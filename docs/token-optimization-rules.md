# Token optimization rules

| Rule | What it reduces | Evidence |
|---|---|---|
| Grep/targeted `Read` over full-file or full-repo dumps | Input tokens sent | Proven — direct mechanism |
| Delegate exploration-heavy sub-tasks to `explore` | Input tokens in the main thread (moved to a disposable subagent context, not eliminated) | Proven — architectural, by construction |
| Keep `CLAUDE.md`/system prompt stable across turns | Cost + latency of repeated context, not raw token count | Proven — Anthropic prompt caching, ~90% cheaper cached reads |
| Cap/summarize verbose tool output before it re-enters context | Input tokens, repeated context | Proven mechanism; tools like LLMLingua benchmark up to 20x compression |
| `/compact`/`/clear` in long sessions | Repeated context, and indirectly quality | Mixed — token savings direct; quality benefit ("lost in the middle") is a corollary, not directly tested for this exact use |
| Route mechanical sub-tasks to a cheap model tier | Expensive model calls | Proven in principle (cascades); actual savings depend on your task mix |
| Deterministic evaluator instead of asking the model "are you confident?" | Wasted re-runs and silent failures | Verbalized LLM confidence is documented as poorly calibrated; tests are ground truth |
| Automatic prompt-optimization frameworks (DSPy/GEPA) at inference time | Nothing directly — they cost tokens during an *offline* optimization phase | Don't expect inference-time savings from adopting one; see the research report |

Full sourcing for every claim above: see [The Routing Ledger](../README.md#background) research report.
