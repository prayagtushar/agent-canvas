//! Runs the real agent CLIs against a real Bus. Ignored by default because it
//! spends provider credits and needs the CLIs installed and logged in.
//!
//!   cargo test --test live_harness -- --ignored --nocapture

use agent_canvas_lib::bus::{BusShared, NodeInfo};
use serde_json::json;
use std::process::Command;
use std::time::{Duration, Instant};

fn node(id: &str, harness: &str, cwd: &str) -> NodeInfo {
    NodeInfo {
        id: id.to_string(),
        label: id.to_string(),
        harness: harness.to_string(),
        cwd: cwd.to_string(),
        status: "idle".to_string(),
        role: String::new(),
        output_tail: vec![],
        unread: 0,
        tokens_in: 0,
        tokens_out: 0,
        cost_usd: 0.0,
    }
}

/// A test binary has no `--bus-mcp` mode, so without this every agent's Bus
/// connection fails and the whole exercise measures nothing.
fn use_the_real_bridge() {
    std::env::set_var(
        "AGENT_CANVAS_BRIDGE_EXE",
        env!("CARGO_BIN_EXE_agent-canvas"),
    );
}

/// Answer the one-off gates a CLI can open on, the way a person would.
///
/// Watch the whole window rather than returning at the first clean screen: a
/// gate can take several seconds to paint, and an empty screen early on means
/// the CLI has not started yet, not that there is nothing to answer.
fn clear_startup_gates(bus: &std::sync::Arc<BusShared>, id: &str) {
    let gates: &[(&str, &str)] = &[
        ("Press t to trust", "t"),
        ("Yes, I trust this folder", "\r"),
        ("Do you trust the files in this folder", "\r"),
    ];
    let start = Instant::now();
    while start.elapsed() < Duration::from_secs(22) {
        std::thread::sleep(Duration::from_millis(700));
        let screen = bus
            .get_node(id)
            .map(|n| n.output_tail.join("\n"))
            .unwrap_or_default();
        if let Some((cue, key)) = gates.iter().find(|(cue, _)| screen.contains(cue)) {
            eprintln!("answering startup gate: {cue}");
            let _ = agent_canvas_lib::pty::write_input(id, key);
            std::thread::sleep(Duration::from_secs(2));
        }
    }
}

/// A CLI that cannot run here at all. The point of these tests is whether an
/// agent goes looking for what its peer knows; a CLI sitting on a login page
/// or refusing the account's model has not been asked the question yet, and
/// failing the run would say something untrue about the canvas.
fn blocked_by_environment(screen: &str) -> Option<&'static str> {
    let cues = [
        (
            "Waiting for authentication",
            "the CLI is not logged in here",
        ),
        ("authentication page", "the CLI is not logged in here"),
        ("authentication_failed", "the CLI is not logged in here"),
        ("Failed to authenticate", "the CLI is not logged in here"),
        (
            "not supported when using",
            "the account cannot use its configured model",
        ),
        (
            "needs review before it can run",
            "the user's own config has a hook awaiting their approval",
        ),
    ];
    cues.iter()
        .find(|(cue, _)| screen.contains(cue))
        .map(|(_, why)| *why)
}

fn installed(bin: &str) -> bool {
    Command::new("which")
        .arg(bin)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore]
async fn claude_can_see_its_peer_through_the_bus() {
    if !installed("claude") {
        eprintln!("claude not installed, skipping");
        return;
    }

    let dir = std::env::temp_dir().join("agent-canvas-live");
    std::fs::create_dir_all(&dir).unwrap();

    let bus = BusShared::new();
    bus.register_node(node("alpha", "claude", dir.to_str().unwrap()));
    bus.register_node(node("beta", "codex", dir.to_str().unwrap()));
    bus.edges.lock().push(("alpha".into(), "beta".into()));

    let (port, token) = agent_canvas_lib::server::start(bus.clone()).await.unwrap();

    // the same config the spawner writes for a real agent
    let cfg = dir.join("mcp-bus.json");
    std::fs::write(
        &cfg,
        serde_json::to_string_pretty(&json!({
            "mcpServers": {
                "bus": {
                    "command": env!("CARGO_BIN_EXE_agent-canvas"),
                    "args": ["--bus-mcp", port.to_string(), token, "alpha"],
                }
            }
        }))
        .unwrap(),
    )
    .unwrap();

    let out = Command::new("claude")
        .current_dir(&dir)
        .arg("-p")
        .arg("Call the mcp__bus__list_peers tool. Reply with only the id of each peer it returns.")
        .args(["--output-format", "stream-json", "--verbose"])
        .arg("--mcp-config")
        .arg(&cfg)
        .args(["--permission-mode", "acceptEdits"])
        .args(["--allowedTools", "mcp__bus"])
        .output()
        .expect("claude should launch");

    let stdout = String::from_utf8_lossy(&out.stdout);
    eprintln!("--- claude exit {:?} ---", out.status.code());
    eprintln!("{}", String::from_utf8_lossy(&out.stderr));

    // Nothing to prove about the app if the CLI itself is not logged in.
    if stdout.contains("authentication_failed") || stdout.contains("Failed to authenticate") {
        eprintln!("claude is not authenticated here, skipping. Run `claude` once to log in.");
        return;
    }

    assert!(out.status.success(), "claude exited non-zero:\n{stdout}");
    assert!(
        stdout.contains("beta"),
        "claude never reported the peer; output was:\n{stdout}"
    );
    // it must not invent a peer it cannot see
    assert!(
        !stdout.contains("gamma"),
        "claude reported a node it is not connected to"
    );
}

/// The other half of the contract: the real CLI has to come up on a pty and
/// paint its own interface, through the operator's login shell, with the Bus
/// config the spawner writes. Costs nothing — it never sends a prompt.
#[test]
#[ignore]
fn a_real_claude_paints_its_interface_on_the_node() {
    if !installed("claude") {
        eprintln!("claude not installed, skipping");
        return;
    }
    let dir = std::env::temp_dir().join("agent-canvas-live");
    std::fs::create_dir_all(&dir).unwrap();

    let bus = BusShared::new();
    let id = agent_canvas_lib::spawn::launch_agent(
        &bus,
        "alpha".into(),
        "claude".into(),
        dir.to_string_lossy().to_string(),
        String::new(),
        String::new(),
    )
    .expect("claude should launch");

    let start = Instant::now();
    let mut screen = String::new();
    while start.elapsed() < Duration::from_secs(25) {
        screen = bus
            .get_node(&id)
            .map(|n| n.output_tail.join("\n"))
            .unwrap_or_default();
        if screen.to_lowercase().contains("claude") {
            break;
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    agent_canvas_lib::pty::close(&id);
    eprintln!("--- what the node showed ---\n{screen}\n---");
    assert!(
        screen.to_lowercase().contains("claude"),
        "the CLI never drew itself on the node"
    );
}

/// The bug this was written for: opencode invented a spell on its own node,
/// the operator asked the connected Claude Code what the spell does, and got
/// "I don't know of a spell called OpenClaude." Nothing was broken in the
/// plumbing — nothing had ever told the agent there was somebody to ask.
///
/// So this asserts behaviour, not wiring: a real CLI, given only the briefing
/// the MCP server hands it, has to go and look.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore]
async fn an_agent_finds_out_what_its_peer_did() {
    if !installed("claude") {
        eprintln!("claude not installed, skipping");
        return;
    }
    let dir = std::env::temp_dir().join("agent-canvas-live");
    std::fs::create_dir_all(&dir).unwrap();

    let bus = BusShared::new();
    bus.register_node(node("alpha", "claude", dir.to_str().unwrap()));
    bus.register_node(node("beta", "opencode", dir.to_str().unwrap()));
    bus.edges.lock().push(("alpha".into(), "beta".into()));
    // What the peer has on screen, and nowhere else. It never called
    // `remember`, exactly as in the report.
    bus.set_output_tail(
        "beta",
        "OpenClaude (Conjuration, Level 3)\n\
         Incantation: \"By terminal's glow and prompt unseen, open the way\"\n\
         Effect: Summons a spectral assistant that reads your codebase, fixes \
         bugs, and writes tests while you sip coffee.",
    );

    let (port, token) = agent_canvas_lib::server::start(bus.clone()).await.unwrap();
    let cfg = dir.join("mcp-bus.json");
    std::fs::write(
        &cfg,
        serde_json::to_string_pretty(&json!({
            "mcpServers": {
                "bus": {
                    "command": env!("CARGO_BIN_EXE_agent-canvas"),
                    "args": ["--bus-mcp", port.to_string(), token, "alpha"],
                }
            }
        }))
        .unwrap(),
    )
    .unwrap();

    let out = Command::new("claude")
        .current_dir(&dir)
        .arg("-p")
        .arg("what does the spell OpenClaude do?")
        .arg("--mcp-config")
        .arg(&cfg)
        .args(["--permission-mode", "acceptEdits"])
        .args(["--allowedTools", "mcp__bus"])
        .output()
        .expect("claude should launch");
    let answer = String::from_utf8_lossy(&out.stdout).to_string();
    eprintln!("--- claude answered ---\n{answer}\n---");

    if answer.contains("authentication_failed") || answer.contains("Failed to authenticate") {
        eprintln!("claude is not authenticated here, skipping.");
        return;
    }
    assert!(
        answer.to_lowercase().contains("spectral"),
        "the agent never went looking for what its peer knew"
    );
}

/// The report this was written for: opencode invented a spell on its own node,
/// the operator asked the connected agent what the spell does, and got "I
/// don't know of a spell called OpenClaude." Nothing was broken in the
/// plumbing. Nothing had ever told the agent there was somebody to ask.
///
/// So this asserts behaviour, through the whole real path — login shell, pty,
/// the config the spawner writes, the briefing the Bus hands over — for one
/// CLI at a time. The peer never called `remember`; the answer exists only on
/// its screen, which is exactly the case that used to fail.
async fn a_peer_knows_something_this_agent_does_not(harness: &str) {
    if !installed(harness) {
        eprintln!("{harness} not installed, skipping");
        return;
    }
    use_the_real_bridge();
    let dir = std::env::temp_dir().join(format!("ac-live-{harness}"));
    std::fs::create_dir_all(&dir).unwrap();

    let bus = BusShared::new();
    let (port, token) = agent_canvas_lib::server::start(bus.clone()).await.unwrap();
    *bus.port.lock() = port;
    *bus.token.lock() = token;

    bus.register_node(node("beta", "opencode", dir.to_str().unwrap()));
    bus.set_output_tail(
        "beta",
        "OpenClaude (Conjuration, Level 3)\n\
         Incantation: \"By terminal's glow and prompt unseen, open the way\"\n\
         Effect: Summons a spectral assistant that reads your codebase, fixes \
         bugs, and writes tests while you sip coffee.",
    );

    let id = agent_canvas_lib::spawn::launch_agent(
        &bus,
        harness.to_string(),
        harness.to_string(),
        dir.to_string_lossy().to_string(),
        String::new(),
        String::new(),
    )
    .expect("the agent should launch");
    bus.edges.lock().push((id.clone(), "beta".into()));

    // A CLI can open on a gate the operator has to answer: a folder trust
    // dialog, a hook from their own config awaiting review. Answering it with
    // a keystroke is what the operator would do, and doing it here is also the
    // proof that the node is a genuinely interactive terminal.
    clear_startup_gates(&bus, &id);

    agent_canvas_lib::spawn::send_prompt(&bus, &id, "what does the spell OpenClaude do?")
        .expect("the prompt should be accepted");

    let start = Instant::now();
    let mut screen = String::new();
    let mut found = false;
    while start.elapsed() < Duration::from_secs(150) {
        screen = bus
            .get_node(&id)
            .map(|n| n.output_tail.join("\n"))
            .unwrap_or_default();
        if screen.to_lowercase().contains("spectral") {
            found = true;
            break;
        }
        if let Some(why) = blocked_by_environment(&screen) {
            agent_canvas_lib::pty::close(&id);
            eprintln!("--- {harness} ---\n{screen}\n--- end {harness} ---");
            eprintln!("skipping {harness}: {why}");
            return;
        }
        std::thread::sleep(Duration::from_millis(500));
    }
    let took_the_prompt = agent_canvas_lib::pty::settled(&id);
    agent_canvas_lib::pty::close(&id);
    eprintln!("--- {harness} ---\n{screen}\n--- end {harness} ---");
    assert!(
        took_the_prompt,
        "{harness} never took the prompt at all; something on its screen is eating keystrokes"
    );
    assert!(found, "{harness} never went looking for what its peer knew");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore]
async fn claude_finds_out_what_its_peer_did() {
    a_peer_knows_something_this_agent_does_not("claude").await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore]
async fn opencode_finds_out_what_its_peer_did() {
    a_peer_knows_something_this_agent_does_not("opencode").await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore]
async fn codex_finds_out_what_its_peer_did() {
    a_peer_knows_something_this_agent_does_not("codex").await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore]
async fn gemini_finds_out_what_its_peer_did() {
    a_peer_knows_something_this_agent_does_not("gemini").await;
}

/// Scratch probe: launch a harness, send one prompt, print the screen.
///   cargo test --test live_harness -- --ignored --nocapture probe_screen
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore]
async fn probe_screen() {
    let harness = std::env::var("AC_HARNESS").unwrap_or_else(|_| "claude".into());
    let prompt = std::env::var("AC_PROMPT").unwrap_or_else(|_| "/mcp".into());
    let secs: u64 = std::env::var("AC_WAIT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(25);
    use_the_real_bridge();
    let dir = std::env::temp_dir().join(format!("ac-probe-{harness}"));
    std::fs::create_dir_all(&dir).unwrap();

    let bus = BusShared::new();
    let (port, token) = agent_canvas_lib::server::start(bus.clone()).await.unwrap();
    *bus.port.lock() = port;
    *bus.token.lock() = token;
    bus.register_node(node("beta", "opencode", dir.to_str().unwrap()));
    bus.set_output_tail("beta", "beta is doing something spectral");

    let id = agent_canvas_lib::spawn::launch_agent(
        &bus,
        harness.clone(),
        harness.clone(),
        dir.to_string_lossy().to_string(),
        String::new(),
        String::new(),
    )
    .expect("launch");
    bus.edges.lock().push((id.clone(), "beta".into()));
    agent_canvas_lib::spawn::send_prompt(&bus, &id, &prompt).expect("prompt");
    std::thread::sleep(Duration::from_secs(secs));
    let screen = bus
        .get_node(&id)
        .map(|n| n.output_tail.join("\n"))
        .unwrap_or_default();
    agent_canvas_lib::pty::close(&id);
    eprintln!("--- PROBE {harness} :: {prompt} ---\n{screen}\n--- END ---");
}

/// The whole point of the orchestrator story: one agent starts another, and
/// the new one comes up on a real pty, joined to the agent that asked for it.
/// Ignored — it launches a real CLI.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore]
async fn an_agent_can_start_another_agent() {
    let hired = "opencode";
    if !installed(hired) {
        eprintln!("{hired} not installed, skipping");
        return;
    }
    use_the_real_bridge();

    let dir = std::env::temp_dir().join("agent-canvas-live");
    std::fs::create_dir_all(&dir).unwrap();

    let bus = BusShared::new();
    bus.register_node(node("boss", "claude", dir.to_str().unwrap()));
    let (port, token) = agent_canvas_lib::server::start(bus.clone()).await.unwrap();

    let body = json!({
        "by": "boss",
        "harness": hired,
        "name": "Hired",
        "role": "Does what the orchestrator asks",
        "brief": "",
    });
    let res = ureq_post(port, &token, "/hire", &body);
    eprintln!("hire → {res}");
    assert_eq!(res["ok"], json!(true), "hiring failed: {res}");

    let id = res["agent"]["id"].as_str().expect("an id").to_string();
    assert_eq!(res["agent"]["role"], "Does what the orchestrator asks");
    assert!(
        bus.connected("boss", &id),
        "a hired agent nobody is connected to cannot be reached at all"
    );

    // It has to actually come up, not just exist on the Bus.
    let start = Instant::now();
    let mut screen = String::new();
    while start.elapsed() < Duration::from_secs(30) {
        screen = bus
            .get_node(&id)
            .map(|n| n.output_tail.join("\n"))
            .unwrap_or_default();
        if !screen.trim().is_empty() {
            break;
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    agent_canvas_lib::pty::close(&id);
    eprintln!("--- what the hired agent drew ---\n{screen}\n---");
    assert!(
        !screen.trim().is_empty(),
        "the hired agent never painted anything"
    );
}

/// A tiny POST helper: these tests speak to the Bus the way `mcp.rs` does,
/// over a plain socket, so nothing new is pulled in for them.
fn ureq_post(port: u16, token: &str, path: &str, body: &serde_json::Value) -> serde_json::Value {
    use std::io::{Read, Write};
    let mut sock = std::net::TcpStream::connect(("127.0.0.1", port)).expect("connect");
    let payload = body.to_string();
    let req = format!(
        "POST {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer {token}\r\n\
Content-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{payload}",
        payload.len()
    );
    sock.write_all(req.as_bytes()).expect("write");
    let mut raw = String::new();
    sock.read_to_string(&mut raw).expect("read");
    let body = raw.split_once("\r\n\r\n").map(|(_, b)| b).unwrap_or("");
    serde_json::from_str(body).unwrap_or_else(|_| json!({ "raw": raw }))
}
