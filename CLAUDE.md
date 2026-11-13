# GTA Melbourne: working rules

The live game is `melbourne3d/` (see `melbourne3d/README.md`). The root `index.html` is the old game.

## Model budget (owner's standing rule, applies to every task)

The owner's usage limit must last a full 5-hour window. The top-tier model is for special high-level work only.

- **Top-tier model: at most about 5% of usage.** Only for planning a large change, a hard design decision, and the
  final review of merged work. The main session keeps its own turns short: no long file reads, no exploratory
  debugging, no test runs it could delegate.
- **Everything else runs on cheaper models.** Coding, debugging, browser tests, screenshots and docs go to subagents
  on `sonnet`. Searches, file listings and simple checks go to `haiku`.
- **Every Agent call sets `model` explicitly** (`sonnet` or `haiku`). Never let a subagent inherit the main session's
  model. Every agent definition in `.claude/agents/` is pinned to `model: sonnet`; keep it that way.
- **At most two subagents at a time.** Queue the rest. Prefer resuming an agent over starting a new one.
- **Commit early.** Subagents commit working progress to their branch as they go, so a cut-off loses little.
- Subagents do the assigned task without stopping to ask for sign-off on file edits; they report what they did.
