//! An agent is a real process on the far end of a real terminal. These check
//! the three things that has to mean: what it prints reaches the canvas, what
//! the canvas types reaches it, and quitting is noticed.

use agent_canvas_lib::bus::{BusShared, NodeInfo};
use agent_canvas_lib::pty::{self, CommandBuilder};
use agent_canvas_lib::spawn;
use std::time::{Duration, Instant};

fn node(id: &str) -> NodeInfo {
    NodeInfo {
        id: id.to_string(),
        label: id.to_string(),
        harness: "sh".to_string(),
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

fn sh(script: &str) -> CommandBuilder {
    let mut cmd = CommandBuilder::new("/bin/sh");
    cmd.args(["-c", script]);
    cmd.env("TERM", "xterm-256color");
    cmd
}

/// Poll rather than sleep a fixed amount: the pty, the reader thread and the
/// watcher all run on their own clocks.
fn until(deadline: Duration, mut done: impl FnMut() -> bool) -> bool {
    let start = Instant::now();
    while start.elapsed() < deadline {
        if done() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    false
}

#[test]
fn what_the_process_prints_lands_on_its_node() {
    let bus = BusShared::new();
    bus.register_node(node("a"));
    pty::open(&bus, "a", sh("echo hello-from-the-pty; sleep 10"), 80, 24).expect("opens");

    let seen = until(Duration::from_secs(5), || {
        bus.get_node("a").is_some_and(|n| {
            n.output_tail
                .iter()
                .any(|l| l.contains("hello-from-the-pty"))
        })
    });
    pty::close("a");
    assert!(seen, "the node never saw what the process wrote");
}

#[test]
fn a_prompt_typed_by_the_canvas_reaches_the_process() {
    let bus = BusShared::new();
    bus.register_node(node("b"));
    // `cat` echoes whatever the terminal sends it, which is exactly the
    // question: did the keystrokes get there at all.
    pty::open(&bus, "b", sh("cat"), 80, 24).expect("opens");

    // The first prompt waits for the process to settle, so this also covers
    // the queue that holds it until then.
    pty::send("b", "ping-from-the-canvas").expect("queued");

    let seen = until(Duration::from_secs(5), || {
        bus.get_node("b").is_some_and(|n| {
            n.output_tail
                .iter()
                .any(|l| l.contains("ping-from-the-canvas"))
        })
    });
    pty::close("b");
    assert!(seen, "the process never received the prompt");
}

#[test]
fn an_agent_that_quits_stops_being_a_session() {
    let bus = BusShared::new();
    bus.register_node(node("c"));
    pty::open(&bus, "c", sh("exit 0"), 80, 24).expect("opens");

    let noticed = until(Duration::from_secs(5), || {
        !pty::is_open("c") && bus.get_node("c").is_some_and(|n| n.status == "exited")
    });
    assert!(noticed, "a finished process was still reported as running");
}

#[test]
fn a_prompt_the_agent_shows_is_not_typed_twice() {
    let bus = BusShared::new();
    bus.register_node(node("d"));
    pty::open(&bus, "d", sh("cat"), 80, 24).expect("opens");
    pty::send("d", "distinctiveword").expect("queued");

    assert!(
        until(Duration::from_secs(8), || pty::settled("d")),
        "a prompt that turned up on screen should not still be in flight"
    );
    pty::close("d");
}

/// A CLI that is still painting, or sitting on a dialog, takes keystrokes and
/// drops them without a word. The only evidence is that the prompt never
/// appears, so the canvas retypes it, and eventually stops and says so.
#[test]
fn a_prompt_that_never_appears_is_retyped_then_given_up_on() {
    let bus = BusShared::new();
    bus.register_node(node("e"));
    // No terminal echo, and the process throws away everything it is given:
    // exactly how a swallowed prompt looks from outside.
    pty::open(&bus, "e", sh("stty -echo; cat > /dev/null"), 80, 24).expect("opens");
    pty::send("e", "distinctiveword").expect("queued");

    assert!(
        !until(Duration::from_secs(3), || pty::settled("e")),
        "an unconfirmed prompt should still be in flight while it is being retried"
    );
    assert!(
        until(Duration::from_secs(25), || pty::settled("e")),
        "the canvas should stop retyping rather than go on forever"
    );
    pty::close("e");
}

/// A message from a peer is typed into an idle recipient, so it acts on it now
/// instead of waiting for somebody to prompt it. The inbox is emptied at the
/// same time, or the agent would read it twice.
#[test]
fn a_peer_message_is_typed_into_an_idle_agent() {
    let bus = BusShared::new();
    bus.register_node(node("f"));
    bus.register_node(node("g"));
    bus.edges.lock().push(("f".into(), "g".into()));
    pty::open(&bus, "g", sh("cat"), 80, 24).expect("opens");

    assert!(
        until(Duration::from_secs(8), || bus
            .get_node("g")
            .is_some_and(|n| n.status == "idle")),
        "the stand-in agent never settled"
    );
    bus.add_message("f", "g", "the parser is yours")
        .expect("sent");
    assert!(spawn::deliver_message(&bus, "g", "Fern"), "should deliver");

    let arrived = until(Duration::from_secs(8), || {
        bus.get_node("g").is_some_and(|n| {
            n.output_tail
                .iter()
                .any(|l| l.contains("the parser is yours"))
        })
    });
    pty::close("g");
    assert!(arrived, "the message never reached the agent's terminal");
    assert!(
        bus.drain_inbox("g").is_empty(),
        "a delivered message must not also sit in the inbox"
    );
    assert_eq!(bus.get_node("g").unwrap().unread, 0);
}

/// A busy agent is left alone: typing into the middle of a turn is how you get
/// a prompt ignored, and the inbox is there for exactly this.
#[test]
fn a_busy_agent_keeps_its_message_in_the_inbox() {
    let bus = BusShared::new();
    bus.register_node(node("h"));
    bus.register_node(node("i"));
    bus.edges.lock().push(("h".into(), "i".into()));
    // Never stops printing, so it never reads as idle.
    pty::open(
        &bus,
        "i",
        sh("while :; do echo working; sleep 0.1; done"),
        80,
        24,
    )
    .expect("opens");
    std::thread::sleep(Duration::from_secs(2));

    bus.add_message("h", "i", "take the parser").expect("sent");
    assert!(
        !spawn::deliver_message(&bus, "i", "Hazel"),
        "a working agent should not be typed into"
    );
    pty::close("i");
    assert_eq!(
        bus.drain_inbox("i").len(),
        1,
        "the message should be waiting"
    );
}
