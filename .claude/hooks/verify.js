#!/usr/bin/env node
/**
 * claude-cascade — deterministic evaluator (Stop hook)
 *
 * Runs the project's real test/lint command after Claude finishes a turn.
 * On failure it exits 2, which blocks the Stop and feeds the failure back
 * to Claude as context — this is the escalation trigger from the routing
 * plan, and it's ground truth (a test either passes or it doesn't), not an
 * LLM's self-reported confidence.
 *
 * Respects `stop_hook_active` from the hook input to avoid infinite retry
 * loops: if this Stop event is already a continuation of a previous block
 * from THIS hook, it lets the turn end instead of blocking again. That's
 * the "retry once, then surface to human" rule from the plan.
 */

const { execSync } = require("node:child_process");
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

function findUp(startDir, names) {
  let dir = startDir;
  for (let i = 0; i < 6; i++) {
    for (const name of names) {
      const p = path.join(dir, name);
      if (fs.existsSync(p)) return { dir, file: p, name };
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function detectCommand(projectDir) {
  // 1. explicit override
  const configPath = path.join(projectDir, ".claude", "cascade", "verify.config.json");
  if (fs.existsSync(configPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
      if (cfg && cfg.command) return { cwd: projectDir, command: cfg.command, label: "configured" };
    } catch {
      // fall through to auto-detect if the config file is malformed
    }
  }

  // 2. Node / npm
  const pkgHit = findUp(projectDir, ["package.json"]);
  if (pkgHit) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgHit.file, "utf8"));
      const testScript = pkg.scripts && pkg.scripts.test;
      if (testScript && !/no test specified/i.test(testScript)) {
        return { cwd: pkgHit.dir, command: "npm test --silent", label: "npm test" };
      }
    } catch {
      // unreadable package.json — skip node detection
    }
  }

  // 3. Python / pytest
  const pyHit = findUp(projectDir, ["pyproject.toml", "pytest.ini", "setup.cfg"]);
  if (pyHit && (fs.existsSync(path.join(pyHit.dir, "tests")) || pyHit.name === "pytest.ini")) {
    return { cwd: pyHit.dir, command: "python -m pytest -q", label: "pytest" };
  }

  // 4. Rust
  const cargoHit = findUp(projectDir, ["Cargo.toml"]);
  if (cargoHit) {
    return { cwd: cargoHit.dir, command: "cargo test --quiet", label: "cargo test" };
  }

  // 5. Go
  const goHit = findUp(projectDir, ["go.mod"]);
  if (goHit) {
    return { cwd: goHit.dir, command: "go test ./...", label: "go test" };
  }

  return null;
}

function main() {
  const input = readStdin();

  // Prevent infinite escalation loops: if this Stop is already a
  // continuation of a block from a previous hook run, don't block again.
  if (input.stop_hook_active) {
    process.exit(0);
  }

  const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const target = detectCommand(projectDir);

  if (!target) {
    // Nothing recognizable to verify against — not a failure, just a no-op.
    process.exit(0);
  }

  try {
    execSync(target.command, {
      cwd: target.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120000,
      encoding: "utf8",
    });
    process.exit(0);
  } catch (err) {
    const output = `${err.stdout || ""}\n${err.stderr || ""}`.trim();
    const tail = output.split("\n").slice(-40).join("\n");
    process.stderr.write(
      `[claude-cascade] Deterministic evaluator FAILED (${target.label}).\n` +
        `This is a real test/build/lint failure, not an opinion — fix it before finishing.\n` +
        `If this is the second time this task has failed verification, hand it to the ` +
        `architect subagent (opus tier) instead of retrying again.\n\n${tail}\n`
    );
    process.exit(2);
  }
}

main();
