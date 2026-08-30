#!/usr/bin/env node
/**
 * claude-cascade — usage report
 *
 * Summarizes .claude/cascade/usage-log.csv: total tokens, sessions logged,
 * and average tokens per session. Run this before/after adopting the
 * cascade rules to see whether they're actually moving the number that
 * matters — tokens per session, not tokens per request.
 *
 * Usage: node scripts/report.js [path-to-usage-log.csv]
 */

const fs = require("node:fs");
const path = require("node:path");

const logPath = process.argv[2] || path.join(process.cwd(), ".claude", "cascade", "usage-log.csv");

if (!fs.existsSync(logPath)) {
  console.error(`No usage log found at ${logPath}`);
  console.error("Nothing logged yet — the Stop hook writes a row after each session.");
  process.exit(1);
}

const lines = fs.readFileSync(logPath, "utf8").trim().split("\n");
const [header, ...rows] = lines;
const cols = header.split(",");
const idx = Object.fromEntries(cols.map((c, i) => [c, i]));

const sessions = new Map(); // session_id -> latest cumulative row (usage.js logs running totals per Stop)

for (const line of rows) {
  const cells = line.split(",");
  const sessionId = cells[idx.session_id];
  sessions.set(sessionId, cells); // later rows overwrite earlier ones — we want the last snapshot per session
}

let totalTokens = 0;
let totalInput = 0;
let totalOutput = 0;
let totalCacheRead = 0;

for (const cells of sessions.values()) {
  totalInput += Number(cells[idx.input_tokens]) || 0;
  totalOutput += Number(cells[idx.output_tokens]) || 0;
  totalCacheRead += Number(cells[idx.cache_read_tokens]) || 0;
  totalTokens += Number(cells[idx.total_tokens]) || 0;
}

const sessionCount = sessions.size;
const avg = sessionCount ? Math.round(totalTokens / sessionCount) : 0;

console.log(`claude-cascade usage report`);
console.log(`  log:              ${logPath}`);
console.log(`  sessions logged:  ${sessionCount}`);
console.log(`  total tokens:     ${totalTokens.toLocaleString()}`);
console.log(`    input:          ${totalInput.toLocaleString()}`);
console.log(`    output:         ${totalOutput.toLocaleString()}`);
console.log(`    cache reads:    ${totalCacheRead.toLocaleString()}  (billed ~10% of input rate)`);
console.log(`  avg tokens/session: ${avg.toLocaleString()}`);
console.log("");
console.log("This counts cumulative usage per session, not per successful task — pair it");
console.log("with your own pass/fail record (verify.js's exit code) if you want a true");
console.log("tokens-per-successful-task figure.");
