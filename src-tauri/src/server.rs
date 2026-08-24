use axum::extract::{Path, Query, Request, State};
use axum::http::{header, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Json, Response};
use axum::routing::get;
use axum::routing::post;
use axum::Router;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::net::TcpListener;

use crate::bus::{self, BusShared};

type Ctx = (Arc<BusShared>, String);

const POLL: Duration = Duration::from_millis(250);
const TIMEOUT: Duration = Duration::from_secs(120);

pub async fn start(shared: Arc<BusShared>) -> Result<(u16, String), String> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("bind failed: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("local_addr failed: {e}"))?
        .port();
    let token = uuid::Uuid::new_v4().simple().to_string();
    let router = Router::new()
        .route("/health", get(health))
        .route("/peers", get(peers))
        .route("/peer/{id}", get(peer))
        .route("/canvas", get(canvas))
        .route("/message", post(message))
        .route("/hire", post(hire))
        .route("/inbox/{node}", get(inbox))
        .route("/tasks", get(tasks_list).post(task_create))
        .route("/tasks/{id}/claim", post(task_claim))
        .route("/tasks/{id}/complete", post(task_complete))
        .route("/ask_user", post(ask_user))
        .route("/approval/{id}/result", get(approval_result))
        .route("/memory", get(memory_list).post(memory_write))
        .route("/memory/{key}", axum::routing::delete(memory_forget))
        .route("/status", get(status))
        .route("/wait", post(wait))
        .layer(middleware::from_fn_with_state(
            (shared.clone(), token.clone()),
            auth,
        ))
        .with_state((shared, token.clone()));
    tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, router).await {
            eprintln!("bus server stopped: {e}");
        }
    });
    Ok((port, token))
}

async fn auth(State((_, token)): State<Ctx>, req: Request, next: Next) -> Response {
    let ok = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .is_some_and(|t| t == token);
    if ok {
        next.run(req).await
    } else {
        (
            StatusCode::UNAUTHORIZED,
            Json(json!({"error": "unauthorized"})),
        )
            .into_response()
    }
}

async fn health() -> Json<Value> {
    Json(json!({ "ok": true }))
}

/// The shape of the canvas is public; what an agent is actually doing is not.
/// A brief says who a node is and whether it is busy, and stops there.
fn brief_node(n: &bus::NodeInfo) -> Value {
    json!({
        "id": n.id,
        "label": n.label,
        "harness": n.harness,
        "status": n.status,
        "cwd": n.cwd,
        "role": n.role,
    })
}

/// Who the caller may see. `as` is the requesting node, supplied by its own MCP
/// bridge rather than by the agent, so it cannot be claimed.
async fn peers(State(ctx): State<Ctx>, Query(q): Query<HashMap<String, String>>) -> Json<Value> {
    let (shared, _) = ctx;
    let me = q.get("as").cloned().unwrap_or_default();
    let peers: Vec<Value> = shared
        .peers_of(&me)
        .iter()
        .map(|n| {
            let mut v = brief_node(n);
            // One line of what they are up to, so the common case — "who would
            // know about this?" — is answered without a second round trip.
            if let Some(line) = n.output_tail.iter().rev().find(|l| !l.trim().is_empty()) {
                v["doing"] = json!(line.trim());
            }
            v
        })
        .collect();
    Json(json!({ "peers": peers, "tasks": shared.list_tasks() }))
}

/// Everything one peer has on screen. This is the only route that hands an
/// agent another agent's work, and it is the only one that requires an edge.
async fn peer(
    State(ctx): State<Ctx>,
    Path(id): Path<String>,
    Query(q): Query<HashMap<String, String>>,
) -> Response {
    let (shared, _) = ctx;
    let me = q.get("as").cloned().unwrap_or_default();
    if !shared.connected(&me, &id) {
        return forbidden(format!(
            "no connection between {me} and {id}; ask the operator to draw one"
        ));
    }
    match shared.get_node(&id) {
        Some(n) => Json(json!({
            "peer": brief_node(&n),
            "screen": n.output_tail,
        }))
        .into_response(),
        None => err(format!("unknown node {id}")),
    }
}

async fn canvas(State(ctx): State<Ctx>) -> Json<Value> {
    let (shared, _) = ctx;
    let nodes: Vec<Value> = shared.nodes.lock().values().map(brief_node).collect();
    Json(json!({
        "nodes": nodes,
        "edges": edges_json(&shared),
        "tasks": shared.list_tasks(),
    }))
}

#[derive(Deserialize)]
struct MessageBody {
    from: String,
    to: String,
    text: String,
}

async fn message(State(ctx): State<Ctx>, Json(b): Json<MessageBody>) -> Response {
    let (shared, _) = ctx;
    match shared.add_message(&b.from, &b.to, &b.text) {
        Ok(m) => {
            // An idle recipient gets the message typed into its terminal, so
            // it acts on it now instead of the next time somebody prompts it.
            let sender = shared
                .get_node(&b.from)
                .map(|n| n.label)
                .unwrap_or_else(|| b.from.clone());
            let guard = crate::spawn::delivery_lock().lock();
            let delivered = crate::spawn::deliver_message(&shared, &b.to, &sender);
            drop(guard);
            Json(json!({ "ok": true, "message": m, "delivered": delivered })).into_response()
        }
        Err(e) => err(e),
    }
}

#[derive(Deserialize)]
struct HireBody {
    by: String,
    harness: String,
    name: String,
    #[serde(default)]
    role: String,
    #[serde(default)]
    brief: String,
}

/// One agent starting another.
///
/// The new agent lands in the hirer's working directory and is joined to it,
/// because an agent nobody is connected to cannot be seen, messaged, or given
/// anything to do — hiring one and leaving it stranded would be a bug that
/// only shows up as silence.
async fn hire(State(ctx): State<Ctx>, Json(b): Json<HireBody>) -> Response {
    let (shared, _) = ctx;

    if !*shared.allow_hiring.lock() {
        return forbidden(
            "the operator has turned off agents starting other agents; ask them to launch it"
                .to_string(),
        );
    }
    let Some(me) = shared.get_node(&b.by) else {
        return err(format!("unknown node {}", b.by));
    };
    let cap = *shared.agent_cap.lock() as usize;
    let now = shared.nodes.lock().len();
    if now >= cap {
        return forbidden(format!(
            "the canvas is full at {cap} agents. Finish or hand back work before starting more."
        ));
    }
    let name = b.name.trim().to_string();
    if name.is_empty() {
        return err("a new agent needs a name".to_string());
    }
    if shared
        .nodes
        .lock()
        .values()
        .any(|n| n.label.eq_ignore_ascii_case(&name))
    {
        return err(format!(
            "there is already an agent called {name}; pick another name"
        ));
    }

    // `launch_agent` writes config files and spawns a process. Doing that on
    // the async runtime would block whichever worker is serving other agents.
    let bus = shared.clone();
    let (harness, role, brief, cwd) = (b.harness.clone(), b.role.clone(), b.brief.clone(), me.cwd);
    let launched = tokio::task::spawn_blocking(move || {
        crate::spawn::launch_agent(&bus, name, harness, cwd, brief, role)
    })
    .await;

    let id = match launched {
        Ok(Ok(id)) => id,
        Ok(Err(e)) => return err(e),
        Err(e) => return err(format!("the agent did not start: {e}")),
    };

    shared.connect(&b.by, &id);
    if let Some(node) = shared.get_node(&id) {
        shared.announce_node(&node);
        Json(json!({ "ok": true, "agent": brief_node(&node) })).into_response()
    } else {
        err("the agent started but is not on the Bus".to_string())
    }
}

async fn inbox(State(ctx): State<Ctx>, Path(node): Path<String>) -> Json<Value> {
    let (shared, _) = ctx;
    Json(json!({ "messages": shared.drain_inbox(&node) }))
}

async fn memory_list(
    State(ctx): State<Ctx>,
    Query(q): Query<HashMap<String, String>>,
) -> Json<Value> {
    let (shared, _) = ctx;
    Json(json!({ "memory": shared.recall(q.get("q").map(String::as_str)) }))
}

#[derive(Deserialize)]
struct MemoryBody {
    author: String,
    key: String,
    value: String,
}

async fn memory_write(State(ctx): State<Ctx>, Json(b): Json<MemoryBody>) -> Json<Value> {
    let (shared, _) = ctx;
    Json(json!(shared.remember(&b.author, &b.key, &b.value)))
}

async fn memory_forget(State(ctx): State<Ctx>, Path(key): Path<String>) -> Response {
    let (shared, _) = ctx;
    match shared.forget(&key) {
        Ok(e) => Json(json!({ "ok": true, "forgot": e })).into_response(),
        Err(e) => err(e),
    }
}

async fn tasks_list(State(ctx): State<Ctx>) -> Json<Value> {
    let (shared, _) = ctx;
    Json(json!({ "tasks": shared.list_tasks() }))
}

#[derive(Deserialize)]
struct TaskBody {
    creator: String,
    title: String,
    #[serde(default)]
    details: String,
}

async fn task_create(State(ctx): State<Ctx>, Json(b): Json<TaskBody>) -> Json<Value> {
    let (shared, _) = ctx;
    Json(json!(shared.add_task(&b.creator, &b.title, &b.details)))
}

#[derive(Deserialize)]
struct NodeBody {
    node: String,
}

async fn task_claim(
    State(ctx): State<Ctx>,
    Path(id): Path<String>,
    Json(b): Json<NodeBody>,
) -> Response {
    let (shared, _) = ctx;
    match shared.claim_task(&id, &b.node) {
        Ok(t) => Json(t).into_response(),
        Err(e) => err(e),
    }
}

#[derive(Deserialize)]
struct CompleteBody {
    node: String,
    #[serde(default)]
    result: String,
}

async fn task_complete(
    State(ctx): State<Ctx>,
    Path(id): Path<String>,
    Json(b): Json<CompleteBody>,
) -> Response {
    let (shared, _) = ctx;
    match shared.complete_task(&id, &b.node, &b.result) {
        Ok(t) => Json(t).into_response(),
        Err(e) => err(e),
    }
}

#[derive(Deserialize)]
struct AskBody {
    node: String,
    question: String,
}

async fn ask_user(State(ctx): State<Ctx>, Json(b): Json<AskBody>) -> Json<Value> {
    let (shared, _) = ctx;
    let approval = shared.ask_user(&b.node, &b.question);
    match poll_answer(&shared, &approval.id).await {
        Some(answer) => {
            shared.set_status(&b.node, "running");
            Json(json!({ "id": approval.id, "answer": answer }))
        }
        None => Json(json!({ "id": approval.id, "answer": null, "timeout": true })),
    }
}

async fn approval_result(State(ctx): State<Ctx>, Path(id): Path<String>) -> Json<Value> {
    let (shared, _) = ctx;
    match poll_answer(&shared, &id).await {
        Some(answer) => Json(json!({ "id": id, "answer": answer })),
        None => Json(json!({ "answer": null, "timeout": true })),
    }
}

async fn status(State(ctx): State<Ctx>, Query(q): Query<HashMap<String, String>>) -> Response {
    let (shared, _) = ctx;
    match q.get("node").cloned() {
        Some(id) => match shared.get_node(&id) {
            Some(n) => Json(brief_node(&n)).into_response(),
            None => (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": format!("node {id} not found") })),
            )
                .into_response(),
        },
        None => Json(json!({ "nodes": nodes_map(&shared) })).into_response(),
    }
}

#[derive(Deserialize)]
struct WaitBody {
    nodes: Vec<String>,
}

async fn wait(State(ctx): State<Ctx>, Json(b): Json<WaitBody>) -> Json<Value> {
    let (shared, _) = ctx;
    let deadline = tokio::time::Instant::now() + TIMEOUT;
    let mut done = false;
    loop {
        if all_settled(&shared, &b.nodes) {
            done = true;
            break;
        }
        if tokio::time::Instant::now() >= deadline {
            break;
        }
        tokio::time::sleep(POLL).await;
    }
    Json(json!({ "nodes": nodes_map(&shared), "done": done }))
}

fn all_settled(shared: &BusShared, ids: &[String]) -> bool {
    ids.iter().all(|id| {
        shared
            .get_node(id)
            .map(|n| n.status != "running")
            .unwrap_or(false)
    })
}

async fn poll_answer(shared: &BusShared, id: &str) -> Option<String> {
    let deadline = tokio::time::Instant::now() + TIMEOUT;
    loop {
        if let Some(a) = shared.approval_answer(id) {
            return Some(a);
        }
        if tokio::time::Instant::now() >= deadline {
            return None;
        }
        tokio::time::sleep(POLL).await;
    }
}

fn edges_json(shared: &BusShared) -> Value {
    let edges = shared.edges.lock();
    Value::Array(edges.iter().map(|(a, b)| json!([a, b])).collect())
}

fn nodes_map(shared: &BusShared) -> Value {
    let nodes = shared.nodes.lock();
    Value::Object(
        nodes
            .iter()
            .map(|(id, n)| {
                (
                    id.clone(),
                    json!({
                        "status": n.status,
                        "label": n.label,
                        "harness": n.harness,
                    }),
                )
            })
            .collect(),
    )
}

fn err<S: Into<String>>(s: S) -> Response {
    (StatusCode::BAD_REQUEST, Json(json!({ "error": s.into() }))).into_response()
}

fn forbidden<S: Into<String>>(s: S) -> Response {
    (StatusCode::FORBIDDEN, Json(json!({ "error": s.into() }))).into_response()
}
