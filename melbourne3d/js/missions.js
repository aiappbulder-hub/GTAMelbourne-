import * as THREE from 'three/webgpu';
import { getLocationLabel, ROADS, ALL_AVENUES, ALL_STREETS } from './city-config.js';
import { circuitPoint } from './race-track.js';
import { blockAt } from './city-config.js';
import { STORY_CAST } from './people.js';
import { PLACES } from './story/places.js';
import { createPursuer } from './pursuit.js';
import { createLeader } from './story/leader.js';
import { ROUTES } from './story/routes.js';
import { terrainHeight } from './terrain.js';
import { describeChoice } from './story/choices.js';

// GTA Melbourne's story: "The Ferryman". Tonight, Callum Reid (the player) comes back to Melbourne by boat, twenty-two years
// after he left the same way with Vince Lombardo's black book (who paid whom: police, a developer, a minister's office).
// Job 1 is tonight (Low Tide). The rest are 2004, as he remembers it: the Lygon Street Crew against the Broadmeadows
// firm, Taskforce Kestrel closing in, the book's pages being sold, and the night he takes it and goes. One thread runs
// through every job. The design is in docs/story/ (SYNOPSIS.md, EMPIRE_DESIGN.md).
//
// Places: { grid: ['Flinders St', 'Spencer St'] } a Hoddle Grid corner, { cross: ['STREET A', 'STREET B'] } where two
// streets meet (OSM names), { road: 'STREET' } the middle of a street, { circuit: u } the point a fraction u of the
// way round the Albert Park Grand Prix circuit from its start line (js/race-track.js), off: metres in towards the lake.
// Steps can also ask for: targets: n (take out n armed hostiles who spawn round the player and shoot back; weapons: [...] their guns; red beams over them),
// ambush: { n, weapons } (n armed men at the marker who open up as you come within 110 m), steal: 'pickup'
// (be driving a car of that kind taken from the traffic, or 'any'), talkTo: n (talk to n people), rob: n (hold up n
// people: aim and T).
// A job's steps: { text, at: place, r: metres, car: true (must be driving), time: seconds,
// wait: seconds standing in the marker, away: metres to get clear of the last marker }
// Act I's steps can also ask for:
//   when: { flag: value }   the step is only played if the story's flags say so (a branch after a choice)
//   choice: { who, text, options: [{ label, cost, set: { flag: value }, reply }] }   cost: dollars it takes
//   talk: { who, at, with: [who], lines: [[who, line], ...] }   a conversation part-way through a job, staged like the
//     opening cut scene (a job's own `with` puts more of the cast beside its giver in the opening one)
//   lead: { id: route, speed, file | person, far, near, end, catch }   someone to follow or chase along a route
//     (js/story/leader.js): further than `far` for a few seconds and they're lost, closer than `near` and they've seen
//     you; done once they've stopped at the end with you within `end` metres (or at any time within `catch`).
//     hold: true keeps them where they are (parked before the chase, or stopped after it)
//   watch: [...] with seenText (what the fail says), evade: { file, color } (what's chasing)

const MISSIONS = [
  {
    id: 'M1', act: 'Tonight', name: 'Low Tide', call: ['Davo', "It's Davo. I'm on Harbour Esplanade, at the bottom of Collins Street. Walk down to me. Don't wave."], giver: 'Davo', crew: 'The Crossing', start: { place: 'DOCK_COLLINS' }, reward: 2000,
    begin: { card: ['TWENTY-TWO YEARS LATER', 'Docklands · tonight'], car: { id: 'comodo', place: 'M1_CAR', heading: Math.PI } },
    // (kept short: the intro has just set the story up)
    cut: [['Davo', 'You got old.'],
      ['You', 'You got sober.'],
      ['You', 'Where is the car?'],
      ['Davo', "Up the end, by Bourke Street. Don't walk the esplanade. There's a grey Comodo parked there since Tuesday, two up. Coppers or real estate. Can't tell anymore."],
      ['You', 'Both.'],
      ['Davo', 'Go round by the water, and mind the woman walking the park.']],
    outro: ['You', 'Every empire starts with a lease nobody else wants.'],
    after: { card: ['2004', 'How it started'], line: ['You', 'It started in 2004, with a phone call from Vince Lombardo.'] },
    steps: [
      { text: "Get to Davo's car and get in (F) without being seen. Go round by the water: the esplanade is watched.",
        at: { place: 'M1_CAR' }, r: 7, car: true,
        tail: { place: 'M1_SEDAN', heading: Math.PI },
        watch: [
          { key: 'kestrel_a', model: 'ara:sgt', at: { place: 'M1_WATCH_A' }, heading: -Math.PI / 2, fov: 70, range: 50, sweep: 40, period: 7 },
          { key: 'kestrel_b', model: 'ara:cons', patrol: [{ place: 'M1_PATROL_S' }, { place: 'M1_PATROL_N' }], speed: 1.3, fov: 80, range: 20 }
        ],
        actors: [{ key: 'm_davo', who: 'Davo', at: { place: 'M1_CAR' }, off: [3.6, 0.8], face: 'player', anim: 'text' }] },
      { text: 'They\'re pulling out. Lose the tail: get 200 m clear of the grey Comodo and stay clear.', evade: { lose: 200, hold: 8, speed: 29 }, time: 150,
        lines: [[1, 'Davo', "Don't look now. They're on us."], [9, 'Davo', 'Take the city. Plenty of lights, plenty of trams.'],
          [24, 'Davo', 'Still there. Lose them, mate.'], [60, 'Davo', "They'll run out of petrol before patience. You won't."]],
        say: 'Davo: "Gone. Nice driving, for an old bloke."' },
      { text: 'Take Davo to the Quiet Room: Flinders Lane at Elizabeth St.', at: { place: 'HQ' }, r: 16, car: true,
        lines: [[2, 'Davo', "Your bar. Well, it's a bar. Gus wants out. You'll see."], [20, 'Davo', 'Thirty years his dad ran it. Smells like it, too.']] },
      { text: 'Get out and walk to the door of the Quiet Room.', at: { place: 'HQ', kerb: true }, r: 3, foot: true,
        actors: [{ key: 'm_davo', who: 'Davo', near: 'player', anim: 'idle' }] },
      { text: 'Davo has a question.', choice: { who: 'Davo', text: 'That car. Want me to find out whose it was?',
        options: [
          { label: 'Yes. Quietly.', set: { davo_tails_kestrel: true }, reply: "I know a bloke who used to be a copper. Leave it with me." },
          { label: 'No. Let them watch.', set: { davo_tails_kestrel: false }, reply: "Your call. I'll put the kettle on." }
        ] },
        actors: [{ key: 'm_davo', who: 'Davo', near: 'player', anim: 'talk_cool' }] }
    ]
  },
  // ---------------------------------------------------------------------------------------------------------------
  // 2004, as the Ferryman remembers it. One thread runs through every job: Vince Lombardo's black book (who paid whom:
  // police, a developer, a minister's office), who is selling its pages, and the man who takes it and leaves by boat.
  // ---------------------------------------------------------------------------------------------------------------
  {
    id: 'M2', act: '2004', name: 'Laneway Hustle', call: ['Vince', "It's Vince. Flinders Lane, corner of Elizabeth Street. Come now, and come alone."], giver: 'Vince', crew: 'Lygon Street Crew', start: { cross: ['FLINDERS LANE', 'ELIZABETH STREET'] }, reward: 1000,
    cut: [['Vince', "There you are. Six years this war's been going, and the Broadmeadows firm reckon they own the town now."],
      ['You', 'So what do you need?'],
      ['Vince', "Somebody's been selling pages out of my book. Names, payments, who's on whose payroll. Davo is carrying what's left."],
      ['Vince', "Get him to the lock-up in Carlton before the firm gets to him. He's at the pub in Collingwood. Don't hang about."]],
    steps: [
      { text: 'Get in your car (the CAR button, or switch with the mode buttons).', car: true },
      { text: 'Pick up Davo outside the pub on Wellington St, Collingwood.', at: { cross: ['WELLINGTON STREET', 'GIPPS STREET'] }, r: 14, car: true,
        say: 'Davo: "Carlton, mate. The Broady boys are cutting in on our patch. Step on it."' },
      { text: 'Get Davo to the lock-up in Carlton before the Broadmeadows firm gets there first.', at: { cross: ['RATHDOWNE STREET', 'QUEENSBERRY STREET'] }, r: 16, car: true, time: 150 }
    ]
  },
  {
    id: 'M3', act: '2004', name: 'Word on the Street', call: ['Vince', "Vince. I'm at the lock-up, Rathdowne and Queensberry. We need to talk about my book."], giver: 'Vince', crew: 'Lygon Street Crew', start: { cross: ['RATHDOWNE STREET', 'QUEENSBERRY STREET'] }, reward: 2000,
    cut: [['Vince', 'The pages are still going missing. Somebody is talking to the firm, or to Kestrel. I want a name.'],
      ['You', 'Where do I start?'],
      ['Vince', 'Fitzroy. Ask around. Locals talk if you ask nicely.']],
    steps: [
      { text: 'Get to Gertrude St, Fitzroy.', at: { cross: ['GERTRUDE STREET', 'NICHOLSON STREET'] }, r: 30 },
      { text: 'Ask around: talk to three locals (T next to someone).', talkTo: 3,
        say: 'A local: "The bloke you want drinks at the pub on Smith Street. Didn\'t hear it from me."' },
      { text: 'Check out the pub on Smith St.', at: { cross: ['SMITH STREET', 'GERTRUDE STREET'] }, r: 16, time: 90 }
    ]
  },
  {
    id: 'M4', act: '2004', name: 'The Informant', call: ['Kaz', "You're the one asking about Vince's pages. Smith Street, corner of Gertrude. I'm buying."], giver: 'Kaz', crew: 'Broadmeadows', start: { cross: ['SMITH STREET', 'GERTRUDE STREET'] }, reward: 4000,
    cut: [['Kaz', "You're the one asking questions about Vince's pages. Sit down. It isn't me you want."],
      ['Kaz', 'Vince has a man in Carlton who records everything on tape and sings to Taskforce Kestrel. Who paid whom. Get the tapes before Kestrel does.'],
      ['You', 'Why would I do that for you?'],
      ['Kaz', "Because Vince never paid you what you're worth. I will."],
      ['You', 'I go where the money is.']],
    steps: [
      { text: 'Get the first tape from the phone box on Nicholson St, by the Exhibition Building.', at: { cross: ['NICHOLSON STREET', 'CARLTON STREET'] }, r: 12, time: 150, keepTime: true },
      { text: 'Get the other tape from the informant\'s flat on Clarendon St, East Melbourne.', at: { cross: ['CLARENDON STREET', 'GIPPS STREET'] }, r: 12, keepTime: true },
      { text: 'Burn the tapes at the lock-up in Collingwood. Kestrel is onto you.', at: { cross: ['WELLINGTON STREET', 'GIPPS STREET'] }, r: 14, time: 90 }
    ]
  },
  {
    id: 'M5', act: '2004', name: 'Westside Bikies', call: ['Kaz', "It's Kaz. Collins Street at Spencer, by the station. I know who has the pages."], giver: 'Kaz', crew: 'Broadmeadows', start: { grid: ['Collins St', 'Spencer St'] }, reward: 3000,
    cut: [['Kaz', "The tapes say who sold Vince's pages. The Westside Nomads bought them."],
      ['You', 'And?'],
      ['Kaz', "They've hidden the pages and their takings on a boat in Docklands. Get there before they move it."]],
    steps: [
      { text: 'Get to the Nomads\' boat off Harbour Esplanade, Docklands.', at: { cross: ['HARBOUR ESPLANADE', 'BOURKE STREET'] }, r: 16, time: 110 },
      { text: 'The Nomads see you coming: a pack of bikies on choppers. Take them out.', targets: 4, bikies: true, weapons: ['pistol', 'uzi', 'pistol', 'uzi'] },
      { text: 'Grab the bag, the pages and the cash. Stay in the marker on foot while you take it.', at: { cross: ['HARBOUR ESPLANADE', 'BOURKE STREET'] }, r: 8, wait: 4, foot: true },
      { text: 'Get the bag to Kaz\'s mechanic on Clarendon St, Southbank.', at: { cross: ['WHITEMAN STREET', 'CLARENDON STREET'] }, r: 16, car: true, time: 120 }
    ]
  },
  {
    id: 'M6', act: '2004', name: 'Tobacco Wars', call: ['Kaz', "They burnt my shop. Clarendon Street at Whiteman, in Southbank. Now."], giver: 'Kaz', crew: 'Broadmeadows', start: { place: 'CLAR_WHITE' }, reward: 5000,
    cut: [['Kaz', 'The Nomads know it was us. They burnt our shop last night.'],
      ['You', "That's not my fight."],
      ['Kaz', "It is now. Their stock is in a warehouse on the South Wharf, and so is the rest of Vince's book."],
      ['Kaz', 'Set the charge, grab the pages, then get well clear. Make it loud.']],
    steps: [
      { text: 'Get to the Nomads\' warehouse on the South Wharf, by the Polly Woodside.', at: { place: 'POLLY_WOODSIDE' }, r: 16, time: 90 },
      { text: 'The Nomads\' guards open up. Take them out.', targets: 3, weapons: ['uzi', 'shotgun', 'pistol'] },
      { text: 'Set the charge and grab the pages: stay in the marker on foot.', at: { place: 'POLLY_WOODSIDE' }, r: 7, wait: 5, foot: true },
      { text: 'It\'s going to blow! Get 250 m clear.', away: 250, time: 25 }
    ]
  },
  {
    // a sit-down over coffee in St Kilda (js/stkilda.js plays the scene at the café's front table)
    id: 'M7', act: '2004', name: 'Short Black', call: ['Kaz', "Coffee. Acland Street, St Kilda, the Short Black. There's a man you should meet."], giver: 'Kaz', crew: 'Broadmeadows', scene: 'cafe', start: { cafe: true }, reward: 5500,
    // straight on from Tobacco Wars: a short black card, then the player is at the café table (no trek to a marker)
    chain: true, begin: { card: ['ST KILDA', 'Acland Street · the Short Black'], quick: true },
    cut: [['Kaz', "Sit down. You're making the locals nervous."],
      ['Mick', 'Best flat white south of the river, and you lot want to talk shop.'],
      ['Kaz', 'This is Mick. Mick moves things. Watches, phones, whatever falls off a truck. Today he is moving paper.'],
      ['Mick', "There's an envelope in a locker at the end of St Kilda Pier. The last pages of Vince's book, and a photograph."],
      ['You', 'Of what?'],
      ['Mick', 'A developer shaking hands with a Kestrel detective. Whoever holds that photograph owns this town.'],
      ['Kaz', "Bring it back here. And don't stop to look at the penguins."]],
    outro: ['Mick', "Good man. The coffee's on me."],
    steps: [
      { text: 'Get out to the end of St Kilda Pier, by the kiosk.', at: { pier: true }, r: 8 },
      { text: 'Find the locker and grab the envelope. Stay in the marker on foot.', at: { pier: true }, r: 5, wait: 3, foot: true },
      { text: 'Get the envelope back to the café on Acland Street before the Nomads catch on.', at: { cafe: true }, r: 7, time: 150 }
    ]
  },
  {
    id: 'M8', act: '2004', name: 'Harbour Run', call: ['Kaz', "It's all coming down. Flinders Street at Queen. Hurry."], giver: 'Kaz', crew: 'Broadmeadows', start: { grid: ['Flinders St', 'Queen St'] }, reward: 10000,
    chain: true, begin: { card: ['FLINDERS STREET', 'Kestrel raided the Brighton house'], quick: true }, // (straight on from the café, five kilometres away)
    cut: [['Kaz', 'Kestrel raided the Brighton house. They know the book is gone, and so do both crews.'],
      ['Kaz', "There's a boat waiting off Harbour Esplanade. Be on it in two and a half minutes, or don't bother."]],
    steps: [
      { text: 'Get to the boat off Harbour Esplanade, Docklands!', at: { cross: ['HARBOUR ESPLANADE', 'COLLINS STREET'] }, r: 14, time: 150, ambush: { n: 3, weapons: ['uzi', 'pistol', 'm4'] } }
    ],
    // back in the present, and the choice Davo asked about at the Quiet Room door has its answer
    after: { card: ['2026', 'Twenty-two years later'],
      lineIf: { flag: 'davo_tails_kestrel',
        yes: ['You', "Davo's friend rang while I was remembering. The grey Comodo was Kestrel's. It always is."],
        no: ['You', 'I let Kestrel watch. After twenty-two years, they could wait one more night.'] } }
  },
  // ---------------------------------------------------------------------------------------------------------------
  // Act I, "Low Tide" (2026), after the memory: the Quiet Room, Sunday lunch, the market, the doors and the raid
  // (docs/story/EMPIRE_DESIGN.md section 5, restaged without interiors, boats or trucks: see MILESTONES.md).
  // call: the phone call that sends you to the job ([who, line]), rung through a few seconds after the last job (or
// after the game loads), with where to go.
// ride: someone in the car with you, talking, while you drive to the job's marker ([seconds at the wheel, who, line]).
  // ---------------------------------------------------------------------------------------------------------------
  {
    id: 'A2', act: 'Act I', name: 'The Quiet Room', call: ['Davo', "Gus is at the bar now. Flinders Lane at Elizabeth Street. If you want the place, today's the day."], giver: 'Gus', crew: 'The Crossing', start: { place: 'HQ' }, reward: 3000,
    chain: true, begin: { card: ['THE QUIET ROOM', 'Flinders Lane · Elizabeth Street'], quick: true }, // (straight on from the 2026 card)
    ride: [[3, 'Davo', "Gus Pappas. His old man poured beers in that bar for thirty years. Gus has poured them for the bank."],
      [14, 'Davo', "He'll sell. He just wants to be asked properly. Or not. Up to you."],
      [28, 'Davo', "And Ruby Achterberg has been ringing. Does the numbers for the Golden Reef crowd at Southbank. Says you gave her a way to reach you, years back."]],
    cut: [['Gus', "Thirty years. My father's bar. And you want it for what? A front?"],
      ['You', 'A bar. With a quiet room out the back.'],
      ['Gus', 'The bank wants it Friday.'],
      ['You', 'Then we both know what day it is.']],
    outro: ['Ruby', "You don't have enough money to be this calm."],
    steps: [
      // (the bar is inside: the door is on Elizabeth St, js/interiors.js; `enter` is done once you are in, `inside` steps are played in the room)
      { text: 'Go into the Quiet Room: the door on Elizabeth St, just south of the lane. Gus is waiting at the bar.', at: { place: 'QR_DOOR' }, r: 3, foot: true, enter: true },
      { text: 'Gus is behind the bar. Walk up to it.', at: { place: 'QR_BAR' }, r: 1.7, foot: true, inside: true,
        lines: [[0.8, 'Gus', 'Mind the third stool. It has rocked since 1987.']],
        actors: [{ key: 'a_gus', who: 'Gus', at: { place: 'QR_GUS' }, face: 'player', anim: 'idle' }] },
      { text: 'Gus is waiting on an offer.', inside: true, choice: { who: 'Gus', text: "So. What's your offer?",
        options: [
          { label: 'A fair price, and your name stays on the window.', cost: 12000, set: { quiet_room: 'fair' }, reply: "My father would have shaken your hand. Don't make me regret it." },
          { label: 'The bank wants it Friday. I want it today.', cost: 4000, set: { quiet_room: 'lean' }, reply: 'You people. Always the same. Take it.' },
          { label: "Stay on. Run the bar. I'll run the rest.", cost: 8000, set: { quiet_room: 'partner' }, reply: 'Then I hear things, and you hear them second. Deal.' }
        ] },
        actors: [{ key: 'a_gus', who: 'Gus', at: { place: 'QR_GUS' }, face: 'player', anim: 'talk_assured' }] },
      { text: 'Your phone: Ruby Achterberg wants out of the Golden Reef suite at Southbank, now. Get in a car (F by any car, or the CAR button).', car: true,
        lines: [[0.4, 'Ruby', "It's Ruby. You said to call if I ever wanted out. I want out. Under Eureka, the City Road side. Be quick."]] },
      { text: "Get to City Rd at Southbank Blvd, under Eureka, before Golden Reef's driver does.", at: { place: 'SB_CITY' }, r: 16, car: true, time: 130, wait: 2,
        lines: [[6, 'Davo', "Ruby Achterberg kept Vellacott's books six years. If she's walking out, she's walking out with all of it in her head."],
          [22, 'Davo', "Over the river. Queens Bridge, then left. She'll be the one not looking at her phone."]],
        actors: [{ key: 'a_ruby', who: 'Ruby', at: { place: 'SB_CITY', kerb: true }, face: 'player', anim: 'look' }],
        say: 'Ruby: "Drive. Don\'t look at the black four-wheel drive."' },
      { text: "Golden Reef's driver is behind you. Lose the black Territorial: get 200 m clear and stay clear.", evade: { lose: 200, hold: 8, speed: 27, file: 'territorial', color: 0x0c0c0e }, time: 160,
        lines: [[2, 'Ruby', "That's Vellacott's chauffeur. He's paid to follow, not to think. Use that."],
          [18, 'Davo', 'Back over the river. He hates trams.'],
          [45, 'Ruby', 'Still there. I did say be quick.']],
        say: 'Ruby: "Gone. Vellacott will be livid. Good."' },
      { text: 'Take Ruby to the Quiet Room: Flinders Lane at Elizabeth St.', at: { place: 'HQ' }, r: 16, car: true,
        lines: [[2, 'Ruby', "Six years of his books. I know where every dollar sleeps, and who tucks it in."],
          [14, 'Davo', 'She talks like that all the time?'],
          [19, 'Ruby', 'Only when I am being paid. Am I being paid?'],
          [30, 'Ruby', 'Before anyone says anything useful in that bar, I sweep it. Kestrel had a week with the place empty.']] },
      { text: 'Get out and go into the Quiet Room with Ruby: the door on Elizabeth St.', at: { place: 'QR_DOOR' }, r: 3, foot: true, enter: true,
        actors: [{ key: 'a_ruby', who: 'Ruby', near: 'player', anim: 'look' }] },
      { text: 'Ruby wants the place swept. Start under the bar.', at: { place: 'QR_UNDER' }, r: 1.6, wait: 3, foot: true, inside: true,
        actors: [{ key: 'a_ruby', who: 'Ruby', at: { place: 'QR_BAR' }, off: [-3, -1.2], face: 'player', anim: 'look' }],
        say: 'Ruby: "Nothing. Next the booth lamp."' },
      { text: 'Check the lamp over the booth.', at: { place: 'QR_LAMP' }, r: 1.6, wait: 3, foot: true, inside: true,
        actors: [{ key: 'a_ruby', who: 'Ruby', at: { place: 'QR_BAR' }, off: [-3, -1.2], face: 'player', anim: 'look' }],
        say: 'Ruby: "Clean. Try the office phone."' },
      { text: 'Check the phone by the office door.', at: { place: 'QR_PHONE' }, r: 1.6, wait: 3, foot: true, inside: true,
        actors: [{ key: 'a_ruby', who: 'Ruby', at: { place: 'QR_BAR' }, off: [-3, -1.2], face: 'player', anim: 'look' }],
        say: 'Ruby: "There. Inside the earpiece. That is a Kestrel bug, and it is still warm."' },
      { text: 'Ruby is holding the bug.', inside: true, choice: { who: 'Ruby', text: 'What do we do with it?',
        options: [
          { label: 'Crush it.', set: { bug: 'destroyed' }, reply: "Clean. They'll know we found it." },
          { label: "Leave it. We'll tell it bedtime stories.", set: { bug: 'kept' }, reply: 'Then we mind what we say in here, and choose what they hear.' }
        ] },
        actors: [{ key: 'a_ruby', who: 'Ruby', at: { place: 'QR_BAR' }, off: [-3, -1.2], face: 'player', anim: 'talk_cool' }] }
    ]
  },
  {
    id: 'A3', act: 'Act I', name: 'Sunday Lunch', call: ['Vince', "Callum. Sunday lunch. Argyle Square, off Lygon Street. Come hungry, and come alone."], giver: 'Vince', crew: 'Lygon Street Crew', start: { place: 'ARGYLE_SQ' }, reward: 4000, with: ['Nico'],
    ride: [[3, 'Davo', 'Sunday lunch on the piazza. He still does it. Long table, bocce, the oxygen bottle under his chair like a dog.'],
      [16, 'Davo', "Nico will be there. The nephew. He was twelve when you left and he's been angry about it ever since."],
      [30, 'Davo', "Don't let Vince pour for you. He does it to see if your hand shakes."]],
    cut: [['Vince', 'Twenty-two years, and you walk in at the primo. You always had manners.'],
      ['Nico', "Manners. He left with your book, Zio. I remember."],
      ['Vince', 'You were twelve. You remember gelato.'],
      ['Vince', "I'm dying, Callum. Slowly, which is the expensive way. When I go, Carlton goes to someone."],
      ['Vince', "I'd rather it went to someone who sits still."],
      ['You', "I didn't come back for Carlton."],
      ['Vince', "Nobody comes back for Carlton. They come back, and it's still here."]],
    outro: ['You', 'In Carlton, a promise to a dying man outranks a contract.'],
    steps: [
      { text: 'Shots from Lygon St! A white hatch is pulling away. Get in a car (F by any car, or the CAR button).', car: true,
        lead: { id: 'LUNCH_CHASE', hold: true, file: 'barrina', color: 0xe8e8e8 },
        lines: [[0.3, 'Nico', 'Down! Get Zio down!'], [2.6, 'Vince', "Don't stand there. Go and ask him who sent him."]] },
      { text: "Chase the white hatch. Don't let it get away.", lead: { id: 'LUNCH_CHASE', speed: 16, file: 'barrina', color: 0xe8e8e8, far: 190, end: 18, lostText: 'The hatch got away.' },
        lines: [[3, 'Davo', "White Barrina. One bloke. He's not a shooter, he's a driver who was handed a gun."],
          [14, 'Davo', "He's running for the university. Nowhere to go up there on a Sunday."]],
        say: 'Davo: "He\'s stalled it. Go easy. He\'s more scared than you are."' },
      { text: 'He has stalled it on Grattan St. Get out and walk up to him.', at: { place: 'CARDIGAN_DRIVER' }, r: 4, foot: true,
        lead: { id: 'LUNCH_CHASE', hold: true },
        actors: [{ key: 'a_shooter', who: 'Shooter', at: { place: 'CARDIGAN_DRIVER' }, off: [2.2, 1.6], face: 'player', anim: 'nervous_idle' }] },
      { text: 'The driver has his hands up.', choice: { who: 'Shooter', text: "Don't. Please. I just drive. I just drive!",
        options: [
          { label: 'Who sent you?', set: { lunch_shooter: 'talked' }, reply: 'A yard hand at the market. Paid cash. Said it was a message, not a hit.' },
          { label: 'Leave him for Sal.', set: { lunch_shooter: 'sal' }, reply: 'Thank you. Thank you. I never saw you.' }
        ] },
        lead: { id: 'LUNCH_CHASE', hold: true },
        actors: [{ key: 'a_shooter', who: 'Shooter', at: { place: 'CARDIGAN_DRIVER' }, off: [2.2, 1.6], face: 'player', anim: 'talk_nervous' }] },
      { text: 'Go back to Vince at Argyle Square.', at: { place: 'ARGYLE_SQ' }, r: 9,
        lines: [[3, 'Davo', "A message. At Sunday lunch. Somebody wants the old man to know he can be reached at his own table."],
          [16, 'Davo', "Whatever he asks you now, he's been waiting twenty-two years to ask it."]] },
      { text: 'Vince has sent the others away.', choice: { who: 'Vince', text: 'So. Nico takes the chair when I am gone, or you keep the books for Carlton and he never knows. Which?',
        options: [
          { label: "Nico takes the chair. I'll stand behind it.", set: { carlton: 'nico' }, reply: "Good. He will try you. When he does, do it kindly. For his mother." },
          { label: "I'll keep the books. Quietly.", set: { carlton: 'books' }, reply: "Then you are my partner, and he is your problem. Do it kindly. For his mother." }
        ] },
        actors: [{ key: 'a_vince', who: 'Vince', at: { place: 'ARGYLE_SQ', kerb: true }, face: 'player', anim: 'talk_assured' }] }
    ]
  },
  {
    id: 'A4', act: 'Act I', name: 'Market Day', call: ['Davo', "Queen Vic Market, the Victoria Street end, corner of Queen. Early. Bring your phone, not your gun."], giver: 'Davo', crew: 'The Crossing', start: { place: 'VIC_QUEEN' }, reward: 4500,
    ride: [[3, 'Ruby', 'The market. Five in the morning, forklifts everywhere, and three utes that never have plates on.'],
      [16, 'Ruby', "I ran the numbers on what comes off them. It isn't fruit. Fruit doesn't pay for a rail yard."],
      [30, 'Ruby', 'Photograph them, then follow one. And stay back. People who load at dawn check their mirrors.']],
    cut: [['You', 'Fruit and veg goes in at dawn. So does everything else.'],
      ['Davo', 'Word is the bloke at lunch was paid out of this market. Three utes load here every morning. No plates, and nobody asks.'],
      ['You', 'Whose?'],
      ['Davo', "That's what the phone is for. Get a picture of each, then see where the last one goes."],
      ['Davo', 'And Callum. Hang back. They know what a tail looks like.']],
    outro: ['You', 'She was always going to be at that gate. The only question was which side of it I would be standing on.'],
    steps: [
      { text: 'Photograph the first ute: Queen St at Franklin St. On foot, stay in the marker and hold still.', at: { place: 'QUEEN_FRANKLIN', kerb: true }, r: 4, wait: 3, foot: true },
      { text: 'Photograph the second: Elizabeth St at Therry St.', at: { place: 'ELIZ_THERRY', kerb: true }, r: 4, wait: 3, foot: true },
      { text: 'Photograph the third, by the sheds: Queen St at Therry St.', at: { place: 'QUEEN_THERRY', kerb: true }, r: 4, wait: 3, foot: true,
        say: 'Davo: "That\'s three. The grey one is pulling out onto Victoria Street. Go."' },
      { text: 'The grey ute is leaving from Victoria St. Get in a car.', car: true, lead: { id: 'MARKET_UTE', hold: true, file: 'strainger', color: 0x8d8f8a } },
      { text: "Tail the grey ute to wherever it's going. Stay back: no closer than 25 m, no further than 200 m.",
        lead: { id: 'MARKET_UTE', speed: 13, file: 'strainger', color: 0x8d8f8a, far: 200, farHold: 7, near: 25, end: 50,
          lostText: 'You lost the ute.', seenText: 'The driver saw you in his mirror. The yard will be empty by tonight.' },
        lines: [[4, 'Davo', 'West on Victoria Street. Not the freeway, then. Somewhere close.'],
          [30, 'Davo', "North Melbourne. Twenty-two years ago this was all Kaz's uncle's. Ray, out in Broadmeadows. Tobacco, mostly."],
          [60, 'Davo', "Easy. Let a car get between you if you can."],
          [95, 'Davo', "Dudley Street. The rail yards. Well, I'll be. She never left."]],
        say: 'Davo: "That\'s Kaz at the gate. She knew we were coming, mate."' },
      { text: 'The yards on Dudley St. Get out and walk to the gate.', at: { place: 'DUDLEY_WURU', kerb: true }, r: 4, foot: true,
        lead: { id: 'MARKET_UTE', hold: true },
        actors: [{ key: 'a_kaz', who: 'Kaz', at: { place: 'DUDLEY_WURU', kerb: true }, off: [1.8, 1.2], face: 'player', anim: 'angry_idle' }] },
      { text: 'Kaz.', lead: { id: 'MARKET_UTE', hold: true },
        talk: { who: 'Kaz', at: { place: 'DUDLEY_WURU', kerb: true }, lines: [
          ['Kaz', 'Twenty-two years, and you still follow utes.'],
          ['You', 'You still load them at the market.'],
          ['Kaz', "Uncle Ray's tobacco. Pays for the yard, pays for the boys. Pays for nothing I want."],
          ['Kaz', 'What do you want?'],
          ['You', 'Ten percent of what goes through this gate, and nothing that goes through it in my name.']] } },
      { text: 'Kaz is waiting.', lead: { id: 'MARKET_UTE', hold: true },
        choice: { who: 'Kaz', text: 'Ten percent. Or what?',
          options: [
            { label: 'Or nothing. You get a door into the Grid. I get my ten.', set: { kaz: 'partner' }, reply: "Partners, then. Don't make me say it twice." },
            { label: 'Or these photographs go for a walk.', set: { kaz: 'threat' }, reply: "There he is. Fine. You'll get your ten, and you'll count it yourself." },
            { label: 'Or Kestrel gets a present.', set: { kaz: 'inform' }, reply: 'Then we are done talking. Mind your back, Ferryman.' }
          ] },
        actors: [{ key: 'a_kaz', who: 'Kaz', at: { place: 'DUDLEY_WURU', kerb: true }, face: 'player', anim: 'talk_cool' }] }
    ]
  },
  {
    id: 'A5', act: 'Act I', name: 'Doors', call: ['Ruby', "King Street, tonight. Meet me at the Flinders Lane corner. Wear something a bouncer would respect."], giver: 'Ruby', crew: 'The Crossing', start: { place: 'KING_FL' }, reward: 5000,
    ride: [[3, 'Ruby', 'King Street. Eleven clubs, and one firm on every door: Kingsgate. Terry Maguire.'],
      [15, 'Ruby', 'A door is the only business in this town that is all cash and no stock. Whoever holds the rope holds the street.'],
      [29, 'Davo', "Terry's all right. Terry's just never been told no by anyone he couldn't have thrown out."]],
    cut: [['Ruby', 'Friday, eleven at night. The doors are counting, and so am I.'],
      ['Ruby', 'You want a slice of the Grid, it starts at the rope. The big fella at Bourke Street runs the rest of them.'],
      ['You', 'And the takings?'],
      ['Ruby', "Bianca Rowe walks the night's envelopes up to Terry. She is quick. Be quicker."]],
    outro: ['You', 'By dawn the street sweeper was the only one working King Street for free.'],
    steps: [
      { text: 'Walk up King St to the head bouncer at Bourke St.', at: { place: 'KING_BOURKE', kerb: true }, r: 4, foot: true,
        actors: [{ key: 'a_bouncer', who: 'Bouncer', at: { place: 'KING_BOURKE', kerb: true }, off: [1.6, 1.2], face: 'player', anim: 'idle' }] },
      { text: 'The head bouncer.', choice: { who: 'Bouncer', text: "Private night, mate. Unless you're here about the door.",
        options: [
          { label: "Here's two grand. Tell the others.", cost: 2000, set: { doors_first: 'bribe' }, reply: 'Then I never saw who came through.' },
          { label: 'You work for me now. Ask around about who I am.', set: { doors_first: 'lean' }, reply: 'Yeah. Yeah, I heard you were back.' }
        ] },
        actors: [{ key: 'a_bouncer', who: 'Bouncer', at: { place: 'KING_BOURKE', kerb: true }, off: [1.6, 1.2], face: 'player', anim: 'talk' }] },
      { text: "Bianca Rowe has bolted with the night's envelopes. Run her down (Shift to sprint).",
        lead: { id: 'DOORS_RUN', person: STORY_CAST.Bianca, speed: 5.9, far: 110, farHold: 4, end: 3.5, catch: 2.5, lostText: 'Bianca got away with the envelopes.' },
        lines: [[0.3, 'Bouncer', "Oi! That's Bianca! She's got the bag!"]] },
      { text: 'A Merc pulls up. Terry Maguire.', lead: { id: 'DOORS_RUN', hold: true },
        talk: { who: 'Terry', at: 'lead', lines: [
          ['Terry', "That's my girl you've run to ground, and my envelopes. Terry Maguire. You'll be the ghost everyone's on about."],
          ['You', 'I am the man who just spoke to your doors.'],
          ['Terry', "Doors talk to whoever's standing closest. I've four lads in that car who stand very close."],
          ['You', "Then let's keep this between people who can count."]] } },
      { text: 'Terry is listening.', lead: { id: 'DOORS_RUN', hold: true },
        choice: { who: 'Terry', text: 'Go on, then. Count.',
          options: [
            { label: 'Fifty-fifty. Your men, my peace.', set: { doors: 'split' }, reply: "Half of King Street for a quiet life. I've signed worse." },
            { label: 'All of it. You can keep the Merc.', set: { doors: 'take' }, reply: 'Wrong answer, son. Lads!' },
            { label: "Bianca keeps tonight's envelopes. And she answers my calls.", set: { doors: 'bianca' }, reply: "You're buying my runner? Take her. She was skimming anyway." }
          ] },
        actors: [{ key: 'a_terry', who: 'Terry', at: 'lead', off: [1.6, 1.0], face: 'player', anim: 'talk_assured' }] },
      { when: { doors: 'take' }, text: "Terry's men are coming out of every door. Get 250 m clear.", away: 250, time: 60 }
    ]
  },
  {
    id: 'A6', act: 'Act I', name: "The Ferryman's Toll", call: ['Ruby', "Come to the Quiet Room. Now. There are three cars in the lane with their lights off."], giver: 'Marsh', crew: 'Taskforce Kestrel', start: { place: 'HQ' }, reward: 8000, with: ['Ruby'],
    ride: [[3, 'Davo', "Ruby rang. Three cars sitting on Flinders Lane with their lights off. That's not a booze bus."],
      [15, 'Davo', "If it goes bad, I'll be on Flinders Street, the far side of Elizabeth, engine running. Don't come out the front."],
      [28, 'Davo', "And don't let them have the ledger. Everything we've done since you got back is in that book."]],
    begin: { card: ['CLOSING TIME', 'The Quiet Room'], car: { id: 'comodo', place: 'M13_CAR', heading: -Math.PI / 2 } },
    cut: [['Marsh', "Lemonade, thanks. I'm working. Detective Inspector Helen Marsh."],
      ['Marsh', "I read your file on the plane back from a conference. Twelve pages. Ten of them say 'unknown'."],
      ['You', 'Sounds like a short conference.'],
      ['Marsh', "The warrant's for the ledger. Not you. Not yet."],
      ['Ruby', "It's in your coat. Back door. Davo is on Flinders Street. Go."]],
    outro: ['You', 'Someone inside wanted me caught. Not killed. Caught. That narrows it.'],
    after: { card: ['ACT II', 'The Board'], line: ['You', "You don't take a city. You find out who you can trust with a piece of it."] },
    steps: [
      { text: "Get the ledger to Davo's car on Flinders St without being seen. Cross Elizabeth St behind the uniform on the corner and go down the far side.",
        at: { place: 'M13_CAR' }, r: 7, car: true, time: 110,
        seenText: 'The uniforms saw you leave. Marsh has the ledger.', shotText: 'Shots outside a raid. Marsh has the ledger, and you.',
        watch: [
          { key: 'uni_b', model: 'Police_Male_03', at: { place: 'M13_UNI_B' }, heading: 0, fov: 60, range: 30, sweep: 15, period: 7 },
          { key: 'uni_a', model: 'Police_Male_01', patrol: [{ place: 'M13_UNI_N' }, { place: 'M13_UNI_S' }], speed: 1.3, fov: 80, range: 20 }
        ],
        actors: [{ key: 'm_davo', who: 'Davo', at: { place: 'M13_CAR' }, off: [-3.4, 1.8], face: 'player', anim: 'text' }] },
      { text: "Kestrel is on you. Lose the unmarked car: get 200 m clear and stay clear.", evade: { lose: 200, hold: 8, speed: 30 }, time: 160,
        lines: [[1, 'Davo', "That's Marsh's lot. Go. Go!"], [12, 'Davo', 'They knew which night. How did they know which night?'],
          [40, 'Davo', "Don't go home. Don't go anywhere you've been."]],
        say: 'Davo: "Clear. Dump the car by the station. They\'ll have the plates by now."' },
      { text: 'Dump the car on Flinders St at Russell St, by Federation Square.', at: { place: 'FLINDERS_RUSSELL' }, r: 16, car: true,
        lines: [[3, 'Davo', "I'll walk it from here. You get in among the people at Fed Square and you stand very still."]] },
      { text: 'On foot: walk into the crowd at Federation Square and stand still while the heat goes by.', at: { place: 'FEDSQ_PLAZA' }, r: 10, wait: 10, foot: true },
      { when: { davo_tails_kestrel: true }, text: 'A man steps out of the crowd.',
        talk: { who: 'Sully', at: { place: 'FEDSQ_PLAZA' }, lines: [
          ['Sully', "Davo has been asking after a grey Comodo. I'm the bloke he asked. Sully. Fifteen years in the job, twenty-one out of it."],
          ['Sully', 'They knew which floorboard, Callum. Someone told them which floorboard.'],
          ['You', 'Someone inside.'],
          ['Sully', 'Someone who wants you in a cell, not in the river. I would start with who knew about tonight.']] } },
      { when: { davo_tails_kestrel: false }, text: 'A man steps out of the crowd.',
        talk: { who: 'Sully', at: { place: 'FEDSQ_PLAZA' }, lines: [
          ['Sully', "Don't turn round. The name is Sully. Fifteen years in the job, twenty-one out of it, and I still know a raid when I see one go wrong."],
          ['Sully', 'They knew which floorboard, Callum. Someone told them which floorboard.'],
          ['You', 'Someone inside.'],
          ['Sully', 'Someone who wants you in a cell, not in the river. I would start with who knew about tonight.']] } },
      { text: 'Sully nods at your coat.', choice: { who: 'Sully', text: "That ledger can't stay on you. Who holds it?",
        options: [
          { label: 'Ruby. She wrote half of it.', set: { ledger: 'ruby' }, reply: 'The bookkeeper. Sensible. Hope she is as loyal as she is neat.' },
          { label: 'Davo. He has never read a book in his life.', set: { ledger: 'davo' }, reply: 'The old mate. They will look there first, and he will say nothing. Probably.' },
          { label: 'You. Nobody knows you are with me.', set: { ledger: 'sully' }, reply: 'Trusting a copper. You have been away a long time.' },
          { label: "Nobody. I'll stash it myself.", set: { ledger: 'self' }, reply: 'Then only one man can give it up. Mind he does not.' }
        ] },
        actors: [{ key: 'a_sully', who: 'Sully', at: { place: 'FEDSQ_PLAZA' }, face: 'player', anim: 'talk_cool' }] }
    ]
  }
];

const SAVE_KEY = 'gta-melbourne3d-save-v2';
const SAVE_KEY_V1 = 'gta-melbourne3d-save-v1';
const NEW_KEY = 'gta-melbourne3d-new-game'; // set for one reload by newGame()

const CSS = `
.gm-pointer { position: fixed; left: 0; top: 0; z-index: 31; pointer-events: none; display: none; transform: translate(-50%, -50%);
  font: 800 13px/1 'JetBrains Mono', monospace; color: #fff; text-align: center; text-shadow: 0 1px 3px rgba(0,0,0,.9); }
.gm-pointer.on { display: block; }
.gm-pointer i { display: block; width: 0; height: 0; margin: 0 auto 4px; border-left: 11px solid transparent; border-right: 11px solid transparent;
  border-top: 18px solid var(--pc, #ff3d9a); filter: drop-shadow(0 2px 4px rgba(0,0,0,.6)); }
.gm-pointer span { display: inline-block; padding: 3px 7px; border-radius: 8px; background: rgba(10,12,16,.72); }
.gm-objective { position: fixed; left: 50%; top: 84px; transform: translateX(-50%); max-width: min(720px, 92vw); z-index: 30;
  padding: 10px 16px; border-radius: 12px; background: rgba(10, 12, 16, 0.78); color: #fff; font: 600 15px/1.35 Inter, system-ui, sans-serif;
  text-align: center; box-shadow: 0 8px 30px rgba(0,0,0,.35); pointer-events: none; }
.gm-objective:empty { display: none; }
.gm-objective[data-job]::before { content: attr(data-job); display: block; margin-bottom: 2px; color: #ff4fa3; font: 800 11px/1.2 Inter, system-ui, sans-serif; letter-spacing: .1em; text-transform: uppercase; }
.gm-timer { position: fixed; right: 18px; top: 84px; z-index: 30; padding: 6px 12px; border-radius: 10px; background: rgba(10,12,16,.78);
  color: #ffd23f; font: 800 22px/1 'JetBrains Mono', monospace; pointer-events: none; }
.gm-timer[hidden], .gm-cut[hidden] { display: none; }
.gm-money { position: fixed; right: 18px; top: 124px; z-index: 30; color: #8ee07a; font: 800 22px/1 'JetBrains Mono', monospace;
  text-shadow: 0 2px 6px rgba(0,0,0,.7); pointer-events: none; }
.gm-big { position: fixed; left: 50%; top: 34%; transform: translate(-50%, -50%); z-index: 31; text-align: center; pointer-events: none;
  font: 900 clamp(30px, 6vw, 64px)/1 Inter, system-ui, sans-serif; letter-spacing: .04em; text-shadow: 0 4px 18px rgba(0,0,0,.7); transition: opacity .4s; }
.gm-big small { display: block; margin-top: 10px; font-size: .42em; color: #8ee07a; }
body.cutscene .gm-cut { bottom: max(10px, calc(11vh - 64px)); width: min(660px, 92vw); z-index: 61; background: rgba(0,0,0,.42); padding: 10px 16px 8px; }
body.cutscene .gm-pointer, body.cutscene .intro-skip, body.cutscene .gm-big { display: none !important; }
.gm-cut { position: fixed; left: 50%; bottom: 120px; transform: translateX(-50%); width: min(760px, 94vw); z-index: 32; padding: 14px 18px 12px;
  border-radius: 14px; background: rgba(8, 10, 14, 0.9); color: #fff; font: 500 16px/1.45 Inter, system-ui, sans-serif; cursor: pointer;
  box-shadow: 0 10px 40px rgba(0,0,0,.45); }
.gm-cut b { display: block; color: #ff4fa3; font-size: 13px; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 4px; }
.gm-cut i { display: block; margin-top: 8px; color: rgba(255,255,255,.55); font-size: 12px; font-style: normal; text-align: right; }
.gm-black { position: fixed; inset: 0; z-index: 70; background: #000; color: #fff; display: flex; flex-direction: column; align-items: center;
  justify-content: center; text-align: center; opacity: 0; pointer-events: none; transition: opacity .7s ease; }
.gm-black.on { opacity: 1; pointer-events: auto; }
.gm-black b { font: 900 clamp(28px, 6vw, 64px)/1 Inter, system-ui, sans-serif; letter-spacing: .08em; }
.gm-black small { margin-top: 14px; font: 600 13px/1 Inter, system-ui, sans-serif; letter-spacing: .3em; color: #ffcf6e; text-transform: uppercase; }
.gm-choice { position: fixed; left: 50%; bottom: 110px; transform: translateX(-50%); width: min(620px, 94vw); z-index: 33; padding: 14px 18px;
  border-radius: 14px; background: rgba(8, 10, 14, 0.92); color: #fff; font: 500 16px/1.45 Inter, system-ui, sans-serif; box-shadow: 0 10px 40px rgba(0,0,0,.45); }
.gm-choice[hidden] { display: none; }
.gm-choice b { display: block; color: #ff4fa3; font-size: 13px; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 4px; }
.gm-choice button { display: block; width: 100%; margin-top: 8px; padding: 10px 12px; border: 1px solid rgba(255,255,255,.25); border-radius: 10px;
  background: rgba(255,255,255,.06); color: #fff; font: 600 15px/1.3 Inter, system-ui, sans-serif; text-align: left; cursor: pointer; }
.gm-choice button:hover, .gm-choice button:focus-visible { background: rgba(255,79,163,.22); border-color: #ff4fa3; outline: none; }
.gm-choice button i { font-style: normal; color: #ffd23f; margin-right: 8px; }
.gm-choice { max-height: calc(100vh - 130px); max-height: calc(100dvh - 130px); overflow-y: auto; }
.gm-choice .gm-ask { font-weight: 700; font-size: 17px; line-height: 1.35; }
.gm-choice .gm-said { margin-top: 4px; color: #b9c0cc; font-size: 14px; font-style: italic; }
.gm-choice button { display: flex; align-items: flex-start; gap: 10px; min-height: 56px; }
.gm-choice button i { flex: none; width: 26px; height: 26px; margin: 1px 0 0; border-radius: 50%; background: #ffd23f; color: #111; text-align: center; line-height: 26px; font-weight: 800; }
.gm-choice button span { display: block; min-width: 0; }
.gm-choice button strong { display: block; font-weight: 700; }
.gm-choice button small { display: block; margin-top: 3px; font: 500 13px/1.35 Inter, system-ui, sans-serif; color: #c9d0db; }
.gm-choice .gm-hint { margin-top: 10px; font-size: 12.5px; color: #ffcf6e; text-align: center; }
.gm-chosen { position: fixed; left: 50%; bottom: 120px; transform: translateX(-50%); width: min(560px, 92vw); z-index: 33; padding: 10px 14px; border-radius: 12px;
  background: rgba(8, 10, 14, 0.92); border: 1px solid rgba(142, 224, 122, .6); color: #fff; font: 500 13.5px/1.4 Inter, system-ui, sans-serif; pointer-events: none; }
.gm-chosen[hidden] { display: none; }
.gm-chosen b { display: block; color: #8ee07a; font-size: 14px; }
@media (max-width: 600px) { .gm-choice { bottom: 66px; padding: 10px 12px; max-height: calc(100dvh - 134px); } .gm-choice .gm-ask { font-size: 15px; } .gm-choice .gm-said { font-size: 12.5px; }
  .gm-choice button { padding: 8px 10px; margin-top: 6px; min-height: 48px; } .gm-choice button small { font-size: 12px; line-height: 1.3; } .gm-choice .gm-hint { margin-top: 8px; font-size: 12px; } }
.gm-call { position: fixed; left: 50%; top: 150px; transform: translate(-50%, -12px); width: min(560px, 92vw); z-index: 32; padding: 12px 16px 12px 58px;
  border-radius: 14px; background: rgba(8, 10, 14, 0.92); border: 1px solid rgba(142, 224, 122, .55); color: #fff; font: 500 15px/1.4 Inter, system-ui, sans-serif;
  box-shadow: 0 10px 40px rgba(0,0,0,.5); opacity: 0; pointer-events: none; transition: opacity .35s, transform .35s; }
.gm-call.on { opacity: 1; transform: translate(-50%, 0); pointer-events: auto; cursor: pointer; }
.gm-call::before { content: '\\260E'; position: absolute; left: 16px; top: 12px; width: 30px; height: 30px; border-radius: 50%; background: #2fa84f; color: #fff;
  font: 400 18px/30px system-ui, sans-serif; text-align: center; animation: gm-ring .5s ease-in-out 6 alternate; }
@keyframes gm-ring { from { transform: rotate(-14deg); } to { transform: rotate(14deg); } }
.gm-call b { display: block; color: #8ee07a; font-size: 12px; letter-spacing: .1em; text-transform: uppercase; margin-bottom: 2px; }
.gm-call small { display: block; margin-top: 6px; color: #ffcf6e; font: 700 13px/1.3 Inter, system-ui, sans-serif; }
body.cutscene .gm-call, body.cinematic .gm-call { display: none; }
@media (prefers-reduced-motion: reduce) { .gm-call::before { animation: none; } }
.gm-skip { position: fixed; right: 18px; top: calc(11vh + 12px); z-index: 63; padding: 7px 14px; border: 1px solid rgba(255,255,255,.5); border-radius: 999px;
  background: rgba(0,0,0,.45); color: #fff; font: 700 13px/1 Inter, system-ui, sans-serif; letter-spacing: .06em; cursor: pointer; display: none; }
body.cutscene .gm-skip { display: block; }
.gm-skip:hover, .gm-skip:focus-visible { background: rgba(255,79,163,.35); border-color: #ff4fa3; outline: none; }
.gm-sub { position: fixed; left: 50%; bottom: 200px; transform: translateX(-50%); z-index: 30; max-width: 80vw; color: #fff; text-align: center;
  font: 600 16px/1.4 Inter, system-ui, sans-serif; text-shadow: 0 2px 6px rgba(0,0,0,.85); pointer-events: none; }
`;

export function createMissionSystem({ scene, controllerManager, mapSystem, cameraSystem = null, voices = null, cast = null, stkilda = null, interiors = null }) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
  const el = (cls, parent = document.body) => {
    const e = document.createElement('div');
    e.className = cls;
    parent.append(e);
    return e;
  };
  const elObjective = el('gm-objective');
  const elTimer = el('gm-timer');
  elTimer.hidden = true;
  const elMoney = el('gm-money');
  const elBig = el('gm-big');
  const elSub = el('gm-sub');
  const elCut = el('gm-cut');
  const elBlack = el('gm-black');
  // Skip, as in the intro: ends the cut scene that's playing
  const elSkip = document.createElement('button');
  elSkip.type = 'button';
  elSkip.className = 'gm-skip';
  elSkip.textContent = 'Skip \u25B8\u25B8';
  elSkip.addEventListener('click', (e) => { e.stopPropagation(); advanceCut(true); });
  document.body.append(elSkip);
  const elCall = el('gm-call');
  elCall.addEventListener('click', () => { callUp = 0; elCall.classList.remove('on'); });
  const elChoice = el('gm-choice');
  elChoice.hidden = true;
  const elChosen = el('gm-chosen');
  elChosen.hidden = true;
  // A pointer to the marker that matters (the next job, or the objective): over it when it's on screen, pinned to
  // the screen's edge and turned towards it when it isn't
  const elPointer = el('gm-pointer');
  const elPointerArrow = document.createElement('i');
  const elPointerText = document.createElement('span');
  elPointer.append(elPointerArrow, elPointerText);
  const _pv = new THREE.Vector3();
  function point(target, colour) {
    const cam = cameraSystem?.camera;
    if (!target || !cam) { elPointer.classList.remove('on'); return; }
    const p = playerPos();
    const d = Math.hypot(target.x - p.x, target.z - p.z);
    _pv.set(target.x, (target.y || 0) + 3, target.z).applyMatrix4(cam.matrixWorldInverse);
    const behind = _pv.z > 0; // camera space looks down -z
    _pv.set(target.x, (target.y || 0) + 3, target.z).project(cam);
    let nx = _pv.x, ny = _pv.y;
    if (behind) { nx = -nx; ny = -Math.abs(ny) - 1; }
    const W = window.innerWidth, H = window.innerHeight, M = 46;
    let sx = ((nx + 1) / 2) * W, sy = ((1 - ny) / 2) * H, angle = 0;
    const inside = !behind && sx > M && sx < W - M && sy > M + 60 && sy < H - M;
    if (!inside) {
      // pin to the edge, along the line from the centre of the screen
      const cx = W / 2, cy = H / 2, dx = sx - cx, dy = sy - cy;
      const k = Math.min((W / 2 - M) / Math.max(1e-3, Math.abs(dx)), (H / 2 - M - 30) / Math.max(1e-3, Math.abs(dy)));
      sx = cx + dx * k; sy = cy + dy * k;
      angle = Math.atan2(dy, dx) * 180 / Math.PI - 90; // the arrow (pointing down at rest) turned towards the marker
    }
    elPointer.style.setProperty('--pc', colour);
    elPointer.style.left = `${sx}px`;
    elPointer.style.top = `${sy}px`;
    elPointerArrow.style.transform = `rotate(${angle}deg)`;
    elPointerText.textContent = d > 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d)} m`;
    elPointer.classList.add('on');
  }
  elCut.hidden = true;
  // New game: a toolbar button that asks first
  const tbAnchor = document.getElementById('btn-quality');
  if (tbAnchor) {
    const btn = document.createElement('button');
    btn.className = 'tool-btn';
    btn.type = 'button';
    btn.id = 'btn-new-game';
    btn.title = 'Start the story again from the beginning';
    const lab = document.createElement('span');
    lab.className = 'gfx-label';
    lab.textContent = 'New game';
    btn.append(lab);
    btn.addEventListener('click', () => {
      if (window.confirm('Start a new game? Your cash, progress and story choices will be wiped.')) api.newGame();
    });
    tbAnchor.before(btn);
  }

  // Save: cash and how far through the story
  // Save v2: { version: 2, money, progress, flags } (story choices in flags). A v1 save (money, progress) is carried
  // over; anything unreadable starts a new game.
  // (`story` 2 is this chain of eight jobs; a save from the older ten-job order keeps its cash and choices but starts the
  // new story from the top, since its progress counted different jobs)
  const clean = (s) => ({
    version: 2,
    story: 2,
    money: Number.isFinite(s?.money) ? s.money : 500,
    progress: s?.story === 2 && Number.isInteger(s?.progress) ? Math.max(0, Math.min(MISSIONS.length, s.progress)) : 0,
    flags: s && typeof s.flags === 'object' && s.flags && !Array.isArray(s.flags) ? s.flags : {}
  });
  const read = (key) => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
  let save = clean(read(SAVE_KEY) || read(SAVE_KEY_V1));
  // The job the pink marker and the phone point at: the furthest one reached (save.progress), or an earlier one picked in the Jobs
  // list to play again (which must never wind the saved progress back)
  let focus = null;
  const cur = () => (focus !== null && focus < save.progress ? focus : save.progress);
  let persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* storage unavailable */ } };
  persist();
  const showMoney = () => { elMoney.textContent = `$${save.money.toLocaleString('en-AU')}`; };
  showMoney();

  // Markers: a glowing ring with a beam of light (pink: a job to start, yellow: the objective)
  function makeMarker(colorHex) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicNodeMaterial({ color: colorHex, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 140, 24, 1, true), mat); // tall enough to see over the buildings
    beam.position.y = 70;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 8, 48), mat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.4;
    g.add(beam, ring);
    g.visible = false;
    g.renderOrder = 10;
    scene.add(g);
    return g;
  }
  const startMarker = makeMarker(0xff3d9a);
  const goalMarker = makeMarker(0xffd23f);
  const targetMarkers = Array.from({ length: 4 }, () => makeMarker(0xff2a2a));

  // --- Act I machinery: watchers with view cones, the tail, story actors, choices -----------------------------------
  const pursuer = createPursuer({ scene, controllerManager, traffic: () => traffic });
  const leader = createLeader({ scene, controllerManager, cast });
  // the routes a job's lead can take: the ones found along the streets (js/story/routes.js) and the short ones written here
  const LEAD_ROUTES = { ...ROUTES,
    // Doors: Bianca's run, down King St's east footpath and along Collins St's north one to William St
    DOORS_RUN: [[-923, -203], [-923, -4], [-722, -4]] };
  if (cast) cast.preload([STORY_CAST.Davo]);
  // everyone a job's scenes want is fetched while it is the next one, so nobody appears late (or not at all) in the cut scene
  const preloaded = new Set();
  function preloadCast(def, i) {
    if (!cast || preloaded.has(i)) return;
    preloaded.add(i);
    const who = new Set([def.giver, ...(def.with || []), ...(def.cut || []).map((l) => l[0])]);
    for (const st of def.steps || []) {
      for (const a of st.actors || []) who.add(a.who);
      if (st.talk) { who.add(st.talk.who); for (const w of st.talk.with || []) who.add(w); for (const l of st.talk.lines || []) who.add(l[0]); }
      if (st.choice) who.add(st.choice.who);
    }
    cast.preload([...who].map((n) => STORY_CAST[n]));
  }
  // the rest of the cast standing with the giver in a cut scene (a job's `with`), put away when it ends
  let cutExtras = new Set();
  function hideCutExtras() { for (const k of cutExtras) cast?.setActor(k, null, null); cutExtras = new Set(); }
  const flagsMatch = (when) => !when || Object.entries(when).every(([k, v]) => (save.flags[k] ?? false) === v);
  const D2R = Math.PI / 180;
  // a watcher's view cone on the ground: a fan of `fov` degrees out to `range` metres, facing +z (turned by heading)
  const coneMat = new THREE.MeshBasicNodeMaterial({ color: 0xff3030, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
  const cones = new Map();
  function cone(key, fov, range) {
    if (cones.has(key)) return cones.get(key);
    const n = 24, pos = [0, 0, 0];
    for (let i = 0; i <= n; i++) {
      const a = (-fov / 2 + (fov * i) / n) * D2R;
      pos.push(Math.sin(a) * range, 0, Math.cos(a) * range);
    }
    const idx = [];
    for (let i = 1; i <= n; i++) idx.push(0, i, i + 1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    const mesh = new THREE.Mesh(g, coneMat.clone());
    mesh.renderOrder = 9;
    mesh.visible = false;
    scene.add(mesh);
    cones.set(key, mesh);
    return mesh;
  }
  let shownActors = new Set();
  // the actors a step wants this frame (watchers, Davo), the rest put away
  function showActors(list) {
    const want = new Set(list.map((a) => a.key));
    for (const k of shownActors) if (!want.has(k)) cast?.setActor(k, null, null);
    for (const a of list) cast?.setActor(a.key, a.id, a.pose, a.anim);
    shownActors = want;
  }
  // where a watcher stands and looks now (sweeping, or walking its patrol and pausing at each end)
  function watcherPose(w, m) {
    const st = (m.watchState ||= {});
    const ws = (st[w.key] ||= { t: 0, leg: 0, pause: 0, x: 0, z: 0 });
    if (w.patrol) {
      const a = resolve(w.patrol[ws.leg % 2]), b = resolve(w.patrol[(ws.leg + 1) % 2]);
      const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      if (!ws.started) { ws.started = true; ws.x = a.x; ws.z = a.z; }
      const heading = Math.atan2(b.x - a.x, b.z - a.z);
      if (ws.pause > 0) {
        // at the end of the leg: a look back the way it came (turning round over ~0.8 s), then on
        ws.want = heading + Math.PI + Math.sin(ws.pause * 1.6) * 0.9;
        return { x: ws.x, z: ws.z, heading: ws.h ?? (ws.h = ws.want), anim: 'look' };
      }
      ws.want = heading;
      return { x: ws.x, z: ws.z, heading: ws.h ?? (ws.h = ws.want), anim: 'walk', a, b, L };
    }
    const at = resolve(w.at);
    return { x: at.x, z: at.z, heading: w.heading + (w.sweep || 0) * D2R * Math.sin((ws.t / (w.period || 6)) * Math.PI * 2), anim: 'look' };
  }
  function stepWatchers(w, m, dt) {
    const ws = m.watchState[w.key];
    ws.t += dt;
    if (!w.patrol) return;
    if (ws.h !== undefined) { const d = Math.atan2(Math.sin(ws.want - ws.h), Math.cos(ws.want - ws.h)); ws.h += Math.max(-4 * dt, Math.min(4 * dt, d)); } // never more than 4 rad/s round
    if (ws.pause > 0) { ws.pause -= dt; if (ws.pause <= 0) ws.leg++; return; }
    const a = resolve(w.patrol[ws.leg % 2]), b = resolve(w.patrol[(ws.leg + 1) % 2]);
    const dx = b.x - ws.x, dz = b.z - ws.z, d = Math.hypot(dx, dz);
    const step = (w.speed || 1.3) * dt;
    if (d <= step) { ws.x = b.x; ws.z = b.z; ws.pause = 2.5; } else { ws.x += (dx / d) * step; ws.z += (dz / d) * step; }
    void a;
  }
  function hideWatchers() { for (const c of cones.values()) c.visible = false; }
  // the choice panel: buttons, or keys 1-3
  let choiceOpen = null; // { def, pick(i) }
  function openChoice(c, onPick) {
    const d = describeChoice(c), n = c.options.length;
    elChoice.innerHTML = '';
    elChoice.scrollTop = 0;
    const b = document.createElement('b');
    b.textContent = `${d.who} is asking you`;
    const q = document.createElement('div');
    q.className = 'gm-ask';
    q.textContent = d.ask || c.text;
    const said = document.createElement('div');
    said.className = 'gm-said';
    said.textContent = `“${c.text}”`;
    elChoice.append(b, q);
    if (d.ask) elChoice.append(said);
    const pick = (i) => {
      if (!choiceOpen || !c.options[i]) return;
      if (c.options[i].cost > save.money && (c.options[i].cost || 0) !== Math.min(...c.options.map((o) => o.cost || 0))) return;
      choiceOpen = null;
      elChoice.hidden = true;
      showChosen(c.options[i], d.notes[i], i);
      onPick(c.options[i]);
    };
    // an option that costs more than the player has can't be picked (the cheapest always can: it takes what there is)
    const cheapest = Math.min(...c.options.map((o) => o.cost || 0));
    const can = (o) => !(o.cost > save.money) || (o.cost || 0) === cheapest;
    const dollars = (v) => `$${v.toLocaleString('en-AU')}`;
    c.options.forEach((o, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      const k = document.createElement('i');
      k.textContent = String(i + 1);
      const main = document.createElement('span');
      const lab = document.createElement('strong');
      lab.textContent = o.label;
      main.append(lab);
      const note = document.createElement('small');
      const cost = !o.cost ? '' : !can(o) ? `Needs ${dollars(o.cost)} (you have ${dollars(save.money)}). `
        : o.cost > save.money ? `Costs ${dollars(o.cost)}: you only have ${dollars(save.money)}, so it takes that. ` : `Costs ${dollars(o.cost)}. `;
      note.textContent = `${cost}${d.notes[i] || ''}`.trim();
      if (note.textContent) main.append(note);
      btn.append(k, main);
      btn.disabled = !can(o);
      if (btn.disabled) btn.style.opacity = '0.45';
      btn.addEventListener('click', () => pick(i));
      elChoice.append(btn);
    });
    const hint = document.createElement('div');
    hint.className = 'gm-hint';
    hint.textContent = `Pick one: press ${n > 1 ? `1–${n}` : '1'} or tap it. It is saved and you can’t change it later.`;
    elChoice.append(hint);
    elChoice.hidden = false;
    choiceOpen = { def: c, pick };
    voices?.sayText(c.text, { subtitle: false, who: c.who });
  }
  // a short confirmation of what was just chosen
  let chosenT = 0;
  function showChosen(o, note, i) {
    elChosen.textContent = '';
    const t = document.createElement('b');
    t.textContent = `✓ You chose ${i + 1}: ${o.label}`;
    elChosen.append(t);
    if (note) { const s2 = document.createElement('span'); s2.textContent = note; elChosen.append(s2); }
    elChosen.hidden = false;
    clearTimeout(chosenT);
    chosenT = setTimeout(() => { elChosen.hidden = true; }, 6000);
  }
  window.addEventListener('keydown', (e) => {
    if (!choiceOpen) return;
    const i = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
    if (i >= 0 && i < choiceOpen.def.options.length) { e.preventDefault(); e.stopPropagation(); choiceOpen.pick(i); }
  }, true);
  // everything a job set out in the world, put away (on a pass, a fail or a restart)
  function cleanup() {
    if (cut) { // a conversation still playing (the job was left from the Jobs list)
      cut = null;
      elCut.hidden = true;
      document.body.classList.remove('cinematic', 'cutscene');
      cast?.setPlayerAction(null);
      voices?.stopStory();
    }
    gameplay?.combat?.clear();
    pursuer.stop();
    leader.stop();
    hideWatchers();
    showActors([]);
    hideCutExtras();
    if (choiceOpen) { choiceOpen = null; elChoice.hidden = true; }
    elBlack.classList.remove('on');
  }

  // the player's game (js/gameplay.js) and the traffic (people, cars), attached once they exist
  let gameplay = null, traffic = null;
  const counters = { talk: 0, rob: 0 };
  const placeMarker = (m, p, r) => {
    m.position.set(p.x, (p.y ?? terrainHeight(p.x, p.z)) + 0.2, p.z); // (p.y: a place inside the Quiet Room, js/interiors.js, or a footpath spot)
    m.scale.set(r, 1, r);
    m.visible = true;
  };

  // Where a job's giver stands: on the footpath nearest the job's marker (not out in the road)
  const giverCache = new Map();
  const giverSpot = (def) => kerbSpot(def.start);
  // the footpath nearest a place (where someone stands waiting: a job's giver, Davo at his pickup)
  function kerbSpot(at) {
    if (giverCache.has(at)) return giverCache.get(at);
    const best = footpathNear(resolve(at));
    giverCache.set(at, best);
    return best;
  }
  function footpathNear(st) {
    const gy = (x, z) => controllerManager.getGroundHeight(x, z, 'person');
    let best = { x: st.x, y: gy(st.x, st.z), z: st.z };
    if (!blockAt(st.x, st.z)) {
      search: for (let r = 2; r <= 24; r += 1.5) {
        for (let a = 0; a < 16; a++) {
          const x = st.x + Math.cos((a / 16) * Math.PI * 2) * r, z = st.z + Math.sin((a / 16) * Math.PI * 2) * r;
          const b = blockAt(x, z);
          if (b && !(b.park > 0.6)) { best = { x, y: gy(x, z), z }; break search; }
        }
      }
    } else best.y = gy(st.x, st.z);
    return best;
  }

  const placeCache = new Map();
  function resolve(at) {
    if (placeCache.has(at)) return placeCache.get(at);
    let p = null;
    if (at.grid) {
      const st = ALL_STREETS.find((s) => s.name === at.grid[0]), av = ALL_AVENUES.find((a) => a.name === at.grid[1]);
      if (st && av) p = { x: av.x, z: st.z };
    } else if (at.cross) {
      const A = ROADS.filter((r) => r.raw === at.cross[0]), B = ROADS.filter((r) => r.raw === at.cross[1]);
      let best = Infinity;
      for (const r of A) for (const a of r.pts) for (const q of B) for (const b of q.pts) {
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        if (d < best) { best = d; p = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }; }
      }
    } else if (at.cafe) {
      p = stkilda ? stkilda.marker() : { x: -985, z: 5470 };
    } else if (at.pier) {
      p = stkilda ? stkilda.pierEnd : { x: -1872, z: 5160 };
    } else if (typeof at.circuit === 'number') {
      // a point round the Albert Park Grand Prix circuit, moved `off` metres in towards the middle (a start marker
      // beside the track rather than on the racing line)
      p = circuitPoint(at.circuit);
      if (at.off) {
        const nx = -Math.cos(p.heading), nz = Math.sin(p.heading); // across the track, to the inside (it runs clockwise)
        p = { x: p.x + nx * at.off, z: p.z + nz * at.off };
      }
    } else if (at.road) {
      const pts = ROADS.filter((r) => r.raw === at.road).flatMap((r) => r.pts);
      if (pts.length) p = pts[pts.length >> 1];
    } else if (at.place) {
      const q = PLACES[at.place];
      if (q) p = q.y === undefined ? { x: q.x, z: q.z } : { x: q.x, z: q.z, y: q.y };
    } else if (typeof at.x === 'number') p = at;
    if (!p) { console.warn('[missions] no such place', at); p = { x: 0, z: 0 }; }
    if (at.kerb) p = footpathNear(p);
    placeCache.set(at, p);
    return p;
  }
  // 'lead': beside whoever the job has you chasing, wherever they stopped
  const spotOf = (at, off = [0, 0]) => (at === 'lead' ? { x: leader.position.x + off[0], z: leader.position.z + off[1] } : resolve(at));
  const playerPos = () => controllerManager.getActiveEntity().position;
  const driving = () => controllerManager.activeMode === 'car';

  let mission = null; // { def, i, si, timer, data }
  let cut = null; // { lines, k, done }
  let bigT = 0, subT = 0;
  // Delays on game time, not the wall clock: they hold while the tab is hidden and stretch when the game runs slowly
  const timers = []; // { t, fn }
  const later = (secs, fn) => timers.push({ t: secs, fn });
  let lastCard = null; // what the last chapter card showed (for scripted checks)

  function big(text, color, secs, small = '') {
    elBig.innerHTML = '';
    elBig.textContent = text;
    elBig.style.color = color;
    if (small) {
      const s = document.createElement('small');
      s.textContent = small;
      elBig.append(s);
    }
    elBig.style.opacity = '1';
    bigT = secs;
  }
  function sub(text, secs = 4) {
    if (cut) return; // (never over a cut scene's own lines)
    elSub.textContent = text;
    subT = secs;
  }
  // The body language of a cut-scene line (an optional third entry in the line overrides it): anger at the war and
  // the betrayals, Vince sure of himself, Kaz cool, the player's questions with a shrug
  function moodOf(who, text, given) {
    if (given) return given;
    const t = text.toLowerCase();
    if (who === 'You') return /\?$/.test(text.trim()) ? 'shrug' : 'talk_cool';
    if (/war|torched|burnt|raided|singing|dog|bullet|gone now|loud|forgot/.test(t)) return 'talk_angry';
    if (/!|go\.|don't keep|bring it home|whose town/.test(t)) return 'talk_excited';
    return who === 'Kaz' ? 'talk_cool' : 'talk_assured';
  }
  // A job's cut scene is played out between the player and the giver (Vince or Kaz): letterbox bars, the player walks
  // up to the giver (on foot), and the camera cuts over the shoulder of whoever is listening to whoever is speaking
  function showCut(lines, done, opts = null) {
    cut = { lines, k: 0, done, giver: null, scene: !opts && !!mission?.def?.scene, step: !!opts, who: opts?.who ?? mission?.def?.giver, spots: {} };
    const def = mission?.def;
    if (def && cast && !cut.scene) {
      let at = giverSpot(def);
      if (opts?.at) { const q = spotOf(opts.at, [1.6, 1.0]); at = { x: q.x, y: q.y ?? controllerManager.getGroundHeight(q.x, q.z, 'person'), z: q.z }; }
      cut.giver = at;
      const person = controllerManager.entities.person;
      if (controllerManager.activeMode === 'person') {
        // stand 1.7 m in front of the giver, facing them
        const p = playerPos();
        const d = Math.hypot(p.x - at.x, p.z - at.z) || 1;
        person.position.set(at.x + ((p.x - at.x) / d) * 1.7, at.y ?? person.position.y, at.z + ((p.z - at.z) / d) * 1.7);
        person.heading = Math.atan2(at.x - person.position.x, at.z - person.position.z);
        person.speed = 0;
      }
      // the others in the scene stand either side of the giver, turned to the player
      const p = playerPos(), d = Math.hypot(p.x - at.x, p.z - at.z) || 1, fx = (p.x - at.x) / d, fz = (p.z - at.z) / d;
      (opts ? opts.with || [] : def.with || []).forEach((who, n) => {
        const side = (n % 2 ? -1 : 1) * (1.15 + 0.5 * (n >> 1));
        const x = at.x - fz * side - fx * 0.25, z = at.z + fx * side - fz * 0.25;
        cut.spots[who] = { x, y: controllerManager.getGroundHeight(x, z, 'person'), z };
      });
    }
    document.body.classList.add('cinematic', 'cutscene');
    // nobody talks over the scene: whatever was being said (the call, the passenger, a line on the street) stops, and
    // its subtitle goes
    voices?.stopStory();
    subT = 0; elSub.textContent = '';
    elCall.classList.remove('on'); callUp = 0;
    renderCut();
  }
  // who does what on the current line: the speaker in their mood, the listener listening (a nod on the last line)
  function cutActions() {
    const [who, text, given] = cut.lines[cut.k];
    const last = cut.k === cut.lines.length - 1;
    const mood = moodOf(who, text, given);
    if (who === 'You') return { player: mood, giver: /\?$/.test(text.trim()) ? 'listen' : 'nod' };
    if (cut.spots[who]) return { player: 'listen', giver: 'listen', extra: who, mood }; // one of the others speaks
    return { player: last ? 'nod' : 'listen', giver: who === cut.who || !cut.step && !Object.keys(cut.spots).length ? mood : 'listen' };
  }
  // The camera for the line being spoken (called after the follow camera each frame; see main.js)
  const _eye = new THREE.Vector3(), _look = new THREE.Vector3();
  function applyCamera(dt) {
    if (cut && cut.scene && stkilda && cameraSystem) {
      controllerManager.resetInput();
      const shot = stkilda.camera(cut.k, cut.lines[cut.k][0], dt);
      if (!shot) return false;
      const cam = cameraSystem.camera;
      cameraSystem.currentPos.copy(shot.eye);
      cameraSystem.currentLookAt.copy(shot.look);
      cam.position.copy(shot.eye);
      cam.lookAt(shot.look);
      cam.updateMatrixWorld();
      return true;
    }
    if (!cut || !cut.giver || !cameraSystem) return false;
    controllerManager.resetInput();
    const me = controllerManager.getActiveEntity().position;
    const onFoot = controllerManager.activeMode === 'person';
    const [who] = cut.lines[cut.k];
    const g = cut.spots[who] || cut.giver; // whoever is speaking (the giver, or one of the others)
    const youSpeak = who === 'You';
    // from the listener's side, a little to the right of their shoulder, looking at the speaker's face
    const from = youSpeak ? g : me, to = youSpeak ? me : g;
    const dx = to.x - from.x, dz = to.z - from.z, d = Math.hypot(dx, dz) || 1;
    const fx = dx / d, fz = dz / d, rx = -fz, rz = fx;
    const headTo = (youSpeak ? (onFoot ? me.y : me.y + 0.2) : (g.y ?? 0)) + 1.62;
    const headFrom = (youSpeak ? (g.y ?? 0) : me.y) + 1.66;
    _eye.set(from.x - fx * 0.9 + rx * 0.55, headFrom + 0.08, from.z - fz * 0.9 + rz * 0.55);
    _look.set(to.x, headTo - 0.05, to.z);
    const cam = cameraSystem.camera;
    // a straight cut on each new line, then a slow push in (the shot keeps its own state: the follow camera would
    // pull it back every frame)
    if (cut.cutTo !== cut.k) {
      cut.cutTo = cut.k;
      cut.eye = _eye.clone().addScaledVector(new THREE.Vector3(fx, 0, fz), -0.35);
      cut.look = _look.clone();
    }
    cut.eye.lerp(_eye, Math.min(1, dt * 0.6));
    cut.look.lerp(_look, Math.min(1, dt * 3));
    cameraSystem.currentPos.copy(cut.eye);
    cameraSystem.currentLookAt.copy(cut.look);
    cam.position.copy(cut.eye);
    cam.lookAt(cut.look);
    cam.updateMatrixWorld();
    return true;
  }
  function renderCut() {
    const [who, line] = cut.lines[cut.k];
    elCut.innerHTML = '';
    const b = document.createElement('b');
    b.textContent = who;
    const t = document.createElement('span');
    t.textContent = line;
    const hint = document.createElement('i');
    hint.textContent = 'Plays by itself · Enter: next line · Esc or Skip: skip';
    elCut.append(b, t, hint);
    elCut.hidden = false;
    // the line spoken (a recording, or the browser's voice; the panel already shows the words). The scene plays itself:
    // the next line follows once this one has been said (Enter or a click still moves it on sooner)
    const said = voices?.sayText(line, { subtitle: false, who });
    cut.auto = Math.max(said?.duration || 0, 1.4 + line.length / 12) + 0.7; // (long enough for the browser's voice to finish too)
  }
  function advanceCut(skip = false) {
    if (!cut) return;
    cut.k++;
    if (skip || cut.k >= cut.lines.length) {
      const done = cut.done, cut0 = cut;
      cut = null;
      elCut.hidden = true;
      document.body.classList.remove('cinematic', 'cutscene');
      cast?.setPlayerAction(null);
      if (cut0.scene) stkilda?.standUp();
      voices?.stopStory();
      done();
    } else renderCut();
  }
  elCut.addEventListener('click', () => advanceCut());
  window.addEventListener('keydown', (e) => {
    if (!cut) return;
    if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); advanceCut(); }
    if (e.code === 'Escape') { e.preventDefault(); advanceCut(true); }
  });

  function start(i, opts = null) {
    const def = MISSIONS[i];
    if (!def) return;
    cleanup();
    mission = { def, i, si: -1, timer: 0, data: {} };
    elCall.classList.remove('on'); callUp = 0; callT = 0;
    if (cast) { // the job's people, fetched now so they are there when their scene comes
      const who = new Set([def.giver, ...(def.with || [])]);
      for (const st of def.steps) {
        for (const a of st.actors || []) who.add(a.who);
        if (st.talk) { who.add(st.talk.who); for (const w of st.talk.with || []) who.add(w); }
      }
      cast.preload([...who].map((n) => STORY_CAST[n]).filter(Boolean).concat(def.steps.map((st) => st.lead?.person).filter(Boolean)));
    }
    startMarker.visible = false;
    const m = mission;
    const open = () => {
      if (mission !== m) return;
      big(def.name, '#ff4fa3', 2.5, `${def.act ? def.act + ' · ' : ''}${def.giver} · ${def.crew}`);
      const go = () => { if (mission === m) nextStep(); };
      if (def.cut) showCut(def.cut, go);
      else go();
    };
    const b = def.begin || (opts?.chain ? { quick: true } : null);
    if (!b) return open();
    // a black card while the scene is set: out of any car, the job's car parked where it waits
    m.blackout = true;
    elBlack.innerHTML = '';
    const t = document.createElement('b');
    t.textContent = b.card ? b.card[0] : def.name;
    const sm = document.createElement('small');
    sm.textContent = b.card ? b.card[1] || '' : '';
    elBlack.append(t, sm);
    elBlack.classList.add('on');
    gameplay?.leaveCarNow?.();
    if (b.car && gameplay?.placeCar) { const c = resolve({ place: b.car.place }); gameplay.placeCar(b.car.id, c.x, c.z, b.car.heading || 0); }
    { // handed over from the job before, or replayed from the Jobs list: set down at the start, whatever was going on and wherever the player was
      const st = resolve(def.start), tp = window.__city?.teleportTo, pp = playerPos();
      if (tp && (opts?.chain || Math.hypot(pp.x - st.x, pp.z - st.z) > 40)) tp(st.x, st.z, 0);
    }
    later(opts?.fromIntro ? 1.5 : b.quick ? 1.6 : 3.2, () => { // (straight from the intro: a beat of black, not a second title card)
      if (mission !== m) return;
      m.blackout = false;
      elBlack.classList.remove('on');
      open();
    });
  }
  function nextStep() {
    const m = mission;
    m.si++;
    while (m.si < m.def.steps.length && !flagsMatch(m.def.steps[m.si].when)) m.si++; // a branch not taken
    if (m.si >= m.def.steps.length) return pass();
    const s = m.def.steps[m.si];
    if (s.time && !(s.keepTime && m.timer > 0)) m.timer = s.time;
    if (!s.time && !s.keepTime) m.timer = 0;
    m.wait = 0;
    m.from = { x: playerPos().x, z: playerPos().z };
    m.count0 = { talk: counters.talk, rob: counters.rob };
    m.targets = null;
    m.ambushed = false;
    if (s.targets && traffic) {
      // the people nearest the player become the targets
      const p = playerPos();
      // armed hostiles round the player (js/combat.js: they notice, aim and shoot back); if none could be placed, the people nearest
      // (s.bikies: they arrive as a pack of bikies on motorbikes who ride up, get off and fight: js/bikies.js)
      let armed = s.bikies && gameplay?.bikies ? gameplay.bikies.spawnPack({ n: s.targets, hostile: true, job: true, weapons: s.weapons, range: [90, 150], hidden: false }) : null;
      if (!armed?.length) armed = gameplay?.combat?.spawnGroup(p, s.targets, s.weapons || ['pistol', 'uzi'], (x, z) => !!blockAt(x, z));
      m.targets = armed?.length ? armed : traffic.peds.filter((q) => q.placed && !q.dead)
        .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z)).slice(0, s.targets);
    }
    m.stepT = 0;
    m.said = 0;
    m.clear = 0;
    m.seen = 0;
    m.lost = 0;
    m.replyT = 0;
    for (const t of targetMarkers) t.visible = false;
    if (s.lead) {
      const L = s.lead;
      if (!leader.active || m.leadId !== L.id) {
        m.leadId = L.id;
        leader.start({ pts: LEAD_ROUTES[L.id], speed: L.speed, file: L.file, color: L.color, person: L.person, ease: L.far });
      }
      if (!L.hold) { leader.tune({ speed: L.speed, ease: L.far }); leader.go(); }
    } else leader.stop();
    if (s.tail && !pursuer.active) {
      const t = resolve({ place: s.tail.place });
      pursuer.start({ x: t.x, z: t.z, heading: s.tail.heading || 0, wait: true, speed: 29 });
    }
    if (s.evade) {
      if (!pursuer.active) {
        const p = playerPos(), o = { x: p.x - 30, z: p.z, heading: 0, speed: s.evade.speed || 29 };
        if (s.evade.file) o.file = s.evade.file;
        if (s.evade.color !== undefined) o.color = s.evade.color;
        pursuer.start(o);
      }
      pursuer.release();
      hideWatchers();
    }
    if (!s.watch) hideWatchers();
    if (s.choice) {
      openChoice(s.choice, (o) => {
        if (mission !== m) return;
        Object.assign(save.flags, o.set || {});
        if (o.cost) { save.money = Math.max(0, save.money - o.cost); showMoney(); }
        persist();
        if (o.reply) {
          sub(`${s.choice.who}: ${o.reply}`, 5);
          const said = voices?.sayText(o.reply, { who: s.choice.who });
          m.replyT = Math.max(said?.duration || 0, 1.2 + o.reply.length / 15) + 0.4; // the answer is heard out, then on
        } else nextStep();
      });
    }
    elObjective.textContent = s.text;
    { const ns = m.def.steps.filter((q) => flagsMatch(q.when)); elObjective.dataset.job = `Job ${m.i + 1} of ${MISSIONS.length} \u00B7 ${m.def.name} \u00B7 step ${ns.indexOf(s) + 1}/${ns.length}`; }
    if (s.at) {
      const p = resolve(s.at);
      placeMarker(goalMarker, p, s.r);
      if (mapSystem) mapSystem.waypoint = { x: p.x, z: p.z, name: getLocationLabel(p.x, p.z) };
    } else {
      goalMarker.visible = false;
      if (mapSystem && !s.lead) mapSystem.waypoint = null;
    }
    // a conversation part-way through the job: played like the opening cut scene, then on to the next step
    if (s.talk) showCut(s.talk.lines, () => { if (mission === m) nextStep(); }, s.talk);
  }
  // a black card between chapters (2004, 2026) with the Ferryman's voice over it; no job starts under it
  let cardUp = false;
  let chainJob = null; // { n, t }: the next job (def.chain) starts by itself t seconds after the last one passed (and any chapter card)
  let ride = { job: -1, t: 0, said: 0 }; // the passenger's talk on the way to the next job
  // The phone call that sends you to the next job: a card with who is ringing, what they say and where to go. It rings
  // a few seconds after the last job (or after the game loads), and again if you've done nothing about it for a while
  let called = -1, callT = 0, callUp = 0;
  const whereTo = (st) => {
    const p = playerPos(), d = Math.hypot(p.x - st.x, p.z - st.z);
    const dirs = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
    const bearing = (Math.atan2(st.x - p.x, -(st.z - p.z)) * 180) / Math.PI - 19.18; // (the grid is turned ~19° off north)
    return `${d > 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.max(10, Math.round(d / 10) * 10)} m`} ${dirs[(Math.round((((bearing % 360) + 360) % 360) / 45)) % 8]}`;
  };
  function ring(def, st, again = false) {
    elCall.textContent = '';
    const b = document.createElement('b');
    b.textContent = `${def.call[0]} calling`;
    const t = document.createElement('span');
    t.textContent = def.call[1];
    const sm = document.createElement('small');
    const near = Math.hypot(playerPos().x - st.x, playerPos().z - st.z) < 60;
    sm.textContent = near ? `Next job: ${def.name}. Walk into the pink marker, just ahead.` : `Next job: ${def.name}. Follow the pink marker, ${whereTo(st)} (M opens the map).`;
    elCall.append(b, t, sm);
    elCall.classList.remove('on');
    void elCall.offsetWidth; // (so the handset rings again)
    elCall.classList.add('on');
    callUp = 11;
    if (!again) voices?.sayText(def.call[1], { subtitle: false, who: def.call[0] });
  }
  function chapterCard(after) {
    cardUp = true;
    // a line that depends on a choice the player made (a saved flag), else the one line
    const line = after.lineIf ? (save.flags[after.lineIf.flag] ? after.lineIf.yes : after.lineIf.no) : after.line;
    later(2.8, () => {
      elBlack.innerHTML = '';
      const t = document.createElement('b');
      t.textContent = after.card[0];
      const sm = document.createElement('small');
      sm.textContent = after.card[1] || '';
      elBlack.append(t, sm);
      lastCard = { card: after.card, line: line ? line[1] : null };
      if (line) {
        const v = document.createElement('i');
        v.textContent = line[1];
        v.style.cssText = 'margin-top:26px;font:italic 500 17px/1.4 Inter,system-ui,sans-serif;opacity:.85;max-width:min(560px,86vw)';
        elBlack.append(v);
        voices?.sayText(line[1], { subtitle: false, who: line[0] });
      }
      elBlack.classList.add('on');
      later(6.5, () => { elBlack.classList.remove('on'); cardUp = false; });
    });
  }
  function pass() {
    const def = mission.def;
    cleanup();
    if (def.after) chapterCard(def.after);
    if (def.outro) { voices?.sayText(def.outro[1], { who: def.outro[0] }); sub(`${def.outro[0]}: ${def.outro[1]}`, 5); }
    save.money += def.reward;
    save.progress = Math.max(save.progress, mission.i + 1);
    focus = null;
    persist();
    showMoney();
    mission = null;
    elObjective.textContent = '';
    delete elObjective.dataset.job;
    elTimer.hidden = true;
    goalMarker.visible = false;
    for (const t of targetMarkers) t.visible = false;
    if (mapSystem) mapSystem.waypoint = null;
    const n = MISSIONS.indexOf(def) + 1, rew = `+$${def.reward.toLocaleString('en-AU')}`;
    if (n === MISSIONS.length && save.progress >= MISSIONS.length) {
      big('MISSION PASSED', '#ffd23f', 5, `Job ${n} of ${MISSIONS.length} \u00B7 ${rew}`);
      sub('Act I is done. Act II, "The Board", comes in the next update; the city is yours to roam.', 7);
    } else big('MISSION PASSED', '#ffd23f', 3.5, `Job ${n} of ${MISSIONS.length} \u00B7 ${rew}`);
    // the next job runs on from this one (def.chain): it starts by itself once MISSION PASSED has been read
    const nxt = MISSIONS[n];
    if (nxt && nxt.chain && save.progress === n) {
      called = n; // (no phone call to send you there: it's about to begin)
      chainJob = { n, t: 3.6 };
    }
    // a cheer on passing a job (on foot)
    if (cast && controllerManager.activeMode === 'person') { cast.setPlayerAction('cheer'); later(3.5, () => cast.setPlayerAction(null)); }
  }
  function fail(why) {
    cleanup();
    mission = null;
    elObjective.textContent = '';
    delete elObjective.dataset.job;
    elTimer.hidden = true;
    goalMarker.visible = false;
    for (const t of targetMarkers) t.visible = false;
    if (mapSystem) mapSystem.waypoint = null;
    big('MISSION FAILED', '#e5383b', 3, 'Nothing is lost: walk back into the pink marker to try again');
    sub(why, 5);
  }

  function update(dt, elapsed) {
    if (timers.length) { // the delays that have run out (callbacks may start new ones)
      const due = [];
      for (let i = 0; i < timers.length;) { timers[i].t -= dt; if (timers[i].t <= 0) due.push(...timers.splice(i, 1)); else i++; }
      for (const x of due) x.fn();
    }
    if (cut && cut.auto > 0) { cut.auto -= dt; if (cut.auto <= 0) advanceCut(); }
    if (bigT > 0) { bigT -= dt; if (bigT <= 0) elBig.style.opacity = '0'; }
    if (subT > 0) { subT -= dt; if (subT <= 0) elSub.textContent = ''; }
    // markers pulse
    const pulse = 0.45 + Math.sin(elapsed * 3) * 0.12;
    startMarker.children[0].material.opacity = pulse;
    goalMarker.children[0].material.opacity = pulse;
    const p = playerPos();
    // the job's giver (Vince or Kaz) waits at the next job's marker and talks through its cut scene
    if (cast) {
      const def = mission ? mission.def : MISSIONS[cur()];
      const inScene = !!(def && def.scene);
      if (def && !mission) preloadCast(def, cur());
      if (stkilda) {
        // the café: Kaz and Mick at their table before the job (and when you bring the watches back), all three in it
        const st = def && inScene ? resolve(def.start) : null;
        const near = st && Math.hypot(p.x - st.x, p.z - st.z) < 140;
        const returning = mission && inScene && mission.si === def.steps.length - 1;
        stkilda.update(dt, inScene && cut ? 'cut' : inScene && near && (!mission || returning) ? 'waiting' : 'off', cut ? cut.lines[cut.k] : null);
      }
      const show = def && !inScene && (!mission || cut) && (cut || !document.body.classList.contains('cinematic'));
      if (inScene) cast.setGiver(null);
      if (show) {
        const at = cut?.giver || giverSpot(def);
        const acts = cut ? cutActions() : null;
        if (acts && acts.player !== cut.playerAct) { cut.playerAct = acts.player; cast.setPlayerAction(acts.player); }
        cast.setGiver(cut?.who || def.giver, at, p, acts && acts.giver, dt);
        // and whoever stands with them
        for (const [who, q] of Object.entries(cut?.spots || {})) {
          const key = `cut_${who}`;
          cutExtras.add(key);
          cast.setActor(key, STORY_CAST[who], { ...q, heading: Math.atan2(p.x - q.x, p.z - q.z), ease: 7 }, acts.extra === who ? acts.mood : 'listen');
        }
      } else cast.setGiver(null);
      if (!cut && cutExtras.size) hideCutExtras();
      // Davo on the kerb outside the pub (the first job), waving the player down; picked up, he's in the car
      const step = mission && !cut && mission.si >= 0 ? mission.def.steps[mission.si] : null;
      if (step && step.at && /Pick up Davo/.test(step.text)) {
        const k = kerbSpot(step.at);
        const near = Math.hypot(p.x - k.x, p.z - k.z) < 45;
        cast.setActor('davo', STORY_CAST.Davo, { x: k.x, y: k.y, z: k.z, heading: Math.atan2(p.x - k.x, p.z - k.z) }, near ? 'wave' : 'idle');
      } else cast.setActor('davo', null, null);
    }
    // the pointer: the objective's marker, or the nearest target, or the next job's
    if (cut || document.body.classList.contains('cinematic')) point(null);
    else if (mission && goalMarker.visible) point(goalMarker.position, '#ffd23f');
    else if (mission && targetMarkers.some((t) => t.visible)) {
      const t = targetMarkers.filter((q) => q.visible).sort((a, b) => Math.hypot(a.position.x - p.x, a.position.z - p.z) - Math.hypot(b.position.x - p.x, b.position.z - p.z))[0];
      point(t.position, '#ff2a2a');
    } else if (!mission && startMarker.visible) point(startMarker.position, '#ff3d9a');
    else point(null);

    if (chainJob) {
      if (mission || focus !== null && focus !== chainJob.n || cur() !== chainJob.n) chainJob = null;
      else if (!cut && !choiceOpen && !cardUp && bigT <= 0 && (chainJob.t -= dt) <= 0) { const n = chainJob.n; chainJob = null; start(n, { chain: true }); }
    }
    if (!mission) {
      // the next job's marker
      if (cur() < MISSIONS.length) {
        const def = MISSIONS[cur()];
        const st = resolve(def.start);
        placeMarker(startMarker, st, 5);
        const d = Math.hypot(p.x - st.x, p.z - st.z);
        // the call that sends you there
        if (def.call && !cut && !cardUp && bigT <= 0 && subT <= 0 && d > 9 && !document.body.classList.contains('cinematic')) {
          callT += dt;
          if (called !== cur() && callT > 3.5) { called = cur(); callT = 0; ring(def, st); }
          else if (called === cur() && callT > 150 && !driving()) { callT = 0; ring(def, st, true); } // still standing about: the card again
        }
        if (callUp > 0) { callUp -= dt; if (callUp <= 0 || d < 9) elCall.classList.remove('on'); }
        // someone in the car on the way there, talking (once per job)
        if (def.ride && driving() && !cut && !cardUp && d > 30 && callUp < 4) {
          if (ride.job !== cur()) ride = { job: cur(), t: 0, said: 0 };
          ride.t += dt;
          while (ride.said < def.ride.length && ride.t >= def.ride[ride.said][0]) {
            const [, who, text] = def.ride[ride.said++];
            sub(`${who}: ${text}`, Math.max(4.5, text.length / 14));
            voices?.sayText(text, { subtitle: false, who });
          }
        }
        if (!cut && d < 8 && bigT <= 0 && !cardUp) start(cur());
        else if (!cut) {
          // say where the next job is, and put it on the map
          const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
          // world z is grid south and the grid is turned ~19° off north
          const bearing = (Math.atan2(st.x - p.x, -(st.z - p.z)) * 180) / Math.PI - 19.18;
          const dir = dirs[(Math.round((((bearing % 360) + 360) % 360) / 45)) % 8];
          const dist = d > 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d / 10) * 10} m`;
          const text = `Next job: ${def.name} (${def.giver}). Go to the pink marker, ${dist} ${dir}.`;
          if (elObjective.textContent !== text) elObjective.textContent = text;
          elObjective.dataset.job = `Job ${cur() + 1} of ${MISSIONS.length}${cur() < save.progress ? ' \u00B7 replay' : ''} \u00B7 next`;
          if (mapSystem && (!mapSystem.waypoint || mapSystem.waypoint.job !== cur())) mapSystem.waypoint = { x: st.x, z: st.z, name: def.name, job: cur() };
        }
      } else startMarker.visible = false;
      return;
    }
    if (mission.blackout) return;
    if (cut || mission.si < 0) { if (!cut || cut.step) showActors([]); return; }
    const m = mission, s = m.def.steps[m.si];
    m.stepT += dt;
    // an inside step's goal is in the room (y 1500): with the player out on the street, the marker and the GPS point at the street door instead
    if (s.inside || (s.at && resolve(s.at).y > 1000)) {
      const out = !interiors?.inside, key = `${m.si}:${out}`;
      if (m.doorPtr !== key) {
        m.doorPtr = key;
        const g = out ? resolve({ place: 'QR_DOOR' }) : s.at ? resolve(s.at) : null;
        if (g) {
          placeMarker(goalMarker, g, out ? 3 : s.r);
          if (mapSystem) mapSystem.waypoint = { x: g.x, z: g.z, name: getLocationLabel(g.x, g.z) };
        } else { goalMarker.visible = false; if (mapSystem) mapSystem.waypoint = null; }
      }
    }
    // story actors and watchers for this step
    const acts = [];
    for (const a of s.actors || []) {
      if ((a.who === 'Davo' || a.near === 'player') && driving()) continue; // in the car with you
      let pose;
      if (a.near === 'player') {
        // walks to a spot picked once per step (beside the door, or where he already stands), then stays put
        const pp = playerPos(), ph = controllerManager.getActiveEntity().heading || 0;
        const ws = ((m.walkers ||= {})[a.key] ||= {});
        if (ws.si !== m.si) {
          ws.si = m.si;
          if (ws.x === undefined && a.from) { const f = resolve(a.from); ws.x = f.x; ws.z = f.z; } // comes over from where they waited
          if (ws.x === undefined) { ws.x = pp.x + Math.cos(ph) * 1.6 - Math.sin(ph) * 0.8; ws.z = pp.z - Math.sin(ph) * 1.6 - Math.cos(ph) * 0.8; } // out of the car beside you
          ws.tx = ws.x; ws.tz = ws.z;
          if (s.at) {
            const g = resolve(s.at), gx = g.x - pp.x, gz = g.z - pp.z, L = Math.hypot(gx, gz) || 1;
            const spot = (k) => ({ x: g.x + (gz / L) * 2.2 * k + (gx / L) * 0.8, z: g.z - (gx / L) * 2.2 * k + (gz / L) * 0.8 });
            const sp = [spot(1), spot(-1)].find((q) => blockAt(q.x, q.z)) || spot(1);
            ws.tx = sp.x; ws.tz = sp.z;
          } else if (Math.hypot(pp.x - ws.x, pp.z - ws.z) < 1.4) {
            const ax = ws.x - pp.x || 0.01, az = ws.z - pp.z, L = Math.hypot(ax, az); // the player stopped on top of him: a step aside
            ws.tx = pp.x + (ax / L) * 2; ws.tz = pp.z + (az / L) * 2;
          }
        }
        const dx = ws.tx - ws.x, dz = ws.tz - ws.z, d = Math.hypot(dx, dz);
        let v = 0, heading = Math.atan2(pp.x - ws.x, pp.z - ws.z);
        if (d > 0.15) {
          v = d > 6 ? 2.4 : 1.7;
          const st = Math.min(d, v * dt);
          ws.x += (dx / d) * st; ws.z += (dz / d) * st;
          heading = Math.atan2(dx, dz);
        }
        pose = { x: ws.x, y: controllerManager.getGroundHeight(ws.x, ws.z, 'person'), z: ws.z, heading, speed: v, ease: 7 };
      } else {
        const at = spotOf(a.at), x = at.x + (a.off ? a.off[0] : 0), z = at.z + (a.off ? a.off[1] : 0);
        pose = { x, y: controllerManager.getGroundHeight(x, z, 'person'), z, heading: a.face === 'player' ? Math.atan2(p.x - x, p.z - z) : a.heading || 0, ease: 7 };
      }
      acts.push({ key: a.key, id: a.who ? STORY_CAST[a.who] : a.model, pose, anim: a.anim || 'idle' });
    }
    let seenNow = false;
    for (const w of s.watch || []) {
      const wp = watcherPose(w, m);
      stepWatchers(w, m, dt);
      acts.push({ key: w.key, id: w.model, pose: { x: wp.x, y: controllerManager.getGroundHeight(wp.x, wp.z, 'person'), z: wp.z, heading: wp.heading }, anim: wp.anim });
      const c = cone(w.key, w.fov, w.range);
      c.visible = true;
      // the view cone lies on the ground, following the hill (its vertices are raised to the terrain under them)
      const gy0 = terrainHeight(wp.x, wp.z);
      c.position.set(wp.x, gy0 + 0.1, wp.z);
      c.rotation.set(0, wp.heading, 0);
      {
        const pa = c.geometry.attributes.position, sh = Math.sin(wp.heading), ch = Math.cos(wp.heading);
        for (let i = 0; i < pa.count; i++) {
          const lx = pa.getX(i), lz = pa.getZ(i);
          pa.setY(i, terrainHeight(wp.x + lx * ch + lz * sh, wp.z - lx * sh + lz * ch) - gy0 + 0.16);
        }
        pa.needsUpdate = true;
      }
      const dx = p.x - wp.x, dz = p.z - wp.z, d = Math.hypot(dx, dz);
      const off = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - wp.heading), Math.cos(Math.atan2(dx, dz) - wp.heading)));
      const sees = d < w.range && off < (w.fov / 2) * D2R;
      c.material.opacity = sees ? 0.42 : 0.2;
      if (sees) { seenNow = true; m.seen += dt * (1.4 - (0.9 * d) / w.range); }
    }
    if (s.watch) {
      if (!seenNow) m.seen = Math.max(0, m.seen - dt * 0.3);
      if (m.seen >= 1) return fail(s.seenText || 'Kestrel made you. They know you\'re back.');
    }
    showActors(acts);
    // timed lines (Davo talking in the car)
    while (s.lines && m.said < s.lines.length && m.stepT >= s.lines[m.said][0]) {
      const [, who, text] = s.lines[m.said++];
      sub(`${who}: ${text}`, 4.5);
      voices?.sayText(text, { subtitle: false, who });
    }
    pursuer.update(dt);
    if (pursuer.active && !pursuer.parked) {
      placeMarker(targetMarkers[0], pursuer.position, 1.2);
      for (let k = 1; k < targetMarkers.length; k++) targetMarkers[k].visible = false;
    }
    if (choiceOpen) { controllerManager.resetInput(); return; }
    if (m.timer > 0) {
      m.timer -= dt;
      elTimer.hidden = false;
      const t = Math.max(0, Math.ceil(m.timer));
      elTimer.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
      if (m.timer <= 0) return fail('Out of time.');
    } else elTimer.hidden = true;

    if (s.ambush && !m.ambushed && s.at && gameplay?.combat) { // armed men waiting at the marker open up as you come near
      const ag = resolve(s.at);
      if (Math.hypot(p.x - ag.x, p.z - ag.z) < (s.ambush.near || 110)) { m.ambushed = true; gameplay.combat.spawnGroup(ag, s.ambush.n, s.ambush.weapons, (x, z) => !!blockAt(x, z), [10, 22]); }
    }
    let done = false;
    if (s.evade) {
      const d = pursuer.distance();
      if (d > s.evade.lose) m.clear += dt; else m.clear = Math.max(0, m.clear - dt * 2);
      elObjective.textContent = m.clear > 0 ? `${s.text} Clear: ${m.clear.toFixed(1)} / ${s.evade.hold} s` : `${s.text} (${Math.round(d)} m)`;
      if (m.clear >= s.evade.hold) {
        for (const t of targetMarkers) t.visible = false;
        pursuer.stop();
        if (s.say) sub(s.say, 5);
        return nextStep();
      }
      return;
    }
    if (m.replyT > 0) { m.replyT -= dt; if (m.replyT <= 0) nextStep(); return; }
    if (s.choice || s.talk) return;
    leader.update(dt);
    if (s.lead && !s.lead.hold) {
      // following or chasing: a red beam over them, the distance in the objective, lost if they get too far ahead
      const L = s.lead, d = leader.distance(), q = leader.position;
      placeMarker(targetMarkers[0], q, 1.2);
      if (mapSystem) mapSystem.waypoint = { x: q.x, z: q.z, name: 'Target' };
      if (d > L.far) m.lost += dt; else m.lost = Math.max(0, m.lost - dt);
      if (m.lost > (L.farHold || 5)) return fail(L.lostText || 'You lost them.');
      const close = L.near && d < L.near && !leader.arrived && m.stepT > 6; // (a moment's grace while it pulls out)
      if (close) m.seen += dt / (L.nearHold || 3); else m.seen = Math.max(0, m.seen - dt * 0.3);
      if (m.seen >= 1) return fail(L.seenText || 'They saw you coming.');
      elObjective.textContent = `${s.text} (${Math.round(d)} m)${close ? '  TOO CLOSE' : d > L.far * 0.8 ? '  FALLING BEHIND' : ''}`;
      if ((leader.arrived && d < (L.end || 14)) || (L.catch && d < L.catch)) {
        leader.halt();
        targetMarkers[0].visible = false;
        if (s.say) {
          sub(s.say, 5);
          const sm = /^(\w+): "(.*)"$/.exec(s.say);
          if (sm) voices?.sayText(sm[2], { subtitle: false, who: sm[1] });
        }
        return nextStep();
      }
      return;
    }
    if (s.watch && m.seen > 0.05) {
      const n = Math.min(5, Math.ceil(m.seen * 5));
      const meter = `  SEEN ${'■'.repeat(n)}${'□'.repeat(5 - n)}`;
      if (!elObjective.textContent.endsWith(meter)) elObjective.textContent = s.text + meter;
    } else if (s.watch && elObjective.textContent !== s.text && !/Get out/.test(elObjective.textContent)) elObjective.textContent = s.text;
    const stealOk = !s.steal || (gameplay && gameplay.driving && (s.steal === 'any' || gameplay.driving.bodyType === s.steal));
    if (s.targets && m.targets) {
      const left = m.targets.filter((q) => !q.dead);
      targetMarkers.forEach((tm, i) => {
        const q = left[i];
        if (q) placeMarker(tm, { x: q.x, z: q.z }, 0.8);
        else tm.visible = false;
      });
      if (left[0] && mapSystem) mapSystem.waypoint = { x: left[0].x, z: left[0].z, name: 'Target' };
      elObjective.textContent = `${s.text} ${left.length} left.`;
      done = left.length === 0;
      if (done) for (const tm of targetMarkers) tm.visible = false;
    } else if (s.talkTo) {
      const n = counters.talk - m.count0.talk;
      elObjective.textContent = `${s.text} ${n} / ${s.talkTo}`;
      done = n >= s.talkTo;
    } else if (s.rob) {
      const n = counters.rob - m.count0.rob;
      elObjective.textContent = `${s.text} ${n} / ${s.rob}`;
      done = n >= s.rob;
    } else if (s.steal && !s.at) {
      done = stealOk;
    } else if (s.at && s.steal && !stealOk) {
      elObjective.textContent = `${s.text} (You need the ute.)`;
    } else if (s.enter) {
      done = !!interiors?.inside; // (the door of the Quiet Room: js/interiors.js)
    } else if (s.at) {
      const g = resolve(s.at);
      const inside = Math.hypot(p.x - g.x, p.z - g.z) < s.r;
      const modeOk = (!s.car || driving()) && (!s.foot || controllerManager.activeMode === 'person') && (!s.inside || !!interiors?.inside);
      if (inside && !modeOk && s.foot) elObjective.textContent = `${s.text} (Get out of the car first.)`;
      if (inside && modeOk) {
        if (s.wait) {
          m.wait += dt;
          elObjective.textContent = `${s.text} ${Math.max(0, s.wait - m.wait).toFixed(1)} s`;
          done = m.wait >= s.wait;
        } else done = true;
      } else if (s.wait) m.wait = 0;
    } else if (s.away) {
      done = Math.hypot(p.x - m.from.x, p.z - m.from.z) > s.away;
    } else if (s.car) {
      done = driving();
    }
    if (done && s.lines && !s.at && m.said < s.lines.length) done = false; // already in a car: the step's lines are still said
    if (done) {
      if (s.say) {
        sub(s.say, 5);
        const sm = /^(\w+): "(.*)"$/.exec(s.say); // 'Davo: "..."': said aloud too (a recording, or the browser's voice)
        if (sm) voices?.sayText(sm[2], { subtitle: false, who: sm[1] });
      }
      nextStep();
    }
  }

  const api = {
    update,
    sub,
    /** gameplay.js and the traffic, once they exist; gameplay reports talks and hold-ups here */
    attach(g, t) {
      gameplay = g; traffic = t;
      // a new game was asked for (below): on foot at the story's first spot, whatever the last game left behind
      let fresh = false;
      try { fresh = sessionStorage.getItem(NEW_KEY) === '1'; sessionStorage.removeItem(NEW_KEY); } catch { /* storage unavailable */ }
      if (fresh) {
        g.leaveCarNow?.();
        const q = PLACES.M1_PLAYER, e = controllerManager.entities.person;
        e.position.set(q.x, controllerManager.getGroundHeight(q.x, q.z, 'person'), q.z);
        e.heading = Math.atan2(PLACES.DOCK_COLLINS.x - q.x, PLACES.DOCK_COLLINS.z - q.z); // facing Davo and the first marker
        if (e.mesh) e.mesh.position.copy(e.position);
      }
    },
    /** Start the story again from the top: cash, progress, choices, the till and where you stood are all wiped, and
     *  the page reloads into the intro */
    newGame() {
      try {
        for (const k of [SAVE_KEY, SAVE_KEY_V1, 'gta-melbourne3d-till-v1', 'melbourne-player-state', 'gta-melbourne3d-intro-seen']) localStorage.removeItem(k);
        sessionStorage.setItem(NEW_KEY, '1');
      } catch { /* storage unavailable */ }
      save = clean(null);
      persist = () => {}; // (nothing written between here and the reload)
      location.reload();
    },
    /** The player fired (gameplay.js): shots during a stealth step blow the job */
    onGunfire() {
      const st = mission && !cut && mission.si >= 0 ? mission.def.steps[mission.si] : null;
      if (st && st.watch) fail(st.shotText || 'Kestrel made you. They heard the shots.');
    },
    /** The player was killed (js/gameplay.js): where they wake, and the job lost */
    respawnSpot() { return giverSpot(mission ? mission.def : MISSIONS[cur()]); },
    failJob(why) { if (mission) fail(why); },
    onTalk(robbed) { if (robbed) counters.rob++; else counters.talk++; },
    addMoney(n) { save.money += n; persist(); showMoney(); },
    missions: MISSIONS,
    get progress() { return save.progress; },
    /** Story choices made so far (saved) */
    get flags() { return { ...save.flags }; },
    /** The tail's footprint (for the player on foot), or null */
    pursuerBox() { return pursuer.box() || leader.box(); },
    /** For scripted checks: where the job is up to */
    debug() {
      return { mission: mission ? mission.def.name : null, step: mission ? mission.si : -1, seen: mission ? mission.seen || 0 : 0,
        clear: mission ? mission.clear || 0 : 0, ride: ride.said, tail: pursuer.active ? { ...pursuer.position, parked: pursuer.parked, dist: pursuer.distance() } : null,
        choice: !!choiceOpen, inCut: !!cut, cutLine: cut ? cut.k : -1, blackout: !!(mission && mission.blackout), lost: mission ? mission.lost || 0 : 0,
        lead: leader.active ? { ...leader.position, moving: leader.moving, arrived: leader.arrived, dist: leader.distance() } : null,
        goal: goalMarker.visible ? { x: goalMarker.position.x, y: goalMarker.position.y - 0.2, z: goalMarker.position.z } : null };
    },
    /** What the last chapter card showed, and a way to run one now (scripted checks) */
    get lastCard() { return lastCard; },
    showChapter(i) { const a = MISSIONS[i]?.after; if (a) chapterCard(a); },
    setFlag(k, v) { save.flags[k] = v; persist(); },
    /** Pick option i of the open choice (scripted checks; players use the buttons or 1-3) */
    choose(i) { choiceOpen?.pick(i); },
    /** Skip the cut scene that's playing (scripted checks) */
    skipCut() { if (cut) advanceCut(true); },
    /** Next line of the cut scene (scripted checks) */
    nextCutLine() { if (cut) advanceCut(); },
    get money() { return save.money; },
    start,
    applyCamera,
    get inCut() { return !!cut; },
    /** The step the job is on (or null) */
    get step() { return mission && mission.si >= 0 ? mission.def.steps[mission.si] : null; },
    /** A job is under way */
    get onJob() { return !!mission; },
    /** No shooting, aiming, talking to people or getting into cars: a cut scene, a choice or a black card is up */
    get busy() { return !!cut || !!choiceOpen || cardUp || !!(mission && mission.blackout); },
    /** Start a job now, wherever the player is (the Jobs list) */
    startNow(i) {
      if (mission) fail('You walked off the job.');
      if (i > save.progress) { save.progress = i; persist(); } // (ahead of the story: for checks; the Jobs list keeps these locked)
      focus = i < save.progress ? i : null;
      start(i);
      return resolve(MISSIONS[i].start);
    },
    /** Jump to a job: its start marker becomes the next one (the pause/jobs list) */
    jumpTo(i) {
      if (mission) fail('You walked off the job.');
      if (i > save.progress) { save.progress = i; persist(); }
      focus = i < save.progress ? i : null;
      return resolve(MISSIONS[i].start);
    }
  };
  return api;
}
