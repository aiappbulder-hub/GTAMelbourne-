# People quality bar

Owner's report: "People are glitchy." This document sets the bar that the street crowd and the story cast (Vince, Kaz,
Mick, Davo, the player, police, gang members, Kestrel watchers) must meet. It also ranks the glitches against that bar
and assigns the work.

- **Method:** the code was read; the game was not run. Every cause named below is a **HYPOTHESIS** until QA has seen
  the glitch and a programmer has confirmed the code path. Line numbers are approximate. Use the function names.
- **Who draws whom:**
  - The crowd is procedural: `PersonRig` and `PersonCrowd` in `js/pedestrians.js`, driven by `js/pedestrian-system.js`.
    The Rocketbox crowd stays switched off (`CROWD = false`).
  - The player and the story cast are Ara GLBs posed by `js/people.js`.
  - The Kestrel watchers and the intro police are Rocketbox GLBs, also posed by `js/people.js`.

## 1. What "alive and believable" means here

The references are The Godfather, Mr Inbetween, Lock Stock, Yellowstone and Australian crime drama. None of them is
about a busy crowd. They are about weight, stillness and sudden consequence:
- People stand like they mean it and hold still.
- When violence comes it is quick, ugly and over.
- Nobody ever looks like a game object: no gliding, no popping, no spinning on the spot.

"Alive" means grounded and reactive before it means busy. A crowd of 40 that never breaks is better than 255 that do.

Each standard below can be checked by a person watching, at normal speed, from the default third-person camera.

| # | Standard | Pass when |
|---|----------|-----------|
| S1 | **Feet on the ground.** No one's feet sink into or float above the footpath, kerb, lawn or road. | No visible gap or burial at 3 m on any of the five M1 actors, the player, or 20 crowd walkers. |
| S2 | **No gliding.** A body that changes position is stepping; a body playing an idle does not move. | No visible foot slide in 30 s of watching the player, Davo or a watcher. |
| S3 | **No walking through solids.** Nobody passes through a car, a wall, another person or a body. | Zero overlaps during a 2-minute walk on Elizabeth St and Flinders Lane, and a 2-minute drive. |
| S4 | **A car hits people.** A car that reaches a pedestrian knocks them down. It never passes through them. | 10 out of 10 drive-throughs at 50 km/h end in a dodge or a knock-down. Zero ghosts. |
| S5 | **A shot lands.** A person who is shot starts going down within 0.3 s, in the direction of the shot. No turning away first, no acrobatics. | Every hit reads as a hit, not a dive, to a viewer who hasn't been told what it is. |
| S6 | **No backwards walking.** Nobody moves backwards or sideways while facing the wrong way, unless they are deliberately backing off. | No moonwalk visible when a crowd flees or turns around. |
| S7 | **No snap turns.** Nobody rotates more than about 45° in a single frame: not the player, not the cast, not the crowd. | Turning the camera, talking (T), firing and the watcher's patrol ends show no pops. |
| S8 | **The cast keeps its distance.** A story character never stays glued to the player's heading. They walk to where they stand and then stay put. | When the player turns 360° beside Davo, Davo does not orbit. |
| S9 | **Danger moves everyone.** Gunfire within 40 m makes everyone in sight react within 1 s, including people on crosswalks. | No one strolls calmly through a gunfight. |
| S10 | **Bodies stay.** A body never disappears while it is on screen. | Watch a body for 60 s: it is still there, or it was removed off-screen. |
| S11 | **A gesture is a gesture.** A wave, laugh or cheer plays once and blends out. It never blocks walking and never restarts with a pop. | A cheer followed at once by walking shows no gliding cheer. A laugh in the intro does not loop with a pop. |
| S12 | **What the subtitle says happens on screen.** "You dragged the driver out" means a driver comes out. Otherwise the line goes. | No line describes an action the player didn't see. |
| S13 | **One visual world.** People standing side by side look like they belong to the same game. | A watcher next to Davo does not look like a different art style. |
| S14 | **It holds at low frame rates.** The other standards still hold at 20 fps on a phone. | Re-check S2, S6 and S7 with `quality=low` on a mid-range phone. |

## 2. Glitch taxonomy (ranked)

Severity:
- **P0** breaks the game, or fails M1's threshold "Davo feels alive". These block M1.
- **P1** is obvious to any player within minutes.
- **P2** is polish.

Every cause below is a HYPOTHESIS.

### P0

| ID | Glitch the player sees | Most likely cause |
|----|------------------------|-------------------|
| G1 | **Davo is glued to the player.** On "walk to the door" and at the choice he stands 1.6 m in front of you, slides along as you walk while playing his idle, and orbits when you turn. He blocks your path and the camera. | `missions.js` `update()`, the step-actor loop: for `a.near === 'player'` the pose is recomputed every frame from the player's heading. `people.js` `setActor()` then places him with `place(..., ease=false)` and never calls `gait()`, so he cannot step. |
| G2 | **Cars pass through people.** When a pedestrian's dodge fails, the player's car drives straight through them. AI traffic is the same. | No car-to-pedestrian contact path exists: `kill()` in `pedestrian-system.js` is reached only from `gameplay.js` `fire()`. Avoidance is all there is: `avoidPlayer()`, and only while `pedRange > 0`, which needs car or cyclist mode. |

### P1

| ID | Glitch the player sees | Most likely cause |
|----|------------------------|-------------------|
| G3 | **The shot dive.** A shot pedestrian turns away from the gun, then does the evasive "superman" dive with their hands catching the landing, and freezes prone. It reads as a stunt, not a death. | `pedestrian-system.js`: `kill()` sets `diveHeading` away from the shooter, and `renderPed()` clamps `diveTime` to 0.9 s. `pedestrians.js` `PersonRig.update()` then eases the yaw at 10 rad/s, and `solveDive()` plays `DIVE_POSES`, which is the escape dive reused. |
| G4 | **Watchers and Davo at the car stand sunk into the ground.** Their feet are buried about 0.22 m in the footpath, or about 0.4 m in a raised lawn. | `missions.js` `update()`: step actors and watchers are given `y: 0` (`pose = { x, y: 0, z, ... }`). Only the givers get 0.22 m, from `footpathNear()`. The Ara models have no foot IK. |
| G5 | **Snap turns.** The player pops round to face whoever they talk to or shoot, and when walking to a car door. The patrolling watcher flips about 140° in one frame at each end of her patrol. | `gameplay.js`: `talk()`, `fire()` and the `approach` block set `person.heading` directly, and `people.js` `posePlayer()` places with `ease=false`. `missions.js` `watcherPose()`'s pause branch adds π to the heading. `setActor()` never eases. |
| G6 | **Gestures lock the body and loop with a pop.** The player keeps cheering while gliding off after "Mission passed". Davo's intro laugh and his wave at the car restart with a visible jump. | `people.js` `play()`: `clock < a.onceUntil` refuses walk and run. ONCE actions made in `makeActor()` never get `LoopOnce`; only those made in `action()` do. Re-asking every frame calls `act.reset()` with no crossfade. `missions.js` `pass()` uses a wall-clock `setTimeout`. |
| G7 | **Pedestrians and the cast pass through each other.** Crowd walkers pass through Davo and the watchers. The player on foot passes through crowd walkers. | The crowd knows nothing of cast actors: `spread()` and `escapeRoom()` look only at `peds`. Nothing on the player's side pushes the player or the walkers apart (to be confirmed in `controllers.js`). |
| G8 | **Bodies vanish on camera** 45 s after death. | `pedestrian-system.js` `update()`: `if (p.dead && clock - p.diveStart > 45) p.placed = false`, with no `visible()` check. |
| G9 | **Calm crosswalk walkers during gunfire.** | `walk()` applies `fleeSpeed` only `if (... && !p.node)`. `scare()` also skips the change of direction on crosswalks. |
| G10 | **The hold-up.** The victim never puts their hands up. They stand for 1.5 s, walk off calmly for about 1 s, and then bolt. | `gameplay.js` `talk()`: `talkToPed(q, ..., 1.5)` then a 2600 ms `setTimeout(scarePeds)`, which runs on wall time and not the game clock. The procedural rig has no hands-up or cower pose. |
| G11 | **Shooting the cast does nothing.** Tracers pass through Davo and the Kestrel watchers. | `gameplay.js` `trace()` and `findTarget()` test only crowd `peds`, cars and walls. The cast's `hit`, `die` and `getup` clips (`ARA_CLIPS`) are never used. |
| G12 | **The player's feet on kerbs and when jumping.** The Ara player pops 0.22 m at kerbs, jumps while still in the walk or idle pose, and sprints on the Run clip at up to 2× speed. | `people.js` `posePlayer()`/`place()` put the root at the controller's y with no foot IK. `ARA_CLIPS` has `sprint: 'Run'` and no jump clip. `gait()`'s `timeScale` clamps. |
| G13 | **The carjack subtitle lies.** "You dragged the driver out" appears and no driver comes out. | `gameplay.js` `enterTrafficCar()`. |

### P2

| ID | Glitch the player sees | Most likely cause |
|----|------------------------|-------------------|
| G14 | **Moonwalk for about 0.4 s** when a walker reverses: on a scare, at a dead end, or on retreat. | `scare()` and `turnPed()` flip `p.dir` instantly. `PersonRig.update()` turns at most 7 rad/s, and `swingFoot()`'s backwards branch steps backwards until the turn finishes. |
| G15 | **Walkers drift into shopfronts or off the kerb** in dense spots, worst in Flinders Lane. | `spread()`'s `sepWant` (±1 m) plus `lineOff` is never checked. `pedRoutes.canDodge()` checks only dodges. |
| G16 | **The living walk through bodies.** | `spread()` skips `p.dead` when it builds its grid. |
| G17 | **A brief run or stumble after a frame hitch**, worse on phones. | `PersonRig.update()` clamps `dt` to 0.1 s, but `walk()` moved the walker with the raw `dt`, so `rvx`/`rvz` spike and `run`/`gait` jump. |
| G18 | **Three art styles side by side.** The Rocketbox watchers look unlike Ara Davo, and both look unlike the procedural crowd. | The `watch` models `Male_Adult_14` and `Female_Adult_09` in `MISSIONS` M1. The intro police come from `POOLS.police`. |
| G19 | **The patrolling watcher slides slightly and walks straight through props.** | `setActor()` plays `walk` at `timeScale` 1: the Rocketbox clip covers 1.4 m/s and she patrols at 1.3 m/s. `stepWatchers()` walks a straight line. |
| G20 | **"Turret" turning.** Davo at the car, and the givers, rotate on the spot to track the player with no steps. | `face: 'player'` is recomputed every frame, then `place()`. There is no turn-in-place clip, unlike the player's `turn_left`/`turn_right`. |
| G21 | **The crowd LOD pops at 34 m.** | `PersonCrowd` `farDistance = 34`, with no blend between the two levels. |
| G22 | **Fleeing walkers start overheard small talk.** | `voice-manager.js` checks `q.fleeing`, which is never set. The system uses `fleeUntil`. |
| G23 | **Davo is not in the car while his lines play** during the chase. | `missions.js`: `if (a.who === 'Davo' && driving()) continue`. |

## 3. What matters in the first 10 minutes

Low Tide on Harbour Esplanade runs: black card, Davo's cut scene, getting past the watchers to the car, the tail chase
through the city, then on foot at the Quiet Room (Flinders Lane × Elizabeth St) and the choice. In order of player
exposure × severity:

1. **G1 Davo glued (P0).** It happens on both final steps of M1, at the moment the milestone says "Davo feels alive".
   It is the most visible people bug in the game. Fix first.
2. **G4 sunk feet (P1).** Davo at the car and both watchers stand on the esplanade for the whole stealth step, and
   the player studies them closely to read their cones.
3. **G2 cars through pedestrians (P0).** The chase goes through the CBD's crosswalks at speed. One ghost and the city
   feels fake.
4. **G5 and G20 snaps and turret turns.** The watcher flips at the patrol ends, which the stealth step makes the
   player stare at. Davo swivels at the car.
5. **G7 crowd through the cast.** The esplanade crowd walks through the watchers, and the Quiet Room crowd walks
   through Davo.
6. **G12 the player's feet.** Stepping out of the car at the Quiet Room means a kerb, and the walk to the door is the
   only on-foot moment of M1 with the camera close.
7. **G15 drift into walls in Flinders Lane.** It is the narrowest footpath in M1.
8. **G11 shooting a watcher or Davo.** GTA players will try it in the first five minutes.
   - The cheapest in-tone answer is design, not animation: gunfire inside the stealth step fails the job ("Kestrel
     made you").
   - The cast also stops bullets, and plays the Ara `hit` clip and a line.
   - Decide this before any programmer builds damage for the cast.
9. **G23 the empty passenger seat** during six lines of chase dialogue. It is noticeable, but night-time and the
   chase camera help. See section 4.

G3, G8, G9 and G10 matter after M1, when the player starts free-roaming with a gun. Fix them in the same pass as G2,
because G2's knock-down needs the same "going down" pose.

## 4. Cut rather than fix (scope discipline)

The deferred list holds: boats, trucks, interiors, the helicopter escape, advanced pedestrian behaviour. On top of it:

- **No ragdoll physics** and no hit-location reactions. One procedural "crumple" keyframe table in the
  `DIVE_POSES` format serves gunshots (G3) and car knock-downs (G2). The escape dive stays for dodges only.
- **No Rocketbox crowd.** `CROWD` stays `false`. Turning it on to "fix" the crowd's looks would bring back actor
  swapping, popping and cost.
- **No car enter/exit animation.** Keep the hide-and-show, but make the `approach` path go round the car, not through
  it, and ease the heading (G5).
- **No ejected carjack driver.** Change the subtitle to "You took the car." (fixes G13). Driver ejection is advanced
  pedestrian behaviour.
- **No crowd behaviours beyond walk, queue, talk, flee and go down.** No pedestrians boarding trams, entering shops,
  walking in groups, phoning or reacting to the cast. Under G7, the crowd only needs to avoid the cast's footprint.
- **No passenger rendering for M1 (G23)** unless `setSeated()` plus a per-car seat offset is under half a day of work.
  Otherwise accept it, and revisit when M2 adds more in-car dialogue.
- **No damage model for the cast.** Use design instead: the job fails, or the cast stops bullets with a flinch (G11).
- **No lip-sync work.** Loudness-driven visemes are enough for this bar.
- **No new crowd art.** G18 is solved by giving the watchers Ara bodies, not by building more crowd variety.

## 5. Hand-off (in order)

### QA tester: start now. Every item in section 2 needs confirmation before code changes.

Run each test at `?quality=low` and at high quality, on a desktop and on a phone. Take a screenshot or a clip of each
glitch, tag it with its G-number, and list any glitch that isn't in the taxonomy as new.

1. **M1 walkthrough on foot and in the car.** Check S1, S2, S7 and S8 on Davo, both watchers and the player. Turn a
   full 360° beside Davo at the Quiet Room (G1, G4, G5, G20).
2. **Fire near the watchers, near Davo and near a crowded crosswalk on Elizabeth St** (G9, G11, G3).
3. **Drive through a crowded crosswalk 10 times at 50 km/h, and 5 times at 80 km/h.** Count the ghosts (G2).
4. **Walk into crowd walkers, into Davo and into a watcher** (G7).
5. **Talk to 5 people, rob 5, pass a job and walk off at once** (G5, G6, G10).
6. **Watch a body for 60 s; watch a crowd flee from a shot** (G8, G14, G16).
7. **Flinders Lane, 2 minutes at walking pace:** wall drift and the LOD pop (G15, G21).

### Gameplay programmer: `missions.js`, `people.js`, `gameplay.js`

1. **G1.** `near: 'player'` becomes a slot Davo *walks* to: position and heading eased, `gait()` driven by his real
   speed, the slot re-picked only when the player is more than 3 m away. Acceptance: S2, S8.
2. **G4.** Every `setActor` pose takes y from the same ground height the player uses (`getGroundHeight` or the
   footpath sampler), never a literal 0. Acceptance: S1.
3. **G5.** Ease every scripted change to `person.heading` (talk, fire, approach) over about 0.2 s. Make the watcher
   turn at patrol ends over about 0.8 s. Give `setActor()` an eased mode. Acceptance: S7.
4. **G6.**
   - Movement overrides a ONCE gesture.
   - `makeActor()` sets `LoopOnce` and `clampWhenFinished` on the ONCE clips.
   - A ONCE clip is not restarted while its name is still requested.
   - Timers run on the game clock.
   - Acceptance: S11.
5. **G11 and G13.** Implement the design call from section 3, item 8 (decided by the creative director and the user).
   Change the carjack line.
6. **G10.** Put the hold-up on the game clock, with fleeing to follow immediately once the cash is handed over.

### Crowd and rig programmer: `pedestrian-system.js`, `pedestrians.js`

1. **G2.** Car–pedestrian contact. Each frame, sweep the player's car footprint against the walkers (the same
   oriented-box test as `playerContactTime()`). On contact, the walker is knocked down with the crumple from the
   technical artist and reuses the `dead` state. The same applies to AI traffic if it can reach a footpath.
2. **G3.** `kill()` uses the crumple, not the dive. The body falls *in the direction of the shot*, with no turn first.
3. **G7.** The cast's footprints (Davo, the watchers, the player on foot) go into `spread()` and `escapeRoom()` as
   fixed obstacles.
4. **G8, G9, G16.** Remove bodies only out of view. Make crosswalk walkers flee too. Count bodies in `spread()`.
5. **G14, G15, G17.** Turn the walker before reversing (pause about 0.3 s, as `TURN_TIME` already does). Clamp
   `sep` and `lineOff` with `canDodge()`. Pass the rig the same `dt` that `walk()` used.
6. **G22.** Check `fleeUntil` in `voice-manager.js`.

### Technical artist

1. **Crumple keyframes** in the `DIVE_POSES` format: knees give, a twist towards the hit side, down within 0.6 s, and
   a still final pose with no push-up. One table serves both shots and knock-downs. This unblocks G2 and G3.
2. **A hands-up or cower pose** for the procedural rig, for the hold-up (G10).
3. **G18.** Ara bodies for the two Kestrel watchers and the intro police, so that everyone the camera frames is the
   same kind of person.
4. **G12 and G19.** Check the Ara clips' foot speeds against `ARA_GAIT`, and the Rocketbox walk against the patrol
   speed. Specify a jump pose, or a lift-and-tuck on the Ara player. Decide whether `sprint` needs its own clip, or a
   gait clamp that keeps it under about 1.4× speed.
5. **G21.** Recommend a LOD distance, or a cross-fade, that hides the pop at 34 m on high quality.

## Validation: we'll know this bar was right if

- A first-time player finishes M1 and, when asked "did anything about the people look wrong?", names nothing from
  sections 2–3.
- QA's M1 walkthrough passes S1–S8 on all five M1 actors, at low and high quality, on a phone and a desktop.
- After the fixes, the owner's report changes from "people are glitchy" to a specific complaint about behaviour
  (for example "the crowd is too quiet"), not about glitches. That is the point to reconsider advanced pedestrian
  behaviour.
