use parking_lot::Mutex;
use portable_pty::CommandBuilder;
use serde_json::{json, Value};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock};

/// The geometry a CLI first draws itself at. The node resizes the pty as soon
/// as its terminal has measured a character, usually within a frame or two.
const START_COLS: u16 = 100;
const START_ROWS: u16 = 28;

/// How a harness is told where the Bus lives.
///
/// The rule every variant follows: add the Bus, change nothing else. An agent
/// has to keep the models, agents, keybinds and above all the credentials the
/// user set up in their own CLI. Pointing a CLI's whole config directory at a
/// scratch folder is the easy way to wire in an MCP server and it silently
/// takes all of that away — `CODEX_HOME` did exactly that, and left codex
/// unable to find its own `auth.json`.
///
/// `None` means the CLI has no MCP support we can drive. It still runs on the
/// canvas, it just cannot see peers or the task board.
#[derive(Clone, Copy, PartialEq)]
pub enum BusWiring {
    /// `--mcp-config <file>`, which Claude Code layers over its own config.
    McpConfigFlag,
    /// `GEMINI_CLI_SYSTEM_SETTINGS_PATH`, the system layer Gemini merges
    /// underneath the user's own settings.
    GeminiSettings,
    /// `OPENCODE_CONFIG`, pointed at the user's own config with the Bus added.
    OpencodeConfig,
    /// `XDG_CONFIG_HOME`, with the user's config copied in and the Bus added.
    XdgConfig,
    /// `-c mcp_servers.bus.…` on the command line, layered over `~/.codex`.
    CodexFlags,
    None,
}

pub struct Harness {
    pub name: &'static str,
    pub label: &'static str,
    pub wiring: BusWiring,
}

/// Add a harness by adding a row here and a match arm in `interactive_command`.
pub const HARNESSES: &[Harness] = &[
    Harness {
        name: "claude",
        label: "Claude Code",
        wiring: BusWiring::McpConfigFlag,
    },
    Harness {
        name: "codex",
        label: "Codex",
        wiring: BusWiring::CodexFlags,
    },
    Harness {
        name: "gemini",
        label: "Gemini CLI",
        wiring: BusWiring::GeminiSettings,
    },
    Harness {
        name: "opencode",
        label: "opencode",
        wiring: BusWiring::OpencodeConfig,
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

/// Which CLIs are installed. Asked once — on macOS this sources a real login
/// profile, which costs a couple of hundred milliseconds, and it runs while
/// the window is opening. How the question is asked is `platform`'s problem.
fn available() -> &'static HashSet<String> {
    static AVAILABLE: OnceLock<HashSet<String>> = OnceLock::new();
    AVAILABLE.get_or_init(|| {
        let names: Vec<&str> = HARNESSES.iter().map(|h| h.name).collect();
        crate::platform::installed(&names)
    })
}

/// How this CLI is told where the Bus is, in the operator's words. Shown in
/// diagnostics, because "wired how?" is the question behind most of the
/// reports that a peer cannot be seen.
fn wiring_label(w: BusWiring) -> &'static str {
    match w {
        BusWiring::McpConfigFlag => "--mcp-config, layered over its own config",
        BusWiring::GeminiSettings => "system settings, merged under yours",
        BusWiring::OpencodeConfig => "OPENCODE_CONFIG, a copy of your config plus the Bus",
        BusWiring::XdgConfig => "XDG_CONFIG_HOME, your config plus the Bus",
        BusWiring::CodexFlags => "-c mcp_servers.bus, your ~/.codex untouched",
        BusWiring::None => "no MCP support this app can drive",
    }
}

/// Every harness, whether it is installed, what version, and how the Bus
/// reaches it. Under a ceiling, because an installed CLI that is wedged on a
/// login prompt never answers `--version` at all.
pub fn diagnose() -> Vec<Value> {
    let found = available();
    let wanted: Vec<&str> = HARNESSES
        .iter()
        .map(|h| h.name)
        .filter(|n| found.contains(*n))
        .collect();
    let probes = crate::platform::probe(&wanted, std::time::Duration::from_secs(12));

    HARNESSES
        .iter()
        .map(|h| {
            let installed = found.contains(h.name);
            let (version, path) = probes
                .get(h.name)
                .map(|p| (p.version.clone(), p.path.clone()))
                .unwrap_or_default();
            json!({
                "name": h.name,
                "label": h.label,
                "installed": installed,
                "version": version,
                "path": path,
                "bus": h.wiring != BusWiring::None,
                "wiring": wiring_label(h.wiring),
            })
        })
        .collect()
}

pub fn list_harnesses() -> Vec<(String, String, bool, bool)> {
    let found = available();
    HARNESSES
        .iter()
        .map(|h| {
            (
                h.name.to_string(),
                h.label.to_string(),
                found.contains(h.name),
                h.wiring != BusWiring::None,
            )
        })
        .collect()
}

/// What cancels the current turn without quitting the CLI. Claude Code and the
/// Gemini-family CLIs take Escape and treat Ctrl-C as quit; the rest interrupt
/// on Ctrl-C the way any terminal program does.
fn interrupt_keys(harness: &str) -> &'static [u8] {
    match harness {
        "claude" | "gemini" | "qwen" => b"\x1b",
        _ => b"\x03",
    }
}

pub fn launch_agent(
    shared: &Arc<crate::bus::BusShared>,
    label: String,
    harness: String,
    cwd: String,
    prompt: String,
    role: String,
) -> Result<String, String> {
    if find_harness(&harness).is_none() {
        return Err(format!("unknown harness: {}", harness));
    }
    if !available().contains(&harness) {
        return Err(format!("{} CLI not found on PATH", harness));
    }
    let id = crate::bus::new_id("agent");
    shared.register_node(crate::bus::NodeInfo {
        id: id.clone(),
        label,
        harness: harness.clone(),
        cwd: cwd.clone(),
        status: "idle".to_string(),
        role,
        output_tail: vec![],
        unread: 0,
        turns: 0,
        busy_ms: 0,
        tokens: 0,
        cost_usd: 0.0,
    });
    write_mcp_configs(shared, &id, &harness)?;
    start_session(shared, &id, &harness, &cwd)?;
    if !prompt.trim().is_empty() {
        crate::pty::send(&id, &prompt)?;
    }
    Ok(id)
}

fn start_session(
    shared: &Arc<crate::bus::BusShared>,
    id: &str,
    harness: &str,
    cwd: &str,
) -> Result<(), String> {
    let cmd = interactive_command(shared, id, harness, cwd)?;
    match crate::pty::open(shared, id, cmd, START_COLS, START_ROWS) {
        Ok(()) => Ok(()),
        Err(e) => {
            shared.set_status(id, "error");
            Err(e)
        }
    }
}

/// Type a prompt into the agent's terminal, starting its session first if the
/// CLI has quit since it was last used.
pub fn send_prompt(
    shared: &Arc<crate::bus::BusShared>,
    id: &str,
    text: &str,
) -> Result<(), String> {
    let node = shared
        .get_node(id)
        .ok_or_else(|| "unknown node".to_string())?;
    if !crate::pty::is_open(id) {
        write_mcp_configs(shared, id, &node.harness)?;
        start_session(shared, id, &node.harness, &node.cwd)?;
    }
    crate::pty::send(id, text)
}

/// Cancel the current turn. The session stays up: interrupting an agent should
/// leave it sitting at its prompt, not kill it.
pub fn interrupt(shared: &Arc<crate::bus::BusShared>, id: &str) -> Result<(), String> {
    let node = shared
        .get_node(id)
        .ok_or_else(|| "unknown node".to_string())?;
    if !crate::pty::is_open(id) {
        return Err("not running".to_string());
    }
    let keys = String::from_utf8_lossy(interrupt_keys(&node.harness)).to_string();
    crate::pty::write_input(id, &keys)
}

/// Quit the CLI and start it again, on the same node and in the same folder.
/// The agent loses its context, which is the point — this is the button for
/// when a session has gone sideways.
pub fn restart(shared: &Arc<crate::bus::BusShared>, id: &str) -> Result<(), String> {
    let node = shared
        .get_node(id)
        .ok_or_else(|| "unknown node".to_string())?;
    crate::pty::close(id);
    write_mcp_configs(shared, id, &node.harness)?;
    start_session(shared, id, &node.harness, &node.cwd)
}

pub fn kill(shared: &Arc<crate::bus::BusShared>, id: &str) -> Result<(), String> {
    crate::pty::close(id);
    shared.set_status(id, "exited");
    Ok(())
}

pub fn write_input(id: &str, data: &str) -> Result<(), String> {
    crate::pty::write_input(id, data)
}

pub fn resize(id: &str, cols: u16, rows: u16) -> Result<(), String> {
    crate::pty::resize(id, cols, rows)
}

/// The binary an agent's MCP client is told to run for the Bus. That is this
/// same executable in `--bus-mcp` mode.
///
/// The override exists for the live tests: a test harness is a different
/// binary from the app, so `current_exe` there points at something with no
/// `--bus-mcp` mode and every agent's Bus connection fails. Debug builds only,
/// so nothing can redirect it in a shipped app.
fn bridge_exe() -> Result<String, String> {
    #[cfg(debug_assertions)]
    if let Some(path) = std::env::var_os("AGENT_CANVAS_BRIDGE_EXE") {
        return Ok(path.to_string_lossy().to_string());
    }
    std::env::current_exe()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

fn config_base(id: &str) -> Result<PathBuf, String> {
    dirs::cache_dir()
        .map(|d| d.join("agent-canvas").join("mcp-configs").join(id))
        .ok_or_else(|| "could not resolve cache directory".to_string())
}

/// The `bus` entry as each config schema spells it.
fn bus_entry(exe: &str, port: &str, token: &str, id: &str) -> (Value, Value) {
    let args = json!(["--bus-mcp", port, token, id]);
    (
        json!({ "command": exe, "args": args }),
        json!({ "type": "local", "command": [exe, "--bus-mcp", port, token, id], "enabled": true }),
    )
}

/// The user's own config for a CLI, so the Bus can be added to it rather than
/// instead of it. Missing or unreadable means an empty object, never an error:
/// not having configured a CLI yet is not a reason to refuse to launch it.
fn user_config(dir: &Path, stem: &str) -> Value {
    for name in [format!("{stem}.json"), format!("{stem}.jsonc")] {
        let Ok(text) = std::fs::read_to_string(dir.join(&name)) else {
            continue;
        };
        if let Ok(v) = serde_json::from_str::<Value>(&strip_jsonc(&text)) {
            if v.is_object() {
                return v;
            }
        }
    }
    json!({})
}

/// Enough of JSONC to read a config people hand-edit: line comments, and a
/// trailing comma before a closing brace or bracket.
fn strip_jsonc(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut in_string = false;
    let mut escaped = false;
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        if in_string {
            out.push(c);
            if escaped {
                escaped = false;
            } else if c == '\\' {
                escaped = true;
            } else if c == '"' {
                in_string = false;
            }
            continue;
        }
        match c {
            '"' => {
                in_string = true;
                out.push(c);
            }
            '/' if chars.peek() == Some(&'/') => {
                for c in chars.by_ref() {
                    if c == '\n' {
                        out.push('\n');
                        break;
                    }
                }
            }
            ',' => {
                // Keep the comma unless the next thing that matters closes.
                let mut gap = String::new();
                while let Some(&next) = chars.peek() {
                    if next.is_whitespace() {
                        gap.push(next);
                        chars.next();
                    } else {
                        break;
                    }
                }
                if !matches!(chars.peek(), Some('}') | Some(']')) {
                    out.push(',');
                }
                out.push_str(&gap);
            }
            _ => out.push(c),
        }
    }
    out
}

/// Where a CLI keeps its own config, honouring XDG before falling back.
fn user_config_dir(app: &str) -> PathBuf {
    match std::env::var_os("XDG_CONFIG_HOME") {
        Some(x) if !x.is_empty() => PathBuf::from(x).join(app),
        _ => dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("/"))
            .join(".config")
            .join(app),
    }
}

fn write_json(path: &Path, doc: &Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(doc).map_err(|e| e.to_string())?;
    std::fs::write(path, text).map_err(|e| e.to_string())
}

fn write_mcp_configs(
    shared: &crate::bus::BusShared,
    id: &str,
    harness: &str,
) -> Result<(), String> {
    let base = config_base(id)?;
    std::fs::create_dir_all(&base).map_err(|e| e.to_string())?;
    let exe_str = bridge_exe()?;
    let port = (*shared.port.lock()).to_string();
    let token = shared.token.lock().clone();
    let (mcp_style, local_style) = bus_entry(&exe_str, &port, &token, id);

    let wiring = find_harness(harness)
        .map(|h| h.wiring)
        .unwrap_or(BusWiring::None);
    match wiring {
        BusWiring::McpConfigFlag => write_json(
            &base.join("mcp-bus.json"),
            &json!({ "mcpServers": { "bus": mcp_style } }),
        )?,
        // Gemini merges system settings underneath the user's own, so this
        // adds the Bus without hiding anything they set.
        BusWiring::GeminiSettings => write_json(
            &base.join("settings.json"),
            &json!({ "mcpServers": { "bus": mcp_style } }),
        )?,
        BusWiring::OpencodeConfig => {
            let mut doc = user_config(&user_config_dir("opencode"), "opencode");
            doc["mcp"]["bus"] = local_style;
            write_json(&base.join("opencode.json"), &doc)?;
        }
        BusWiring::XdgConfig => {
            let mut doc = user_config(&user_config_dir(harness), harness);
            doc["mcp"]["bus"] = local_style;
            write_json(&base.join(harness).join(format!("{harness}.json")), &doc)?;
        }
        // Codex takes the Bus on the command line, so `~/.codex` is left
        // alone. Nothing to write.
        BusWiring::CodexFlags | BusWiring::None => {}
    }
    Ok(())
}

/// The CLI as the user would run it in a terminal, plus the flags and
/// environment that point it at this node's Bus. No headless or print flags:
/// the whole point is that the agent's own interface ends up on the node.
fn interactive_command(
    shared: &crate::bus::BusShared,
    id: &str,
    harness: &str,
    cwd: &str,
) -> Result<CommandBuilder, String> {
    let base = config_base(id)?;
    let path = |p: PathBuf| p.to_string_lossy().to_string();
    let mut argv: Vec<String> = vec![harness.to_string()];
    let mut env: Vec<(&str, String)> = Vec::new();

    match harness {
        "claude" => {
            argv.push("--mcp-config".into());
            argv.push(path(base.join("mcp-bus.json")));
            // The canvas runs several agents at once and nobody is watching
            // every one of them. Edits go through; the operator can still cycle
            // the mode from inside the node with shift+tab.
            argv.push("--permission-mode".into());
            argv.push("acceptEdits".into());
            // The Bus tools are the canvas's own: peers, tasks, memory,
            // messages. None of them touch the filesystem or run a command,
            // and putting the agent on the canvas is the operator agreeing to
            // them. Without this every `list_peers` stops for a confirmation
            // and coordination never gets off the ground. Everything else
            // still asks.
            argv.push("--allowedTools".into());
            argv.push("mcp__bus".into());
        }
        "codex" => {
            // Layered on top of the user's own `~/.codex/config.toml`, which
            // is also where codex keeps `auth.json`. Redirecting CODEX_HOME
            // would take both away.
            argv.push("-c".into());
            argv.push(format!("mcp_servers.bus.command={}", json!(bridge_exe()?)));
            argv.push("-c".into());
            argv.push(format!(
                "mcp_servers.bus.args={}",
                json!([
                    "--bus-mcp",
                    (*shared.port.lock()).to_string(),
                    shared.token.lock().clone(),
                    id
                ])
            ));
        }
        "gemini" | "qwen" => env.push((
            "GEMINI_CLI_SYSTEM_SETTINGS_PATH",
            path(base.join("settings.json")),
        )),
        "opencode" => env.push(("OPENCODE_CONFIG", path(base.join("opencode.json")))),
        "crush" => env.push(("XDG_CONFIG_HOME", path(base.clone()))),
        "goose" => argv.push("session".into()),
        "aider" => {
            argv.push("--yes-always".into());
            argv.push("--no-auto-commits".into());
        }
        "amp" | "cursor-agent" | "copilot" | "droid" => {}
        _ => return Err(format!("unknown harness: {}", harness)),
    }

    let mut cmd = crate::platform::pty_command(&argv);
    if Path::new(cwd).is_dir() {
        cmd.cwd(cwd);
    }
    for (k, v) in env {
        cmd.env(k, v);
    }
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    // Lets an agent tell which node on the canvas it is, without being told.
    cmd.env("AGENT_CANVAS_NODE", id);
    // An agent launched by the canvas is nobody's subagent. If the app was
    // itself started from inside a CLI session, these markers come along and
    // the new agent quietly changes behaviour — Claude Code, for one, turns
    // off transcript saving when it thinks it is a child session.
    for marker in [
        "CLAUDECODE",
        "CLAUDE_CODE_ENTRYPOINT",
        "CLAUDE_CODE_CHILD_SESSION",
        "CLAUDE_CODE_SSE_PORT",
        "AGENT_CANVAS_BUS",
    ] {
        cmd.env_remove(marker);
    }
    Ok(cmd)
}

/// Deliver a peer message by typing it into the recipient's terminal, so an
/// agent that is sitting idle actually acts on it. A busy agent is left alone
/// and reads the message from its inbox when it next checks.
pub fn deliver_message(shared: &Arc<crate::bus::BusShared>, to: &str, from_label: &str) -> bool {
    if !crate::pty::is_open(to) {
        return false;
    }
    match shared.get_node(to) {
        Some(n) if n.status == "idle" => {}
        _ => return false,
    }
    let waiting = shared.drain_inbox(to);
    if waiting.is_empty() {
        return false;
    }
    let body = waiting
        .iter()
        .map(|m| m.text.replace('\n', " "))
        .collect::<Vec<_>>()
        .join(" / ");
    shared.clear_unread(to);
    let _ = crate::pty::send(to, &format!("[message from {from_label}] {body}"));
    true
}

/// A lock the delivery path takes so two messages arriving at once cannot both
/// decide the recipient is idle and type over each other.
pub fn delivery_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

#[cfg(test)]
mod tests {
    use super::{interactive_command, interrupt_keys, strip_jsonc, user_config};
    use serde_json::json;

    fn cmd_for(harness: &str) -> Vec<String> {
        let bus = crate::bus::BusShared::new();
        interactive_command(&bus, "agent-1", harness, "/tmp")
            .expect("builds")
            .get_argv()
            .iter()
            .map(|a| a.to_string_lossy().to_string())
            .collect()
    }

    fn env_for(harness: &str) -> Vec<(String, String)> {
        let bus = crate::bus::BusShared::new();
        interactive_command(&bus, "agent-1", harness, "/tmp")
            .expect("builds")
            .iter_extra_env_as_str()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect()
    }

    #[test]
    fn claude_is_told_where_its_bus_config_lives() {
        let args = cmd_for("claude");
        let line = args.last().expect("a -c script");
        assert!(line.contains("mcp-bus.json"), "{line}");
        assert!(line.starts_with("exec "), "{line}");
        // No print flag: the agent runs its real interface.
        assert!(!line.contains(" -p "), "{line}");
    }

    /// Codex keeps `auth.json` in `~/.codex`. Pointing `CODEX_HOME` at a
    /// scratch directory wired up the Bus and logged the user out.
    #[test]
    fn codex_is_layered_over_its_own_home_not_redirected() {
        let line = cmd_for("codex").last().cloned().expect("a -c script");
        assert!(line.contains("mcp_servers.bus.command"), "{line}");
        assert!(line.contains("--bus-mcp"), "{line}");
        assert!(
            env_for("codex").iter().all(|(k, _)| k != "CODEX_HOME"),
            "codex must keep its own home"
        );
    }

    /// Same story for opencode: `XDG_CONFIG_HOME` took the Bus in and the
    /// user's models, agents and keybinds out.
    #[test]
    fn opencode_gets_a_config_file_not_a_new_config_home() {
        let env = env_for("opencode");
        assert!(
            env.iter()
                .any(|(k, v)| k == "OPENCODE_CONFIG" && v.ends_with("opencode.json")),
            "{env:?}"
        );
        assert!(env.iter().all(|(k, _)| k != "XDG_CONFIG_HOME"), "{env:?}");
    }

    #[test]
    fn an_agent_is_not_launched_as_somebody_elses_subagent() {
        let bus = crate::bus::BusShared::new();
        let cmd = interactive_command(&bus, "agent-1", "claude", "/tmp").expect("builds");
        assert_eq!(cmd.get_env("CLAUDECODE"), None);
        assert_eq!(cmd.get_env("CLAUDE_CODE_CHILD_SESSION"), None);
    }

    #[test]
    fn unknown_harnesses_are_refused() {
        let bus = crate::bus::BusShared::new();
        assert!(interactive_command(&bus, "agent-1", "nope", "/tmp").is_err());
    }

    #[test]
    fn escape_cancels_claude_and_ctrl_c_cancels_the_rest() {
        assert_eq!(interrupt_keys("claude"), b"\x1b");
        assert_eq!(interrupt_keys("aider"), b"\x03");
    }

    #[test]
    fn a_hand_edited_config_still_parses() {
        let text = r#"{
          // the user's own notes
          "model": "anthropic/claude-opus-4",
          "keybinds": { "leader": "ctrl+x", },
        }"#;
        let doc: serde_json::Value = serde_json::from_str(&strip_jsonc(text)).expect("parses");
        assert_eq!(doc["model"], "anthropic/claude-opus-4");
        assert_eq!(doc["keybinds"]["leader"], "ctrl+x");
    }

    #[test]
    fn a_comment_marker_inside_a_string_is_not_a_comment() {
        let text = r#"{ "url": "https://example.com/x", "n": 1 }"#;
        let doc: serde_json::Value = serde_json::from_str(&strip_jsonc(text)).expect("parses");
        assert_eq!(doc["url"], "https://example.com/x");
        assert_eq!(doc["n"], 1);
    }

    #[test]
    fn the_users_config_is_read_and_an_absent_one_is_not_an_error() {
        let dir = std::env::temp_dir().join(format!("ac-cfg-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        assert_eq!(user_config(&dir, "opencode"), json!({}));

        std::fs::write(dir.join("opencode.jsonc"), "{ \"model\": \"zen\" } ").unwrap();
        assert_eq!(user_config(&dir, "opencode")["model"], "zen");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
