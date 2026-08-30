#!/usr/bin/env node
/**
 * claude-cascade — usage logger (Stop hook)
 *
 * Reads the session transcript Claude Code already writes and appends a
 * row of token usage to a CSV log. This is the measurement half of the
 * plan: tokens-per-successful-task, not tokens-per-request, tracked from
 * real API usage numbers instead of guesswork.
 *
 * Log location:
 *   - a directory passed as argv[2], or the CASCADE_LOG_DIR env var if
 *     set (used for a global/all-projects install, so the log lands in
 *     one place instead of dropping an untracked file into every repo
 *     you touch) — logs to <dir>/usage-log.csv with a `project` column.
 *     The CLI-argument form is preferred in settings.json hook commands
 *     since it works identically across cmd/PowerShell/sh, unlike
 *     inline env-var assignment syntax.
 *   - otherwise <project>/.claude/cascade/usage-log.csv (per-project
 *     install, the default for a repo that vendors this tool directly).
 *
 * Designed to never break a session: every risky step is wrapped and any
 * failure just means a skipped log row, never a blocked Stop.
 */

const fs = require("node:fs");
const path = require("node:path");

function readStdin() {
  try {
    const raw = fs.readFileSync(0, "utf8");
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function sumUsage(transcriptPath) {
  const totals = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
    turns: 0,
  };

  if (!transcriptPath || !fs.existsSync(transcriptPath)) return totals;

  const lines = fs.readFileSync(transcriptPath, "utf8").split("\n");
  for (const line of lines) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    // Usage typically lives at entry.message.usage on assistant turns;
    // fall back to entry.usage for older/alternate transcript shapes.
    const usage = (entry.message && entry.message.usage) || entry.usage;
    if (!usage || typeof usage !== "object") continue;

    totals.input_tokens += Number(usage.input_tokens) || 0;
    totals.output_tokens += Number(usage.output_tokens) || 0;
    totals.cache_read_input_tokens += Number(usage.cache_read_input_tokens) || 0;
    totals.cache_creation_input_tokens += Number(usage.cache_creation_input_tokens) || 0;
    totals.turns += 1;
  }
  return totals;
}

function csvField(value) {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function appendRow(logPath, header, row) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  if (!fs.existsSync(logPath)) {
    fs.writeFileSync(logPath, header + "\n", "utf8");
  }
  fs.appendFileSync(logPath, row + "\n", "utf8");
}

function main() {
  try {
    const input = readStdin();
    const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
    const totals = sumUsage(input.transcript_path);
    const total = totals.input_tokens + totals.output_tokens + totals.cache_read_input_tokens + totals.cache_creation_input_tokens;

    // Nothing usable — skip the row rather than log zeros for every stray Stop event.
    if (totals.turns === 0) {
      process.exit(0);
    }

    const globalLogDir = process.argv[2] || process.env.CASCADE_LOG_DIR;
    const fields = [
      new Date().toISOString(),
      input.session_id || "unknown",
      totals.turns,
      totals.input_tokens,
      totals.output_tokens,
      totals.cache_read_input_tokens,
      totals.cache_creation_input_tokens,
      total,
    ];

    if (globalLogDir) {
      // Global install: one shared log across every project, tagged by project name.
      const header = "timestamp,project,session_id,turns,input_tokens,output_tokens,cache_read_tokens,cache_creation_tokens,total_tokens";
      const row = [fields[0], csvField(path.basename(projectDir)), ...fields.slice(1)].join(",");
      appendRow(path.join(globalLogDir, "usage-log.csv"), header, row);
    } else {
      // Per-project install: log stays inside the project it measured.
      const header = "timestamp,session_id,turns,input_tokens,output_tokens,cache_read_tokens,cache_creation_tokens,total_tokens";
      appendRow(path.join(projectDir, ".claude", "cascade", "usage-log.csv"), header, fields.join(","));
    }
  } catch {
    // Logging must never break the session.
  }
  process.exit(0);
}

main();
