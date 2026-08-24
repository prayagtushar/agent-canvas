pub mod bus;
pub mod mcp;
pub mod platform;
pub mod pty;
pub mod server;
pub mod spawn;
pub mod usage;
pub mod worktree;

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
    role: String,
) -> Result<Option<NodeInfo>, String> {
    let id = spawn::launch_agent(&shared, label, harness, cwd, prompt, role)?;
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
fn restart_agent(shared: State<'_, Shared>, id: String) -> Result<(), String> {
    spawn::restart(&shared, &id)
}

/// Rename an agent. The name is what the operator calls it in a prompt and
/// what its peers see in `list_peers`, so it lives on the Bus, not the canvas.
#[tauri::command]
fn rename_agent(shared: State<'_, Shared>, id: String, label: String) -> Result<String, String> {
    shared.rename_node(&id, &label)
}

/// Keystrokes from a node's terminal, straight through to the CLI. This is
/// arrow keys and Escape as much as it is letters, so nothing is interpreted
/// on the way.
#[tauri::command]
fn agent_input(id: String, data: String) -> Result<(), String> {
    spawn::write_input(&id, &data)
}

/// The node's terminal has been measured or resized; tell the pty, so the CLI
/// reflows to the shape the operator actually gave it.
#[tauri::command]
fn agent_resize(id: String, cols: u16, rows: u16) -> Result<(), String> {
    spawn::resize(&id, cols, rows)
}

/// Everything known about the CLIs on this machine: installed, version, path,
/// and how the Bus reaches each one.
#[tauri::command]
fn diagnose_harnesses() -> Vec<Value> {
    spawn::diagnose()
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

#[tauri::command]
fn is_git_repo(path: String) -> bool {
    worktree::is_git_repo(path)
}

#[tauri::command]
fn create_worktree(repo: String, name: String) -> Result<String, String> {
    worktree::create_worktree(repo, name)
}

/// What one agent has changed where it works.
#[tauri::command]
fn agent_diff(shared: State<'_, Shared>, id: String) -> Result<String, String> {
    let node = shared.get_node(&id).ok_or("unknown agent")?;
    worktree::agent_diff(node.cwd)
}

#[tauri::command]
fn remove_worktree(repo: String, path: String) -> Result<(), String> {
    worktree::remove_worktree(repo, path)
}

/// Write a session report to a path the operator picked in the save dialog.
///
/// Deliberately narrow: it writes text to one path the user chose, and nothing
/// in the frontend can turn it into a general file-writing tool by passing a
/// different extension or a directory.
#[tauri::command]
fn export_report(path: String, contents: String) -> Result<(), String> {
    let path = std::path::PathBuf::from(&path);
    if path.extension().and_then(|e| e.to_str()) != Some("md") {
        return Err("a report is written as a .md file".to_string());
    }
    if path.is_dir() {
        return Err(format!("{} is a folder", path.display()));
    }
    std::fs::write(&path, contents).map_err(|e| format!("{}: {e}", path.display()))
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

/// Whether an agent may start another agent. Real processes and real money,
/// so it is the operator's switch, not a setting an agent can reach.
#[tauri::command]
fn set_allow_hiring(shared: State<'_, Shared>, on: bool) {
    *shared.allow_hiring.lock() = on;
    shared.emit_comm();
}

/// Raise or lower the turn budget. Raising it is what the operator does when
/// the canvas stopped on work they meant to keep doing.
#[tauri::command]
fn set_turn_cap(shared: State<'_, Shared>, cap: u32) {
    *shared.turn_cap.lock() = cap;
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

/// The operator putting work on the shared board themselves, rather than
/// waiting for an agent to think of it.
#[tauri::command]
fn add_task(
    shared: State<'_, Shared>,
    title: String,
    details: String,
) -> Result<bus::Task, String> {
    let title = title.trim();
    if title.is_empty() {
        return Err("a task needs a title".to_string());
    }
    Ok(shared.add_task("operator", title, details.trim()))
}

#[tauri::command]
fn remove_task(shared: State<'_, Shared>, id: String) -> Result<(), String> {
    shared.remove_task(&id).map(|_| ())
}

#[tauri::command]
fn list_tasks(shared: State<'_, Shared>) -> Vec<bus::Task> {
    shared.list_tasks()
}

/// Every node with its counters, for the spend breakdown.
#[tauri::command]
fn list_nodes(shared: State<'_, Shared>) -> Vec<NodeInfo> {
    let mut nodes: Vec<NodeInfo> = shared.nodes.lock().values().cloned().collect();
    nodes.sort_by(|a, b| a.label.cmp(&b.label));
    // The screen is large and nothing here needs it.
    for n in &mut nodes {
        n.output_tail.clear();
    }
    nodes
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
    shared.emit_edges();
    Ok(())
}

#[tauri::command]
fn remove_edge(shared: State<'_, Shared>, a: String, b: String) -> Result<(), String> {
    shared
        .edges
        .lock()
        .retain(|(x, y)| !((x == &a && y == &b) || (x == &b && y == &a)));
    shared.emit_edges();
    Ok(())
}

pub fn run() {
    let shared = BusShared::new();
    let shared_for_setup = shared.clone();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
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
            restart_agent,
            rename_agent,
            export_report,
            agent_input,
            agent_resize,
            list_harnesses,
            diagnose_harnesses,
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
            agent_diff,
            get_comm_state,
            set_auto_comm,
            set_allow_hiring,
            set_message_cap,
            set_turn_cap,
            reset_message_count,
            list_memory,
            add_task,
            remove_task,
            list_tasks,
            list_nodes,
            forget_memory,
            remember,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
