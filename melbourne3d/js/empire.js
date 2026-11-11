// js/empire.js: "The Book" (docs/story/EMPIRE_DESIGN.md sections 2 and 6.8, MILESTONES.md Milestone 3, first part).
// What Act I's choices bought: a share of three territories, a daily take from them, people who are with you or
// aren't, and Kestrel's attention. Everything here is worked out from the story's saved flags (js/missions.js), so
// there is nothing to get out of step with the save; the only thing kept besides is the till (takings not yet
// collected). The take builds up while you play and is collected by walking into the Quiet Room, between jobs.
// The panel opens with K or the Book button: Ledger (territories), People, and the Record of what you've done.
// Lieutenants, orders and loyalty that moves come with Act II.

const TILL_KEY = 'gta-melbourne3d-till-v1';
const DAY = 48 * 60; // real seconds in a game day (two minutes an hour)
const TILL_DAYS = 3; // the till holds this many days' take; then it waits for you
const HQ = { x: -224, z: 120 };

// The eleven territories: who holds each when you come back, and a day's money at 100% of it
const TERRITORIES = [
  { id: 'GRID', name: 'The Grid', holder: 'Contested (Kingsgate on the King St doors)', base: 6000, trade: 'nightlife, doors, the Quiet Room' },
  { id: 'CARLTON', name: 'Carlton', holder: 'Lygon Street Crew', base: 4000, trade: 'restaurants, construction, the SP book' },
  { id: 'NWM', name: 'North & West Melbourne', holder: 'Broadmeadows firm', base: 5000, trade: 'the market, the rail yards, tobacco' },
  { id: 'DOCK', name: 'Docklands', holder: 'Westside Nomads', base: 5000, trade: 'marinas, stadium nights, imports' },
  { id: 'FITZ', name: 'Fitzroy & Collingwood', holder: 'The Doherty family', base: 3500, trade: 'pubs, live music, the estate' },
  { id: 'EAST', name: 'East Melbourne & the MCG', holder: 'The Members', base: 4500, trade: 'tickets, boxes, access' },
  { id: 'SBANK', name: 'Southbank & South Wharf', holder: 'Golden Reef', base: 8000, trade: 'junkets, apartment money' },
  { id: 'WEST', name: 'The Westside', holder: 'Westside Nomads', base: 4000, trade: 'towing, smash repairs, the rezoning' },
  { id: 'DOMAIN', name: 'Kings Domain & South Yarra', holder: 'The Members', base: 5000, trade: 'St Kilda Rd money, property' },
  { id: 'LAKE', name: 'Albert Park', holder: 'Neutral ground', base: 0, trade: 'nothing: a place to sit down' },
  { id: 'STK', name: 'St Kilda', holder: "Lenny Szabo's Esplanade", base: 4500, trade: 'clubs, the Fitzroy St book, the pier' }
];

/** Everything the Book shows, from the story so far: { progress, flags } → territories, people, record, heat, daily */
export function bookFrom(progress, flags) {
  const f = flags || {};
  const share = Object.fromEntries(TERRITORIES.map((t) => [t.id, 0]));
  const why = Object.fromEntries(TERRITORIES.map((t) => [t.id, []]));
  const give = (id, n, because) => { share[id] += n; why[id].push(`${n > 0 ? '+' : ''}${n}% ${because}`); };
  const people = [], record = [];
  let heat = 10;
  const person = (name, role, standing, mood) => people.push({ name, role, standing, mood }); // mood: with | wary | against

  person('Davo', 'Driver. Sober eleven years.', f.davo_tails_kestrel ? 'Asked his ex-copper about the grey Comodo. Loyal the way furniture is loyal.' : 'Put the kettle on, as told. Loyal the way furniture is loyal.', 'with');
  if (f.davo_tails_kestrel !== undefined) record.push(f.davo_tails_kestrel ? 'Had Davo find out whose grey Comodo that was.' : 'Let Kestrel watch.');

  if (f.quiet_room) {
    const q = f.quiet_room;
    give('GRID', q === 'lean' ? 8 : 12, 'the Quiet Room');
    record.push({ fair: "Bought Gus's bar at a fair price. His name stays on the window.", lean: "Took Gus's bar for what the bank was owed.", partner: 'Kept Gus on to run the bar.' }[q]);
    person('Gus Pappas', 'The Quiet Room', { fair: 'Sold fair. Says good morning and means it.', lean: 'Sold with the bank at his back. Has been seen talking to a woman in a grey suit.', partner: 'Runs the bar. Passes on what the bar hears.' }[q], q === 'lean' ? 'against' : 'with');
    if (q === 'lean') heat += 5;
  }
  if (f.bug) {
    record.push(f.bug === 'kept' ? "Left Kestrel's bug in the jukebox. It hears what you want it to." : "Crushed Kestrel's bug. They know you found it.");
    heat += f.bug === 'kept' ? -5 : 5;
    person('Ruby Achterberg', 'The books', "Walked out of Golden Reef with six years of Vellacott's numbers in her head. Counts the till twice.", 'with');
  }
  if (f.lunch_shooter) record.push(f.lunch_shooter === 'talked' ? 'The driver at Sunday lunch talked: paid by a yard hand at the market.' : 'Left the driver at Sunday lunch for Sal.');
  if (f.carlton) {
    const books = f.carlton === 'books';
    give('CARLTON', books ? 30 : 10, books ? "Vince's hidden partner" : 'an ally in the chair');
    record.push(books ? "Keeping Carlton's books for Vince. Nico doesn't know." : "Backed Nico for Vince's chair.");
    person('Vince Lombardo', 'Carlton. Dying, slowly.', books ? 'Your partner, on paper nobody has seen.' : 'Has your word about the boy.', 'with');
    person('Nico Lombardo', "Vince's nephew", books ? 'Smells something in the books. Has not forgiven 2004.' : 'Thinks you owe him the chair. Is half right.', books ? 'against' : 'wary');
  }
  if (f.kaz) {
    const k = f.kaz;
    if (k !== 'inform') give('NWM', k === 'partner' ? 20 : 10, k === 'partner' ? "partners with Kaz at the yards" : "ten percent, counted yourself");
    record.push({ partner: 'Went partners with Kaz at the Dudley St yards.', threat: 'Showed Kaz the photographs. She pays.', inform: 'Gave the market photographs to Kestrel.' }[k]);
    person('Kaz Haddad', 'The Dudley St yards', { partner: 'Partners. She will not say it twice.', threat: 'Pays her ten percent and counts the days.', inform: 'Knows who sent Kestrel to her gate.' }[k], { partner: 'with', threat: 'wary', inform: 'against' }[k]);
    if (k === 'inform') heat -= 10;
  }
  if (f.doors_first) record.push(f.doors_first === 'bribe' ? "Bought King St's head bouncer for two grand." : "Told King St's head bouncer who he works for.");
  if (f.doors) {
    const d = f.doors;
    give('GRID', { split: 15, take: 28, bianca: 8 }[d], { split: 'half the King St doors', take: 'the King St doors', bianca: 'a runner inside Kingsgate' }[d]);
    record.push({ split: 'Split the King St doors with Terry Maguire.', take: 'Took the King St doors off Terry Maguire.', bianca: "Let Bianca Rowe keep the night's envelopes. She answers your calls." }[d]);
    person('Terry Maguire', 'Kingsgate Security', { split: 'Half a street for a quiet life. So far he is getting it.', take: 'Lost his doors on a Friday night. Is asking who else you have upset.', bianca: 'Knows you bought his runner. Has not decided what that costs.' }[d], { split: 'with', take: 'against', bianca: 'wary' }[d]);
    if (d === 'bianca') person('Bianca Rowe', 'Runner, Kingsgate', 'Carries their envelopes. Tells you what is in them.', 'with');
    if (d === 'take') heat += 5;
  }
  if (f.ledger) {
    heat += 30;
    const l = f.ledger;
    record.push(`Kestrel raided the Quiet Room for the ledger. ${{ ruby: 'Ruby', davo: 'Davo', sully: 'Sully', self: 'Nobody but you' }[l]} ${l === 'self' ? 'knows' : 'holds it'}${l === 'self' ? ' where it is.' : '.'}`);
    person('Sully', 'Ex-detective. Kestrel sacked him in 2005.', l === 'sully' ? 'Holds the ledger. You trusted a copper.' : 'Thinks someone inside told Kestrel which floorboard.', 'with');
    person('DI Helen Marsh', 'Taskforce Kestrel', "Has twelve pages on you. Ten of them say 'unknown'. She is working on the ten.", 'against');
  }
  const territories = TERRITORIES.map((t) => {
    const s = Math.max(0, Math.min(100, share[t.id]));
    return { ...t, share: s, why: why[t.id], daily: Math.round((t.base * s) / 100 / 10) * 10 };
  });
  return {
    open: progress >= 9 || !!f.quiet_room, // the Book starts with the bar
    territories, people, record,
    heat: Math.max(0, Math.min(100, heat)),
    daily: territories.reduce((a, t) => a + t.daily, 0)
  };
}

const CSS = `
.bk { position: fixed; inset: 0; z-index: 80; display: none; align-items: center; justify-content: center; background: rgba(4,6,10,.62); }
.bk.on { display: flex; }
.bk-panel { width: min(760px, 96vw); max-height: min(86vh, 720px); display: flex; flex-direction: column; border-radius: 16px; overflow: hidden;
  background: #14110d; color: #efe6d4; font: 500 14px/1.45 Inter, system-ui, sans-serif; box-shadow: 0 20px 80px rgba(0,0,0,.6); border: 1px solid #3a3024; }
.bk-head { display: flex; align-items: baseline; gap: 12px; padding: 14px 18px 10px; border-bottom: 1px solid #3a3024; }
.bk-head h2 { margin: 0; font: 800 20px/1 Georgia, 'Times New Roman', serif; letter-spacing: .04em; color: #ffcf6e; }
.bk-head span { flex: 1; color: #b9ab92; font-size: 12px; }
.bk-head button, .bk-tabs button { font: 700 13px/1 Inter, system-ui, sans-serif; color: #efe6d4; background: transparent; border: 1px solid #4a3d2c; border-radius: 9px; padding: 8px 12px; cursor: pointer; }
.bk-tabs { display: flex; gap: 8px; padding: 10px 18px; }
.bk-tabs button[aria-selected="true"] { background: #ffcf6e; color: #14110d; border-color: #ffcf6e; }
.bk-body { padding: 4px 18px 16px; overflow-y: auto; }
.bk-sum { display: flex; flex-wrap: wrap; gap: 8px 22px; padding: 8px 0 12px; color: #b9ab92; font-size: 13px; }
.bk-sum b { color: #8ee07a; font: 800 18px/1 'JetBrains Mono', monospace; margin-right: 6px; }
.bk-sum b.heat { color: #ff7a6b; }
.bk-row { padding: 10px 0; border-top: 1px solid #2a231a; }
.bk-row h3 { display: flex; justify-content: space-between; gap: 10px; margin: 0 0 3px; font: 700 15px/1.2 Inter, system-ui, sans-serif; }
.bk-row h3 em { font-style: normal; color: #8ee07a; font-family: 'JetBrains Mono', monospace; white-space: nowrap; }
.bk-row p { margin: 0; color: #b9ab92; font-size: 13px; }
.bk-bar { height: 6px; margin: 6px 0 4px; border-radius: 3px; background: #2a231a; overflow: hidden; }
.bk-bar i { display: block; height: 100%; background: #ffcf6e; }
.bk-dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 8px; background: #8ee07a; }
.bk-dot.wary { background: #ffcf6e; } .bk-dot.against { background: #ff7a6b; }
.bk-rec { margin: 0; padding: 0 0 0 18px; } .bk-rec li { padding: 5px 0; }
.bk-empty { padding: 26px 0; color: #b9ab92; text-align: center; }
@media (max-width: 560px) { .bk-panel { max-height: 92vh; } .bk-head h2 { font-size: 17px; } }
`;

export function createEmpire({ missionSystem, controllerManager }) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
  const money = (n) => `$${Math.round(n).toLocaleString('en-AU')}`;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

  // the till: takings not yet collected
  let till = 0;
  try { const t = JSON.parse(localStorage.getItem(TILL_KEY) || 'null'); if (t && Number.isFinite(t.till)) till = Math.max(0, t.till); } catch { /* a new till */ }
  let saved = till, saveT = 0;
  const persist = () => { saved = till; try { localStorage.setItem(TILL_KEY, JSON.stringify({ till: Math.round(till) })); } catch { /* storage unavailable */ } };
  const book = () => bookFrom(missionSystem.progress, missionSystem.flags);

  // --- the panel --------------------------------------------------------------------------------------------------
  const root = el('div', 'bk');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'The Book');
  const panel = el('div', 'bk-panel');
  const head = el('div', 'bk-head');
  const title = el('h2', '', 'The Book');
  const sub = el('span', '', '');
  const close = el('button', '', 'Close');
  close.type = 'button';
  head.append(title, sub, close);
  const tabs = el('div', 'bk-tabs');
  tabs.setAttribute('role', 'tablist');
  const body = el('div', 'bk-body');
  panel.append(head, tabs, body);
  root.append(panel);
  document.body.append(root);
  let tab = 'Ledger';
  const TABS = ['Ledger', 'People', 'Record'];
  const tabBtns = TABS.map((name) => {
    const b = el('button', '', name);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.addEventListener('click', () => { tab = name; render(); });
    tabs.append(b);
    return b;
  });
  function render() {
    const bk = book();
    tabBtns.forEach((b, i) => b.setAttribute('aria-selected', String(TABS[i] === tab)));
    body.textContent = '';
    if (!bk.open) {
      sub.textContent = '';
      body.append(el('div', 'bk-empty', 'Nothing in it yet. The Book starts when you have somewhere to keep it: the Quiet Room.'));
      return;
    }
    sub.textContent = 'Kept at the Quiet Room, Flinders Lane';
    if (tab === 'Ledger') {
      const sum = el('div', 'bk-sum');
      const a = el('span'); a.append(el('b', '', money(bk.daily)), 'a day');
      const b = el('span'); b.append(el('b', '', money(till)), 'in the till (collect it at the Quiet Room)');
      const c = el('span'); c.append(el('b', 'heat', `${bk.heat}`), "Kestrel's interest, out of 100");
      sum.append(a, b, c);
      body.append(sum);
      for (const t of [...bk.territories].sort((x, y) => y.share - x.share)) {
        const row = el('div', 'bk-row');
        const h = el('h3');
        h.append(el('span', '', t.name), el('em', '', t.share ? `${t.share}% · ${money(t.daily)}/day` : '—'));
        const bar = el('div', 'bk-bar');
        const fill = el('i');
        fill.style.width = `${t.share}%`;
        bar.append(fill);
        row.append(h, bar, el('p', '', t.share ? `Yours: ${t.why.join(', ')}. Held by: ${t.holder}.` : `Held by: ${t.holder}. ${t.trade[0].toUpperCase()}${t.trade.slice(1)}.`));
        body.append(row);
      }
    } else if (tab === 'People') {
      for (const q of bk.people) {
        const row = el('div', 'bk-row');
        const h = el('h3');
        const n = el('span');
        n.append(el('i', `bk-dot ${q.mood === 'with' ? '' : q.mood}`), q.name);
        h.append(n, el('em', '', { with: 'with you', wary: 'wary', against: 'against you' }[q.mood]));
        h.lastChild.style.color = { with: '#8ee07a', wary: '#ffcf6e', against: '#ff7a6b' }[q.mood];
        row.append(h, el('p', '', `${q.role}. ${q.standing}`));
        body.append(row);
      }
    } else {
      const ol = el('ol', 'bk-rec');
      for (const r of bk.record) ol.append(el('li', '', r));
      body.append(ol);
    }
  }
  let isOpen = false;
  function open(show = !isOpen) {
    if (show && (missionSystem.busy || document.body.classList.contains('cutscene'))) return;
    isOpen = show;
    root.classList.toggle('on', show);
    if (show) { render(); close.focus(); }
  }
  close.addEventListener('click', () => open(false));
  root.addEventListener('click', (e) => { if (e.target === root) open(false); });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyK' && !e.repeat && !/^(INPUT|TEXTAREA)$/.test(e.target?.tagName || '')) { e.preventDefault(); open(); }
    else if (isOpen && e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); open(false); }
  }, true);
  // a button on the toolbar, beside the graphics one
  const anchor = document.getElementById('btn-quality');
  if (anchor) {
    const btn = el('button', 'tool-btn');
    btn.type = 'button';
    btn.id = 'btn-book';
    btn.title = 'The Book: your territories, people and record [K]';
    btn.setAttribute('aria-label', 'The Book');
    btn.append(el('span', 'gfx-label', 'Book'));
    btn.addEventListener('click', () => open());
    anchor.before(btn);
  }

  // --- the take ---------------------------------------------------------------------------------------------------
  let told = false, inside = false;
  function update(dt) {
    const bk = book();
    if (!bk.open || bk.daily <= 0) return;
    const cap = bk.daily * TILL_DAYS;
    const before = till;
    till = Math.min(cap, till + (bk.daily * dt) / DAY);
    if (till >= cap && before < cap && !told) { told = true; missionSystem.sub?.('Ruby: "The till is full. Come by the Quiet Room."', 5); }
    saveT += dt;
    if (saveT > 20 && Math.abs(till - saved) >= 1) { saveT = 0; persist(); }
    if (isOpen && tab === 'Ledger' && Math.floor(till / 10) !== Math.floor(before / 10)) render();
    // collecting: on foot at the Quiet Room, between jobs
    const p = controllerManager.getActiveEntity().position;
    const near = controllerManager.activeMode === 'person' && Math.hypot(p.x - HQ.x, p.z - HQ.z) < 9 && !missionSystem.busy && !missionSystem.onJob;
    if (near && !inside && till >= 50) {
      const n = Math.floor(till / 10) * 10;
      till -= n;
      told = false;
      persist();
      missionSystem.addMoney(n);
      missionSystem.sub?.(`Ruby hands you the take: +${money(n)}. ${bk.heat >= 40 ? 'She has counted it twice. Kestrel is counting too.' : 'She has counted it twice.'}`, 6);
    }
    inside = near;
  }

  return {
    update,
    open,
    get isOpen() { return isOpen; },
    /** For scripted checks */
    debug() { const bk = book(); return { open: bk.open, daily: bk.daily, heat: bk.heat, till, shares: Object.fromEntries(bk.territories.filter((t) => t.share).map((t) => [t.id, t.share])), people: bk.people.map((q) => `${q.name}:${q.mood}`), record: bk.record.length }; },
    /** For scripted checks: put money in the till */
    setTill(n) { till = n; }
  };
}
