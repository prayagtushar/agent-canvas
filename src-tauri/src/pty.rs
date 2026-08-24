//! One real terminal per agent.
//!
//! The canvas used to run each harness headlessly — `claude -p "…"` with stdin
//! closed — and rebuild a transcript from its JSON. That shows what an agent
//! said but leaves the operator no way to answer it: permission prompts, slash
//! commands and mode switches all need a keyboard on the far end of a pty. So
//! each agent gets one, and the node draws the CLI's own interface instead of
//! an imitation of it.

use parking_lot::Mutex;
/// Re-exported so callers — including the tests — can describe a process to
/// run without taking their own dependency on the pty crate.
pub use portable_pty::CommandBuilder;
use portable_pty::{native_pty_system, Child, MasterPty, PtySize};
use std::collections::{HashMap, VecDeque};
use std::io::{Read, Write};
use std::sync::{Arc, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

/// How long the pty has to stay silent before the agent counts as idle. Long
/// enough that the gap between two spinner frames reads as one stretch of
/// work, short enough that the header dot turns green when a turn really ends.
const QUIET_MS: u128 = 700;

/// A freshly launched CLI paints its welcome screen in bursts with gaps in
/// between. The first prompt waits for this much silence before going in;
/// later ones only wait for the agent to stop working.
const BOOT_QUIET_MS: u128 = 900;
const QUEUE_QUIET_MS: u128 = 350;

/// How long a sent prompt has to show up on the agent's screen before it is
/// assumed lost. A CLI that was still painting when it arrived swallows it
/// silently, and there is no error to catch — only the absence of an echo.
const CONFIRM_MS: u128 = 4000;

/// Attempts at one prompt before giving up. Something is genuinely wrong by
/// then, and retyping forever would be worse than stopping.
const MAX_SENDS: u8 = 3;

/// The watcher's tick. Also the worst-case lag on a status change.
const TICK: Duration = Duration::from_millis(150);

pub struct Session {
    writer: Mutex<Box<dyn Write + Send>>,
    master: Mutex<Box<dyn MasterPty + Send>>,
    child: Mutex<Box<dyn Child + Send + Sync>>,
    /// The screen as the agent has drawn it. A peer asking for context wants
    /// what is on the node right now, not the escape codes that put it there.
    screen: Mutex<vt100::Parser>,
    last_byte: Mutex<Instant>,
    /// False until the CLI has drawn itself and gone quiet once.
    booted: Mutex<bool>,
    /// Prompts waiting for the agent to be ready for them, oldest first.
    queue: Mutex<VecDeque<String>>,
    /// The prompt that has been typed but not yet seen on screen.
    awaiting: Mutex<Option<Sent>>,
}

/// One prompt in flight, and what would prove it arrived.
struct Sent {
    text: String,
    /// A word from the prompt that the CLI echoes when it accepts it. A whole
    /// phrase is no good: a TUI wraps at spaces, so only single words survive
    /// the trip intact.
    marker: String,
    at: Instant,
    sends: u8,
}

fn sessions() -> &'static Mutex<HashMap<String, Arc<Session>>> {
    static SESSIONS: OnceLock<Mutex<HashMap<String, Arc<Session>>>> = OnceLock::new();
    SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn session(id: &str) -> Option<Arc<Session>> {
    sessions().lock().get(id).cloned()
}

pub fn is_open(id: &str) -> bool {
    sessions().lock().contains_key(id)
}

/// Start a harness in its own pty. `size` is the node's current terminal
/// geometry; the CLI lays itself out to it and reflows on every resize.
pub fn open(
    shared: &Arc<crate::bus::BusShared>,
    id: &str,
    cmd: CommandBuilder,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let cols = cols.max(20);
    let rows = rows.max(6);
    let pair = native_pty_system()
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;
    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    // The slave end has to go now. While this process still holds it open the
    // master never reaches EOF, so an agent that has quit would read as
    // running forever.
    drop(pair.slave);
    let reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let sess = Arc::new(Session {
        writer: Mutex::new(writer),
        master: Mutex::new(pair.master),
        child: Mutex::new(child),
        screen: Mutex::new(vt100::Parser::new(rows, cols, 0)),
        last_byte: Mutex::new(Instant::now()),
        booted: Mutex::new(false),
        queue: Mutex::new(VecDeque::new()),
        awaiting: Mutex::new(None),
    });
    sessions().lock().insert(id.to_string(), Arc::clone(&sess));
    shared.set_status(id, "running");

    read_loop(shared, id, &sess, reader);
    watch_loop(shared, id, &sess);
    Ok(())
}

fn read_loop(
    shared: &Arc<crate::bus::BusShared>,
    id: &str,
    sess: &Arc<Session>,
    mut reader: Box<dyn Read + Send>,
) {
    let sh = Arc::clone(shared);
    let nid = id.to_string();
    let sess = Arc::clone(sess);
    thread::spawn(move || {
        let mut buf = [0u8; 8192];
        let mut carry: Vec<u8> = Vec::new();
        loop {
            let n = match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => n,
            };
            sess.screen.lock().process(&buf[..n]);
            *sess.last_byte.lock() = Instant::now();
            carry.extend_from_slice(&buf[..n]);
            let text = take_utf8(&mut carry);
            if !text.is_empty() {
                sh.push_raw(&nid, &text);
            }
        }
    });
}

fn watch_loop(shared: &Arc<crate::bus::BusShared>, id: &str, sess: &Arc<Session>) {
    let sh = Arc::clone(shared);
    let nid = id.to_string();
    let sess = Arc::clone(sess);
    thread::spawn(move || {
        let mut reported = "running".to_string();
        let mut tail_at = Instant::now();
        loop {
            thread::sleep(TICK);
            if sess.child.lock().try_wait().ok().flatten().is_some() {
                sessions().lock().remove(&nid);
                sh.set_status(&nid, "exited");
                break;
            }
            // A session removed from the map has been closed deliberately.
            if !sessions().lock().contains_key(&nid) {
                break;
            }

            let quiet = sess.last_byte.lock().elapsed().as_millis();
            if quiet >= BOOT_QUIET_MS && !*sess.booted.lock() {
                *sess.booted.lock() = true;
            }
            pump(&sh, &nid, &sess, quiet);

            let now = if quiet < QUIET_MS { "running" } else { "idle" };
            if now != reported {
                sh.set_status(&nid, now);
                reported = now.to_string();
            }

            // Refresh what peers can read, on a timer rather than per chunk —
            // a busy TUI repaints its whole screen dozens of times a second.
            if tail_at.elapsed() >= Duration::from_millis(600) {
                tail_at = Instant::now();
                let text = sess.screen.lock().screen().contents();
                sh.set_output_tail(&nid, &text);
            }
        }
    });
}

/// Move the outbox along: confirm what was sent, retype what was lost, and
/// hand over the next prompt once the agent is ready for it.
///
/// A prompt is not fire and forget. A CLI that is still painting, or sitting
/// on a dialog, takes the keystrokes and drops them, and says nothing about
/// it. The only evidence either way is whether the prompt turns up on screen.
fn pump(shared: &Arc<crate::bus::BusShared>, id: &str, sess: &Arc<Session>, quiet: u128) {
    let screen = sess.screen.lock().screen().contents();

    let mut awaiting = sess.awaiting.lock();
    if let Some(sent) = awaiting.as_mut() {
        if screen.contains(&sent.marker) {
            *awaiting = None;
        } else if sent.at.elapsed().as_millis() >= CONFIRM_MS {
            if sent.sends >= MAX_SENDS {
                // Something on screen is eating keystrokes: a trust dialog, a
                // hook waiting to be approved, a login. The operator can see
                // it and answer it, but only if they are told to look.
                shared.notice(
                    id,
                    "This agent did not take the prompt. Its terminal is waiting on something.",
                );
                *awaiting = None;
            } else {
                sent.sends += 1;
                sent.at = Instant::now();
                let (s, text) = (Arc::clone(sess), sent.text.clone());
                thread::spawn(move || type_into(&s, &text));
            }
            return;
        } else {
            return;
        }
    }
    drop(awaiting);

    // Wait for the agent to stop working before handing it the next one, so a
    // prompt never lands in the middle of a turn it would be ignored by.
    let ready = if *sess.booted.lock() {
        quiet >= QUEUE_QUIET_MS
    } else {
        false
    };
    if !ready {
        return;
    }
    let next = sess.queue.lock().pop_front();
    let Some(text) = next else { return };
    *sess.awaiting.lock() = Some(Sent {
        marker: echo_marker(&text),
        text: text.clone(),
        at: Instant::now(),
        sends: 1,
    });
    let s = Arc::clone(sess);
    thread::spawn(move || type_into(&s, &text));
}

/// The longest word in a prompt, which is what a wrapped terminal is most
/// likely to have left intact when it echoes the prompt back.
fn echo_marker(text: &str) -> String {
    text.split_whitespace()
        .filter(|w| w.chars().all(|c| !c.is_control()))
        .max_by_key(|w| w.chars().count())
        .map(str::to_string)
        .unwrap_or_else(|| text.trim().to_string())
}

/// Type a whole prompt in the way a terminal delivers a paste, so a CLI that
/// has asked for bracketed paste keeps it as one block instead of treating
/// every newline as a separate submission.
fn type_into(sess: &Session, text: &str) {
    let bracketed = sess.screen.lock().screen().bracketed_paste();
    {
        let mut w = sess.writer.lock();
        if bracketed {
            let _ = w.write_all(b"\x1b[200~");
            let _ = w.write_all(text.as_bytes());
            let _ = w.write_all(b"\x1b[201~");
        } else {
            // Without bracketed paste a newline submits, so a multi-line
            // prompt would arrive as several half-finished ones.
            let _ = w.write_all(text.replace('\n', " ").as_bytes());
        }
        let _ = w.flush();
    }
    // The CLI needs a frame to put the paste in its input box. An Enter sent
    // in the same breath lands before the text does.
    thread::sleep(Duration::from_millis(70));
    let mut w = sess.writer.lock();
    let _ = w.write_all(b"\r");
    let _ = w.flush();
}

/// Queue a prompt to be typed in as if the operator had done it. It goes in
/// when the agent is ready, and is retyped if it never turns up on screen.
pub fn send(id: &str, text: &str) -> Result<(), String> {
    let sess = session(id).ok_or_else(|| "agent is not running".to_string())?;
    sess.queue.lock().push_back(text.to_string());
    Ok(())
}

/// Whether every prompt handed to this agent has been seen on its screen.
pub fn settled(id: &str) -> bool {
    match session(id) {
        Some(s) => s.queue.lock().is_empty() && s.awaiting.lock().is_none(),
        None => true,
    }
}

/// Raw keystrokes from the node's terminal. Passed through untouched — this is
/// arrow keys, Escape, Ctrl-C and everything else the CLI binds.
pub fn write_input(id: &str, data: &str) -> Result<(), String> {
    let sess = session(id).ok_or_else(|| "agent is not running".to_string())?;
    let mut w = sess.writer.lock();
    w.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    w.flush().map_err(|e| e.to_string())
}

pub fn resize(id: &str, cols: u16, rows: u16) -> Result<(), String> {
    let sess = session(id).ok_or_else(|| "agent is not running".to_string())?;
    let cols = cols.max(20);
    let rows = rows.max(6);
    sess.master
        .lock()
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;
    sess.screen.lock().screen_mut().set_size(rows, cols);
    Ok(())
}

pub fn close(id: &str) {
    let removed = sessions().lock().remove(id);
    if let Some(sess) = removed {
        let _ = sess.child.lock().kill();
    }
}

/// Decode as much of the buffer as is complete, keeping a sequence that a read
/// boundary cut in half for the next chunk to finish.
fn take_utf8(buf: &mut Vec<u8>) -> String {
    match std::str::from_utf8(buf) {
        Ok(s) => {
            let out = s.to_string();
            buf.clear();
            out
        }
        Err(e) => {
            let good = e.valid_up_to();
            let out = std::str::from_utf8(&buf[..good]).unwrap_or("").to_string();
            match e.error_len() {
                // A byte that can neither start nor continue a sequence. Drop
                // it, or every later chunk stalls behind it.
                Some(n) => buf.drain(..good + n),
                None => buf.drain(..good),
            };
            out
        }
    }
}

#[cfg(test)]
mod tests {
    use super::take_utf8;

    #[test]
    fn keeps_a_split_sequence_for_the_next_chunk() {
        let mut buf = "ok→".as_bytes().to_vec();
        let tail = buf.split_off(buf.len() - 1);
        assert_eq!(take_utf8(&mut buf), "ok");
        // Two of the arrow's three bytes are held back, not mangled.
        assert_eq!(buf.len(), 2);
        buf.extend_from_slice(&tail);
        assert_eq!(take_utf8(&mut buf), "→");
        assert!(buf.is_empty());
    }

    #[test]
    fn drops_bytes_that_are_not_utf8_at_all() {
        let mut buf = vec![b'a', 0xff, b'b'];
        assert_eq!(take_utf8(&mut buf), "a");
        assert_eq!(take_utf8(&mut buf), "b");
        assert!(buf.is_empty());
    }
}
