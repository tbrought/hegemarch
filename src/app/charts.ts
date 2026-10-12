import type { Game, HistorySample } from '../game/Game';
import { LEVEL_STEP, POWER_BOON, POWER_WRECK } from '../game/constants';
import { BUILD_ORDER, isWarship, UNITS } from '../game/data/units';
import type { UnitType } from '../game/types';
import { esc } from '../ui/format';

/**
 * The graphs of a run's results: how every house stood, minute by minute (`Game.history`).
 *
 * Four small line charts on one time axis, one per figure: no chart has two scales. A large sector has
 * six houses, and six house colours cannot all be told apart on one chart (gold, ember and red fall
 * together for a colour-blind reader, whatever their lightness), so the charts use emphasis: the
 * player's house in its colour, one rival of the player's choosing in its colour, the others grey. The
 * two coloured lines are named where they end, every house is named in the read-out under the pointer,
 * and the figures are there as a table: nothing is told by colour alone.
 */

export interface ChartHouse {
  f: number;
  name: string;
  /** For the end of a line: "You", "Vael". */
  short: string;
  color: string;
  you: boolean;
}

export interface RunCharts {
  houses: ChartHouse[];
  samples: HistorySample[];
  /** The rival drawn in its colour beside the player (-1: none). */
  pick: number;
}

type Key = 'e' | 'w' | 's' | 'b';

const METRICS: { key: Key; title: string; what: string; whole: boolean; fmt: (v: number) => string }[] = [
  { key: 'e', title: 'EMBERS PER SECOND', what: 'What a house’s worlds earn each second.', whole: false, fmt: (v) => v.toFixed(1) },
  { key: 'w', title: 'WORLDS', what: 'The worlds a house holds.', whole: true, fmt: (v) => String(Math.round(v)) },
  { key: 's', title: 'FLEET STRENGTH', what: 'The power of all a house’s warships, added up. How it is counted is under the charts.', whole: true, fmt: (v) => String(Math.round(v)) },
  { key: 'b', title: 'BOONS', what: 'The Boons a house has chosen.', whole: true, fmt: (v) => String(Math.round(v)) },
];

const time = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/** What the results need to draw a run. Null for a run too short to draw (or a save from before 1.12). */
export function runCharts(g: Game): RunCharts | null {
  const samples = g.history;
  if (samples.length < 3) return null;
  const houses: ChartHouse[] = g.empires().map((f) => ({
    f: f.id,
    name: f.name,
    short: f.id === g.playerId ? 'You' : f.name.replace(/^(The|House) /i, '').split(' ')[0],
    color: f.color,
    you: f.id === g.playerId,
  }));
  // Beside the player: the house that won, or else the rival that held the most worlds at its height.
  const o = g.outcome;
  let pick = o && o.winner >= 0 && o.winner !== g.playerId && houses.some((h) => h.f === o.winner) ? o.winner : -1;
  if (pick < 0) {
    let most = -1;
    for (const h of houses) {
      if (h.you) continue;
      const peak = Math.max(0, ...samples.map((s) => s.h.find((x) => x.f === h.f)?.w ?? 0));
      if (peak > most) {
        most = peak;
        pick = h.f;
      }
    }
  }
  return { houses, samples, pick };
}

/**
 * How fleet strength is counted (`Game.unitPower`), for the page to say: the power of each kind of
 * warship, and what raises and lowers it. Read from the game's own numbers, so the words cannot drift
 * from the sum.
 */
export function strengthParts(): { ships: { type: UnitType; name: string; power: number }[]; wreck: number; boon: number; level: number } {
  const types: UnitType[] = [...BUILD_ORDER.filter(isWarship), 'ark'];
  return {
    ships: types.map((t) => ({ type: t, name: UNITS[t].name, power: UNITS[t].power })),
    wreck: POWER_WRECK,
    boon: POWER_BOON,
    level: LEVEL_STEP,
  };
}

const pc = (x: number) => `${Math.round(x * 100)}%`;

/**
 * The note under the charts. "Fleet strength 195" is a number without a unit: the third playtest's
 * host asked what it meant. So the page shows the sum: what each warship adds, with its picture (`pic`
 * draws a ship in the player's colour), and the three things that change it.
 */
function strengthNote(c: RunCharts, pic?: (type: UnitType, color: string) => string): string {
  const s = strengthParts();
  const color = c.houses.find((h) => h.you)?.color ?? '#fff4e0';
  return `<div class="rc-note">
      <h4>HOW FLEET STRENGTH IS COUNTED</h4>
      <p>A house's fleet strength is the power of all its warships, added up:</p>
      <ul class="rc-ships">${s.ships.map((x) => `<li>${pic ? pic(x.type, color) : ''}<span>${esc(x.name)}</span><b>${x.power}</b></li>`).join('')}</ul>
      <ul class="rc-rules">
        <li><b>Damage counts.</b> A ship at full hull and shields counts in full; one that is nearly destroyed counts ${pc(s.wreck)}.</li>
        <li><b>Boons count.</b> Every +10% damage or hull from a house's Boons adds ${pc(s.boon * 0.1)}.</li>
        <li><b>Levels count.</b> Each level of an Ark or a Dreadnought adds ${pc(s.level)}.</li>
      </ul>
      <p class="dim">Not counted: Scouts, seed ships, Starbases and the guns of worlds.</p>
    </div>`;
}

/** The section's markup. The charts themselves are drawn by `mountCharts`, to the width they are given. */
export function chartsHtml(c: RunCharts, pic?: (type: UnitType, color: string) => string): string {
  const you = c.houses.find((h) => h.you);
  const rivals = c.houses.filter((h) => !h.you);
  // The table: every five minutes and the end.
  const every = 300;
  const rows = c.samples.filter((s, i) => i === c.samples.length - 1 || Math.abs(s.t - Math.round(s.t / every) * every) < 1);
  const tables = METRICS.map(
    (m) => `<div class="rc-table"><table><caption>${esc(m.title)}</caption>
      <tr><th scope="col">Time</th>${c.houses.map((h) => `<th scope="col">${esc(h.you ? `${h.name} (you)` : h.name)}</th>`).join('')}</tr>
      ${rows.map((s) => `<tr><th scope="row">${time(s.t)}</th>${c.houses.map((h) => { const x = s.h.find((v) => v.f === h.f); return `<td>${x ? m.fmt(x[m.key]) : '—'}</td>`; }).join('')}</tr>`).join('')}
    </table></div>`,
  ).join('');
  return `<div class="px-box run-charts" id="run-charts">
    <h3>THE RUN, MINUTE BY MINUTE</h3>
    <div class="rc-legend">
      ${you ? `<span class="rc-you"><i class="rc-key" style="--c:${you.color}"></i>${esc(you.name)} <span class="dim">(you)</span></span>` : ''}
      ${rivals.length ? `<span class="rc-with">COMPARE WITH</span>${rivals.map((h) => `<button class="small rc-pick" data-f="${h.f}" aria-pressed="${h.f === c.pick}" style="--c:${h.color}"><i class="rc-key"></i>${esc(h.name)}</button>`).join('')}` : ''}
      <span class="rc-rest"><i class="rc-key rest"></i>the other houses</span>
    </div>
    <div class="rc-grid">${METRICS.map((m) => `<figure class="rc-chart" data-key="${m.key}"><figcaption data-tip="${esc(m.what)}">${esc(m.title)}</figcaption><div class="rc-plot" tabindex="0" role="img" aria-label="${esc(`${m.title} of every house over the run. ${m.what} The figures are in the table below.`)}"></div></figure>`).join('')}</div>
    <div class="rc-tip" hidden></div>
    ${strengthNote(c, pic)}
    <details class="rc-tables"><summary>THE FIGURES AS A TABLE</summary><div class="rc-tables-in">${tables}</div></details>
  </div>`;
}

const SVG = 'http://www.w3.org/2000/svg';
const el = (tag: string, attrs: Record<string, string | number>, text?: string): SVGElement => {
  const e = document.createElementNS(SVG, tag);
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  if (text !== undefined) e.textContent = text;
  return e;
};

/**
 * A round number at or above `v`, and the step of its ticks (three or four of them). `whole`: the figure
 * is counted (worlds, Boons), so its ticks are whole numbers.
 */
export function scale(v: number, whole = false): { max: number; step: number } {
  if (v <= 0) return { max: 1, step: 1 };
  const raw = v / 3;
  const pow = 10 ** Math.floor(Math.log10(raw));
  let step = [1, 2, 2.5, 5, 10].map((k) => k * pow).find((s) => s >= raw && (!whole || Number.isInteger(s))) ?? 10 * pow;
  if (whole) step = Math.max(1, step);
  return { max: Math.max(step, Math.ceil(v / step - 1e-9) * step), step };
}

/** Draw the charts into the section and make them answer the pointer and the keyboard. */
/** The room about a chart's plot: its scale at the left, the names at the ends of its lines at the right. */
const M = { l: 34, r: 78, t: 8, b: 20 };

/**
 * What the charts of a run show at the moment: the rival that is compared, and the sample under the
 * crosshair (-1: none) with the chart it is read in.
 */
interface ChartView {
  pick: number;
  at: number;
  hover: Key | null;
}

export function mountCharts(root: HTMLElement, c: RunCharts): void {
  const box = root.querySelector<HTMLElement>('#run-charts');
  if (!box) return;
  const tip = box.querySelector<HTMLElement>('.rc-tip')!;
  const plots = [...box.querySelectorAll<HTMLElement>('.rc-chart')];
  const T = c.samples[c.samples.length - 1].t || 1;
  const view: ChartView = { pick: c.pick, at: -1, hover: null };

  const draw = () => {
    for (const fig of plots) drawChart(fig, c, view, T);
    for (const b of box.querySelectorAll<HTMLElement>('.rc-pick')) b.setAttribute('aria-pressed', String(Number(b.dataset.f) === view.pick));
  };
  const read = (fig: HTMLElement, px: number, py: number) => readOut(box, tip, fig, c, view, px, py);
  for (const fig of plots) listen(fig, c, view, T, tip, draw, read);
  for (const b of box.querySelectorAll<HTMLElement>('.rc-pick')) {
    b.addEventListener('click', () => {
      view.pick = Number(b.dataset.f);
      c.pick = view.pick;
      draw();
    });
  }
  draw();
  // Drawn to the width they have: again when that changes.
  if (typeof ResizeObserver === 'function') {
    let w = box.clientWidth;
    const ro = new ResizeObserver(() => {
      if (!box.isConnected) {
        ro.disconnect();
        return;
      }
      if (box.clientWidth !== w) {
        w = box.clientWidth;
        draw();
      }
    });
    ro.observe(box);
  }
}

/**
 * What a chart answers to: the pointer over it (the crosshair goes to the nearest sample, and the
 * read-out with it), and the keyboard (the arrows move through the run).
 */
function listen(fig: HTMLElement, c: RunCharts, view: ChartView, T: number, tip: HTMLElement, draw: () => void, read: (fig: HTMLElement, px: number, py: number) => void) {
  const host = fig.querySelector<HTMLElement>('.rc-plot')!;
  const key = fig.dataset.key as Key;
  // (Entering counts too: a chart can come under a pointer that does not move, when the page scrolls.)
  const point = (e: PointerEvent) => {
    view.at = nearestSample(host, c, T, e.clientX);
    view.hover = key;
    draw();
    const r = host.getBoundingClientRect();
    read(fig, e.clientX - r.left, e.clientY - r.top);
  };
  host.addEventListener('pointermove', point);
  host.addEventListener('pointerenter', point);
  host.addEventListener('pointerleave', () => {
    view.at = -1;
    view.hover = null;
    draw();
    tip.hidden = true;
  });
  // The keyboard reads what the pointer reads: the arrows move through the run.
  const place = () => {
    const r = host.getBoundingClientRect();
    read(fig, M.l + (c.samples[view.at].t / T) * (r.width - M.l - M.r), M.t + 20);
  };
  host.addEventListener('focus', () => {
    if (view.at < 0) view.at = c.samples.length - 1;
    view.hover = key;
    draw();
    place();
  });
  host.addEventListener('blur', () => {
    view.at = -1;
    view.hover = null;
    draw();
    tip.hidden = true;
  });
  host.addEventListener('keydown', (e) => {
    const step = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : e.key === 'Home' ? -1e9 : e.key === 'End' ? 1e9 : 0;
    if (!step) return;
    e.preventDefault();
    e.stopPropagation();
    view.at = Math.min(c.samples.length - 1, Math.max(0, (view.at < 0 ? c.samples.length - 1 : view.at) + step));
    view.hover = key;
    draw();
    place();
  });
}

/** The sample of the run nearest to a place across a chart. */
function nearestSample(host: HTMLElement, c: RunCharts, T: number, clientX: number): number {
  const r = host.getBoundingClientRect();
  const pw = r.width - M.l - M.r;
  const t = Math.min(T, Math.max(0, ((clientX - r.left - M.l) / Math.max(1, pw)) * T));
  let best = 0;
  for (let i = 1; i < c.samples.length; i++) if (Math.abs(c.samples[i].t - t) < Math.abs(c.samples[best].t - t)) best = i;
  return best;
}

/** The read-out beside the pointer: the time under the crosshair, then every house, the highest figure first. */
function readOut(box: HTMLElement, tip: HTMLElement, fig: HTMLElement, c: RunCharts, view: ChartView, px: number, py: number) {
  if (view.at < 0 || !view.hover) {
    tip.hidden = true;
    return;
  }
  const m = METRICS.find((x) => x.key === view.hover)!;
  const s = c.samples[view.at];
  tip.replaceChildren();
  const head = document.createElement('div');
  head.className = 'rc-tip-head';
  head.textContent = `${m.title} · ${time(s.t)}`;
  tip.append(head);
  const list = c.houses.map((h) => ({ h, v: s.h.find((x) => x.f === h.f) })).sort((a, b) => (b.v ? b.v[m.key] : -1) - (a.v ? a.v[m.key] : -1));
  for (const { h, v } of list) {
    const row = document.createElement('div');
    row.className = 'rc-tip-row';
    const key = document.createElement('i');
    key.className = h.you || h.f === view.pick ? 'rc-key' : 'rc-key rest';
    if (h.you || h.f === view.pick) key.style.setProperty('--c', h.color);
    const val = document.createElement('b');
    val.textContent = v ? m.fmt(v[m.key]) : '—';
    const name = document.createElement('span');
    name.textContent = h.you ? `${h.name} (you)` : v ? h.name : `${h.name} (out)`;
    row.append(key, val, name);
    tip.append(row);
  }
  tip.hidden = false;
  // Beside the pointer, inside the section, never under it.
  const b = box.getBoundingClientRect();
  const f = fig.getBoundingClientRect();
  const w = tip.offsetWidth;
  let x = f.left - b.left + px + 14;
  if (x + w > b.width - 8) x = f.left - b.left + px - w - 14;
  tip.style.left = `${Math.max(8, x)}px`;
  tip.style.top = `${Math.max(8, f.top - b.top + py - 10)}px`;
}

/**
 * One chart, drawn to the width it has: the grid and its round numbers, a line for every house (the
 * player's and the compared rival's in colour, over the others in grey), their names where they end,
 * and the crosshair.
 */
function drawChart(fig: HTMLElement, c: RunCharts, view: ChartView, T: number) {
  const rank = (h: ChartHouse) => (h.you ? 2 : h.f === view.pick ? 1 : 0);
  const key = fig.dataset.key as Key;
  const m = METRICS.find((x) => x.key === key)!;
  const host = fig.querySelector<HTMLElement>('.rc-plot')!;
  const W = Math.max(220, Math.floor(host.clientWidth));
  const H = 150;
  const pw = W - M.l - M.r;
  const ph = H - M.t - M.b;
  const top = Math.max(0, ...c.samples.flatMap((s) => s.h.map((x) => x[key])));
  const { max, step } = scale(top, m.whole);
  const X = (t: number) => M.l + (t / T) * pw;
  const Y = (v: number) => M.t + ph - (v / max) * ph;
  const svg = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
  // The grid: solid hairlines, one shade off the surface, and round numbers beside them.
  for (let v = 0; v <= max + 1e-9; v += step) {
    svg.append(el('line', { x1: M.l, x2: M.l + pw, y1: Math.round(Y(v)) + 0.5, y2: Math.round(Y(v)) + 0.5, class: 'rc-grid-line' }));
    svg.append(el('text', { x: M.l - 5, y: Y(v) + 4, class: 'rc-tick', 'text-anchor': 'end' }, m.fmt(v).replace(/\.0$/, '')));
  }
  // (Times far enough apart to be read: at least fifty pixels between two of them.)
  const tick = [300, 600, 900, 1200, 1800, 3600].find((s) => (s / T) * pw >= 50) ?? 3600;
  let lastTick = 0;
  for (let t = 0; t <= T + 1e-6; t += tick) {
    svg.append(el('text', { x: X(t), y: H - 5, class: 'rc-tick', 'text-anchor': t === 0 ? 'start' : 'middle' }, time(t)));
    lastTick = t;
  }
  // (And when the run ended, if that is not beside the last of them.)
  if (X(T) - X(lastTick) >= 44) svg.append(el('text', { x: X(T), y: H - 5, class: 'rc-tick', 'text-anchor': 'end' }, time(T)));
  // The lines: the other houses in grey underneath, then the rival that is compared, then the player.
  const order = [...c.houses].sort((a, b) => rank(a) - rank(b));
  const ends: { h: ChartHouse; x: number; y: number; v: number }[] = [];
  for (const h of order) {
    const pts = c.samples.map((s) => ({ t: s.t, x: s.h.find((v) => v.f === h.f) })).filter((p) => p.x);
    if (pts.length < 2) continue;
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)} ${Y(p.x![key]).toFixed(1)}`).join('');
    const lit = h.you || h.f === view.pick;
    svg.append(el('path', { d, class: lit ? 'rc-line' : 'rc-line rest', ...(lit ? { stroke: h.color } : {}) }));
    const lastP = pts[pts.length - 1];
    if (lit) ends.push({ h, x: X(lastP.t), y: Y(lastP.x![key]), v: lastP.x![key] });
  }
  // Where a coloured line ends: a dot ringed in the surface, and its name and figure. If the two
  // would sit on top of each other, the rival's gives way (the legend and the read-out still name it).
  const youEnd = ends.find((e) => e.h.you);
  for (const e of ends) {
    svg.append(el('circle', { cx: e.x, cy: e.y, r: 4, fill: e.h.color, class: 'rc-dot' }));
    const clash = !e.h.you && youEnd && Math.abs(youEnd.y - e.y) < 13 && Math.abs(youEnd.x - e.x) < M.r;
    const room = e.x + 8 + 60 <= W;
    if (!clash && room) svg.append(el('text', { x: e.x + 8, y: e.y + 4, class: e.h.you ? 'rc-end you' : 'rc-end' }, `${e.h.short} ${m.fmt(e.v)}`));
  }
  // The crosshair, at the sample that is read.
  if (view.at >= 0) {
    const x = Math.round(X(c.samples[view.at].t)) + 0.5;
    svg.append(el('line', { x1: x, x2: x, y1: M.t, y2: M.t + ph, class: 'rc-cross' }));
    for (const e of order) {
      const v = c.samples[view.at].h.find((s) => s.f === e.f);
      if (v && (e.you || e.f === view.pick)) svg.append(el('circle', { cx: X(c.samples[view.at].t), cy: Y(v[key]), r: 4, fill: e.color, class: 'rc-dot' }));
    }
  }
  host.replaceChildren(svg);
}
