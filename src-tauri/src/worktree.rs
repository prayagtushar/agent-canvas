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
