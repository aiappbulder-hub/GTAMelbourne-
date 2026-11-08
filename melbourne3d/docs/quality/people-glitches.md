# People glitches: what testing actually showed

Companion to `people-bar.md` (the creative director's ranked hypotheses, G1 to G23). This file records what was
**measured in the running game**, and what was not. Headless Chromium on software rendering runs at about 1 to 2 fps,
so motion is sampled per frame, not per second. The QA tester's raw captures are not committed.

## Confirmed by measurement or by reading the data

| ID (people-bar.md) | Finding | Evidence |
|---|---|---|
| G4 | **Kestrel watcher A stands 0.22 m too low.** The mission places step actors at `y: 0`. At the watcher's spot (-1766, -95) the map has a footpath block with `park = 0.58`, and `getGroundHeight` returns the footpath height 0.22 m there (it only treats `park > 0.6` as lawn). The watcher's recorded `y` was 0 on every sample. | 70 samples of the actor transform, plus `blockAt()` and `isPointOnSidewalk()` at that spot. |
| G4 (not an issue) | The patrolling watcher on the park lawn (park 0.82) and Davo at the car (on the road) are placed at `y: 0`, which **is** the correct ground height there. | Same samples, `blockAt()` at the patrol ends and at (-1775.4, -169.2). |
| G1/G20 (partly) | Davo at the car faces the player correctly (heading 0.26 rad for a player 9 m away) and does not move while the player stands still. The "glued to the player" behaviour is only on the last two steps, which the tester did not reach. | 30 samples of Davo's transform in step 0. |
| G14/G17 (crowd) | Crowd walkers move at 1.35 to 1.56 m/s with matching rig speed and a gait value of 0.93. No teleporting walkers: the largest per-sample step was 0.08 m for 3 of 4 walkers, and 0.51 m once. | 90 frames at Bourke St Mall (4 walkers). |
| G17 (maybe) | One walker's pelvis height dropped to 0.74 m below its standing height for a single sample. That is a one-frame pop, consistent with a hitch rather than a steady fault. | Same capture. |
| none | **No crowd was placed at all at Federation Square or on Harbour Esplanade** during the 90-frame samples, and only 2 at Flinders St Station. The graphics level was `quality=low`, and the samples ran right after teleporting. This may be the crowd not having spawned yet, so it is not counted as a glitch. | 90 frames each. |

## Not measured (the tester ran out of turns)

Everything else in `people-bar.md` is still a hypothesis, including the two P0 items:
- **G1 Davo glued to the player** (walk to the door, and the choice).
- **G2 cars passing through pedestrians.**
- G3, G5 to G13 and G15, G16, G18 to G23.

## Screenshot review

- **Pistol HUD overlaps the minimap and the objective text** when the player is on foot with a gun (seen on Harbour
  Esplanade). Its text runs across the minimap's right edge. This is a UI glitch, not a people glitch.
- The player's white T-shirt in the cut scene carries a circular logo with text. If it resembles a real brand it must
  be replaced (the project forbids real brands). Not verified.
