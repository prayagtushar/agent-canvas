//! Drives the real MCP bridge the way an agent CLI does: start the Bus,
//! launch this binary in `--bus-mcp` mode, and speak JSON-RPC over its stdio.

use agent_canvas_lib::bus::{BusShared, NodeInfo};
use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};

fn node(id: &str, harness: &str) -> NodeInfo {
    NodeInfo {
        id: id.to_string(),
        label: id.to_string(),
        harness: harness.to_string(),
        cwd: "/tmp".to_string(),
        status: "idle".to_string(),
        output_tail: vec![],
        unread: 0,
        tokens_in: 0,
        tokens_out: 0,
        cost_usd: 0.0,
    }
}

struct Bridge {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
    id: i64,
}

impl Bridge {
    fn start(port: u16, token: &str, node_id: &str) -> Self {
        let mut child = Command::new(env!("CARGO_BIN_EXE_agent-canvas"))
            .args(["--bus-mcp", &port.to_string(), token, node_id])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .expect("bus-mcp mode should launch");
        let stdin = child.stdin.take().unwrap();
        let stdout = BufReader::new(child.stdout.take().unwrap());
        Self {
            child,
            stdin,
            stdout,
            id: 0,
        }
    }

    fn call(&mut self, method: &str, params: Value) -> Value {
        self.id += 1;
        let req = json!({ "jsonrpc": "2.0", "id": self.id, "method": method, "params": params });
        writeln!(self.stdin, "{req}").unwrap();
        self.stdin.flush().unwrap();
        let mut line = String::new();
        self.stdout.read_line(&mut line).unwrap();
        serde_json::from_str(&line).unwrap()
    }

    /// Tool results come back as a JSON string inside MCP's text content.
    fn tool(&mut self, name: &str, args: Value) -> Value {
        let res = self.call("tools/call", json!({ "name": name, "arguments": args }));
        let text = res["result"]["content"][0]["text"]
            .as_str()
            .unwrap_or("")
            .to_string();
        assert_ne!(
            res["result"]["isError"],
            json!(true),
            "{name} failed: {text}"
        );
        serde_json::from_str(&text).unwrap_or(Value::String(text))
    }
}

impl Drop for Bridge {
    fn drop(&mut self) {
        let _ = self.child.kill();
    }
}

// multi_thread: the test blocks on the child's stdout, so the axum server
// needs its own worker or it never gets to accept the connection.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn an_agent_sees_only_its_connected_peer_through_mcp() {
    let bus = BusShared::new();
    bus.register_node(node("alpha", "claude"));
    bus.register_node(node("beta", "codex"));
    bus.register_node(node("gamma", "gemini"));
    bus.edges.lock().push(("alpha".into(), "beta".into()));

    let (port, token) = agent_canvas_lib::server::start(bus.clone())
        .await
        .expect("bus should bind");

    let mut mcp = Bridge::start(port, &token, "alpha");

    let init = mcp.call("initialize", json!({ "protocolVersion": "2024-11-05" }));
    assert_eq!(init["result"]["serverInfo"]["name"], "agent-canvas-bus");

    let listed = mcp.call("tools/list", json!({}));
    let names: Vec<String> = listed["result"]["tools"]
        .as_array()
        .expect("tools array")
        .iter()
        .map(|t| t["name"].as_str().unwrap_or_default().to_string())
        .collect();
    for expected in [
        "list_peers",
        "message_peer",
        "add_task",
        "claim_task",
        "remember",
        "recall",
        "forget",
        "ask_user",
    ] {
        assert!(
            names.contains(&expected.to_string()),
            "missing tool {expected}"
        );
    }

    // scoping: alpha is joined to beta only, so gamma must not appear
    let peers = mcp.tool("list_peers", json!({}));
    let ids: Vec<&str> = peers["peers"]
        .as_array()
        .expect("peers array")
        .iter()
        .filter_map(|p| p["id"].as_str())
        .collect();
    assert_eq!(ids, vec!["beta"], "alpha should see beta and nobody else");

    // shared memory round-trips through the bridge
    mcp.tool(
        "remember",
        json!({ "key": "owner", "value": "beta reviews the proxy" }),
    );
    let recalled = mcp.tool("recall", json!({ "query": "proxy" }));
    assert_eq!(recalled["memory"][0]["value"], "beta reviews the proxy");
    assert_eq!(recalled["memory"][0]["author"], "alpha");

    // a task created here is visible on the Bus
    mcp.tool("add_task", json!({ "title": "wire the parser" }));
    assert_eq!(bus.list_tasks().len(), 1);
    assert_eq!(bus.list_tasks()[0].title, "wire the parser");

    // messaging is gated by the edge
    mcp.tool(
        "message_peer",
        json!({ "peer_id": "beta", "text": "take it" }),
    );
    assert_eq!(bus.drain_inbox("beta").len(), 1);

    let blocked = mcp.call(
        "tools/call",
        json!({ "name": "message_peer", "arguments": { "peer_id": "gamma", "text": "hi" } }),
    );
    assert_eq!(
        blocked["result"]["isError"],
        json!(true),
        "messaging an unconnected node must fail"
    );
}
