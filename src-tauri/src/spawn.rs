use parking_lot::Mutex;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, OnceLock};
use std::thread;
use std::time::Duration;

/// How a harness is told where the Bus lives. Every variant writes a config
/// file into the agent's own cache dir, so nothing touches the user's real
/// dotfiles. `None` means the CLI has no MCP support we can drive headlessly —
/// it still runs on the canvas, it just cannot see peers or the task board.
#[derive(Clone, Copy, PartialEq)]
pub enum BusWiring {
    /// `--mcp-config <file>` (Claude Code)
    McpConfigFlag,
    /// GEMINI_CLI_SYSTEM_SETTINGS_PATH -> settings.json
    GeminiSettings,
    /// XDG_CONFIG_HOME -> <app>/<app>.json
    XdgConfig,
    /// CODEX_HOME -> config.toml
    CodexToml,
    None,
}

pub struct Harness {
    pub name: &'static str,
    pub label: &'static str,
    pub wiring: BusWiring,
}

/// Add a harness by adding a row here and a match arm in `start_process`.
pub const HARNESSES: &[Harness] = &[
    Harness {
        name: "claude",
        label: "Claude Code",
        wiring: BusWiring::McpConfigFlag,
    },
    Harness {
        name: "codex",
        label: "Codex",
        wiring: BusWiring::CodexToml,
    },
    Harness {
        name: "gemini",
        label: "Gemini CLI",
        wiring: BusWiring::GeminiSettings,
    },
    Harness {
        name: "opencode",
        label: "opencode",
        wiring: BusWiring::XdgConfig,
    },
    Harness {
        name: "qwen",
        label: "Qwen Code",
        wiring: BusWiring::GeminiSettings,
    },
    Harness {
        name: "crush",
        label: "Crush",
        wiring: BusWiring::XdgConfig,
    },
    Harness {
        name: "goose",
        label: "Goose",
        wiring: BusWiring::None,
    },
    Harness {
        name: "aider",
        label: "Aider",
        wiring: BusWiring::None,
    },
    Harness {
        name: "amp",
        label: "Amp",
        wiring: BusWiring::None,
    },
    Harness {
        name: "cursor-agent",
        label: "Cursor Agent",
        wiring: BusWiring::None,
    },
    Harness {
        name: "copilot",
        label: "Copilot CLI",
        wiring: BusWiring::None,
    },
    Harness {
        name: "droid",
        label: "Droid",
        wiring: BusWiring::None,
    },
];

fn find_harness(name: &str) -> Option<&'static Harness> {
    HARNESSES.iter().find(|h| h.name == name)
}

fn children() -> &'static Mutex<HashMap<String, Arc<Mutex<Child>>>> {
    static CHILDREN: OnceLock<Mutex<HashMap<String, Arc<Mutex<Child>>>>> = OnceLock::new();
    CHILDREN.get_or_init(|| Mutex::new(HashMap::new()))
}

fn sessions() -> &'static Mutex<HashMap<String, String>> {
    static SESSIONS: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
    SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn interrupted() -> &'static Mutex<HashSet<String>> {
    static INTERRUPTED: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    INTERRUPTED.get_or_init(|| Mutex::new(HashSet::new()))
}

pub fn list_harnesses() -> Vec<(String, String, bool, bool)> {
    HARNESSES
        .iter()
        .map(|h| {
            (
                h.name.to_string(),
                h.label.to_string(),
                is_available(h.name),
                h.wiring != BusWiring::None,
            )
        })
        .collect()
}

fn is_available(name: &str) -> bool {
    match Command::new("which").arg(name).output() {
        Ok(out) => !String::from_utf8_lossy(&out.stdout).trim().is_empty(),
        Err(_) => false,
    }
}

pub fn launch_agent(
    shared: &Arc<crate::bus::BusShared>,
    label: String,
    harness: String,
    cwd: String,
    prompt: String,
) -> Result<String, String> {
    if find_harness(&harness).is_none() {
        return Err(format!("unknown harness: {}", harness));
    }
    if !is_available(&harness) {
        return Err(format!("{} CLI not found on PATH", harness));
    }
    let id = crate::bus::new_id("agent");
    shared.register_node(crate::bus::NodeInfo {
        id: id.clone(),
        label,
        harness: harness.clone(),
        cwd: cwd.clone(),
        status: "idle".to_string(),
        output_tail: vec![],
        unread: 0,
        tokens_in: 0,
        tokens_out: 0,
        cost_usd: 0.0,
    });
    write_mcp_configs(shared, &id, &harness)?;
    if !prompt.trim().is_empty() {
        start_process(shared, &id, &harness, &cwd, &prompt, None)?;
    }
    Ok(id)
}

pub fn send_prompt(
    shared: &Arc<crate::bus::BusShared>,
    id: &str,
    text: &str,
) -> Result<(), String> {
    let node = shared
        .get_node(id)
        .ok_or_else(|| "unknown node".to_string())?;
    if node.status == "running" {
        return Err("agent busy".to_string());
    }
    let resume = if node.harness == "claude" {
        sessions().lock().get(id).cloned()
    } else {
        None
    };
    start_process(shared, id, &node.harness, &node.cwd, text, resume)
}

pub fn interrupt(shared: &Arc<crate::bus::BusShared>, id: &str) -> Result<(), String> {
    let child = children().lock().get(id).cloned();
    match child {
        Some(cell) => {
            interrupted().lock().insert(id.to_string());
            let _ = cell.lock().kill();
            shared.set_status(id, "exited");
            Ok(())
        }
        None => Err("not running".to_string()),
    }
}

pub fn kill(shared: &Arc<crate::bus::BusShared>, id: &str) -> Result<(), String> {
    let removed = children().lock().remove(id);
    match removed {
        Some(cell) => {
            let _ = cell.lock().kill();
            shared.set_status(id, "exited");
            Ok(())
        }
        None => Err("not running".to_string()),
    }
}

fn config_base(id: &str) -> Result<PathBuf, String> {
    dirs::cache_dir()
        .map(|d| d.join("agent-canvas").join("mcp-configs").join(id))
        .ok_or_else(|| "could not resolve cache directory".to_string())
}

fn escape_toml(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

fn write_mcp_configs(
    shared: &crate::bus::BusShared,
    id: &str,
    harness: &str,
) -> Result<(), String> {
    let base = config_base(id)?;
    std::fs::create_dir_all(&base).map_err(|e| e.to_string())?;
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_str = exe.to_string_lossy().to_string();
    let port = (*shared.port.lock()).to_string();
    let token = shared.token.lock().clone();

    let wiring = find_harness(harness)
        .map(|h| h.wiring)
        .unwrap_or(BusWiring::None);
    match wiring {
        BusWiring::McpConfigFlag | BusWiring::GeminiSettings => {
            let file = if wiring == BusWiring::McpConfigFlag {
                base.join("mcp-bus.json")
            } else {
                base.join("settings.json")
            };
            let doc = json!({
                "mcpServers": {
                    "bus": {
                        "command": exe_str,
                        "args": ["--bus-mcp", port, token, id],
                    }
                }
            });
            let text = serde_json::to_string_pretty(&doc).map_err(|e| e.to_string())?;
            std::fs::write(file, text).map_err(|e| e.to_string())?;
        }
        BusWiring::XdgConfig => {
            // opencode and crush both read <XDG_CONFIG_HOME>/<app>/<app>.json
            let dir = base.join(harness);
            std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
            let doc = json!({
                "mcp": {
                    "bus": {
                        "type": "local",
                        "command": [exe_str, "--bus-mcp", port, token, id],
                        "enabled": true,
                    }
                }
            });
            let text = serde_json::to_string_pretty(&doc).map_err(|e| e.to_string())?;
            std::fs::write(dir.join(format!("{harness}.json")), text).map_err(|e| e.to_string())?;
        }
        BusWiring::CodexToml => {
            let text = format!(
                "[mcp_servers.bus]\ncommand = \"{}\"\nargs = [\"--bus-mcp\", \"{}\", \"{}\", \"{}\"]\n",
                escape_toml(&exe_str),
                port,
                escape_toml(&token),
                escape_toml(id)
            );
            std::fs::write(base.join("config.toml"), text).map_err(|e| e.to_string())?;
        }
        BusWiring::None => {}
    }
    Ok(())
}

fn start_process(
    shared: &Arc<crate::bus::BusShared>,
    id: &str,
    harness: &str,
    cwd: &str,
    prompt: &str,
    resume_session: Option<String>,
) -> Result<(), String> {
    let base = config_base(id)?;

    let mut cmd = Command::new(harness);
    cmd.stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null());

    match harness {
        "claude" => {
            cmd.arg("-p").arg(prompt);
            if let Some(sid) = resume_session.as_deref() {
                cmd.arg("--resume").arg(sid);
            }
            cmd.args(["--output-format", "stream-json", "--verbose"])
                .arg("--mcp-config")
                .arg(base.join("mcp-bus.json"))
                .args(["--permission-mode", "acceptEdits"])
                .args(["--allowedTools", "mcp__bus"]);
        }
        "gemini" => {
            cmd.args(["-p", prompt, "--output-format", "json"]).env(
                "GEMINI_CLI_SYSTEM_SETTINGS_PATH",
                base.join("settings.json"),
            );
        }
        "qwen" => {
            // Qwen Code is a Gemini CLI fork and takes the same flags.
            cmd.args(["-p", prompt]).env(
                "GEMINI_CLI_SYSTEM_SETTINGS_PATH",
                base.join("settings.json"),
            );
        }
        "opencode" | "crush" => {
            cmd.args(["run", prompt]).env("XDG_CONFIG_HOME", &base);
        }
        "codex" => {
            cmd.args(["exec", prompt]).env("CODEX_HOME", &base);
        }
        "goose" => {
            cmd.args(["run", "-t", prompt]);
        }
        "aider" => {
            cmd.args(["--message", prompt, "--yes-always", "--no-auto-commits"]);
        }
        "amp" => {
            cmd.args(["-x", prompt]);
        }
        "cursor-agent" | "copilot" => {
            cmd.args(["-p", prompt]);
        }
        "droid" => {
            cmd.args(["exec", prompt]);
        }
        _ => return Err(format!("unknown harness: {}", harness)),
    }

    if Path::new(cwd).is_dir() {
        cmd.current_dir(cwd);
    }

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            shared.set_status(id, "error");
            return Err(e.to_string());
        }
    };
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    children()
        .lock()
        .insert(id.to_string(), Arc::new(Mutex::new(child)));
    shared.set_status(id, "running");

    let sh = Arc::clone(shared);
    let nid = id.to_string();
    let h = harness.to_string();
    thread::spawn(move || {
        if let Some(out) = stdout {
            let reader = BufReader::new(out);
            for line in reader.lines() {
                match line {
                    Ok(l) => classify_and_push(&sh, &nid, &h, &l),
                    Err(_) => break,
                }
            }
        }
    });

    let sh = Arc::clone(shared);
    let nid = id.to_string();
    thread::spawn(move || {
        if let Some(err) = stderr {
            let reader = BufReader::new(err);
            for line in reader.lines() {
                match line {
                    Ok(l) => sh.push_output(&nid, &l),
                    Err(_) => break,
                }
            }
        }
    });

    let sh = Arc::clone(shared);
    let nid = id.to_string();
    thread::spawn(move || loop {
        let done = {
            let map = children().lock();
            match map.get(&nid) {
                Some(cell) => cell.lock().try_wait().ok().flatten(),
                None => break,
            }
        };
        if let Some(status) = done {
            let was_interrupted = interrupted().lock().remove(&nid);
            children().lock().remove(&nid);
            if was_interrupted {
                sh.set_status(&nid, "exited");
            } else if status.success() {
                sh.set_status(&nid, "idle");
            } else {
                sh.set_status(&nid, "exited");
            }
            break;
        }
        thread::sleep(Duration::from_millis(200));
    });

    Ok(())
}

/// Turn one harness output line into something worth reading on the canvas.
/// Claude Code speaks stream-json, so tool calls become `> Read(src/foo.rs)`
/// lines instead of vanishing; everything else is plain text with terminal
/// control codes stripped.
fn classify_and_push(shared: &crate::bus::BusShared, id: &str, harness: &str, line: &str) {
    match harness {
        "claude" => {
            let v = match serde_json::from_str::<Value>(line) {
                Ok(v) => v,
                Err(_) => {
                    shared.push_output(id, line);
                    return;
                }
            };
            let kind = v.get("type").and_then(Value::as_str).unwrap_or("");
            let subtype = v.get("subtype").and_then(Value::as_str).unwrap_or("");
            if kind == "system" && subtype == "init" {
                if let Some(sid) = v.get("session_id").and_then(Value::as_str) {
                    sessions().lock().insert(id.to_string(), sid.to_string());
                }
                if let Some(model) = v.get("model").and_then(Value::as_str) {
                    shared.push_output(id, &format!("· {model}"));
                }
            } else if kind == "assistant" {
                if let Some(items) = v
                    .get("message")
                    .and_then(|m| m.get("content"))
                    .and_then(Value::as_array)
                {
                    for item in items {
                        match item.get("type").and_then(Value::as_str) {
                            Some("text") => {
                                if let Some(t) = item.get("text").and_then(Value::as_str) {
                                    if !t.trim().is_empty() {
                                        shared.push_output(id, t);
                                    }
                                }
                            }
                            Some("tool_use") => {
                                let name =
                                    item.get("name").and_then(Value::as_str).unwrap_or("tool");
                                shared
                                    .push_output(id, &format!("> {}({})", name, tool_brief(item)));
                            }
                            _ => {}
                        }
                    }
                }
            } else if kind == "result" {
                if let Some(r) = v.get("result").and_then(Value::as_str) {
                    if !r.trim().is_empty() {
                        shared.push_output(id, r);
                    }
                }
                record_usage(shared, id, &v);
            }
        }
        "gemini" => match serde_json::from_str::<Value>(line) {
            Ok(v) => match v.get("response").and_then(Value::as_str) {
                Some(r) => shared.push_output(id, r),
                None => shared.push_output(id, line),
            },
            Err(_) => shared.push_output(id, line),
        },
        _ => shared.push_output(id, line),
    }
}

/// The most useful identifying argument of a tool call, kept short.
fn tool_brief(item: &Value) -> String {
    let input = match item.get("input").and_then(Value::as_object) {
        Some(o) => o,
        None => return String::new(),
    };
    for key in [
        "file_path",
        "path",
        "pattern",
        "command",
        "url",
        "query",
        "key",
        "peer_id",
        "title",
        "task_id",
        "description",
        "prompt",
    ] {
        if let Some(v) = input.get(key).and_then(Value::as_str) {
            let one_line = v.replace('\n', " ");
            let trimmed = one_line.trim();
            return if trimmed.chars().count() > 60 {
                format!("{}…", trimmed.chars().take(60).collect::<String>())
            } else {
                trimmed.to_string()
            };
        }
    }
    String::new()
}

fn record_usage(shared: &crate::bus::BusShared, id: &str, v: &Value) {
    let cost = v
        .get("total_cost_usd")
        .and_then(Value::as_f64)
        .unwrap_or(0.0);
    let usage = v.get("usage");
    let get = |k: &str| {
        usage
            .and_then(|u| u.get(k))
            .and_then(Value::as_u64)
            .unwrap_or(0)
    };
    let tin =
        get("input_tokens") + get("cache_read_input_tokens") + get("cache_creation_input_tokens");
    let tout = get("output_tokens");
    if tin > 0 || tout > 0 || cost > 0.0 {
        shared.add_usage(id, tin, tout, cost);
    }
}
