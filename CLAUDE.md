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

## Shipping (owner's standing rule)

The owner can only play what is on `main`. When a change is finished and tested, merge the working branch into the default branch (`ccr-c003ea14-x4uzks`, the repo has no `main`)
and push it (as well as the working branch). Do this every time, without asking.

## Licensing (owner's decision)

The owner is fine with the game being GPL-3.0 (it's a free fun game, never sold). Code may be ported from GPL-3
projects such as rezvivo (https://github.com/thpg/rezvivo), and from MIT/CC0 sources such as Streets-GL, Poly Haven
and ambientCG. Credit every source in `melbourne3d/CREDITS.md` (project, licence, what was used). Once any GPL code
is merged, add a GPL-3.0 `LICENSE` at the repo root and keep mrdoob's MIT notice in `melbourne3d/LICENSE`.
