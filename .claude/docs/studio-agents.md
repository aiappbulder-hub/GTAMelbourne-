# Studio agents

These 34 subagent definitions come from **[Claude Code Game Studios](https://github.com/Donchitos/Claude-Code-Game-Studios)**
by Donchitos, under the MIT licence (`.claude/agents/LICENSE-claude-code-game-studios`), at commit `05ad7c8`. Claude Code picks them up
automatically: ask for one by name ("have the qa-tester check the heist mission"), or let Claude delegate to them.

**Included** are the engine-neutral roles:
- **Directors:** creative, technical, art, audio, narrative.
- **Leads:** lead programmer, QA lead, producer, localisation lead, release manager.
- **Designers:** game, level, systems, economy, live ops, UX.
- **Programmers:** gameplay, AI, engine, UI, network, tools.
- **Specialists:** technical artist, sound designer, writer, world builder, QA tester, performance analyst, security,
  accessibility, analytics, devops, community manager, prototyper.

**Left out:**
- The 15 Godot, Unity and Unreal specialists. This game runs on three.js in the browser, so they don't apply.
- The upstream hooks, settings, status line, slash-command skills and document templates. Those reshape every session
  and expect the framework's own folder layout. To try them, clone the upstream repo into a separate folder.

The agents read project context from `.claude/docs/technical-preferences.md`, which describes this game's real stack.
When an agent mentions upstream documents that don't exist here (`design/game-brief.md`, `production/...`), it carries
on without them.
