# Routing rules

No trained classifier — see [why](../README.md#why-no-learned-router). These are the rules `CLAUDE.md` asks the main agent to apply when deciding whether to handle a task directly or delegate.

| Signal | `explore` (cheap) | default (mid) | `architect` (strong) |
|---|---|---|---|
| Task verbs | "where is", "find", "locate", "what does X do" | add feature, write function, fix bug | refactor architecture, design system, security review |
| Files touched | 0 (read-only) | 2–8 | 9+, or cross-cutting |
| Domain risk | none | normal app code | auth, payments, infra, secrets, migrations |
| Required context | one search | a few related files | whole-repo understanding |

## Rules

```
IF task = "where is X" / locate / scope-before-deciding
  → delegate to explore

IF task = formatting, typo fix, rename, single-file bug fix
  → handle directly at default tier (no delegation needed)

IF task = ordinary feature work, single-domain bug fix
  → default tier (no delegation needed)

IF task = architecture change, cross-cutting refactor
  → delegate to architect

IF task touches auth / payments / secrets / infra / migrations
  → delegate to architect, regardless of apparent size

IF the deterministic evaluator (verify.js) fails once
  → fix and let it re-run; this is normal, not an escalation trigger yet

IF the deterministic evaluator fails a second time on the same task
  → delegate to architect rather than retrying a third time
```

## Why a second failure escalates instead of retrying again

A model retrying the same class of fix a third time with no new information rarely does better than the second attempt — the failure mode is usually a misunderstanding of the surrounding code, not a typo in the fix. `architect` is instructed to diagnose *why* the prior attempt failed before trying again, not just try harder.
