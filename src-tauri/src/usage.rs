//! What a session is costing, read off the agents' own screens.
//!
//! Two kinds of number live here, and they are not equally trustworthy.
//!
//! **Turns and busy time** are counted by this app: every time an agent goes
//! from idle to working, that is a turn, whoever prompted it. Those are exact.
//!
//! **Tokens and dollars** are whatever the CLI happened to print. Every
//! harness formats it differently, several print nothing at all, and a figure
//! can scroll off screen. So this is best effort by design: a reading is
//! reported when one is found and the number is simply absent otherwise. It is
//! never guessed at, and never extrapolated from turns.
//!
//! One thing worth being careful about: what a CLI prints is a **running
//! total**, not the cost of the last turn. So a reading replaces the stored
//! figure rather than adding to it — accumulating screen totals would climb
//! by the whole session's cost every six hundred milliseconds.

/// A cost or token total an agent has shown on screen.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Reading {
    pub tokens: u64,
    pub cost_usd: f64,
}

/// Read a total off a screen, if there is one to read.
pub fn read(screen: &str) -> Option<Reading> {
    let lower = screen.to_lowercase();
    let tokens = tokens_in(&lower).unwrap_or(0);
    let cost_usd = cost_in(&lower).unwrap_or(0.0);
    if tokens == 0 && cost_usd == 0.0 {
        return None;
    }
    Some(Reading { tokens, cost_usd })
}

/// The largest dollar figure near the word "cost".
///
/// Largest because a screen can hold both a per-turn figure and a session
/// total, and the total is the one worth showing. Near, because a bare `$`
/// anywhere on a developer's screen is as likely to be a shell prompt.
fn cost_in(lower: &str) -> Option<f64> {
    let mut best: Option<f64> = None;
    for (at, _) in lower.match_indices("cost") {
        let rest = &lower[at..];
        // Only look at the rest of that line: the next line's numbers are
        // about something else.
        let line = rest.split('\n').next().unwrap_or(rest);
        if let Some(dollar) = line.find('$') {
            if let Some(v) = number_at(&line[dollar + 1..]) {
                best = Some(best.map_or(v, |b: f64| b.max(v)));
            }
        }
    }
    best.filter(|v| *v > 0.0)
}

/// The largest token figure on the screen, in either of the two shapes CLIs
/// use: `12,345 tokens` and `tokens: 12,345`.
fn tokens_in(lower: &str) -> Option<u64> {
    let mut best: Option<u64> = None;
    for (at, _) in lower.match_indices("token") {
        let before = number_before(&lower[..at]);
        let after = lower[at..]
            .split('\n')
            .next()
            .and_then(|line| line.find(':').and_then(|c| number_at(&line[c + 1..])))
            .map(|v| v as u64);
        for candidate in [before, after].into_iter().flatten() {
            best = Some(best.map_or(candidate, |b: u64| b.max(candidate)));
        }
    }
    best.filter(|v| *v > 0)
}

/// Parse a number at the start of `text`, allowing `1,234`, `1.2k` and `3.4M`.
fn number_at(text: &str) -> Option<f64> {
    let text = text.trim_start();
    let mut digits = String::new();
    let mut rest = text;
    for (i, c) in text.char_indices() {
        if c.is_ascii_digit() || c == '.' || c == ',' {
            if c != ',' {
                digits.push(c);
            }
        } else {
            rest = &text[i..];
            break;
        }
        rest = "";
    }
    let value: f64 = digits.parse().ok()?;
    Some(match rest.chars().next() {
        Some('k') => value * 1_000.0,
        Some('m') => value * 1_000_000.0,
        _ => value,
    })
}

/// Parse a number that ends just before `text` ends, e.g. the `12,345` in
/// `"used 12,345 "` when `text` is everything before the word `tokens`.
fn number_before(text: &str) -> Option<u64> {
    let trimmed = text.trim_end();
    // A `k` or `m` suffix belongs to the number, not to the word after it.
    let (body, scale) = match trimmed.chars().last() {
        Some('k') => (&trimmed[..trimmed.len() - 1], 1_000.0),
        Some('m') => (&trimmed[..trimmed.len() - 1], 1_000_000.0),
        _ => (trimmed, 1.0),
    };
    let start = body
        .rfind(|c: char| !(c.is_ascii_digit() || c == '.' || c == ','))
        .map_or(0, |i| i + 1);
    let digits: String = body[start..].chars().filter(|c| *c != ',').collect();
    if digits.is_empty() {
        return None;
    }
    let value: f64 = digits.parse().ok()?;
    Some((value * scale) as u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_screen_with_no_numbers_reports_nothing() {
        assert_eq!(read("welcome back\n> "), None);
        assert_eq!(read(""), None);
    }

    #[test]
    fn a_dollar_total_is_read_where_a_cli_prints_one() {
        let r = read("Total cost: $0.4231\n").unwrap();
        assert!((r.cost_usd - 0.4231).abs() < 1e-9, "{r:?}");
    }

    #[test]
    fn the_session_total_wins_over_a_single_turn() {
        let screen = "cost this turn: $0.02\nTotal cost: $1.40\n";
        assert!((read(screen).unwrap().cost_usd - 1.40).abs() < 1e-9);
    }

    #[test]
    fn a_dollar_sign_that_is_only_a_shell_prompt_is_not_a_cost() {
        assert_eq!(read("user@box:~$ npm test\n"), None);
    }

    #[test]
    fn tokens_are_read_in_either_shape() {
        assert_eq!(read("12,345 tokens used").unwrap().tokens, 12_345);
        assert_eq!(read("Tokens: 9,001").unwrap().tokens, 9_001);
    }

    #[test]
    fn a_shortened_token_count_is_expanded() {
        assert_eq!(read("1.2k tokens").unwrap().tokens, 1_200);
        assert_eq!(read("3m tokens").unwrap().tokens, 3_000_000);
    }

    #[test]
    fn the_largest_figure_on_screen_is_the_one_that_counts() {
        // A TUI can show the last turn and the session side by side.
        assert_eq!(
            read("800 tokens this turn · 47,000 tokens total")
                .unwrap()
                .tokens,
            47_000
        );
    }

    #[test]
    fn both_can_be_read_from_one_screen() {
        let r = read("Session: 22,900 tokens · Total cost: $0.31").unwrap();
        assert_eq!(r.tokens, 22_900);
        assert!((r.cost_usd - 0.31).abs() < 1e-9);
    }

    #[test]
    fn a_cost_on_a_later_line_is_not_attached_to_an_earlier_label() {
        // "cost" and the "$" have to be on the same line, or every screen
        // with both words anywhere on it reports a number.
        assert_eq!(cost_in("cost\nsomething else $5\n"), None);
    }
}
