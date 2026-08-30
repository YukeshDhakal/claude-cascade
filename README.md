# claude-cascade

A rule-based cascade router and deterministic evaluator for Claude Code — the token-optimization layer from [The Routing Ledger](#background) research, implemented as actual `.claude/` config instead of a diagram.

No trained model decides where your prompt goes. No LiteLLM proxy, no learned classifier, no extra service to run. Just:

- **Subagent tiering** — `explore` (haiku, read-only) for cheap look-ups, `architect` (opus) for the hard/risky stuff, default (sonnet) for everything in between.
- **A deterministic evaluator** — a `Stop` hook that runs your project's real test/lint/build command after every turn and blocks completion on a genuine failure, instead of trusting the model's self-reported confidence.
- **A usage logger** — a second `Stop` hook that reads Claude Code's own transcript and logs real token usage per session, so "did this actually save tokens" has an answer instead of a guess.

## Why no learned router

The best-evidenced routing system available (RouteLLM) trains a classifier on labeled preference data — and its own paper reports the router performs *near-random* when the training data doesn't match the target task distribution. No one has published a router trained on coding-task quality. Building one means collecting your own labeled pass/fail data first — worth doing eventually (see the Phase 3 note below), not worth faking with an untrained heuristic dressed up as ML.

The cascade pattern (cheap attempt → deterministic check → escalate on failure) is the best-evidenced alternative — FrugalGPT reports up to 98% cost reduction at matched quality using exactly this shape.

## Install

Requires [Node.js](https://nodejs.org) on `PATH` (the hooks are zero-dependency Node scripts — no `npm install` needed).

1. Copy `.claude/agents/`, `.claude/hooks/`, and `.claude/settings.json` into your project (merge `settings.json` if you already have one — see [Claude Code hooks docs](https://docs.claude.com/en/docs/claude-code/hooks) for the merge shape).
2. Append [`docs/CLAUDE.md.example`](docs/CLAUDE.md.example) to your project's `CLAUDE.md`.
3. Optional: override the evaluator's test command by adding `.claude/cascade/verify.config.json`:
   ```json
   { "command": "make test" }
   ```
   Without this file, `verify.js` auto-detects npm/pytest/cargo/go projects.
4. Work normally. After a few sessions, run:
   ```
   node scripts/report.js
   ```
   from your project root to see total and average tokens per session.

### Global install (all projects, one machine)

Instead of vendoring this into every repo, install once into `~/.claude/`:

1. Copy `.claude/agents/*.md` → `~/.claude/agents/`, and `.claude/hooks/*.js` → `~/.claude/hooks/`.
2. Merge into `~/.claude/settings.json` (add the `hooks` key — don't overwrite the rest of the file):
   ```json
   {
     "hooks": {
       "Stop": [
         { "hooks": [
           { "type": "command", "command": "node \"~/.claude/hooks/verify.js\"" },
           { "type": "command", "command": "node \"~/.claude/hooks/usage-log.js\" \"~/.claude/cascade\"" }
         ] }
       ]
     }
   }
   ```
   The second argument to `usage-log.js` is the key difference from a per-project install: it points the log at one shared location instead of dropping `.claude/cascade/usage-log.csv` into every repo you touch. Rows are tagged with a `project` column so `scripts/report.js` still tells them apart.
3. Copy `docs/CLAUDE.md.example` into `~/.claude/rules/` (or your global instructions file) instead of a per-project `CLAUDE.md`.
4. `verify.js` is a no-op outside a recognizable project (no package.json/pyproject.toml/Cargo.toml/go.mod found), so it's safe to run on every `Stop` event globally, including non-code sessions.

## What's in here

```
.claude/
  agents/
    explore.md      — haiku, read-only exploration
    architect.md     — opus, escalation target
  hooks/
    verify.js         — Stop hook: deterministic evaluator
    usage-log.js       — Stop hook: token usage logger
  settings.json         — wires both hooks to the Stop event
docs/
  CLAUDE.md.example     — paste into your project's CLAUDE.md
  routing-rules.md       — the full routing table
  token-optimization-rules.md — the full rules table, with evidence grading
scripts/
  report.js             — summarizes usage-log.csv
```

## Background

This repo implements the recommendation from a two-pass research project on token optimization and model routing for AI coding agents — sourced findings on RouteLLM, LiteLLM, FrugalGPT, DSPy, GEPA, prompt caching, and context compression, graded proven vs. theoretical throughout. The full writeup, including the architecture comparison and phased roadmap this repo follows, lives in a private Claude artifact; ask if you'd like the link.

## Roadmap

- **Phase 1 (this repo, done):** CLAUDE.md rules, subagent tiering, deterministic evaluator, usage logging.
- **Phase 2:** a LiteLLM gateway in front of this, but only once usage-log data shows real volume of mechanical/cheap-tier tasks worth off-loading to a free local model.
- **Phase 3:** once `verify.js` pass/fail outcomes accumulate, mine that data for a real complexity signal set — replacing the guessed keyword rules in `docs/routing-rules.md` with observed ones, and only then consider a trained classifier on your *own* task distribution (the RouteLLM caveat, applied).
- **Phase 4:** experiment with GEPA to evolve `CLAUDE.md`/agent instructions against a real eval suite of past tasks — speculative, no confirmed coding-agent integration exists yet.

## License

MIT — see [LICENSE](LICENSE).
