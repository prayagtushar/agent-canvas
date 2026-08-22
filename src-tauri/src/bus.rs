use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeInfo {
    pub id: String,
    pub label: String,
    pub harness: String,
    pub cwd: String,
    pub status: String,
    pub output_tail: Vec<String>,
    pub unread: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BusMessage {
    pub id: String,
    pub from: String,
    pub to: String,
    pub text: String,
    pub ts: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub title: String,
    pub details: String,
    pub status: String,
    pub owner: Option<String>,
    pub result: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Approval {
    pub id: String,
    pub from_node: String,
    pub question: String,
    pub answer: Option<String>,
}

/// One fact the whole canvas shares, so agents draw on the same memory
/// instead of each keeping its own.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryEntry {
    pub key: String,
    pub value: String,
    pub author: String,
    pub ts: u64,
}

pub struct BusShared {
    /// Whether agents may message each other without asking the operator.
    pub auto_comm: Mutex<bool>,
    /// Agent-to-agent messages sent so far, and the ceiling. Two agents can
    /// talk each other in circles forever, which costs real money, so the
    /// Bus stops relaying once the count reaches the cap.
    pub msg_count: Mutex<u32>,
    pub msg_cap: Mutex<u32>,
    pub memory: Mutex<HashMap<String, MemoryEntry>>,
    pub nodes: Mutex<HashMap<String, NodeInfo>>,
    pub edges: Mutex<Vec<(String, String)>>,
    pub tasks: Mutex<HashMap<String, Task>>,
    pub inboxes: Mutex<HashMap<String, Vec<BusMessage>>>,
    pub approvals: Mutex<HashMap<String, Approval>>,
    pub app: Mutex<Option<AppHandle>>,
    pub port: Mutex<u16>,
    pub token: Mutex<String>,
}

/// Chosen to be generous for real work but low enough that a runaway loop
/// costs cents, not hundreds of dollars.
pub const DEFAULT_MSG_CAP: u32 = 200;

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn new_id(prefix: &str) -> String {
    format!("{}-{}", prefix, uuid::Uuid::new_v4())
}

impl BusShared {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            auto_comm: Mutex::new(true),
            msg_count: Mutex::new(0),
            msg_cap: Mutex::new(DEFAULT_MSG_CAP),
            memory: Mutex::new(HashMap::new()),
            nodes: Mutex::new(HashMap::new()),
            edges: Mutex::new(Vec::new()),
            tasks: Mutex::new(HashMap::new()),
            inboxes: Mutex::new(HashMap::new()),
            approvals: Mutex::new(HashMap::new()),
            app: Mutex::new(None),
            port: Mutex::new(0),
            token: Mutex::new(String::new()),
        })
    }

    pub fn emit(&self, event: &str, payload: Value) {
        if let Some(app) = self.app.lock().as_ref() {
            let _ = app.emit(event, payload);
        }
    }

    pub fn register_node(&self, mut info: NodeInfo) {
        info.output_tail = Vec::new();
        info.unread = 0;
        self.inboxes.lock().entry(info.id.clone()).or_default();
        self.nodes.lock().insert(info.id.clone(), info);
    }

    pub fn get_node(&self, node_id: &str) -> Option<NodeInfo> {
        self.nodes.lock().get(node_id).cloned()
    }

    pub fn set_status(&self, node_id: &str, status: &str) {
        if let Some(n) = self.nodes.lock().get_mut(node_id) {
            n.status = status.to_string();
        }
        self.emit(
            "agent-status",
            serde_json::json!({ "nodeId": node_id, "status": status }),
        );
    }

    pub fn push_output(&self, node_id: &str, chunk: &str) {
        for line in chunk.lines() {
            if line.trim().is_empty() {
                continue;
            }
            if let Some(n) = self.nodes.lock().get_mut(node_id) {
                n.output_tail.push(line.to_string());
                let len = n.output_tail.len();
                if len > 300 {
                    n.output_tail.drain(0..len - 300);
                }
            }
        }
        self.emit(
            "agent-output",
            serde_json::json!({ "nodeId": node_id, "chunk": chunk }),
        );
    }

    pub fn connected(&self, a: &str, b: &str) -> bool {
        self.edges
            .lock()
            .iter()
            .any(|(x, y)| (x == a && y == b) || (x == b && y == a))
    }

    pub fn peers_of(&self, node_id: &str) -> Vec<NodeInfo> {
        let edges = self.edges.lock();
        let nodes = self.nodes.lock();
        let mut out = Vec::new();
        for (a, b) in edges.iter() {
            let other = if a == node_id {
                b
            } else if b == node_id {
                a
            } else {
                continue;
            };
            if let Some(n) = nodes.get(other) {
                out.push(n.clone());
            }
        }
        out
    }

    pub fn add_message(&self, from: &str, to: &str, text: &str) -> Result<BusMessage, String> {
        if !self.connected(from, to) {
            return Err(format!("no connection between {} and {}", from, to));
        }
        if !*self.auto_comm.lock() {
            return Err(
                "agent-to-agent messaging is switched off; ask the operator to turn it on"
                    .to_string(),
            );
        }
        {
            let mut count = self.msg_count.lock();
            let cap = *self.msg_cap.lock();
            if *count >= cap {
                return Err(format!(
                    "message cap of {cap} reached; the operator has to raise it or reset the count"
                ));
            }
            *count += 1;
        }
        let msg = BusMessage {
            id: new_id("msg"),
            from: from.to_string(),
            to: to.to_string(),
            text: text.to_string(),
            ts: now_ms(),
        };
        self.inboxes
            .lock()
            .entry(to.to_string())
            .or_default()
            .push(msg.clone());
        if let Some(n) = self.nodes.lock().get_mut(to) {
            n.unread += 1;
        }
        self.emit(
            "bus-event",
            serde_json::json!({
                "kind": "message",
                "from": msg.from,
                "to": msg.to,
                "text": msg.text,
            }),
        );
        self.emit_comm();
        Ok(msg)
    }

    pub fn drain_inbox(&self, node_id: &str) -> Vec<BusMessage> {
        let mut boxes = self.inboxes.lock();
        if let Some(entry) = boxes.get_mut(node_id) {
            std::mem::take(entry)
        } else {
            Vec::new()
        }
    }

    pub fn add_task(&self, creator: &str, title: &str, details: &str) -> Task {
        let task = Task {
            id: new_id("task"),
            title: title.to_string(),
            details: details.to_string(),
            status: "todo".to_string(),
            owner: None,
            result: String::new(),
        };
        self.tasks.lock().insert(task.id.clone(), task.clone());
        self.emit(
            "bus-event",
            serde_json::json!({
                "kind": "task",
                "action": "added",
                "task": task,
                "by": creator,
            }),
        );
        task
    }

    pub fn list_tasks(&self) -> Vec<Task> {
        self.tasks.lock().values().cloned().collect()
    }

    pub fn claim_task(&self, task_id: &str, node_id: &str) -> Result<Task, String> {
        let mut tasks = self.tasks.lock();
        let t = tasks
            .get_mut(task_id)
            .ok_or_else(|| format!("task {} not found", task_id))?;
        // A claim is exclusive: two agents must never both think they own
        // the same task. Re-claiming your own is a harmless no-op.
        if let Some(owner) = &t.owner {
            if owner != node_id {
                return Err(format!("task already claimed by {}", owner));
            }
        }
        if t.status == "done" {
            return Err(format!("task {} is already done", task_id));
        }
        t.status = "claimed".to_string();
        t.owner = Some(node_id.to_string());
        let t = t.clone();
        drop(tasks);
        self.emit(
            "bus-event",
            serde_json::json!({ "kind": "task", "action": "claimed", "task": t, "by": node_id }),
        );
        Ok(t)
    }

    pub fn complete_task(
        &self,
        task_id: &str,
        node_id: &str,
        result: &str,
    ) -> Result<Task, String> {
        let mut tasks = self.tasks.lock();
        let t = tasks
            .get_mut(task_id)
            .ok_or_else(|| format!("task {} not found", task_id))?;
        if let Some(owner) = &t.owner {
            if owner != node_id {
                return Err(format!("task owned by {}, not {}", owner, node_id));
            }
        }
        t.status = "done".to_string();
        t.result = result.to_string();
        let t = t.clone();
        drop(tasks);
        self.emit(
            "bus-event",
            serde_json::json!({ "kind": "task", "action": "done", "task": t, "by": node_id }),
        );
        Ok(t)
    }

    pub fn ask_user(&self, node_id: &str, question: &str) -> Approval {
        let approval = Approval {
            id: new_id("apr"),
            from_node: node_id.to_string(),
            question: question.to_string(),
            answer: None,
        };
        self.approvals
            .lock()
            .insert(approval.id.clone(), approval.clone());
        self.set_status(node_id, "waiting");
        self.emit(
            "bus-event",
            serde_json::json!({
                "kind": "approval",
                "approval": {
                    "id": approval.id,
                    "fromNode": approval.from_node,
                    "question": approval.question,
                    "answer": null,
                },
            }),
        );
        approval
    }

    pub fn answer_approval(&self, approval_id: &str, answer: &str) -> Result<Approval, String> {
        let mut approvals = self.approvals.lock();
        let a = approvals
            .get_mut(approval_id)
            .ok_or_else(|| format!("approval {} not found", approval_id))?;
        a.answer = Some(answer.to_string());
        let a = a.clone();
        drop(approvals);
        self.emit(
            "bus-event",
            serde_json::json!({
                "kind": "approval",
                "approval": {
                    "id": a.id,
                    "fromNode": a.from_node,
                    "question": a.question,
                    "answer": a.answer,
                },
            }),
        );
        Ok(a)
    }

    pub fn approval_answer(&self, approval_id: &str) -> Option<String> {
        self.approvals
            .lock()
            .get(approval_id)
            .and_then(|a| a.answer.clone())
    }

    /// Write a fact every agent on the canvas can read. Writing the same key
    /// again replaces it, so memory stays a set of current facts rather than
    /// an append-only log nobody can prune.
    pub fn remember(&self, author: &str, key: &str, value: &str) -> MemoryEntry {
        let entry = MemoryEntry {
            key: key.to_string(),
            value: value.to_string(),
            author: author.to_string(),
            ts: now_ms(),
        };
        self.memory.lock().insert(key.to_string(), entry.clone());
        self.emit_memory();
        entry
    }

    /// Every fact, newest first. `query` filters on key and value.
    pub fn recall(&self, query: Option<&str>) -> Vec<MemoryEntry> {
        let mut out: Vec<MemoryEntry> = self.memory.lock().values().cloned().collect();
        if let Some(q) = query.map(str::trim).filter(|q| !q.is_empty()) {
            let q = q.to_lowercase();
            out.retain(|e| {
                e.key.to_lowercase().contains(&q) || e.value.to_lowercase().contains(&q)
            });
        }
        out.sort_by_key(|e| std::cmp::Reverse(e.ts));
        out
    }

    pub fn forget(&self, key: &str) -> Result<MemoryEntry, String> {
        let removed = self.memory.lock().remove(key);
        match removed {
            Some(e) => {
                self.emit_memory();
                Ok(e)
            }
            None => Err(format!("nothing remembered under {}", key)),
        }
    }

    pub fn comm_state(&self) -> serde_json::Value {
        serde_json::json!({
            "autoComm": *self.auto_comm.lock(),
            "sent": *self.msg_count.lock(),
            "cap": *self.msg_cap.lock(),
        })
    }

    pub fn emit_comm(&self) {
        self.emit(
            "bus-event",
            serde_json::json!({ "kind": "comm", "comm": self.comm_state() }),
        );
    }

    fn emit_memory(&self) {
        self.emit(
            "bus-event",
            serde_json::json!({ "kind": "memory", "memory": self.recall(None) }),
        );
    }
}
