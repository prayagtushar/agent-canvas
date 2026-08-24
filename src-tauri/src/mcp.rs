use serde_json::{json, Map, Value};
use std::borrow::Cow;
use std::io::{BufRead, Read, Write};
use std::net::TcpStream;
use std::time::Duration;

pub fn run(port: u16, token: String, node_id: String) {
    eprintln!("[bus-mcp] node={} port={}", node_id, port);
    let stdin = std::io::stdin();
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let Ok(msg) = serde_json::from_str::<Value>(trimmed) else {
            continue;
        };
        let Some(method) = msg.get("method").and_then(Value::as_str) else {
            continue;
        };
        if method.starts_with("notifications/") {
            continue;
        }
        let Some(id) = msg.get("id") else {
            continue;
        };
        let params = msg.get("params").cloned().unwrap_or_else(|| json!({}));
        let response = handle(
            method.to_string(),
            params,
            id.clone(),
            port,
            &token,
            &node_id,
        );
        let mut out = std::io::stdout().lock();
        let _ = writeln!(out, "{}", response);
        let _ = out.flush();
    }
}

fn handle(
    method: String,
    params: Value,
    id: Value,
    port: u16,
    token: &str,
    node_id: &str,
) -> Value {
    match method.as_str() {
        "initialize" => envelope(
            id,
            json!({
                "protocolVersion": params.get("protocolVersion").and_then(Value::as_str).unwrap_or("2024-11-05"),
                "capabilities": { "tools": {} },
                "serverInfo": { "name": "agent-canvas-bus", "version": "0.1.0" },
                "instructions": briefing(node_id),
            }),
        ),
        "tools/list" => envelope(id, json!({ "tools": tools() })),
        "tools/call" => envelope(id, invoke(params, port, token, node_id)),
        _ => json!({
            "jsonrpc": "2.0",
            "id": id,
            "error": { "code": -32601, "message": "method not found" },
        }),
    }
}

/// What the agent is told about where it is running.
///
/// MCP puts this in `InitializeResult.instructions`, which clients fold into
/// the model's system prompt. Without it an agent has no idea it is on a
/// canvas at all: asked about work a peer did, it answers from its own
/// knowledge and says it does not know, because nothing ever suggested there
/// was somebody else to ask.
pub fn briefing(node_id: &str) -> String {
    format!(
        "You are one agent on an Agent Canvas: several AI coding CLIs running side \
by side, each in its own terminal and working directory, joined by a shared Bus. \
You are node `{node_id}`.

The operator draws the connections that decide who you can see. Agents joined to \
you are your peers. You cannot see anyone else's terminal and they cannot see \
yours. Nothing you print in your own terminal reaches another agent: a fact \
leaves this node only through a tool.

Peers may have roles — reviewer, planner, whatever the operator set up. \
`list_peers` gives you each one's role, so route work to whoever it belongs to \
instead of doing it yourself.

THE MISTAKE TO AVOID. A name you do not recognise is far more likely to be a \
peer's work than a mistake by the operator. Spells, functions, files, plans, \
schemas and decisions another agent invented ten seconds ago look exactly like \
things that do not exist.

So: never answer that something is unknown, unfamiliar, not a real thing, or a \
typo until you have called `list_peers` and `recall`, and `get_peer_context` on \
any peer that might have produced it. Look first, then answer. This comes before \
your own knowledge, and it applies even when the question sounds like general \
knowledge rather than something about this canvas.

The rest:

- When you decide something, invent a name, or settle on a shape others will \
need, call `remember` with a short stable key. That is the only way it reaches \
anyone.
- `list_tasks` and `claim_task` before starting work someone else might already \
be doing; `complete_task` when it is finished.
- `check_inbox` when you begin a turn, and whenever a peer says they sent you \
something.
- `ask_user` when a decision is the human's to make. It blocks until they answer.
- `hire_agent` when the work splits into parts that can run at once, or needs a \
second pair of eyes. You get a peer connected to you, in your working \
directory. Brief it fully: it cannot see anything you have read or said."
    )
}

fn envelope(id: Value, result: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "result": result })
}

fn invoke(params: Value, port: u16, token: &str, node_id: &str) -> Value {
    let empty = Map::new();
    let name = params.get("name").and_then(Value::as_str).unwrap_or("");
    let args = params
        .get("arguments")
        .and_then(Value::as_object)
        .unwrap_or(&empty);
    let (text, is_error) = match call_tool(name, args, port, token, node_id) {
        Ok(bus_value) => (bus_value.to_string(), false),
        Err(err_text) => (err_text, true),
    };
    json!({
        "content": [{ "type": "text", "text": text }],
        "isError": is_error,
    })
}

fn call_tool(
    name: &str,
    args: &Map<String, Value>,
    port: u16,
    token: &str,
    node_id: &str,
) -> Result<Value, String> {
    let (verb, path, body): (&str, String, Option<Value>) = match name {
        "list_peers" => ("GET", format!("/peers?as={node_id}"), None),
        "get_peer_context" => (
            "GET",
            format!("/peer/{}?as={node_id}", str_arg(args, "peer_id")?),
            None,
        ),
        "message_peer" => {
            let to = str_arg(args, "peer_id")?;
            let text = str_arg(args, "text")?;
            (
                "POST",
                "/message".to_string(),
                Some(json!({ "from": node_id, "to": to, "text": text })),
            )
        }
        "check_inbox" => ("GET", format!("/inbox/{node_id}"), None),
        "hire_agent" => {
            let harness = str_arg(args, "harness")?;
            let name = str_arg(args, "name")?;
            (
                "POST",
                "/hire".to_string(),
                Some(json!({
                    "by": node_id,
                    "harness": harness,
                    "name": name,
                    "role": opt_str(args, "role"),
                    "brief": opt_str(args, "brief"),
                })),
            )
        }
        "add_task" => {
            let title = str_arg(args, "title")?;
            let details = opt_str(args, "details");
            (
                "POST",
                "/tasks".to_string(),
                Some(json!({ "creator": node_id, "title": title, "details": details })),
            )
        }
        "list_tasks" => ("GET", "/tasks".to_string(), None),
        "claim_task" => {
            let task_id = str_arg(args, "task_id")?;
            (
                "POST",
                format!("/tasks/{task_id}/claim"),
                Some(json!({ "node": node_id })),
            )
        }
        "complete_task" => {
            let task_id = str_arg(args, "task_id")?;
            let result = opt_str(args, "result");
            (
                "POST",
                format!("/tasks/{task_id}/complete"),
                Some(json!({ "node": node_id, "result": result })),
            )
        }
        "get_node_status" => {
            let target = args
                .get("node_id")
                .and_then(Value::as_str)
                .unwrap_or(node_id);
            ("GET", format!("/status?node={target}"), None)
        }
        "wait_for_nodes" => {
            let ids = arr_arg(args, "node_ids")?.clone();
            ("POST", "/wait".to_string(), Some(json!({ "nodes": ids })))
        }
        "ask_user" => {
            let question = str_arg(args, "question")?;
            (
                "POST",
                "/ask_user".to_string(),
                Some(json!({ "node": node_id, "question": question })),
            )
        }
        "list_canvas" => ("GET", "/canvas".to_string(), None),
        "remember" => {
            let key = str_arg(args, "key")?;
            let value = str_arg(args, "value")?;
            (
                "POST",
                "/memory".to_string(),
                Some(json!({ "author": node_id, "key": key, "value": value })),
            )
        }
        "recall" => {
            let q = opt_str(args, "query");
            let path = if q.is_empty() {
                "/memory".to_string()
            } else {
                format!("/memory?q={}", urlencode(&q))
            };
            ("GET", path, None)
        }
        "forget" => (
            "DELETE",
            format!("/memory/{}", urlencode(&str_arg(args, "key")?)),
            None,
        ),
        other => return Err(format!("unknown tool: {other}")),
    };
    match bus_http(port, token, verb, &path, body.as_ref()) {
        // The Bus refuses plenty of things on purpose: messaging a node you
        // are not connected to, claiming a task someone else owns, exceeding
        // the message cap. Those come back as 4xx and must reach the agent as
        // tool errors, not as a successful result it will act on.
        Some((status, body)) if status < 400 => Ok(body),
        Some((status, body)) => Err(body
            .get("error")
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| format!("bus returned {status}"))),
        None => Err("bus unreachable".to_string()),
    }
}

/// Minimal percent-encoding for the few user strings that reach a URL.
fn urlencode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

/// Returns the HTTP status alongside the decoded JSON body.
fn bus_http(
    port: u16,
    token: &str,
    verb: &str,
    path: &str,
    body: Option<&Value>,
) -> Option<(u16, Value)> {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).ok()?;
    stream
        .set_read_timeout(Some(Duration::from_secs(180)))
        .ok()?;
    let payload = body.map(Value::to_string).unwrap_or_default();
    let request = format!(
        "{} {} HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nAuthorization: Bearer {}\r\nAccept: application/json\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        verb,
        path,
        port,
        token,
        payload.len(),
        payload
    );
    stream.write_all(request.as_bytes()).ok()?;
    stream.flush().ok()?;
    let mut raw = Vec::new();
    stream.read_to_end(&mut raw).ok()?;
    let sep = raw.windows(4).position(|w| w == b"\r\n\r\n")?;
    let head = String::from_utf8_lossy(&raw[..sep]).to_ascii_lowercase();
    let status = head
        .split_whitespace()
        .nth(1)
        .and_then(|c| c.parse::<u16>().ok())
        .unwrap_or(0);
    let body_bytes = &raw[sep + 4..];
    let final_bytes: Cow<[u8]> = if head.contains("transfer-encoding") && head.contains("chunked") {
        Cow::Owned(dechunk(body_bytes)?)
    } else {
        Cow::Borrowed(body_bytes)
    };
    let value = serde_json::from_slice(&final_bytes).unwrap_or(Value::Null);
    Some((status, value))
}

fn dechunk(body: &[u8]) -> Option<Vec<u8>> {
    let mut out = Vec::new();
    let mut i = 0;
    loop {
        while i < body.len() && (body[i] == b'\r' || body[i] == b'\n') {
            i += 1;
        }
        if i >= body.len() {
            return Some(out);
        }
        let line_end = body[i..].windows(2).position(|w| w == b"\r\n")? + i;
        let size_line = std::str::from_utf8(&body[i..line_end]).ok()?;
        let size = usize::from_str_radix(size_line.split(';').next()?.trim(), 16).ok()?;
        if size == 0 {
            return Some(out);
        }
        let start = line_end + 2;
        if start + size > body.len() {
            return None;
        }
        out.extend_from_slice(&body[start..start + size]);
        i = start + size;
    }
}

fn str_arg(args: &Map<String, Value>, key: &str) -> Result<String, String> {
    args.get(key)
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| format!("missing argument: {key}"))
}

fn opt_str(args: &Map<String, Value>, key: &str) -> String {
    args.get(key)
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string()
}

fn arr_arg<'a>(args: &'a Map<String, Value>, key: &str) -> Result<&'a Vec<Value>, String> {
    args.get(key)
        .and_then(Value::as_array)
        .ok_or_else(|| format!("missing argument: {key}"))
}

fn schema(properties: Value, required: &[&str]) -> Value {
    json!({ "type": "object", "properties": properties, "required": required })
}

fn tools() -> Vec<Value> {
    vec![
        json!({
            "name": "list_peers",
            "description": "The agents you are connected to, with what each is doing right now. Call this before answering any question about work you did not do yourself.",
            "inputSchema": schema(json!({}), &[]),
        }),
        json!({
            "name": "get_peer_context",
            "description": "Read what is on a connected peer's screen. This is how you find out what another agent actually did. Requires a connection to that peer.",
            "inputSchema": schema(
                json!({ "peer_id": { "type": "string", "description": "Peer node id" } }),
                &["peer_id"],
            ),
        }),
        json!({
            "name": "message_peer",
            "description": "Send a direct message to a connected peer agent.",
            "inputSchema": schema(
                json!({ "peer_id": { "type": "string" }, "text": { "type": "string" } }),
                &["peer_id", "text"],
            ),
        }),
        json!({
            "name": "hire_agent",
            "description": "Start another agent on this canvas and connect it to you. Use this when the work splits into parts that can run at the same time, or needs a second pair of eyes. The new agent begins in your working directory, sees only you, and gets `brief` typed into it as its first instruction — so put everything it needs to know in there, including what it must not touch. It cannot see this conversation. Give it work through `add_task` or `message_peer` afterwards.",
            "inputSchema": schema(
                json!({
                    "harness": { "type": "string", "description": "Which CLI to run, e.g. claude, codex, opencode, gemini. Ask list_canvas or the operator if unsure." },
                    "name": { "type": "string", "description": "A short unique name, e.g. Builder or Frontend" },
                    "role": { "type": "string", "description": "A few words on what it is for. Its peers read this." },
                    "brief": { "type": "string", "description": "Its opening instruction, typed into its terminal when it comes up." }
                }),
                &["harness", "name"],
            ),
        }),
        json!({
            "name": "check_inbox",
            "description": "Fetch and clear messages peers have sent you. Worth calling when you start a turn.",
            "inputSchema": schema(json!({}), &[]),
        }),
        json!({
            "name": "add_task",
            "description": "Create a new task on the shared board.",
            "inputSchema": schema(
                json!({ "title": { "type": "string" }, "details": { "type": "string" } }),
                &["title"],
            ),
        }),
        json!({
            "name": "list_tasks",
            "description": "List every task on the shared board.",
            "inputSchema": schema(json!({}), &[]),
        }),
        json!({
            "name": "claim_task",
            "description": "Claim a todo task for yourself.",
            "inputSchema": schema(
                json!({ "task_id": { "type": "string" } }),
                &["task_id"],
            ),
        }),
        json!({
            "name": "complete_task",
            "description": "Mark one of your claimed tasks done.",
            "inputSchema": schema(
                json!({ "task_id": { "type": "string" }, "result": { "type": "string" } }),
                &["task_id"],
            ),
        }),
        json!({
            "name": "get_node_status",
            "description": "Read a node's current status (defaults to yourself).",
            "inputSchema": schema(
                json!({ "node_id": { "type": "string" } }),
                &[],
            ),
        }),
        json!({
            "name": "wait_for_nodes",
            "description": "Block until the given nodes finish running.",
            "inputSchema": schema(
                json!({ "node_ids": { "type": "array", "items": { "type": "string" } } }),
                &["node_ids"],
            ),
        }),
        json!({
            "name": "ask_user",
            "description": "Ask the human operator a question and block until they answer.",
            "inputSchema": schema(
                json!({ "question": { "type": "string" } }),
                &["question"],
            ),
        }),
        json!({
            "name": "list_canvas",
            "description": "Every node and edge on the canvas, including agents you are not connected to. Names and status only; reading a peer's work needs a connection.",
            "inputSchema": schema(json!({}), &[]),
        }),
        json!({
            "name": "remember",
            "description": "Write a fact into the memory every agent on this canvas shares. This is the only way something you worked out reaches another agent. Use a short stable key; writing the same key again replaces it.",
            "inputSchema": schema(
                json!({
                    "key": { "type": "string", "description": "Short stable identifier, e.g. db-migration-plan" },
                    "value": { "type": "string", "description": "The fact to store" },
                }),
                &["key", "value"],
            ),
        }),
        json!({
            "name": "recall",
            "description": "Read the shared canvas memory, newest first. Check here before saying you do not know something. Omit query to get everything.",
            "inputSchema": schema(
                json!({ "query": { "type": "string", "description": "Optional filter over keys and values" } }),
                &[],
            ),
        }),
        json!({
            "name": "forget",
            "description": "Remove one fact from the shared canvas memory.",
            "inputSchema": schema(
                json!({ "key": { "type": "string", "description": "Key to remove" } }),
                &["key"],
            ),
        }),
    ]
}
