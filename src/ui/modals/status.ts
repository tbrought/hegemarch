/**
 * Status: the Destinies and how near each house is, the Boons the player holds and what they add up to,
 * the rival houses, and the run so far. On the cradle of an Ages run, the climb through the ages.
 */

import { DIFFICULTY_NAMES } from '../../game/constants';
import { AMBITION_BY_ID } from '../../game/data/ambitions';
import { CARD_BY_ID, CAT_LABEL, type CardCat } from '../../game/data/cards';
import { ERAS, LAST_CRADLE_ERA } from '../../game/data/eras';
import { HEIR_BY_ID } from '../../game/data/heirs';
import { RELIC_BY_ID } from '../../game/data/relics';
import { TRAIT_BY_ID } from '../../game/data/traits';
import { VICTORIES } from '../../game/data/victories';
import { modLines, statSources } from '../../game/modstats';
import { fit, text, textWidth, wrap } from '../../render/font';
import { PAL } from '../../render/palette';
import { bar, box, rect, type Ctx } from '../../render/pixel';
import { fmtTime } from '../../render/Renderer';
import { drawRich, richLines } from '../../render/rich';
import { icon } from '../../render/sprites';
import { boonColor, CAT_ORDER, catIcon, groupBoons } from '../boons';
import { fmt } from '../format';
import { gloss, termsIn } from '../glossary';
import { destinyProgress } from '../hud/destinies';
import type { Modals, StatusTab } from '../Modals';
import { BOOK_H, BOOK_W } from './book';

export function status(modals: Modals, g: Ctx) {
  const W = modals.hud.W;
  const H = modals.hud.H;
  const w = Math.min(W - 12, BOOK_W);
  const h = Math.min(H - 12, BOOK_H);
  const { x, y } = modals.frame(g, w, h, modals.statusTab === 'boons' ? 'YOUR BOONS' : 'STATUS');
  modals.closeButton(g, x, y, w);
  const early = !modals.s.reveal().destinies && modals.s.guided;
  const tabs: [StatusTab, string][] = early ? [['boons', 'BOONS']] : [['destinies', modals.g.cradle ? 'THE CLIMB' : 'DESTINIES'], ['boons', 'BOONS'], ['rivals', 'RIVALS'], ['run', 'THIS RUN']];
  if (early) modals.statusTab = 'boons';
  let tx = x + 6;
  for (const [id, label] of tabs) {
    const tw = textWidth(label, 'tiny') + 10;
    modals.ui.button(g, 'tab-' + id, tx, y + 15, tw, 11, label, () => (modals.statusTab = id), { font: 'tiny', selected: modals.statusTab === id });
    tx += tw + 2;
  }
  const cx = x + 8;
  const cy = y + 31;
  const cw = w - 16;
  const p = modals.g.player;
  switch (modals.statusTab) {
    case 'destinies': {
      if (modals.g.cradle) {
        agesTab(modals, g, cx, cy, cw, y + h - 5);
        break;
      }
      let ly = cy;
      for (const v of modals.g.victories) {
        const d = VICTORIES[v];
        const pr = destinyProgress(modals.hud, p, v);
        const top = ly;
        icon(g, v, cx, ly);
        text(g, d.name.toUpperCase(), cx + 9, ly, PAL.gold);
        text(g, pr.label, cx + cw - textWidth(pr.label, 'tiny'), ly + 1, PAL.mist, 'tiny');
        bar(g, cx + 9, ly + 9, cw - 9, 2, pr.frac, pr.frac >= 1 ? PAL.teal : PAL.gold, PAL.indigo);
        ly += 13;
        for (const l of wrap(d.desc, cw - 9, 'main').slice(0, 2)) {
          text(g, l, cx + 9, ly, PAL.dusk);
          ly += 10;
        }
        modals.ui.hint('st-dest-' + v, cx, top, cw, ly - top, { tip: `${d.name}: ${d.desc}`, terms: termsIn(d.desc, { exclude: d.name }) });
        ly += 3;
      }
      rect(g, cx, ly, cw, 1, PAL.indigo);
      ly += 4;
      text(g, 'OMENS', cx, ly, PAL.violet, 'tiny');
      ly += 7;
      modals.ui.hint('st-omens', cx, ly - 7, 30, 7, { terms: gloss('omen') });
      for (const t of modals.g.traits) {
        const tr = TRAIT_BY_ID[t];
        if (!tr) continue;
        const top = ly;
        ly = drawRich(g, `${tr.name}: ${tr.desc}`, cx, ly, cw, {}, 'main', 2);
        modals.ui.hint('st-omen-' + t, cx, top, cw, ly - top, { terms: termsIn(tr.desc), scan: tr.name });
      }
      const amb = AMBITION_BY_ID[modals.g.ambition];
      if (amb && ly < y + h - 18) {
        ly += 2;
        const top = ly;
        text(g, 'AMBITION', cx, ly, PAL.gold, 'tiny');
        ly += 7;
        const done = amb.check(modals.g, p, false);
        text(g, fit(`${amb.name}: ${amb.desc} (+${amb.reward} Legacy)`, cw, 'main'), cx, ly, done ? PAL.teal : PAL.mist);
        modals.ui.hint('st-amb', cx, top, cw, ly + 9 - top, {
          tip: `${amb.name}: ${amb.desc} Complete it for [+${amb.reward} Legacy] at the end of the run.${done ? ' Done so far!' : ''}`,
          terms: [...termsIn(amb.desc, { max: 2 }), ...gloss('ambition', 'legacy')],
        });
      }
      break;
    }
    case 'boons':
      boonsTab(modals, g, cx, cy, cw, y + h - cy - 5);
      break;
    case 'rivals': {
      let ly = cy;
      for (const f of modals.g.empires()) {
        const heir = HEIR_BY_ID[f.heir];
        const worlds = modals.g.worldsOf(f.id).length;
        rect(g, cx, ly + 1, 6, 6, f.color);
        text(g, `${modals.g.shortName(f)}${f.isPlayer ? ' (YOU)' : ''}`, cx + 10, ly, f.alive ? PAL.bone : PAL.slate);
        const status = !f.alive ? (f.launchedAt >= 0 && modals.g.cradle ? `LEFT FOR THE STARS AT ${fmtTime(f.launchedAt)}` : `OUT AT ${fmtTime(f.eliminatedAt)}`) : modals.g.asleep(f.id) ? `STILL ON ITS WAY · ARRIVES IN ${fmtTime(f.asleepUntil - modals.g.time)}` : `${worlds} WORLDS · ${f.boons} BOONS`;
        text(g, status, cx + cw - textWidth(status, 'tiny'), ly + 1, f.alive ? PAL.mist : PAL.slate, 'tiny');
        ly += 10;
        const notes: string[] = [];
        if (heir) notes.push(heir.title);
        if (f.gate) notes.push('RAISING A STARFIRE GATE!');
        if (f.holdTimer > 0) notes.push('HOLDS DOMINION!');
        if (f.treasuryTimer > 0) notes.push('HOARDING EMBERS!');
        if (f.relicTimer > 0) notes.push('HOLDS THE RELICS!');
        text(g, fit(notes.join(' · '), cw - 10, 'tiny'), cx + 10, ly, notes.length > 1 ? PAL.red : PAL.dusk, 'tiny');
        const warn: string[] = [];
        if (f.gate) warn.push('[!Raising a Starfire Gate]: destroy it before it charges, or they win by Ascension.');
        if (f.holdTimer > 0) warn.push('[!Holds 60% of all worlds]: take worlds back before the hold completes, or they win by Dominion.');
        if (f.treasuryTimer > 0) warn.push('[!Hoarding Embers]: take their worlds to seize part of the hoard, or they win by Ember Hoard.');
        if (f.relicTimer > 0) warn.push('[!Holds most of the relics]: take their Hearth before time runs out, or they win by Relic Hunt.');
        if (heir) {
          modals.ui.hint('st-rival-' + f.id, cx, ly - 10, cw, 19, {
            tipTitle: f.isPlayer ? `${f.name} (you)` : f.name,
            tipColor: f.color,
            tip: [`${heir.title}. ${heir.desc}`, heir.bonuses.join(' · '), ...warn].join('\n'),
          });
        }
        ly += 11;
      }
      ly += 4;
      const pir = modals.g.pirates;
      text(g, pir.alive ? `CORSAIRS: ${pir.raidCount} RAIDS SO FAR · NEXT ~${fmtTime(Math.max(modals.g.time, pir.nextRaid))}` : 'CORSAIRS: DESTROYED', cx, ly, PAL.mist, 'tiny');
      modals.ui.hint('st-corsairs', cx, ly - 1, cw, 8, { terms: gloss('corsairs', 'stronghold') });
      ly += 9;
      const c = modals.g.crisis;
      if (c) {
        text(g, c.dead ? 'THE HOLLOW: PURGED' : c.awake ? 'THE HOLLOW: LOOSE IN THE SECTOR' : `THE HOLLOW: THE MAW STIRS (~${fmtTime(c.awakenAt)})`, cx, ly, PAL.pink, 'tiny');
        modals.ui.hint('st-hollow', cx, ly - 1, cw, 8, { terms: gloss('hollow', 'maw', 'riftHeart') });
      }
      break;
    }
    case 'run': {
      const st = p.stats;
      const rows: [string, string][] = [
        ['House', HEIR_BY_ID[p.heir]?.name ?? ''],
        ['Time', fmtTime(modals.g.time)],
        ['Sector', `${modals.g.config.size} · ${DIFFICULTY_NAMES[modals.g.config.difficulty]}${modals.g.config.daily ? ' · daily' : ''}`],
        ['Seed', String(modals.g.config.seed)],
        ['Worlds held / most', `${modals.g.worldsOf(p.id).length} / ${st.maxWorlds}`],
        ['Kindled / captured / lost', `${st.worldsKindled} / ${st.worldsCaptured} / ${st.worldsLost}`],
        ['Ships built / lost', `${st.shipsBuilt} / ${st.shipsLost}`],
        ['Enemy ships destroyed', String(st.kills)],
        ['Embers earned', fmt(st.embersEarned)],
        ['Boons from Lore', String(p.boons)],
        ['Anomalies resolved', String(st.eventsResolved)],
      ];
      let ly = cy;
      for (const [k, v] of rows) {
        text(g, k, cx, ly, PAL.dusk);
        text(g, v, cx + cw - textWidth(v), ly, PAL.bone);
        ly += 10;
      }
      break;
    }
  }
}

function boonsTab(modals: Modals, g: Ctx, x: number, y: number, w: number, h: number) {
  const p = modals.g.player;
  const tw = Math.min(150, Math.max(112, Math.floor(w * 0.36)));
  const lw = w - tw - 9;
  const items: { h: number; draw: (ly: number) => void; terms?: ReturnType<typeof termsIn> }[] = [];
  const head = (label: string, iconName: string, color: string, right = '') =>
    items.push({
      h: 12,
      draw: (ly) => {
        icon(g, iconName, x, ly + 1, color);
        text(g, label, x + 8, ly + 1, color, 'tiny');
        if (right) text(g, right, x + lw - textWidth(right, 'tiny'), ly + 1, PAL.slate, 'tiny');
        rect(g, x, ly + 8, lw, 1, PAL.indigo);
      },
    });
  const entry = (name: string, color: string, count: number, desc: string) =>
    items.push({
      terms: termsIn(`${name}. ${desc}`),
      h: 10 + richLines(desc, lw - 6) * 10 + 3,
      draw: (ly) => {
        const ex = text(g, fit(name, lw - 20, 'main'), x + 2, ly, color);
        if (count > 1) text(g, `×${count}`, ex + 2, ly, PAL.gold);
        drawRich(g, desc, x + 6, ly + 10, lw - 6, { body: PAL.dusk });
      },
    });
  const bullet = (s: string) =>
    items.push({
      terms: termsIn(s),
      h: richLines(s, lw - 8) * 10,
      draw: (ly) => {
        rect(g, x + 3, ly + 3, 2, 2, PAL.slate);
        drawRich(g, s, x + 8, ly, lw - 8, { body: PAL.mist });
      },
    });
  const groups = groupBoons(p.cards);
  if (!groups.length) items.push({ h: 14, draw: (ly) => text(g, 'No Boons yet. They come as your Lore fills.', x, ly, PAL.dusk) });
  for (const cat of CAT_ORDER) {
    const list = groups.filter((gr) => CARD_BY_ID[gr.id].cat === cat);
    if (!list.length) continue;
    head(CAT_LABEL[cat].toUpperCase(), catIcon(cat as CardCat), cat === 'pact' ? PAL.red : PAL.mist, String(list.reduce((a, b) => a + b.count, 0)));
    for (const gr of list) {
      const c = CARD_BY_ID[gr.id];
      entry(c.name, boonColor(c), gr.count, c.desc);
    }
  }
  if (p.relics.length) {
    head('RELICS', 'relic', PAL.sky, String(p.relics.length));
    for (const id of p.relics) {
      const r = RELIC_BY_ID[id];
      if (r) entry(r.name, PAL.sky, 1, r.desc);
    }
  }
  const heir = HEIR_BY_ID[p.heir];
  if (heir) {
    head(heir.name.toUpperCase(), 'hearth', heir.color);
    for (const b of heir.bonuses) bullet(b);
    items.push({ h: 4, draw: () => {} });
  }
  const traits = modals.g.traits.map((t) => TRAIT_BY_ID[t]).filter(Boolean);
  if (traits.length) {
    head('OMENS · EVERY HOUSE', 'star', PAL.violet);
    for (const t of traits) entry(t.name, PAL.violet, 1, t.desc);
  }
  // The list scrolls inside its column.
  const total = items.reduce((a, it) => a + it.h, 0);
  modals.boonScrollMax = Math.max(0, total - h);
  modals.boonScroll = Math.min(modals.boonScroll, modals.boonScrollMax);
  g.save();
  g.beginPath();
  g.rect(x, y, lw + 1, h);
  g.clip();
  let ly = y - modals.boonScroll;
  items.forEach((it, i) => {
    if (ly + it.h > y && ly < y + h) {
      it.draw(ly);
      const top = Math.max(y, ly);
      if (it.terms?.length) modals.ui.hint('bl-' + i, x, top, lw, Math.min(y + h, ly + it.h) - top, { terms: it.terms });
    }
    ly += it.h;
  });
  g.restore();
  if (modals.boonScrollMax > 0) {
    const sx = x + lw + 3;
    rect(g, sx, y, 1, h, PAL.indigo);
    const th = Math.max(10, Math.round((h * h) / total));
    rect(g, sx, y + Math.round(((h - th) * modals.boonScroll) / modals.boonScrollMax), 1, th, PAL.dusk);
  }
  // Totals from every source.
  const rx = x + lw + 9;
  box(g, rx - 3, y - 1, tw + 3, h + 2, PAL.void, PAL.indigo);
  text(g, 'ALL BONUSES', rx, y + 2, PAL.gold, 'tiny');
  text(g, 'HOUSE, OMENS, BOONS, RELICS', rx, y + 9, PAL.slate, 'tiny');
  let ty = y + 19;
  const lines = modLines(p.mods);
  const rows = Math.max(1, Math.floor((h - 30) / 7));
  const shown = lines.length > rows ? lines.slice(0, rows - 1) : lines;
  const sources = modals.g.modSources(p);
  modals.ui.hint('bt-head', rx, y + 1, tw - 4, 15, { tip: 'Every bonus your house has right now, added up from all its sources. Point at a line to see where it comes from.' });
  for (const l of shown) {
    const vw = textWidth(l.text, 'tiny');
    text(g, fit(l.label.toUpperCase(), tw - vw - 10, 'tiny'), rx, ty, PAL.mist, 'tiny');
    text(g, l.text, rx + tw - 5 - vw, ty, l.good ? PAL.teal : PAL.red, 'tiny');
    const from = statSources(sources, l.key);
    modals.ui.hint('bt-' + l.key, rx - 2, ty - 1, tw - 2, 7, {
      tipTitle: `${l.label} ${l.text}`,
      tipColor: l.good ? PAL.teal : PAL.red,
      tip: from.map((s) => `${s.label}: ${s.good ? '[' : '[!'}${s.text}]`).join('\n') || 'From your house.',
    });
    ty += 7;
  }
  if (lines.length > shown.length) text(g, `+${lines.length - shown.length} MORE`, rx, ty, PAL.slate, 'tiny');
  if (!lines.length) text(g, 'NONE YET', rx, ty, PAL.slate, 'tiny');
  const foot = `REROLLS ${p.rerolls} · BOONS ${p.cards.length}`;
  text(g, foot, rx, y + h - 6, PAL.dusk, 'tiny');
}

/** The status screen's first tab on the cradle: where every house stands on the climb. */
function agesTab(modals: Modals, g: Ctx, cx: number, cy: number, cw: number, bottom: number) {
  const game = modals.g;
  let ly = cy;
  for (const f of game.empires()) {
    const gone = f.launchedAt >= 0;
    const dead = !f.alive && !gone;
    rect(g, cx, ly + 1, 5, 5, dead ? PAL.slate : f.color);
    text(g, (f.isPlayer ? `${modals.g.shortName(f)} (you)` : modals.g.shortName(f)).toUpperCase(), cx + 9, ly, dead ? PAL.slate : f.color);
    const fate = gone ? `LEFT FOR THE STARS AT ${fmtTime(f.launchedAt)}` : dead ? 'ITS HEARTH HAS GONE DARK' : ERAS[f.era].name.toUpperCase() + (f.advance && f.era >= LAST_CRADLE_ERA ? ' · BUILDING ITS ARK' : '');
    text(g, fate, cx + cw - textWidth(fate, 'tiny'), ly + 1, gone ? PAL.gold : dead ? PAL.slate : PAL.mist, 'tiny');
    for (let k = 0; k <= LAST_CRADLE_ERA; k++) rect(g, cx + 9 + k * 14, ly + 10, 12, 2, dead ? PAL.indigo : gone || f.era > k ? (gone ? PAL.gold : f.color) : PAL.indigo);
    ly += 17;
  }
  rect(g, cx, ly, cw, 1, PAL.indigo);
  ly += 5;
  const p = game.player;
  const era = ERAS[Math.min(p.era, LAST_CRADLE_ERA)];
  const lines = [
    p.era >= LAST_CRADLE_ERA
      ? `Your next step is the Ark: ${era.lore} Lore, ${era.cost} Embers and ${era.time} seconds at your Hearth. When it is done, your house leaves for the stars.`
      : `Your next age is the ${ERAS[p.era + 1].name}: ${era.lore} Lore, ${era.cost} Embers and ${era.time} seconds at your Hearth. ${ERAS[p.era + 1].brings}`,
    'Put out every rival Hearth before any Ark rises, and the crown is yours at once. Otherwise it is decided among the stars: a house whose Ark has left is gone ahead, not beaten.',
    'A new age upgrades every unit you have, wherever it stands, and brings a Boon of its own.',
  ];
  for (const t of lines) {
    for (const l of wrap(t, cw, 'main')) {
      if (ly > bottom - 10) return;
      text(g, l, cx, ly, PAL.dusk);
      ly += 10;
    }
    ly += 3;
  }
}
