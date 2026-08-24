//! Finding and starting the agent CLIs, which is the one place this app has
//! to care what operating system it is on.
//!
//! The two platforms have opposite problems.
//!
//! On macOS an app bundle launched from Finder inherits almost no `PATH`, and
//! every one of these CLIs lives somewhere a login shell adds — homebrew, nvm,
//! bun, pnpm, cargo. So everything goes through the user's login shell, and
//! the answer matches what they would get in their own terminal.
//!
//! On Windows a GUI process already inherits the user's `PATH` from the
//! registry, so there is nothing to source. What bites instead is that most of
//! these CLIs install as `claude.cmd` shims, which `CreateProcess` cannot run
//! at all: they have to go through `cmd.exe`. Arguments are passed one at a
//! time rather than pasted into a command line, so paths with spaces — which
//! is most of `C:\Users\First Last` — never need quoting by hand.

use portable_pty::CommandBuilder;
use std::collections::{HashMap, HashSet};
use std::time::{Duration, Instant};

/// What one installed CLI reported about itself.
pub struct Probe {
    pub version: String,
    pub path: String,
}

/// Run a child and give up if it hangs.
///
/// A CLI that is installed but wedged — waiting on a login, a trust prompt, a
/// network call — sits on `--version` forever, and the operator asked a
/// question, not for the window to freeze.
fn capture(mut cmd: std::process::Command, timeout: Duration) -> Option<String> {
    let mut child = cmd
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .stdin(std::process::Stdio::null())
        .spawn()
        .ok()?;

    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) => {
                if start.elapsed() > timeout {
                    let _ = child.kill();
                    let _ = child.wait();
                    return None;
                }
                std::thread::sleep(Duration::from_millis(40));
            }
            Err(_) => return None,
        }
    }
    let out = child.wait_with_output().ok()?;
    Some(String::from_utf8_lossy(&out.stdout).to_string())
}

/// First line of a version string, capped. Some CLIs print a banner.
///
/// Only the Windows path calls this: on macOS the login shell already trims
/// the output with `head` and `cut` before it comes back.
#[cfg(any(windows, test))]
fn first_line(s: &str) -> String {
    s.lines()
        .map(str::trim)
        .find(|l| !l.is_empty())
        .unwrap_or("")
        .chars()
        .take(60)
        .collect()
}

/// Keep a child process from flashing a console window on screen.
///
/// Every `Command` this app runs is something it asked for on the operator's
/// behalf — a `git` call, a version probe — and none of them are a window the
/// operator wants. On Windows a GUI process spawning a console app pops one up
/// regardless; everywhere else there is nothing to suppress.
pub fn quiet(cmd: &mut std::process::Command) -> &mut std::process::Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    cmd
}

// ---------------------------------------------------------------- unix

#[cfg(unix)]
mod imp {
    use super::*;
    use std::process::Command;

    /// The user's login shell.
    pub fn login_shell() -> String {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string())
    }

    /// POSIX single-quoting: safe for any byte a path can hold.
    pub fn quote(s: &str) -> String {
        format!("'{}'", s.replace('\'', r"'\''"))
    }

    fn shell_capture(script: &str, timeout: Duration) -> Option<String> {
        let mut cmd = Command::new(login_shell());
        cmd.args(["-lc", script]);
        super::capture(cmd, timeout)
    }

    /// One shell for all of them: sourcing a real profile costs a couple of
    /// hundred milliseconds and this runs while the window is opening.
    pub fn installed(names: &[&str]) -> HashSet<String> {
        let list = names.iter().map(|n| quote(n)).collect::<Vec<_>>().join(" ");
        let script =
            format!("for c in {list}; do command -v \"$c\" >/dev/null 2>&1 && echo \"$c\"; done");
        match shell_capture(&script, Duration::from_secs(20)) {
            Some(out) => out
                .lines()
                .map(|l| l.trim().to_string())
                .filter(|l| !l.is_empty())
                .collect(),
            None => HashSet::new(),
        }
    }

    pub fn probe(names: &[&str], timeout: Duration) -> HashMap<String, Probe> {
        let mut out = HashMap::new();
        if names.is_empty() {
            return out;
        }
        // Output is capped per command: nothing drains this pipe while the
        // timeout runs, and a CLI that prints its whole help text would fill
        // it and wedge.
        let script = names
            .iter()
            .map(|n| {
                let c = quote(n);
                format!(
                    "printf '%s\\t%s\\t%s\\n' {c} \"$(command -v {c})\" \
\"$({c} --version 2>/dev/null | head -1 | cut -c1-60)\""
                )
            })
            .collect::<Vec<_>>()
            .join("; ");

        let Some(text) = shell_capture(&script, timeout) else {
            return out;
        };
        for line in text.lines() {
            let mut parts = line.split('\t');
            let (Some(name), Some(path)) = (parts.next(), parts.next()) else {
                continue;
            };
            out.insert(
                name.trim().to_string(),
                Probe {
                    version: parts.next().unwrap_or("").trim().to_string(),
                    path: path.trim().to_string(),
                },
            );
        }
        out
    }

    /// `exec` so the shell replaces itself with the CLI: one process to
    /// signal, and closing the node kills the agent rather than an orphaned
    /// wrapper around it.
    pub fn pty_command(argv: &[String]) -> CommandBuilder {
        let line = argv.iter().map(|a| quote(a)).collect::<Vec<_>>().join(" ");
        let mut cmd = CommandBuilder::new(login_shell());
        cmd.args(["-l", "-c", &format!("exec {line}")]);
        cmd
    }
}

// ---------------------------------------------------------------- windows

#[cfg(windows)]
mod imp {
    use super::*;
    use std::path::PathBuf;
    use std::process::Command;

    /// Extensions Windows will run, in the order it tries them. Read from the
    /// environment because a machine can add to it, with the usual set as a
    /// fallback for the case where it is somehow unset.
    fn pathext() -> Vec<String> {
        std::env::var("PATHEXT")
            .unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".to_string())
            .split(';')
            .map(|e| e.trim().to_lowercase())
            .filter(|e| !e.is_empty())
            .collect()
    }

    /// Where a command actually lives. This is `where.exe` done in-process:
    /// no shell, and no window flashing up while the canvas is loading.
    pub fn resolve(name: &str) -> Option<PathBuf> {
        let exts = pathext();
        for dir in std::env::split_paths(&std::env::var_os("PATH")?) {
            let direct = dir.join(name);
            if direct.is_file() {
                return Some(direct);
            }
            for ext in &exts {
                let candidate = dir.join(format!("{name}{ext}"));
                if candidate.is_file() {
                    return Some(candidate);
                }
            }
        }
        None
    }

    /// A `.cmd` or `.bat` is a script, not an image: `CreateProcess` refuses
    /// it, and npm-installed CLIs are almost always exactly that.
    fn needs_cmd_exe(path: &std::path::Path) -> bool {
        matches!(
            path.extension()
                .and_then(|e| e.to_str())
                .map(str::to_lowercase)
                .as_deref(),
            Some("cmd") | Some("bat")
        )
    }

    pub fn installed(names: &[&str]) -> HashSet<String> {
        names
            .iter()
            .filter(|n| resolve(n).is_some())
            .map(|n| n.to_string())
            .collect()
    }

    pub fn probe(names: &[&str], timeout: Duration) -> HashMap<String, Probe> {
        let mut out = HashMap::new();
        // The ceiling is for the whole sweep, so a single wedged CLI cannot
        // spend the entire budget and leave the rest unreported.
        let each = (timeout / names.len().max(1) as u32).max(Duration::from_secs(2));
        for name in names {
            let Some(path) = resolve(name) else { continue };
            let mut cmd = if needs_cmd_exe(&path) {
                let mut c = Command::new("cmd.exe");
                c.arg("/c").arg(&path).arg("--version");
                c
            } else {
                let mut c = Command::new(&path);
                c.arg("--version");
                c
            };
            super::quiet(&mut cmd);
            let version = super::capture(cmd, each)
                .map(|s| super::first_line(&s))
                .unwrap_or_default();
            out.insert(
                name.to_string(),
                Probe {
                    version,
                    path: path.to_string_lossy().to_string(),
                },
            );
        }
        out
    }

    /// No shell: arguments go across one at a time, so a path with a space in
    /// it needs no quoting and cannot be split in the wrong place.
    pub fn pty_command(argv: &[String]) -> CommandBuilder {
        let program = argv.first().map(String::as_str).unwrap_or_default();
        let resolved = resolve(program).unwrap_or_else(|| PathBuf::from(program));

        let mut cmd = if needs_cmd_exe(&resolved) {
            let mut c = CommandBuilder::new("cmd.exe");
            c.arg("/c");
            c.arg(&resolved);
            c
        } else {
            CommandBuilder::new(&resolved)
        };
        for a in argv.iter().skip(1) {
            cmd.arg(a);
        }
        cmd
    }
}

pub use imp::{installed, probe, pty_command};

#[cfg(unix)]
pub use imp::quote;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_version_banner_is_reduced_to_one_capped_line() {
        assert_eq!(first_line("\n\n  1.2.3 (thing)  \nmore\n"), "1.2.3 (thing)");
        assert_eq!(first_line(""), "");
        assert_eq!(first_line(&"x".repeat(200)).len(), 60);
    }

    #[test]
    fn a_command_that_never_exits_is_given_up_on() {
        let mut cmd = std::process::Command::new(if cfg!(windows) { "cmd.exe" } else { "sleep" });
        if cfg!(windows) {
            cmd.args(["/c", "pause"]);
        } else {
            cmd.arg("30");
        }
        let start = Instant::now();
        assert!(capture(cmd, Duration::from_millis(300)).is_none());
        assert!(
            start.elapsed() < Duration::from_secs(5),
            "it waited {:?}",
            start.elapsed()
        );
    }

    #[test]
    fn nothing_is_reported_installed_that_is_not() {
        let found = installed(&["definitely-not-a-real-cli-xyz"]);
        assert!(found.is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn quoting_survives_spaces_and_apostrophes() {
        assert_eq!(quote("/Users/a b/c"), "'/Users/a b/c'");
        assert_eq!(quote("it's"), r"'it'\''s'");
    }
}
