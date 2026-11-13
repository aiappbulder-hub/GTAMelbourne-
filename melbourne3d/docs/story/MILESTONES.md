# The Ferryman: milestones and tickets

Progress is measured by what the player can do, not by files or features listed.

**Deferred (out of scope until Act I plays well):** boats, trucks, other interiors (the Quiet Room is built: see "Interiors" below), the helicopter escape and advanced
pedestrian behaviour. Missions that relied on them are restaged without them (see "Restaging" below).

## Milestone 1: "Low Tide" is playable and the save survives a restart

The threshold: M1 is enjoyable, Davo feels alive, the city works around it, and quitting and reloading never loses
progress or choices.

| # | Ticket | Acceptance test (how it is checked) |
|---|---|---|
| 1.1 | **Save v2.** `{ version: 2, money, progress, flags }` under a new key. A v1 save (`gta-melbourne3d-save-v1`: money, progress) migrates on load; bad or missing data falls back to a new game. | Put a v1 save in localStorage, reload: money and progress are kept, `flags` is `{}`, the v2 key is written. Finish a choice, reload: the flag is still set. Corrupt JSON in the key: the game starts a new save without an error. |
| 1.2 | **Story places by id.** `js/story/places.js` (from `docs/story/places.json`). Missions can use `{ place: 'ID' }`. `tools/melbourne/check-places.mjs` fails on a place outside the map, within 60 m of its edge, or on water (unless marked `onWater`). | `node tools/melbourne/check-places.mjs` exits 0 and prints each place's district. Moving a place onto the Yarra makes it exit 1. |
| 1.3 | **Map fixes M1 touches.** Tobacco Wars goes to South Wharf (by Polly Woodside), not the Bolte Bridge. `districtAt` gets Docklands, Fitzroy/Collingwood/Carlton (along Victoria Pde and Nicholson St), East Melbourne and the MCG (north of the Yarra, west of Punt Rd), North Melbourne (QVM) and Fishermans Bend right. | The checker's district column: Harbour Esplanade is Docklands, the MCG East Melbourne, Smith × Gertrude Collingwood, QVM North Melbourne, Lorimer St Fishermans Bend. Tobacco Wars' marker resolves within 30 m of (−1338, 554). |
| 1.4 | **The prologue hands over to Act I.** After Harbour Run the next job is "Low Tide", at the same spot on Harbour Esplanade. It opens on a black "Twenty-two years later" card. Jobs don't start while a "Mission passed" card is still up. | Pass Harbour Run: the M1 marker is where you are, and M1 starts after the card fades. The Jobs list shows "12. Low Tide". |
| 1.5 | **Stealth step.** Watchers (cast actors) with view cones drawn on the ground: one stationary and sweeping, one patrolling. Being seen fills a meter; when it is full the mission fails ("Kestrel made you"). | Standing in a cone fails the mission within about 2 s. The waterfront route past the patrol reaches the car without failing. |
| 1.6 | **Choice step.** A panel with 2–3 options (buttons, or keys 1–3); the choice sets a story flag and plays a reply line. | Choosing "Yes" sets `flags.davo_tails_kestrel = true`, saved immediately. |
| 1.7 | **The tail (pursuer).** An unmarked car that follows the route the player actually drove, slows for corners and for traffic ahead, keeps a gap, and is lost by staying 200 m clear for 8 s. It never needs the AI road network, so it works in any suburb. | Driving away fast loses it, and the step passes. Stopping lets it close to its gap and stop, never overlap. It is gone after a pass or a fail. |
| 1.8 | **Davo is present.** He waits at the start marker (phone, then waves), plays the cut scene, waits by the car, talks during the chase (timed lines), and stands with you at the Quiet Room for the final choice. | Visible at each stage in a scripted run; his lines appear as subtitles (recorded voice later). |
| 1.9 | **M1 end to end.** Cut scene → stealth to the car → lose the tail → drive to Flinders Lane × Elizabeth St → walk to the door → choice → pass. A fail restarts at the marker on Harbour Esplanade. | A scripted Playwright run reaches "Mission passed", `progress` = 12, the flag is set, and both survive a page reload. |

**Status:** built. All 20 automated checks pass (`node tools/melbourne/test-m1.cjs`), with no page errors. Still to
judge by playing: whether it is *enjoyable* (the stealth timing, the tail's pace, Davo's lines). That needs a person,
not a test.

Known limits accepted for this milestone: Davo's lines are subtitles until voices are generated; the pursuer passes
through a car only if one cuts in sideways (it brakes for cars ahead).

## Milestone 2: Act I complete (M2–M6)

**Status:** the five jobs are built and play end to end (`node tools/melbourne/test-act1.cjs`), as jobs 9–13:
The Quiet Room, Sunday Lunch, Market Day, Doors, The Ferryman's Toll. Still to judge by playing: the pace of the two
chases, the tail's distances, and the raid's stealth.

What was added to the mission system for them (`js/missions.js`, `js/story/leader.js`, `js/story/routes.js`):

| Step | What it does |
|---|---|
| `when: { flag: value }` | a step played only on one branch of an earlier choice |
| `choice` with `cost` | an option takes money; one you can't afford is greyed out (the cheapest never is); up to four options, keys 1–4 |
| `talk` | a conversation part-way through a job, staged like the opening cut scene; `with` puts more of the cast in a scene |
| `lead` | a car or a runner on a fixed route to chase (stay within `far`) or tail (also not within `near`) |
| `ride` (on a job) | someone in the car talking while you drive to the job's marker |

Routes for lead cars are found along the real streets by `tools/melbourne/build-routes.mjs`.

**Restaged for now** (the design's version waits on the features listed): the search and the photographs are
stand-in-the-marker steps; lunch is standing, not seated; the shooter drives a hatch, not a scooter; the market
trucks are utes; Terry's four men are a run for it, not a fight; "blend" is standing still in Federation Square.
Act I's new people (Gus, Ruby, Nico, Marsh, Terry, Sully, Bianca) wear stock bodies and speak with the browser's
voice until their own models and recordings are made (121 lines are listed in `data/character-voices.json`).

Not built: the empire screen tutorial, territory influence and loyalty numbers (Milestone 3 reads the flags these
jobs save), Princes Bridge and Queens Bridge decks, cars stalling in water.

## Milestone 3: the empire (the user's Phase 5)

Territory ownership, business income, four lieutenants, relationships and loyalty, The Book.

**Status:** the first part is built (`js/empire.js`). The Book opens with K: a ledger of the eleven territories with
the player's share and daily take, the people and where they stand, and the record of choices. Shares, standing and
Kestrel's heat are a pure function of the story's flags (`bookFrom(progress, flags)`), so they cannot drift from the
save. The take accrues in real time (capped at three days) and is collected at the Quiet Room.
Still to build: the territory tint on the map, lieutenants (appointing, paying, orders), loyalty events, messages,
and territory jobs.

**Lieutenant rules, simplified** (replacing section 6.4 of the design):

- **Loyalty** moves only on events: well paid +2 per week, underpaid −3, praised or protected +5, overruled or
  slighted −5, a rival lieutenant favoured −5. There is no random drift.
- **Income** = territory base × influence% × (0.75 + competence/200) − skim. Skim is a fixed 0%, 10% or 20% band
  by greed and loyalty, so it can be tuned and predicted.
- **Independent actions** are triggered, not rolled. When a lieutenant's ambition exceeds their loyalty by 30+ and the
  player has given no order for a week, they take one visible action (expand, recruit, or ask a favour) and phone it in.

## Milestone 4: Acts II and III (the user's Phase 6)

Act II and Act III, the betrayal, three endings, post-game free roam.

**Betrayal is event-driven.** A lieutenant becomes the mole only through things the player saw happen: an underpayment
streak, being passed over twice, or a side deal the player was told about and ignored. Each event is logged in The
Book. If no lieutenant has two such events by the end of Act II, the leak is the bug in the Quiet Room (M2). There is
no hidden score.

## Restaging without the deferred features

| Mission | Was | Now |
|---|---|---|
| M1 | arrives by boat | starts on the waterfront at night, on foot (the boat has gone) |
| M9 | steal a prime mover | steal a ute (the existing `steal: 'pickup'`) carrying cartons |
| M12 | gunmen in a dinghy | gunmen on the St Kilda breakwater |
| M16 | helicopter escape | escape on foot to Hammer's car on Normanby Rd, then lose a tail |
| Interiors | bars, offices | the Quiet Room is a real room (`js/interiors.js`); every other interior is still staged at the doorway, footpath or laneway outside |

## Interiors: the Quiet Room (done)
Gus's bar is a sealed, code-built room hung 1500 m above its real footprint (story places `QR_*`, with y = 1500), entered by
F at its street door on Elizabeth St (fade to black, on foot only, not in a cut scene or with police about). The Quiet
Room job's buy-the-bar choice and the bug sweep (under the bar, the booth lamp, the office phone) are played inside
(steps `enter: true` and `inside: true` in `js/missions.js`; a job that moves on to a street step shows the player out), and
Ruby hands the till over at the bar between jobs. Test: `tools/melbourne/test-interior.cjs`.
