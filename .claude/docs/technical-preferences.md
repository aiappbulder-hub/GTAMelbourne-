# Technical Preferences: GTA Melbourne

What the studio agents in `.claude/agents/` should assume about this project.

## Engine & Language

- **Engine**: none. A custom browser engine on **three.js r128**, using the global build plus `examples/js` loaders
  (GLTFLoader, SkeletonUtils, EffectComposer and SSAOPass), loaded from cdn.jsdelivr.net.
- **Language**: plain JavaScript, no build step. The whole game is the single file `index.html`.
- **Rendering**: three.js WebGL. Chase and overhead 3D cameras, plus a 2D canvas view as fallback.
  - Shadows use PCF soft shadow maps.
  - SSAO runs on desktop only, and switches itself off when slow.
  - City chunks are built from canvas-drawn textures; facades are procedural.
- **Physics**: our own arcade physics. Tile and fine-grid collision (`SOL`, `carHits`, `moveCircle`), plus raised decks
  and tunnels.

## World and assets

- **Map**: `map/melbourne.js`, built from OpenStreetMap data (ODbL, credit required) by `tools/build_map.py`
  (run with `python3 -I`).
- **Models**: glTF JSON with embedded buffers under `models/`. They are built in Blender by `tools/make_*.py`
  (custom cars, landmarks, aircraft, props), or come from CC0 packs credited in `models/README.md`.
- **Characters**: `characters/` and `tools/characters/`. Bodies start from the MakeHuman CC0 base mesh; the clothing,
  hair, textures and GLB exports are scripted.
- **Licences**: only CC0, CC-BY or MIT assets may go in the repo, because it is public. Never commit paid packs such as
  Synty. Never use real brands or logos: invent fictional ones (for example *Plumbright*, *Southerly Surf Co.*).

## Input & Platform

- **Target Platforms**: Web: desktop browsers and mobile (iOS and Android touch). Hosted on GitHub Pages from the
  working branch. A rebranded copy, "Melbourne Underworld", is also published as a claude.ai artifact.
- **Input Methods**: Mixed. Keyboard and mouse on desktop (with pointer-lock aiming); on-screen touch controls on mobile.
- **Primary Input**: keyboard and mouse on desktop, touch on mobile.
- **Gamepad Support**: none yet.
- **Touch Support**: full: stick, buttons, tap to lock on.

## Conventions

- Match the surrounding code: dense one-line functions, short names (`G3`, `CHK`, `EDGES`), and comments only where the
  reason isn't obvious.
- Bump `const BUILD='Build N'` with each shipped change.
- Test hooks are exposed on `window.GTA`.

## Performance Budgets

- **Target Framerate**: 60 fps on a mid-range laptop, 30 or more on phones.
- **Characters**: 8k to 20k triangles each (about 15k now), 1K to 2K textures, GLB under 1 MB.
- **Map chunks**: built a few per frame, and disposed when out of range.

## Testing

- **Framework**: headless Playwright scripts against a local `python3 -m http.server`. Chromium is preinstalled, and 3D
  runs on swiftshader (slow, about 1 fps).
  - The checks are: the game loads, traffic doesn't jam, lock-on combat works, plus screenshot reviews.
  - Call the scripts through `window.GTA` hooks.
- **Required**: the game loads without page errors. Look at screenshots of anything visual before shipping it.

## Forbidden Patterns

- Real brand names, logos or trade dress in game content.
- Assets that can't be redistributed in a public repo.
- Build tooling or bundlers. The game stays one HTML file that runs as is.

## Allowed Libraries / Addons

- three.js r128 and its `examples/js` addons, from cdn.jsdelivr.net.
- Blender run as a Python module (`bpy`) for asset scripts, and Pillow for textures.
