//! Each agent can be given its own git worktree, so two agents editing the
//! same repository never collide. Worktrees live under
//! `.agent-canvas/worktrees/` inside the repo, on a branch named
//! `agent/<slug>`.

fn git(repo: &str, args: &[&str]) -> Result<String, String> {
    let mut cmd = std::process::Command::new("git");
    cmd.arg("-C").arg(repo).args(args);
    let out = crate::platform::quiet(&mut cmd)
        .output()
        .map_err(|e| format!("git not available: {e}"))?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

/// What an agent has changed in the directory it works in.
///
/// Staged and unstaged together, plus anything untracked, because an agent
/// that wrote a new file has changed the tree just as much as one that edited
/// an old one — and `git diff` alone would show neither.
///
/// Capped: a diff is for reading, and an agent that reformatted a lockfile can
/// produce megabytes nobody will scroll through.
pub fn agent_diff(dir: String) -> Result<String, String> {
    const MAX: usize = 200_000;

    if !is_git_repo(dir.clone()) {
        return Err(format!("{dir} is not inside a git repository"));
    }

    let tracked = git(&dir, &["diff", "HEAD", "--stat", "--patch"]).unwrap_or_default();

    // Untracked files are listed rather than printed: one of them is as likely
    // to be a build directory as a source file.
    let untracked = git(&dir, &["ls-files", "--others", "--exclude-standard"]).unwrap_or_default();
    let new_files: Vec<&str> = untracked.lines().filter(|l| !l.trim().is_empty()).collect();

    let mut out = String::new();
    if !new_files.is_empty() {
        out.push_str("New files, not yet added to git:\n");
        for f in &new_files {
            out.push_str("  ");
            out.push_str(f);
            out.push('\n');
        }
        out.push('\n');
    }
    if tracked.trim().is_empty() {
        if new_files.is_empty() {
            return Ok("Nothing has changed here yet.".to_string());
        }
    } else {
        out.push_str(&tracked);
    }

    if out.len() > MAX {
        out.truncate(MAX);
        out.push_str("\n\n… truncated. Read the rest with `git diff` in that folder.");
    }
    Ok(out)
}

pub fn is_git_repo(path: String) -> bool {
    git(&path, &["rev-parse", "--is-inside-work-tree"]).as_deref() == Ok("true")
}

/// Give an agent its own worktree so two agents editing the same repo cannot
/// collide. Worktrees live under `.agent-canvas/worktrees/` inside the repo.
pub fn create_worktree(repo: String, name: String) -> Result<String, String> {
    if !is_git_repo(repo.clone()) {
        return Err(format!("{repo} is not a git repository"));
    }
    let slug: String = name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' {
                c
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_lowercase();
    let slug = if slug.is_empty() {
        "agent".to_string()
    } else {
        slug
    };

    let root = git(&repo, &["rev-parse", "--show-toplevel"])?;
    let dir = std::path::Path::new(&root)
        .join(".agent-canvas")
        .join("worktrees")
        .join(&slug);
    let dir_str = dir.to_string_lossy().to_string();
    if dir.is_dir() {
        return Ok(dir_str);
    }
    std::fs::create_dir_all(dir.parent().unwrap_or(&dir)).map_err(|e| e.to_string())?;

    let branch = format!("agent/{slug}");
    let exists = git(&repo, &["rev-parse", "--verify", &branch]).is_ok();
    if exists {
        git(&repo, &["worktree", "add", &dir_str, &branch])?;
    } else {
        git(&repo, &["worktree", "add", "-b", &branch, &dir_str])?;
    }
    Ok(dir_str)
}

pub fn remove_worktree(repo: String, path: String) -> Result<(), String> {
    git(&repo, &["worktree", "remove", "--force", &path]).map(|_| ())
}
