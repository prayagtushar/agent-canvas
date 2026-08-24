//! Each agent can get its own git worktree, so two of them editing the same
//! repository never collide. This is the part that touches a real repo.

use std::process::Command;

fn git(dir: &std::path::Path, args: &[&str]) -> String {
    let out = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .output()
        .expect("git should be installed");
    assert!(
        out.status.success(),
        "git {args:?} failed: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

fn a_repo(name: &str) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!("ac-wt-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    git(&dir, &["init", "-q"]);
    git(&dir, &["config", "user.email", "test@example.com"]);
    git(&dir, &["config", "user.name", "Test"]);
    std::fs::write(dir.join("README.md"), "hello\n").unwrap();
    git(&dir, &["add", "."]);
    git(&dir, &["commit", "-qm", "first"]);
    dir
}

#[test]
fn an_agent_gets_its_own_branch_and_directory() {
    let repo = a_repo("basic");
    let path = agent_canvas_lib::worktree::create_worktree(
        repo.to_string_lossy().to_string(),
        "Wire Parser".to_string(),
    )
    .expect("worktree should be created");

    let dir = std::path::Path::new(&path);
    assert!(dir.join("README.md").is_file(), "the worktree has the code");
    assert_eq!(
        git(dir, &["rev-parse", "--abbrev-ref", "HEAD"]),
        "agent/wire-parser",
        "the label becomes a branch name"
    );
    // Work in the worktree must not show up in the original checkout.
    std::fs::write(dir.join("only-here.txt"), "x").unwrap();
    assert!(!repo.join("only-here.txt").exists());

    agent_canvas_lib::worktree::remove_worktree(repo.to_string_lossy().to_string(), path)
        .expect("worktree should be removable");
    let _ = std::fs::remove_dir_all(&repo);
}

/// Relaunching an agent with the same name has to land on the same worktree,
/// not fail because git already knows the branch.
#[test]
fn asking_twice_returns_the_same_worktree() {
    let repo = a_repo("twice");
    let name = "Reviewer".to_string();
    let first = agent_canvas_lib::worktree::create_worktree(
        repo.to_string_lossy().to_string(),
        name.clone(),
    )
    .expect("first");
    let second =
        agent_canvas_lib::worktree::create_worktree(repo.to_string_lossy().to_string(), name)
            .expect("second");
    assert_eq!(first, second);
    let _ = std::fs::remove_dir_all(&repo);
}

#[test]
fn a_folder_that_is_not_a_repository_is_refused() {
    let dir = std::env::temp_dir().join(format!("ac-wt-plain-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    assert!(!agent_canvas_lib::worktree::is_git_repo(
        dir.to_string_lossy().to_string()
    ));
    assert!(agent_canvas_lib::worktree::create_worktree(
        dir.to_string_lossy().to_string(),
        "x".into()
    )
    .is_err());
    let _ = std::fs::remove_dir_all(&dir);
}

/// Diagnostics must answer, and answer quickly, whatever the machine has
/// installed. A CLI that hangs on `--version` used to be indistinguishable
/// from one that is missing, and the panel would never paint.
#[test]
fn diagnostics_report_every_harness_without_hanging() {
    let start = std::time::Instant::now();
    let rows = agent_canvas_lib::spawn::diagnose();
    assert!(
        start.elapsed() < std::time::Duration::from_secs(20),
        "diagnostics took {:?}",
        start.elapsed()
    );

    assert!(!rows.is_empty(), "every harness should be reported");
    for row in &rows {
        for key in [
            "name",
            "label",
            "installed",
            "bus",
            "wiring",
            "version",
            "path",
        ] {
            assert!(row.get(key).is_some(), "row is missing {key}: {row}");
        }
    }
    let claude = rows
        .iter()
        .find(|r| r["name"] == "claude")
        .expect("claude is in the harness table");
    assert_eq!(claude["bus"], true, "claude can be wired to the Bus");
}
