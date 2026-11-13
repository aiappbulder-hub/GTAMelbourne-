// What each of Act I's choices means, in plain words, for the choice panel (js/missions.js). The key is the story flag an
// option sets; `who` is who is asking, `ask` the question as the player should read it, and each option's note says
// what it really changes. Everything here is what the code does (js/empire.js turns the flags into the Book's shares,
// "Kestrel's interest", people and record; js/missions.js branches on a few). Where a choice only sets the Book's
// Record, the note says so. Daily figures are share x the territory's base take (js/empire.js).
export const CHOICE_INFO = {
  davo_tails_kestrel: {
    who: 'Davo', ask: 'Davo can ask a retired copper whose grey car was watching you tonight. Do you want him to?',
    notes: { true: 'Free. Davo asks around. It changes what Sully says to you at the end of Act I, and the line that closes 2004.',
      false: 'Free. Davo drops it. Sully will meet you as a stranger at the end of Act I, and a different line closes 2004.' }
  },
  quiet_room: {
    who: 'Gus Pappas', ask: 'Gus is selling you the Quiet Room, his bar. How do you pay him?',
    notes: { fair: 'Pays him well and he stays pleased. You get 12% of The Grid (about $720 a day).',
      lean: 'The cheap way. Gus resents it. You get 8% of The Grid (about $480 a day) and Kestrel takes more interest in you.',
      partner: 'Gus stays on to run the bar and tells you what it hears. You get 12% of The Grid (about $720 a day).' }
  },
  bug: {
    who: 'Ruby Achterberg', ask: "Ruby found Kestrel's bug in the bar's jukebox. What happens to it?",
    notes: { destroyed: 'Free. Kestrel will know you found it, so their interest in you goes up a little.',
      kept: 'Free. Kestrel keeps listening, but you choose what it hears. Their interest in you goes down a little.' }
  },
  lunch_shooter: {
    who: 'The driver', ask: 'The man who shot up the table is on his knees. What do you do with him?',
    notes: { talked: 'You learn who paid him: a yard hand at the market. This only goes in The Book (Record); nothing else changes.',
      sal: 'You leave him for Sal. This only goes in The Book (Record); nothing else changes.' }
  },
  carlton: {
    who: 'Vince Lombardo', ask: 'Vince is dying. Who runs Carlton when he is gone?',
    notes: { nico: 'You back Nico. You get 10% of Carlton (about $400 a day). Vince is with you and Nico is wary of you.',
      books: 'You become Vince’s secret partner. You get 30% of Carlton (about $1,200 a day), but Nico, who does not know, turns against you.' }
  },
  kaz: {
    who: 'Kaz Haddad', ask: 'You asked Kaz for ten percent of what goes through her gate. She says "Or what?" What do you tell her?',
    notes: { partner: 'You go partners. You get 20% of North & West Melbourne (about $1,000 a day) and Kaz is with you.',
      threat: 'You squeeze her with the photographs. You get 10% of North & West Melbourne (about $500 a day) and Kaz is wary of you.',
      inform: 'You hand the photographs to Kestrel. No share of the markets and Kaz turns against you, but Kestrel’s interest in you drops.' }
  },
  doors_first: {
    who: 'King St’s head bouncer', ask: 'The head bouncer guards the door at King St. How do you get past him?',
    notes: { bribe: 'Costs $2,000. This only goes in The Book (Record); the job carries on the same either way.',
      lean: 'Free. This only goes in The Book (Record); the job carries on the same either way.' }
  },
  doors: {
    who: 'Terry Maguire', ask: 'You have caught Terry, who runs the doors on King St. What do you want from him?',
    notes: { split: 'You split King St with him. You get 15% of The Grid (about $900 a day) and Terry is with you.',
      take: 'You take all of it: 28% of The Grid (about $1,680 a day). But his men come after you right away, Terry turns against you and Kestrel takes more interest in you.',
      bianca: 'You get Bianca as your runner inside Kingsgate. You get 8% of The Grid (about $480 a day) and Terry is wary of you.' }
  },
  ledger: {
    who: 'Sully', ask: 'Kestrel will search you. Who should hold the ledger, the book of who paid whom?',
    notes: { ruby: 'Ruby holds it. This only changes what The Book says about it; the raid has already happened.',
      davo: 'Davo holds it. This only changes what The Book says about it; the raid has already happened.',
      sully: 'Sully holds it. This only changes what The Book says about it; the raid has already happened.',
      self: 'Only you know where it is. This only changes what The Book says about it; the raid has already happened.' }
  }
};

/** The panel's words for a choice step's `choice` (who, text, options): { who, ask, notes: [one line per option] } */
export function describeChoice(c) {
  const flag = Object.keys((c.options[0] && c.options[0].set) || {})[0];
  const info = CHOICE_INFO[flag];
  return {
    who: info ? info.who : c.who,
    ask: info ? info.ask : '',
    notes: c.options.map((o) => (info && info.notes[String(o.set && o.set[flag])]) || '')
  };
}
