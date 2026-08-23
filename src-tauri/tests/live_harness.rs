//! Runs the real agent CLIs against a real Bus. Ignored by default because it
//! spends provider credits and needs the CLIs installed and logged in.
//!
//!   cargo test --test live_harness -- --ignored --nocapture

use agent_canvas_lib::bus::{BusShared, NodeInfo};
use serde_json::json;
use std::process::Command;

fn node(id: &str, harness: &str, cwd: &str) -> NodeInfo {
    NodeInfo {
        id: id.to_string(),
        label: id.to_string(),
        harness: harness.to_string(),
        cwd: cwd.to_string(),
        status: "idle".to_string(),
        output_tail: vec![],
        unread: 0,
        tokens_in: 0,
        tokens_out: 0,
        cost_usd: 0.0,
    }
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
