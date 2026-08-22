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
        .route("/state", get(state))
        .route("/canvas", get(canvas))
        .route("/message", post(message))
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
        (StatusCode::UNAUTHORIZED, Json(json!({"error": "unauthorized"}))).into_response()
    }
}

async fn health() -> Json<Value> {
    Json(json!({ "ok": true }))
}

async fn state(State(ctx): State<Ctx>, Query(q): Query<HashMap<String, String>>) -> Json<Value> {
    let (shared, _) = ctx;
    let node_id = q.get("node").cloned().unwrap_or_default();
    Json(json!({
        "node": shared.get_node(&node_id),
        "peers": shared.peers_of(&node_id),
        "edges": edges_json(&shared),
        "tasks": shared.list_tasks(),
    }))
}

async fn canvas(State(ctx): State<Ctx>) -> Json<Value> {
    let (shared, _) = ctx;
    let nodes: Vec<bus::NodeInfo> = shared.nodes.lock().values().cloned().collect();
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
        Ok(m) => Json(json!({ "ok": true, "message": m })).into_response(),
        Err(e) => err(e),
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
            Some(n) => Json(n).into_response(),
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
