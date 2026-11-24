# GTA Melbourne: working rules

The live game is `melbourne3d/` (see `melbourne3d/README.md`). The root `index.html` is the old game.

## Model budget (owner's standing rule, applies to every task)

Owner's update (2026-11-24, later): back to conservative mode. Save usage as much as possible.

- Subagents use the `model: sonnet` pin in `.claude/agents/`. Use `opus` only for the hardest 10-15% of work.
- One subagent at a time. Keep tasks small and prefer resuming an agent over starting a new one.
- The main session still reviews subagent screenshots itself before shipping.
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

## Service worker (must do on every deploy)

`melbourne3d/sw.js` serves game files cache-first, so players keep the old version until its cache version changes.
Every change shipped to the default branch must bump `VERSION` in `melbourne3d/sw.js` in the same push.
