#!/usr/bin/env node
/**
 * claude-cascade — usage logger (Stop hook)
 *
 * Reads the session transcript Claude Code already writes and appends a
 * row of token usage to .claude/cascade/usage-log.csv. This is the
 * measurement half of the plan: tokens-per-successful-task, not
 * tokens-per-request, tracked from real API usage numbers instead of
 * guesswork.
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

function appendRow(logPath, row) {
  const header = "timestamp,session_id,turns,input_tokens,output_tokens,cache_read_tokens,cache_creation_tokens,total_tokens\n";
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  if (!fs.existsSync(logPath)) {
    fs.writeFileSync(logPath, header, "utf8");
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

    const row = [
      new Date().toISOString(),
      input.session_id || "unknown",
      totals.turns,
      totals.input_tokens,
      totals.output_tokens,
      totals.cache_read_input_tokens,
      totals.cache_creation_input_tokens,
      total,
    ].join(",");

    appendRow(path.join(projectDir, ".claude", "cascade", "usage-log.csv"), row);
  } catch {
    // Logging must never break the session.
  }
  process.exit(0);
}

main();
