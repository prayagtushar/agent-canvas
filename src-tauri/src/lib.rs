pub mod bus;
pub mod mcp;
pub mod server;
pub mod spawn;

use bus::{BusShared, NodeInfo};
use serde_json::{json, Value};
use std::sync::Arc;
use tauri::State;

type Shared = Arc<BusShared>;

#[tauri::command]
fn add_agent(
    shared: State<'_, Shared>,
    label: String,
    harness: String,
    cwd: String,
    prompt: String,
) -> Result<Option<NodeInfo>, String> {
    let id = spawn::launch_agent(&shared, label, harness, cwd, prompt)?;
    Ok(shared.get_node(&id))
}

#[tauri::command]
fn send_prompt(shared: State<'_, Shared>, id: String, text: String) -> Result<(), String> {
    spawn::send_prompt(&shared, &id, &text)
}

#[tauri::command]
fn interrupt_agent(shared: State<'_, Shared>, id: String) -> Result<(), String> {
    spawn::interrupt(&shared, &id)
}

#[tauri::command]
fn kill_agent(shared: State<'_, Shared>, id: String) -> Result<(), String> {
    spawn::kill(&shared, &id)
}

#[tauri::command]
fn list_harnesses() -> Vec<Value> {
    spawn::list_harnesses()
        .into_iter()
        .map(|(name, label, available, bus)| {
            json!({ "name": name, "label": label, "available": available, "bus": bus })
        })
        .collect()
}

/// Where the "Add agent" dialog starts when the user has not chosen a folder.
#[tauri::command]
fn default_workspace_root() -> String {
    dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "/".to_string())
}

fn git(repo: &str, args: &[&str]) -> Result<String, String> {
    let out = std::process::Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(args)
        .output()
        .map_err(|e| format!("git not available: {e}"))?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

#[tauri::command]
fn is_git_repo(path: String) -> bool {
    git(&path, &["rev-parse", "--is-inside-work-tree"]).as_deref() == Ok("true")
}

/// Give an agent its own worktree so two agents editing the same repo cannot
/// collide. Worktrees live under `.agent-canvas/worktrees/` inside the repo.
#[tauri::command]
fn create_worktree(repo: String, name: String) -> Result<String, String> {
    if !is_git_repo(repo.clone()) {
        return Err(format!("{repo} is not a git repository"));
    }
    let slug: String = name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' {
                c
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_lowercase();
    let slug = if slug.is_empty() {
        "agent".to_string()
    } else {
        slug
    };

    let root = git(&repo, &["rev-parse", "--show-toplevel"])?;
    let dir = std::path::Path::new(&root)
        .join(".agent-canvas")
        .join("worktrees")
        .join(&slug);
    let dir_str = dir.to_string_lossy().to_string();
    if dir.is_dir() {
        return Ok(dir_str);
    }
    std::fs::create_dir_all(dir.parent().unwrap_or(&dir)).map_err(|e| e.to_string())?;

    let branch = format!("agent/{slug}");
    let exists = git(&repo, &["rev-parse", "--verify", &branch]).is_ok();
    if exists {
        git(&repo, &["worktree", "add", &dir_str, &branch])?;
    } else {
        git(&repo, &["worktree", "add", "-b", &branch, &dir_str])?;
    }
    Ok(dir_str)
}

#[tauri::command]
fn remove_worktree(repo: String, path: String) -> Result<(), String> {
    git(&repo, &["worktree", "remove", "--force", &path]).map(|_| ())
}

#[tauri::command]
fn get_comm_state(shared: State<'_, Shared>) -> Value {
    shared.comm_state()
}

#[tauri::command]
fn set_auto_comm(shared: State<'_, Shared>, on: bool) {
    *shared.auto_comm.lock() = on;
    shared.emit_comm();
}

#[tauri::command]
fn set_message_cap(shared: State<'_, Shared>, cap: u32) {
    *shared.msg_cap.lock() = cap;
    shared.emit_comm();
}

#[tauri::command]
fn reset_message_count(shared: State<'_, Shared>) {
    *shared.msg_count.lock() = 0;
    shared.emit_comm();
}

#[tauri::command]
fn list_memory(shared: State<'_, Shared>) -> Vec<bus::MemoryEntry> {
    shared.recall(None)
}

#[tauri::command]
fn forget_memory(shared: State<'_, Shared>, key: String) -> Result<(), String> {
    shared.forget(&key).map(|_| ())
}

#[tauri::command]
fn remember(shared: State<'_, Shared>, key: String, value: String) -> bus::MemoryEntry {
    shared.remember("operator", &key, &value)
}

fn workspace_path() -> Result<std::path::PathBuf, String> {
    dirs::config_dir()
        .map(|p| p.join("agent-canvas").join("workspace.json"))
        .ok_or_else(|| "config directory unavailable".to_string())
}

#[tauri::command]
fn save_workspace(json: String) -> Result<(), String> {
    let path = workspace_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_workspace() -> Result<Option<String>, String> {
    let path = workspace_path()?;
    match std::fs::read_to_string(&path) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn answer_approval(shared: State<'_, Shared>, id: String, answer: String) -> Result<(), String> {
    shared.answer_approval(&id, &answer)?;
    Ok(())
}

#[tauri::command]
fn get_bus_info(shared: State<'_, Shared>) -> Value {
    json!({
        "port": *shared.port.lock(),
        "token": shared.token.lock().clone(),
    })
}

fn emit_edges(shared: &Shared) {
    let edges = shared
        .edges
        .lock()
        .iter()
        .map(|(a, b)| [a.clone(), b.clone()])
        .collect::<Vec<_>>();
    shared.emit("bus-event", json!({ "kind": "edges", "edges": edges }));
}

#[tauri::command]
fn add_edge(shared: State<'_, Shared>, a: String, b: String) -> Result<(), String> {
    if a == b {
        return Err("cannot connect a node to itself".to_string());
    }
    if shared.get_node(&a).is_none() || shared.get_node(&b).is_none() {
        return Err("unknown node".to_string());
    }
    if shared.connected(&a, &b) {
        return Err("edge already exists".to_string());
    }
    shared.edges.lock().push((a.clone(), b.clone()));
    emit_edges(&shared);
    Ok(())
}

#[tauri::command]
fn remove_edge(shared: State<'_, Shared>, a: String, b: String) -> Result<(), String> {
    shared
        .edges
        .lock()
        .retain(|(x, y)| !((x == &a && y == &b) || (x == &b && y == &a)));
    emit_edges(&shared);
    Ok(())
}

pub fn run() {
    let shared = BusShared::new();
    let shared_for_setup = shared.clone();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(shared.clone())
        .setup(move |app| {
            *shared_for_setup.app.lock() = Some(app.handle().clone());
            let sh = shared_for_setup;
            tauri::async_runtime::spawn(async move {
                match server::start(sh.clone()).await {
                    Ok((port, token)) => {
                        *sh.port.lock() = port;
                        *sh.token.lock() = token;
                    }
                    Err(e) => eprintln!("bus server failed to start: {e}"),
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            add_agent,
            send_prompt,
            interrupt_agent,
            kill_agent,
            list_harnesses,
            save_workspace,
            load_workspace,
            answer_approval,
            get_bus_info,
            add_edge,
            remove_edge,
            default_workspace_root,
            is_git_repo,
            create_worktree,
            remove_worktree,
            get_comm_state,
            set_auto_comm,
            set_message_cap,
            reset_message_count,
            list_memory,
            forget_memory,
            remember,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
