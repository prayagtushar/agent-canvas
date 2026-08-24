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
        role: String::new(),
        output_tail: vec![],
        unread: 0,
        turns: 0,
        busy_ms: 0,
        tokens: 0,
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

/// What a CLI prints is the session so far, not the last turn. Adding those
/// up would climb by the whole session's cost every time the screen is read.
#[test]
fn a_screen_total_replaces_rather_than_accumulates() {
    use agent_canvas_lib::usage::Reading;
    let bus = BusShared::new();
    bus.register_node(node("a", "claude"));

    bus.observe_usage(
        "a",
        Reading {
            tokens: 1200,
            cost_usd: 0.021,
        },
    );
    bus.observe_usage(
        "a",
        Reading {
            tokens: 2000,
            cost_usd: 0.030,
        },
    );

    let n = bus.get_node("a").unwrap();
    assert_eq!(n.tokens, 2000);
    assert!((n.cost_usd - 0.030).abs() < 1e-9, "cost was {}", n.cost_usd);
}

/// A total that scrolls off screen must not reset what was already seen.
#[test]
fn a_reading_never_walks_a_total_backwards() {
    use agent_canvas_lib::usage::Reading;
    let bus = BusShared::new();
    bus.register_node(node("a", "claude"));

    bus.observe_usage(
        "a",
        Reading {
            tokens: 5000,
            cost_usd: 0.40,
        },
    );
    bus.observe_usage(
        "a",
        Reading {
            tokens: 0,
            cost_usd: 0.0,
        },
    );

    let n = bus.get_node("a").unwrap();
    assert_eq!(n.tokens, 5000);
    assert!((n.cost_usd - 0.40).abs() < 1e-9);
}

#[test]
fn turns_are_counted_per_agent_and_across_the_canvas() {
    let bus = BusShared::new();
    bus.register_node(node("a", "claude"));
    bus.register_node(node("b", "codex"));

    for _ in 0..3 {
        assert!(!bus.note_turn("a"), "the cap is nowhere near");
    }
    bus.note_turn("b");

    assert_eq!(bus.get_node("a").unwrap().turns, 3);
    assert_eq!(bus.get_node("b").unwrap().turns, 1);
    let (turns, _, _) = bus.spend();
    assert_eq!(turns, 4);
}

#[test]
fn the_canvas_says_when_it_crosses_its_turn_budget_and_only_then() {
    let bus = BusShared::new();
    bus.register_node(node("a", "claude"));
    *bus.turn_cap.lock() = 3;

    assert!(!bus.note_turn("a"));
    assert!(!bus.note_turn("a"));
    assert!(bus.note_turn("a"), "the third turn is the cap");
    assert!(
        !bus.note_turn("a"),
        "past the cap it must not fire again, or every turn stops the canvas"
    );
}

#[test]
fn busy_time_adds_up() {
    let bus = BusShared::new();
    bus.register_node(node("a", "claude"));
    bus.add_busy("a", 150);
    bus.add_busy("a", 150);
    assert_eq!(bus.get_node("a").unwrap().busy_ms, 300);
}

/// Two agents can talk each other in circles forever, and every round trip is
/// real money. The Bus stops relaying at the cap rather than trusting them to
/// stop on their own.
#[test]
fn the_message_cap_stops_a_conversation_that_will_not_end() {
    let bus = BusShared::new();
    bus.register_node(node("a", "claude"));
    bus.register_node(node("b", "codex"));
    bus.edges.lock().push(("a".into(), "b".into()));
    *bus.msg_cap.lock() = 2;

    assert!(bus.add_message("a", "b", "one").is_ok());
    assert!(bus.add_message("b", "a", "two").is_ok());
    let stopped = bus.add_message("a", "b", "three").unwrap_err();
    assert!(stopped.contains("cap"), "{stopped}");

    // The operator raising the cap lets it continue, without losing the count.
    *bus.msg_cap.lock() = 3;
    assert!(bus.add_message("a", "b", "three").is_ok());
}

#[test]
fn agents_cannot_message_each_other_until_the_operator_allows_it() {
    let bus = BusShared::new();
    bus.register_node(node("a", "claude"));
    bus.register_node(node("b", "codex"));
    bus.edges.lock().push(("a".into(), "b".into()));
    *bus.auto_comm.lock() = false;

    let refused = bus.add_message("a", "b", "hello").unwrap_err();
    assert!(refused.contains("switched off"), "{refused}");
    assert!(bus.drain_inbox("b").is_empty(), "nothing should be queued");

    *bus.auto_comm.lock() = true;
    assert!(bus.add_message("a", "b", "hello").is_ok());
    assert_eq!(bus.drain_inbox("b").len(), 1);
}

/// `get_peer_context` reads this, so it has to be the agent's screen rather
/// than the stream of repaints that drew it.
#[test]
fn the_screen_a_peer_reads_is_trimmed_but_not_reordered() {
    let bus = BusShared::new();
    bus.register_node(node("a", "claude"));
    bus.set_output_tail("a", "first\nsecond   \n\n\n");
    let tail = bus.get_node("a").unwrap().output_tail;
    assert_eq!(tail, vec!["first", "second"], "trailing blanks should go");
}

#[test]
fn renaming_a_node_is_what_peers_see() {
    let bus = BusShared::new();
    bus.register_node(node("a", "claude"));
    bus.register_node(node("b", "codex"));
    bus.edges.lock().push(("a".into(), "b".into()));

    assert_eq!(bus.rename_node("a", "  Frontend  ").unwrap(), "Frontend");
    assert_eq!(bus.get_node("a").unwrap().label, "Frontend");

    let seen: Vec<String> = bus.peers_of("b").into_iter().map(|n| n.label).collect();
    assert_eq!(
        seen,
        vec!["Frontend"],
        "b reads the new name, not the old one"
    );
}

#[test]
fn a_name_cannot_be_blank_or_endless() {
    let bus = BusShared::new();
    bus.register_node(node("a", "claude"));

    assert!(bus.rename_node("a", "   ").is_err());
    assert_eq!(bus.get_node("a").unwrap().label, "a", "the old name stands");

    let long = "x".repeat(200);
    let stored = bus.rename_node("a", &long).unwrap();
    assert_eq!(stored.chars().count(), BusShared::MAX_LABEL);

    assert!(bus.rename_node("nobody", "Ghost").is_err());
}

#[test]
fn the_board_reads_in_the_order_it_was_built() {
    let bus = BusShared::new();
    for title in ["first", "second", "third", "fourth"] {
        bus.add_task("operator", title, "");
    }
    // A map hands its values back in whatever order it likes; "claim the
    // first one that is open" only means something if this is stable.
    for _ in 0..8 {
        let titles: Vec<String> = bus.list_tasks().into_iter().map(|t| t.title).collect();
        assert_eq!(titles, ["first", "second", "third", "fourth"]);
    }
}

#[test]
fn work_somebody_has_claimed_cannot_be_taken_off_the_board() {
    let bus = BusShared::new();
    bus.register_node(node("a", "claude"));
    let open = bus.add_task("operator", "open", "");
    let mine = bus.add_task("operator", "mine", "");
    bus.claim_task(&mine.id, "a").unwrap();

    let refused = bus.remove_task(&mine.id).unwrap_err();
    assert!(refused.contains("a"), "it should say who is working on it");
    assert_eq!(bus.list_tasks().len(), 2, "nothing was removed");

    bus.remove_task(&open.id).expect("an unclaimed task can go");
    let left: Vec<String> = bus.list_tasks().into_iter().map(|t| t.title).collect();
    assert_eq!(left, ["mine"]);

    assert!(bus.remove_task("task-nope").is_err());
}

#[test]
fn a_finished_task_can_be_cleared_away() {
    let bus = BusShared::new();
    bus.register_node(node("a", "claude"));
    let t = bus.add_task("operator", "ship it", "");
    bus.claim_task(&t.id, "a").unwrap();
    bus.complete_task(&t.id, "a", "shipped").unwrap();

    bus.remove_task(&t.id)
        .expect("finished work is not in progress");
    assert!(bus.list_tasks().is_empty());
}

#[test]
fn connecting_two_nodes_is_idempotent_and_never_self_joins() {
    let bus = BusShared::new();
    bus.register_node(node("a", "claude"));
    bus.register_node(node("b", "opencode"));

    assert!(bus.connect("a", "b"), "the first join is a real change");
    assert!(!bus.connect("a", "b"), "joining twice is not an error");
    assert!(!bus.connect("b", "a"), "an edge is undirected");
    assert!(!bus.connect("a", "a"), "a node cannot be its own peer");
    assert_eq!(bus.edges.lock().len(), 1);
}

#[test]
fn the_operator_holds_the_switch_on_agents_starting_agents() {
    let bus = BusShared::new();
    let state = bus.comm_state();
    assert_eq!(state["hiring"], true, "on by default");
    assert_eq!(state["agentCap"], agent_canvas_lib::bus::DEFAULT_AGENT_CAP);

    *bus.allow_hiring.lock() = false;
    assert_eq!(bus.comm_state()["hiring"], false);

    // The count the cap is checked against is every agent on the canvas,
    // however it got there.
    bus.register_node(node("a", "claude"));
    bus.register_node(node("b", "opencode"));
    assert_eq!(bus.comm_state()["agents"], 2);
}
