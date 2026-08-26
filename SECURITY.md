# Security

## Reporting a vulnerability

Open a [private advisory](https://github.com/prayagtushar/agent-canvas/security/advisories/new)
rather than a public issue. I read them, and I will tell you within a week
whether I can reproduce what you found.

If it is a real issue I will credit you in the release notes unless you would
rather I did not.

## Which versions get fixes

The latest release. This project is pre-1.0 and there are no maintenance
branches, so a fix goes out as a new version rather than a backport.

## What this app is, in security terms

Worth being blunt about, because the threat model is unusual: Agent Canvas
launches AI coding CLIs as child processes and lets them talk to each other.
That means several things are true by design and are not bugs.

**Agents run as you.** Same user, same files, same environment, same
credentials. Claude Code launches with `--permission-mode acceptEdits`, so it
writes files in its working directory without asking each time. Choose that
folder deliberately. When several agents share a repository, turn on the
per-agent worktree option so they are not editing the same files at once.

**Agent output is untrusted input.** Anything an agent reads, from a file, from
the web, or from a peer on the canvas, can steer what it does next. A connection
you draw is a channel one agent can use to influence another. Draw them on
purpose.

**Agents can start agents,** if you turn hiring on. It is off until you enable
it, and it is bounded by the agent cap and the turn cap. Both are visible in the
toolbar and both can be lowered.

## What is defended

**The Bus**, the local coordination server agents reach over MCP, binds to
`127.0.0.1` on a port the OS picks, and checks a bearer token on every route
including `/health`. The token is generated fresh at launch, written only into
per-agent config files under your cache directory, and never leaves the machine.
A vulnerability here would be a route that skips the token check, a token that
survives across launches, or a bind address that is not loopback.

**Updates** are signed. The app carries a public key and refuses any update the
matching private key did not sign, so control of the release host is not enough
to push code to anyone. A build made without that key pair cannot check for
updates and says so instead of trusting whatever it is handed.

**Releases** are built by GitHub Actions from a tagged commit, so what you
download corresponds to source you can read.

## In scope

Bugs that break the boundaries above. A few examples: reaching the Bus without
the token, a peer message that escapes the terminal it is written into and
executes, a path in the worktree code that writes outside the folder it was
given, an update that installs without a valid signature.

## Out of scope

Anything that requires you to have already given an agent the access it then
used. An agent deleting files in the folder you pointed it at is the product
working. So is one agent persuading another to do something, when you drew the
wire between them.
