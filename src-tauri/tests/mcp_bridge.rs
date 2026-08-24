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
        role: String::new(),
        output_tail: vec![],
        unread: 0,
        turns: 0,
        busy_ms: 0,
        tokens: 0,
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

    /// A call that is expected to be refused. Returns what the agent is told.
    fn tool_err(&mut self, name: &str, args: Value) -> String {
        let res = self.call("tools/call", json!({ "name": name, "arguments": args }));
        let text = res["result"]["content"][0]["text"]
            .as_str()
            .unwrap_or("")
            .to_string();
        assert_eq!(
            res["result"]["isError"],
            json!(true),
            "{name} should have been refused, got: {text}"
        );
        text
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

    // Without this the agent has no idea it is on a canvas, and answers a
    // question about a peer's work from its own knowledge instead of asking.
    let briefing = init["result"]["instructions"]
        .as_str()
        .expect("initialize must carry instructions");
    assert!(
        briefing.contains("alpha"),
        "the agent is not told which node it is"
    );
    for cue in ["list_peers", "recall", "remember", "check_inbox"] {
        assert!(briefing.contains(cue), "the briefing never mentions {cue}");
    }

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

/// The promise the README makes is that content needs an edge. It used not to
/// hold: `get_peer_context` read whatever node id it was handed, and every id
/// on the canvas is discoverable through `list_canvas`.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_peer_screen_is_readable_only_across_an_edge() {
    let bus = BusShared::new();
    bus.register_node(node("alpha", "claude"));
    bus.register_node(node("beta", "opencode"));
    bus.register_node(node("gamma", "gemini"));
    bus.edges.lock().push(("alpha".into(), "beta".into()));
    bus.set_output_tail("beta", "OpenClaude summons a spectral assistant");
    bus.set_output_tail("gamma", "a private thing gamma is working on");

    let (port, token) = agent_canvas_lib::server::start(bus.clone())
        .await
        .expect("bus should bind");
    let mut mcp = Bridge::start(port, &token, "alpha");
    mcp.call("initialize", json!({ "protocolVersion": "2024-11-05" }));

    let seen = mcp.tool("get_peer_context", json!({ "peer_id": "beta" }));
    assert!(
        seen["screen"].as_array().expect("screen").iter().any(|l| l
            .as_str()
            .unwrap_or_default()
            .contains("spectral assistant")),
        "a connected peer's screen should be readable: {seen}"
    );

    let blocked = mcp.call(
        "tools/call",
        json!({ "name": "get_peer_context", "arguments": { "peer_id": "gamma" } }),
    );
    assert_eq!(
        blocked["result"]["isError"],
        json!(true),
        "reading an unconnected node's screen must fail"
    );

    // The shape of the canvas is public, so an agent can tell who else exists
    // and ask the operator for a connection. What they are doing is not.
    let canvas = mcp.tool("list_canvas", json!({}));
    let text = canvas.to_string();
    assert!(text.contains("gamma"), "the canvas shape should be visible");
    assert!(
        !text.contains("a private thing"),
        "list_canvas leaked an unconnected agent's screen: {text}"
    );

    // list_peers carries one line of what each peer is doing, so the common
    // question — who would know about this? — takes one call, not two.
    let peers = mcp.tool("list_peers", json!({}));
    assert_eq!(
        peers["peers"][0]["doing"],
        json!("OpenClaude summons a spectral assistant")
    );
}

/// `wait_for_nodes` is what lets one agent hold off until another has finished.
/// It has to actually block, and it has to come back when the wait is over.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn waiting_on_a_peer_returns_when_it_stops_working() {
    let bus = BusShared::new();
    bus.register_node(node("alpha", "claude"));
    bus.register_node(node("beta", "codex"));
    bus.edges.lock().push(("alpha".into(), "beta".into()));
    bus.set_status("beta", "running");

    let (port, token) = agent_canvas_lib::server::start(bus.clone())
        .await
        .expect("bus should bind");
    let mut mcp = Bridge::start(port, &token, "alpha");
    mcp.call("initialize", json!({ "protocolVersion": "2024-11-05" }));

    let finishing = bus.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(700));
        finishing.set_status("beta", "idle");
    });

    let started = std::time::Instant::now();
    let done = mcp.tool("wait_for_nodes", json!({ "node_ids": ["beta"] }));
    assert!(
        started.elapsed() >= std::time::Duration::from_millis(500),
        "it returned before beta could possibly have finished"
    );
    assert_eq!(done["done"], json!(true), "{done}");
}

/// A team is only a team if its members know what the others are for. The
/// role has to survive the whole path: stored on the Bus, into `brief()`,
/// out through `/peers`, and into what the agent actually reads.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_peer_reads_what_its_neighbour_is_for() {
    let bus = BusShared::new();
    let mut maker = node("maker", "claude");
    maker.label = "Maker".into();
    maker.role = "Writes the code".into();
    let mut reviewer = node("reviewer", "codex");
    reviewer.label = "Reviewer".into();
    reviewer.role = "Reviews the Maker's work and objects".into();
    bus.register_node(maker);
    bus.register_node(reviewer);
    bus.edges.lock().push(("maker".into(), "reviewer".into()));

    let (port, token) = agent_canvas_lib::server::start(bus.clone())
        .await
        .expect("bus should bind");

    let mut mcp = Bridge::start(port, &token, "maker");

    let briefing = mcp.call("initialize", json!({ "protocolVersion": "2024-11-05" }))["result"]
        ["instructions"]
        .as_str()
        .expect("instructions")
        .to_string();
    assert!(
        briefing.contains("role"),
        "nothing tells the agent its peers have roles, so it will never look"
    );

    let peers = mcp.tool("list_peers", json!({}));
    let peer = &peers["peers"][0];
    assert_eq!(peer["label"], "Reviewer");
    assert_eq!(peer["role"], "Reviews the Maker's work and objects");

    // A rename reaches the peer too: the name lives on the Bus, not the canvas.
    bus.rename_node("reviewer", "Critic").unwrap();
    let peers = mcp.tool("list_peers", json!({}));
    assert_eq!(peers["peers"][0]["label"], "Critic");
    assert_eq!(
        peers["peers"][0]["role"], "Reviews the Maker's work and objects",
        "renaming must not wipe what they are for"
    );
}

/// An orchestrator starting its own team is real processes and real money.
/// Every refusal here happens before anything is spawned, so this costs
/// nothing to run and is the part that must not be wrong.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn hiring_is_refused_before_anything_is_started() {
    let bus = BusShared::new();
    let mut boss = node("boss", "claude");
    boss.label = "Boss".into();
    bus.register_node(boss);

    let (port, token) = agent_canvas_lib::server::start(bus.clone())
        .await
        .expect("bus should bind");
    let mut mcp = Bridge::start(port, &token, "boss");
    mcp.call("initialize", json!({ "protocolVersion": "2024-11-05" }));

    // The tool has to be discoverable, or an orchestrator never knows it can.
    let listed = mcp.call("tools/list", json!({}));
    let names: Vec<String> = listed["result"]["tools"]
        .as_array()
        .unwrap()
        .iter()
        .map(|t| t["name"].as_str().unwrap_or_default().to_string())
        .collect();
    assert!(names.contains(&"hire_agent".to_string()));

    let no_name = mcp.tool_err("hire_agent", json!({ "harness": "opencode", "name": "  " }));
    assert!(no_name.contains("name"), "got: {no_name}");

    let unknown = mcp.tool_err(
        "hire_agent",
        json!({ "harness": "not-a-real-cli", "name": "Ghost" }),
    );
    assert!(unknown.contains("harness"), "got: {unknown}");

    let taken = mcp.tool_err(
        "hire_agent",
        json!({ "harness": "opencode", "name": "boss" }),
    );
    assert!(
        taken.contains("already an agent"),
        "a name already in use must be refused, got: {taken}"
    );

    // The operator's switch wins over anything the agent asks for.
    *bus.allow_hiring.lock() = false;
    let off = mcp.tool_err(
        "hire_agent",
        json!({ "harness": "opencode", "name": "Helper" }),
    );
    assert!(off.contains("operator"), "got: {off}");
    *bus.allow_hiring.lock() = true;

    // And so does the ceiling on how many agents may exist at once.
    *bus.agent_cap.lock() = 1;
    let full = mcp.tool_err(
        "hire_agent",
        json!({ "harness": "opencode", "name": "Helper" }),
    );
    assert!(full.contains("full"), "got: {full}");

    assert_eq!(
        bus.nodes.lock().len(),
        1,
        "not one of those refusals may have started a process"
    );
    assert!(bus.edges.lock().is_empty());
}
