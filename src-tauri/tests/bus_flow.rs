//! The M7 demo, written down: two connected agents discover each other,
//! hand a task back and forth, and escalate to the operator — while a
//! third, unconnected agent stays invisible to both.

use agent_canvas_lib::bus::{BusShared, NodeInfo};

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

#[test]
fn peers_are_scoped_to_connected_nodes() {
    let bus = BusShared::new();
    bus.register_node(node("a", "claude"));
    bus.register_node(node("b", "codex"));
    bus.register_node(node("c", "gemini"));
    bus.edges.lock().push(("a".into(), "b".into()));

    let a_peers: Vec<String> = bus.peers_of("a").into_iter().map(|n| n.id).collect();
    assert_eq!(a_peers, vec!["b"], "a must see only b");

    let b_peers: Vec<String> = bus.peers_of("b").into_iter().map(|n| n.id).collect();
    assert_eq!(b_peers, vec!["a"], "the edge is undirected");

    assert!(bus.peers_of("c").is_empty(), "c is connected to nobody");
}

#[test]
fn messages_only_cross_an_edge() {
    let bus = BusShared::new();
    bus.register_node(node("a", "claude"));
    bus.register_node(node("b", "codex"));
    bus.register_node(node("c", "gemini"));
    bus.edges.lock().push(("a".into(), "b".into()));

    bus.add_message("a", "b", "take the parser")
        .expect("a→b is connected");
    bus.add_message("a", "c", "psst")
        .expect_err("a→c has no edge");

    let inbox = bus.drain_inbox("b");
    assert_eq!(inbox.len(), 1);
    assert_eq!(inbox[0].text, "take the parser");
    assert_eq!(bus.get_node("b").unwrap().unread, 1);

    assert!(
        bus.drain_inbox("b").is_empty(),
        "draining consumes the inbox"
    );
    assert!(bus.drain_inbox("c").is_empty(), "c received nothing");
}

#[test]
fn a_task_moves_from_todo_to_done() {
    let bus = BusShared::new();
    bus.register_node(node("a", "claude"));
    bus.register_node(node("b", "codex"));

    let task = bus.add_task("a", "Scope peers by edge", "only connected nodes");
    assert_eq!(task.status, "todo");
    assert!(task.owner.is_none());

    let claimed = bus.claim_task(&task.id, "b").expect("b claims it");
    assert_eq!(claimed.status, "claimed");
    assert_eq!(claimed.owner.as_deref(), Some("b"));

    bus.claim_task(&task.id, "a")
        .expect_err("an owned task cannot be re-claimed");

    let done = bus
        .complete_task(&task.id, "b", "landed in bus.rs")
        .expect("b completes it");
    assert_eq!(done.status, "done");
    assert_eq!(done.result, "landed in bus.rs");

    let all = bus.list_tasks();
    assert_eq!(all.len(), 1);
    assert_eq!(all[0].status, "done");
}

#[test]
fn ask_user_blocks_until_the_operator_answers() {
    let bus = BusShared::new();
    bus.register_node(node("a", "claude"));

    let approval = bus.ask_user("a", "Force-push onto main?");
    assert!(approval.answer.is_none());
    assert_eq!(
        bus.get_node("a").unwrap().status,
        "waiting",
        "asking parks the agent"
    );
    assert!(
        bus.approval_answer(&approval.id).is_none(),
        "nothing to read yet"
    );

    bus.answer_approval(&approval.id, "deny")
        .expect("operator answers");
    assert_eq!(bus.approval_answer(&approval.id).as_deref(), Some("deny"));

    bus.answer_approval("apr-does-not-exist", "yes")
        .expect_err("unknown approvals are rejected");
}

#[test]
fn disconnecting_removes_the_peer() {
    let bus = BusShared::new();
    bus.register_node(node("a", "claude"));
    bus.register_node(node("b", "codex"));
    bus.edges.lock().push(("a".into(), "b".into()));
    assert_eq!(bus.peers_of("a").len(), 1);

    bus.edges
        .lock()
        .retain(|(x, y)| !((x == "a" && y == "b") || (x == "b" && y == "a")));

    assert!(bus.peers_of("a").is_empty());
    bus.add_message("a", "b", "still there?")
        .expect_err("a severed edge closes the channel");
}

#[test]
fn terminal_control_codes_never_reach_the_canvas() {
    use agent_canvas_lib::bus::strip_ansi;

    // SGR colour codes, the kind every CLI wraps its output in
    assert_eq!(strip_ansi("\x1b[32mdone\x1b[0m"), "done");
    // cursor movement and erase-line
    assert_eq!(strip_ansi("\x1b[2K\x1b[1Gloading"), "loading");
    // OSC title sequence terminated by BEL
    assert_eq!(strip_ansi("\x1b]0;a title\x07text"), "text");
    // a spinner redraws with carriage returns; only the last frame matters
    assert_eq!(strip_ansi("step 1\rstep 2\rstep 3"), "step 3");
    // plain text and unicode survive untouched
    assert_eq!(strip_ansi("plain ✓ café"), "plain ✓ café");
    assert_eq!(strip_ansi(""), "");
}

#[test]
fn usage_accumulates_across_turns() {
    let bus = BusShared::new();
    bus.register_node(node("a", "claude"));

    bus.add_usage("a", 1200, 300, 0.021);
    bus.add_usage("a", 800, 150, 0.009);

    let n = bus.get_node("a").unwrap();
    assert_eq!(n.tokens_in, 2000);
    assert_eq!(n.tokens_out, 450);
    assert!((n.cost_usd - 0.030).abs() < 1e-9, "cost was {}", n.cost_usd);
}
