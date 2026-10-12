/**
 * The Hall of Heirs: what Legacy buys (houses, perks for every run, rarer Boons), the player's records
 * and the chronicle of their runs.
 */

import { DIFFICULTY_NAMES } from '../../game/constants';
import { PACT_COLOR } from '../../game/data/cards';
import { HEIR_BY_ID, HEIRS } from '../../game/data/heirs';
import { VICTORIES } from '../../game/data/victories';
import { perkDesc, PERKS, perksSpent, UNLOCKS } from '../../meta/legacy';
import { fmtTime } from '../../render/Renderer';
import { esc } from '../../ui/format';
import { glossHtml } from '../../ui/glossary';
import { startingFleet } from '../houseArt';
import { iconPic, shipPic } from '../pics';
import type { App } from '../App';
import { saveProfile } from '../../meta/profile';
import type { ScreenActions } from './index';

/**
 * The picture of each thing the Hall of Heirs sells, drawn with the game's own icons: what it gives, at
 * a glance (Embers, Lore, a Guardian, a Boon, a star, walls, the Hearth; a Pact, a crown).
 */
export function perkPic(id: string): string {
  switch (id) {
    case 'oldCoin': return iconPic('ember');
    case 'loreSeed': return iconPic('lore');
    case 'escort': return shipPic('guardian', HEIR_BY_ID.concord.color);
    case 'archivist': return iconPic('boon');
    case 'luck': return iconPic('star');
    case 'bastion': return iconPic('bastion');
    case 'secondBreath': return iconPic('hearth');
    case 'pacts': return iconPic('catPact', 'pic', PACT_COLOR);
    case 'legendary': return iconPic('conquest');
    default: return iconPic('star');
  }
}

/** Everything in the Hall of Heirs the player does not have yet, cheapest first: its name and its price. */
export function hallShop(app: App): { name: string; cost: number }[] {
  const p = app.profile;
  const out: { name: string; cost: number }[] = [];
  for (const h of HEIRS) if (h.cost > 0 && !p.heirs.includes(h.id)) out.push({ name: h.name, cost: h.cost });
  for (const pk of PERKS) {
    const rank = p.perks[pk.id] ?? 0;
    if (rank < pk.costs.length) out.push({ name: pk.name, cost: pk.costs[rank] });
  }
  for (const u of UNLOCKS) if (!(u.id === 'pacts' ? p.unlockPacts : p.unlockLegendary)) out.push({ name: u.name, cost: u.cost });
  return out.sort((a, b) => a.cost - b.cost);
}

/** How many things in the Hall of Heirs the player's Legacy would buy right now. */
export function hallOffers(app: App): number {
  return hallShop(app).filter((x) => x.cost <= app.profile.legacy).length;
}

export function showHall(app: App) {
  const p = app.profile;
  const heirs = HEIRS.filter((h) => h.cost > 0)
    .map((h) => {
      const owned = p.heirs.includes(h.id);
      // A house here is the card it is on the setup (its banner, its name, what it is, what it has), with
      // its price along the foot: every card the same shape, whatever the length of a name.
      const short = h.cost - p.legacy;
      return `<div class="heir house px-box${owned ? ' owned' : ''}" style="--hc:${h.color}">
          <canvas class="heir-art" data-heir="${h.id}" height="24" data-tip="${esc(`${h.name} starts with ${startingFleet(h)}${h.start.epicCard ? ', and a random Epic Boon' : ''}.`)}"></canvas>
          <div class="hn${h.name.length > 20 ? ' long' : ''}">${esc(h.name.toUpperCase())}</div>
          <div class="ht">${esc(h.title)}</div>
          <div class="hd">${glossHtml(h.desc)}</div>
          <ul>${h.bonuses.map((b) => `<li>${glossHtml(b)}</li>`).join('')}</ul>
          <div class="house-buy">${owned ? '<span class="good">YOURS TO PLAY</span>' : `<span class="dim">${short > 0 ? `${short} more Legacy to go` : 'You have the Legacy for it'}</span><button class="small ${short > 0 ? 'disabled' : 'primary'}" data-sa="unlock-heir:${h.id}">◆${h.cost}</button>`}</div>
        </div>`;
    })
    .join('');
  const perks = PERKS.map((pk) => {
    const rank = p.perks[pk.id] ?? 0;
    const max = pk.costs.length;
    const cost = pk.costs[rank];
    return `<div class="perk px-box"><span class="perk-pic${rank ? ' has' : ''}">${perkPic(pk.id)}</span><div><div class="pn">${esc(pk.name.toUpperCase())} <span class="dim">${rank}/${max}</span></div><div class="pd">${glossHtml(perkDesc(pk, rank))}</div></div>
        ${rank >= max ? '<span class="good">MASTERED</span>' : `<button class="small ${p.legacy >= cost ? 'primary' : 'disabled'}" data-sa="perk:${pk.id}">◆${cost}</button>`}</div>`;
  }).join('');
  const spent = perksSpent(p.perks);
  const refund = spent
    ? (` <button class="small${app.refundAsked ? ' primary' : ''}" data-sa="refund" data-tip="Give back every perk for the Legacy it cost (◆${spent}` +
        `), to spend again as you like. Houses and Forbidden Knowledge are kept.">` +
        `${app.refundAsked ? `SURE? REFUND ◆${spent}` : `REFUND ALL ◆${spent}`}</button>`)
    : '';
  const unlocks = UNLOCKS.map((u) => {
    const owned = u.id === 'pacts' ? p.unlockPacts : p.unlockLegendary;
    return `<div class="perk px-box"><span class="perk-pic${owned ? ' has' : ''}">${perkPic(u.id)}</span><div><div class="pn">${esc(u.name.toUpperCase())}</div><div class="pd">${glossHtml(u.desc)}</div></div>
        ${owned ? '<span class="good">OWNED</span>' : `<button class="small ${p.legacy >= u.cost ? 'primary' : 'disabled'}" data-sa="unlock:${u.id}">◆${u.cost}</button>`}</div>`;
  }).join('');
  const hist = p.history.length
    ? `<table class="history"><tr><th>DATE</th><th>HOUSE</th><th>SECTOR</th><th>RESULT</th><th>TIME</th><th>LEGACY</th></tr>${p.history
        .slice(0, 10)
        .map(
          (r) => `<tr><td>${new Date(r.date).toLocaleDateString()}</td><td style="color:${HEIR_BY_ID[r.heir]?.color}">${esc(HEIR_BY_ID[r.heir]?.name ?? r.heir)}</td>
          <td>${r.size} · ${DIFFICULTY_NAMES[r.difficulty]}${r.daily ? ' · daily' : ''}</td><td class="${r.won ? 'good' : 'bad'}">${r.won ? 'Crowned · ' + (VICTORIES[r.victory as keyof typeof VICTORIES]?.name ?? '') : 'Defeat'}</td>
          <td>${fmtTime(r.time)}</td><td class="gold">+${r.legacy}</td></tr>`,
        )
        .join('')}</table>`
    : '<div class="dim">No runs yet. The first heir is waiting.</div>';
  // The player's records, a line for each kind of run played: the sector's size and the difficulty
  // (and Ages runs apart), in the order of the setup's own buttons.
  const kinds = Object.keys(p.records).map((k) => ({ k, part: k.split(':') })).sort((x, y) =>
    x.part[0].localeCompare(y.part[0]) * -1 || ['small', 'medium', 'large'].indexOf(x.part[1]) - ['small', 'medium', 'large'].indexOf(y.part[1]) || Number(x.part[2]) - Number(y.part[2]));
  const cell = (v: number | undefined, show: (n: number) => string) => `<td>${v === undefined ? '<span class="dim">—</span>' : show(v)}</td>`;
  const records = kinds.length
    ? `<table class="history records"><tr><th>RUN</th><th>FASTEST CROWN</th><th>LONGEST STAND</th><th>WORLDS</th><th>SHIPS DESTROYED</th><th>BOONS</th><th>LEGACY</th></tr>${kinds
        .map(({ k, part }) => {
          const r = p.records[k];
          return `<tr><td>${part[0] === 'ages' ? 'Ages · ' : ''}${part[1][0].toUpperCase() + part[1].slice(1)} · ${DIFFICULTY_NAMES[Number(part[2])] ?? ''}</td>${cell(r.crown, fmtTime)}${cell(r.stand, fmtTime)}${cell(r.worlds, String)}${cell(r.kills, String)}${cell(r.boons, String)}${cell(r.legacy, (n) => `<span class="gold">◆${n}</span>`)}</tr>`;
        })
        .join('')}</table>
        <div class="dim" style="margin-top:8px">The best of each figure, for each kind of run. A run that beats one is told so at its end. (The longest stand is the longest your house lasted in a run it lost.)</div>`
    : '<div class="dim">No records yet: the first run of each kind sets them, and every run after is measured against them.</div>';
  app.put('hall', `<div class="screen${app.crt()}"><div class="page">
      <h1>HALL OF HEIRS</h1>
      <div class="lead">Every heir who falls leaves a legacy for the next. Every run earns Legacy, win or lose; what you buy with it here is yours in every run after. <span class="gl" data-gl="legacy">Legacy</span>: <span class="legacy-badge">◆${p.legacy}</span> <span class="dim">(${p.totalLegacy} earned in all)</span></div>
      <h2>HOUSES</h2><div class="heirs">${heirs}</div>
      <h2 class="h-with">INHERITANCE${refund}</h2><div class="perks">${perks}</div>
      <h2>FORBIDDEN KNOWLEDGE</h2><div class="perks">${unlocks}</div>
      <h2>RECORDS</h2><div class="px-box">${records}</div>
      <h2>CHRONICLE · ${p.runs} RUNS · ${p.wins} ${p.wins === 1 ? 'HEGEMARCH' : 'HEGEMARCHS'} CROWNED</h2><div class="px-box">${hist}</div>
      <div class="foot-actions"><button data-sa="menu">BACK</button><button class="primary" data-sa="setup">NEW RUN</button></div>
    </div></div>`);
}

/** What the buttons of the Hall of Heirs do: what Legacy buys, and giving it all back. */
export const hallActions: ScreenActions = {
  'unlock-heir': (app, arg) => {
    const h = HEIR_BY_ID[arg];
    if (h && !app.profile.heirs.includes(arg) && app.profile.legacy >= h.cost) {
      app.profile.legacy -= h.cost;
      app.profile.heirs.push(arg);
      saveProfile(app.profile);
      app.sfx.play('good', 0.7);
    }
    showHall(app);
  },
  perk: (app, arg) => {
    const perk = PERKS.find((p) => p.id === arg);
    const rank = app.profile.perks[arg] ?? 0;
    if (perk && rank < perk.costs.length && app.profile.legacy >= perk.costs[rank]) {
      app.profile.legacy -= perk.costs[rank];
      app.profile.perks[arg] = rank + 1;
      saveProfile(app.profile);
      app.sfx.play('good', 0.7);
    }
    showHall(app);
  },
  refund: (app) => {
    // Every perk given back for the Legacy it cost, to buy again as the player likes. Asked twice:
    // the first click only asks (a page in this frame cannot open a confirm box).
    const back = perksSpent(app.profile.perks);
    if (back > 0 && app.refundAsked) {
      app.profile.legacy += back;
      app.profile.perks = {};
      saveProfile(app.profile);
      app.sfx.play('good', 0.7);
      app.refundAsked = false;
    } else app.refundAsked = back > 0;
    showHall(app);
  },
  unlock: (app, arg) => {
    const u = UNLOCKS.find((x) => x.id === arg);
    const owned = arg === 'pacts' ? app.profile.unlockPacts : app.profile.unlockLegendary;
    if (u && !owned && app.profile.legacy >= u.cost) {
      app.profile.legacy -= u.cost;
      if (arg === 'pacts') app.profile.unlockPacts = true;
      else app.profile.unlockLegendary = true;
      saveProfile(app.profile);
      app.sfx.play('good', 0.7);
    }
    showHall(app);
  },
};
