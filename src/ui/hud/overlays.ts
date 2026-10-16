/**
 * What the HUD draws over the map: the badge of each fleet (a click selects it), arrows at the edge of
 * the screen toward a world under attack, the buttons for what waits to be decided, the comms log, and
 * the minimap.
 */

import { UNITS } from '../../game/data/units';
import { burning } from '../../game/starfall';
import type { Unit } from '../../game/types';
import { fit, text, textWidth, wrap } from '../../render/font';
import { PAL, shade } from '../../render/palette';
import { bar, box, frame } from '../../render/pixel';
import { SPRITE_ZOOM } from '../../render/Renderer';
import { fleetBadge, icon } from '../../render/sprites';
import { destinyClocks } from './destinies';
import { fleetSummary, jumpWait, jumpWaitText } from './fleetCard';
import type { Hud } from '../Hud';
import { isHearth } from '../../game/worldStats';
import { drawNews, newsColor } from '../news';


/** The number on the player's fleet badge at a world, as the map shows it ("" for none). */
export function fleetLabel(hud: Hud, node: number): string {
  const n = node >= 0 ? hud.s.fleetAt(node).length : 0;
  return n > 0 ? String(n) : '';
}

export function drawAttackArrows(hud: Hud) {
  const g = hud.s.screen.g;
  const game = hud.g;
  const r = hud.s.renderer;
  const W = hud.W;
  const H = hud.H;
  const blink = Math.floor(hud.ui.time * 4) % 2 === 0;
  let shown = 0;
  for (const n of game.worldsOf(game.playerId)) {
    if (n.lastHit > 3 || shown >= 3) continue;
    const sx = r.sx(n.x);
    const sy = r.sy(n.y);
    if (sx >= 4 && sy >= 18 && sx < W - 4 && sy < H - 4) continue;
    // Where the line from the screen's middle to the world leaves the screen, kept clear of the
    // top bar above and the pause label below.
    const top = 24;
    const bottom = H - 26;
    const cx = W / 2;
    const cy = (top + bottom) / 2;
    const dx = sx - cx;
    const dy = sy - cy;
    const k = Math.min((W / 2 - 12) / Math.max(1e-6, Math.abs(dx)), ((bottom - top) / 2) / Math.max(1e-6, Math.abs(dy)));
    const ax = Math.round(cx + dx * k);
    const ay = Math.round(cy + dy * k);
    const name = Math.abs(dx) * ((H - 16) / W) > Math.abs(dy) ? (dx > 0 ? 'arrowRight' : 'arrowLeft') : dy > 0 ? 'arrowDown' : 'arrowUp';
    const horizontal = name === 'arrowLeft' || name === 'arrowRight';
    const iw = horizontal ? 4 : 7;
    const ih = horizontal ? 7 : 4;
    const id = 'attack-' + n.id;
    const hot = hud.ui.isHot(id);
    box(g, ax - 6, ay - 6, 13, 13, hot ? PAL.wine : PAL.void, blink || hot ? PAL.red : PAL.wine);
    icon(g, name, ax - (iw >> 1), ay - (ih >> 1), blink || hot ? PAL.red : PAL.wine, true);
    hud.ui.hit(id, ax - 6, ay - 6, 13, 13, () => hud.s.focusNode(n.id), `${n.name} is under attack! Click to look.`);
    shown++;
  }
}

export function drawIndicators(hud: Hud) {
  const g = hud.s.screen.g;
  let y = 31;
  // (Where the column reaches: its left edge and its foot. A herald keeps clear of it.)
  let left = hud.W;
  const reach = (w: number) => (left = Math.min(left, hud.W - 3 - w));
  for (const c of destinyClocks(hud).slice(0, 3)) {
    const w = textWidth(c.text, 'tiny') + 10;
    const x = hud.W - 3 - w;
    reach(w);
    const b = hud.bannerRect;
    if (b.w > 0 && x < b.x + b.w + 2 && y < b.y + b.h + 2) y = b.y + b.h + 2;
    const seen = c.node >= 0 && hud.s.explored(c.node);
    // (Whose it is, in that house's colour: its frame, and its name in the words, the rest in a colour no
    // house wears. Until 1.23.6 a rival's clock was all in red, Vael Imperium's colour, and the player's own
    // in gold, the Solar Concord's: a playtester playing Vael read a rival's countdown as his own.)
    const whose = hud.g.factions[c.fid]?.color ?? PAL.bone;
    hud.ui.button(g, c.id, x, y, w, 11, c.text, () => seen && hud.s.focusNode(c.node), {
      font: 'tiny', color: PAL.bone, border: whose, primary: !c.mine, pulse: c.left < 30, tip: `${c.tip}${seen ? ' Click to look.' : ''}`,
      drawLabel: (gg, s, lx, ly, col, font) => drawNews(gg, hud.g, s, lx, ly, col, false, font, true),
    });
    y += 13;
  }
  y = hud.goals.draw(g, hud.W - 3, y, hud.bannerRect);
  if (hud.goals.rect.w) reach(hud.goals.rect.w);
  const pending = hud.g.prompts.filter((x) => x.result === undefined);
  if (pending.length) {
    const label = pending.length > 1 ? `! ${pending.length} DECISIONS` : '! DECISION';
    const w = textWidth(label, 'tiny') + 10;
    reach(w);
    hud.ui.button(g, 'prompt', hud.W - 3 - w, y, w, 11, label, () => hud.modals.open({ kind: 'event', promptId: pending[0].id }), {
      primary: true, pulse: true, font: 'tiny', color: PAL.violet, tip: 'An anomaly or a visitor is waiting for your decision.',
    });
    y += 13;
  }
  const tipAt = y;
  y = hud.tips.drawIndicator(g, hud.W - 3, y);
  if (y > tipAt) reach(textWidth('9 TIPS', 'tiny') + 20);
  for (const u of hud.g.unitList) {
    if (u.dead || u.owner !== hud.g.playerId || !u.pendingAbil.length) continue;
    const label = `${u.type === 'ark' ? 'ARK' : 'DREAD'} LEVEL ${u.level}!`;
    const w = textWidth(label, 'tiny') + 10;
    reach(w);
    hud.ui.button(g, 'abil-' + u.id, hud.W - 3 - w, y, w, 11, label, () => hud.modals.open({ kind: 'ability', unitId: u.id }), {
      primary: true, pulse: true, font: 'tiny', tip: `Your ${u.type === 'ark' ? 'Ark' : 'Dreadnought'} reached level ${u.level} and can learn a ` +
          `new ability. Click to choose.`,
    });
    y += 13;
    if (y > 70) break;
  }
  hud.columnRect = left < hud.W ? { x: left, y: 31, w: hud.W - left, h: y - 31 } : { x: 0, y: 0, w: 0, h: 0 };
}

export function drawBadges(hud: Hud) {
  const g = hud.s.screen.g;
  const game = hud.g;
  const r = hud.s.renderer;
  const z = r.cam.zoom;
  const pid = game.playerId;
  // Ships at worlds.
  for (const n of game.nodes) {
    if (!hud.s.visible(n.id)) continue;
    const b = game.buckets[n.id];
    if (!b.length) continue;
    const counts = new Map<number, number>();
    for (const u of b) {
      if (u.dead || u.type === 'fighter' || UNITS[u.type].isStatic || hud.s.onMission(u)) continue;
      counts.set(u.owner, (counts.get(u.owner) ?? 0) + 1);
    }
    if (!counts.size) continue;
    const nx = r.sx(n.x);
    const ny = r.sy(n.y);
    const nr = r.nodeR(n);
    if (nx < -40 || ny < -40 || nx > hud.W + 40 || ny > hud.H + 40) continue;
    let by = ny - 4 - (counts.size > 1 ? 5 : 0);
    const owners = [...counts.keys()].sort((a, b2) => (a === pid ? -1 : b2 === pid ? 1 : a - b2));
    for (const o of owners) {
      const f = game.factions[o];
      const label = String(counts.get(o));
      const w = textWidth(label, 'tiny') + (o === pid ? 9 : 6);
      const bx = nx + nr + (nr > 6 ? 6 : 4);
      const id = o === pid ? 'fleet-' + n.id : 'efleet-' + n.id + '-' + o;
      const hot = hud.ui.isHot(id);
      const sel = o === pid && fleetSelectedAt(hud, n.id);
      fleetBadge(g, bx, by, label, f.color, { own: o === pid, fill: o === pid ? (sel ? PAL.indigo : PAL.night) : PAL.void, border: sel || hot ? PAL.bone : f.color });
      // Ships of ours charging their drives to jump: a bar under the badge fills as they charge.
      const wait = o === pid ? jumpWait(hud, hud.s.fleetAt(n.id)) : null;
      if (wait) bar(g, bx, by + 10, w, 1, wait.done, wait.held || wait.fire || wait.snared ? PAL.ember : PAL.sky, PAL.indigo);
      if (o === pid) {
        hud.ui.hit(id, bx - 1, by - 1, w + 2, 11, () => selectFleet(hud, n.id), `${wait ? `${jumpWaitText(wait)}. ` : ''}Your fleet at ${n.name}: ` +
            `${fleetSummary(hud.s.fleetAt(n.id))}. Click to select it, then click a world to send it.`);
      } else {
        const units = b.filter((u) => u.owner === o && !u.dead && u.type !== 'fighter' && !UNITS[u.type].isStatic);
        hud.ui.hit(id, bx - 1, by - 1, w + 2, 11, () => {
          hud.s.selectUnits(units.map((u) => u.id), false, false);
          hud.s.sfx.play('select', 0.4);
        }, `${f.name}: ${fleetSummary(units)}`, () => {
          if (hud.s.ownSelected().length && units[0]) hud.actions.attack(units[0].id);
        });
      }
      by += 11;
    }
  }
  // Our fleets on starlanes: one badge per destination.
  if (z < SPRITE_ZOOM * 3) {
    const groups = new Map<number, Unit[]>();
    for (const u of game.unitList) {
      if (u.dead || u.owner !== pid || !u.lane || u.type === 'fighter' || hud.s.onMission(u)) continue;
      const k = u.dest >= 0 ? u.dest : u.lane.to;
      const list = groups.get(k) ?? [];
      list.push(u);
      groups.set(k, list);
    }
    for (const [dest, list] of groups) {
      let mx = 0;
      let my = 0;
      for (const u of list) {
        mx += u.x;
        my += u.y;
      }
      const x = r.sx(mx / list.length);
      const y = r.sy(my / list.length);
      if (x < -20 || y < -20 || x > hud.W + 20 || y > hud.H + 20) continue;
      const label = String(list.length);
      const w = textWidth(label, 'tiny') + 6;
      const f = game.player;
      box(g, x - (w >> 1), y - 12, w, 9, PAL.night, f.color);
      text(g, label, x - (w >> 1) + 3, y - 10, f.color, 'tiny');
      hud.ui.hit('lfleet-' + dest, x - (w >> 1) - 1, y - 13, w + 2, 11, () => {
        hud.s.selectUnits(list.map((u) => u.id));
        hud.s.sfx.play('select', 0.4);
      }, `${fleetSummary(list)} heading for ${game.nodes[dest].name}.`);
    }
  }
}

function fleetSelectedAt(hud: Hud, node: number): boolean {
  const own = hud.s.ownSelected();
  return own.length > 0 && own.every((u) => u.node === node);
}

function selectFleet(hud: Hud, node: number) {
  const ids = hud.s.fleetAt(node).map((u) => u.id);
  if (!ids.length) return;
  hud.s.selectUnits(ids);
  hud.s.sfx.play('select', 0.5);
}

export function drawLog(hud: Hud) {
  const g = hud.s.screen.g;
  hud.logRight = 0;
  hud.logBottom = 0;
  const recent = hud.log.filter((l) => hud.clock - l.at < 10).slice(-3);
  if (!recent.length) return;
  const maxW = Math.min(230, hud.W - 150);
  let y = hud.cardRect.h > 0 ? hud.cardRect.y - 4 : hud.H - 6;
  const newest = recent[recent.length - 1];
  for (let i = recent.length - 1; i >= 0; i--) {
    const l = recent[i];
    const key = 'log-' + l.id;
    const hot = hud.ui.isHinted(key);
    // Pointing at a line holds it on screen.
    if (hot) l.at = Math.max(l.at, hud.clock - 6);
    const age = hud.clock - l.at;
    // The newest line, and the one under the pointer, are shown whole; the others fold to one line.
    const lines = l === newest || hot ? wrap(l.text, maxW, 'main').slice(0, 4) : [fit(l.text, maxW, 'main')];
    const h = lines.length * 10;
    y -= h;
    const w = Math.max(...lines.map((t) => textWidth(t))) + 6;
    // A flat shade, not a dither: world names on the map would show between the letters.
    // (And it stays as dark while the line ages: only the words fade. Thinned, it let the names through.)
    g.fillStyle = hot ? 'rgba(27, 24, 56, 0.96)' : 'rgba(11, 10, 26, 0.8)';
    g.fillRect(3, y - 1, w, h);
    hud.logRight = Math.max(hud.logRight, 3 + w);
    hud.logBottom = Math.max(hud.logBottom, y + h - 1);
    // (In its colour, and the houses it names in theirs: ui/news.ts.)
    const base = newsColor(hud.g, l);
    const faded = age > 7 && !hot;
    lines.forEach((t, k) => drawNews(g, hud.g, t, 6, y + 1 + k * 10, faded ? shade(base) : base, faded));
    // A hint, not a button: clicks and orders still reach the map under the log.
    hud.ui.hint(key, 3, y - 1, Math.max(w, 40), h, { scan: l.text, beside: true });
  }
}

export function drawMinimap(hud: Hud) {
  const g = hud.s.screen.g;
  const game = hud.g;
  const b = game.bounds;
  const bw = b.maxX - b.minX;
  const bh = b.maxY - b.minY;
  const maxW = Math.min(120, Math.round(hud.W * 0.24));
  const maxH = 70;
  const k = Math.min(maxW / bw, maxH / bh);
  const w = Math.round(bw * k) + 4;
  const h = Math.round(bh * k) + 4;
  const x0 = hud.W - 3 - w;
  const y0 = hud.H - 3 - h;
  hud.minimapRect = { x: x0, y: y0, w, h };
  box(g, x0, y0, w, h, PAL.void, PAL.indigo);
  const mx = (wx: number) => Math.round(x0 + 2 + (wx - b.minX) * k);
  const my = (wy: number) => Math.round(y0 + 2 + (wy - b.minY) * k);
  const p = game.player;
  for (const n of game.nodes) {
    if (!hud.s.explored(n.id)) continue;
    const owner = hud.s.visible(n.id) ? n.owner : p.seenOwner[n.id];
    let c: string = PAL.slate;
    if (n.kind === 'star') c = PAL.indigo;
    if (owner >= 0) c = game.factions[owner].color;
    else if (n.kind === 'planet') c = PAL.slate;
    else if (n.kind === 'anomaly' && n.anomaly) c = PAL.violet;
    else if (n.kind === 'relic' && n.relic) c = PAL.sky;
    else if (n.kind === 'rift') c = PAL.pink;
    g.fillStyle = c;
    const size = isHearth(n) ? 2 : 1;
    g.fillRect(mx(n.x), my(n.y), size, size);
    if (hud.s.visible(n.id) && game.hasHostiles(n.id, p.id) && game.buckets[n.id].some((u) => u.owner === p.id) && Math.floor(hud.clock * 3) % 2 === 0) {
      g.fillStyle = PAL.red;
      g.fillRect(mx(n.x) - 1, my(n.y) - 1, 3, 3);
    }
  }
  // A star with an armed Starfall blinks red, wherever it is: every house is told of one. A star that burns is ember.
  for (const n of game.nodes) {
    if (n.kind !== 'star' || !hud.s.explored(n.id)) continue;
    const armed = !!game.armedAt(n);
    if (!armed && !burning(n)) continue;
    g.fillStyle = armed ? (Math.floor(hud.clock * 4) % 2 === 0 ? PAL.red : PAL.bone) : PAL.ember;
    g.fillRect(mx(n.x) - 1, my(n.y), 3, 1);
    g.fillRect(mx(n.x), my(n.y) - 1, 1, 3);
  }
  // Camera view.
  const cam = hud.s.renderer.cam;
  const vw = (cam.w / cam.zoom) * k;
  const vh = (cam.h / cam.zoom) * k;
  const vx = mx(cam.x) - vw / 2;
  const vy = my(cam.y) - vh / 2;
  const fx = Math.max(x0 + 1, Math.round(vx));
  const fy = Math.max(y0 + 1, Math.round(vy));
  const fw = Math.min(x0 + w - 1, Math.round(vx + vw)) - fx;
  const fh = Math.min(y0 + h - 1, Math.round(vy + vh)) - fy;
  if (fw > 1 && fh > 1) frame(g, fx, fy, fw, fh, PAL.dusk);
  const move = () => {
    const wx = b.minX + (hud.ui.mx - x0 - 2) / k;
    const wy = b.minY + (hud.ui.my - y0 - 2) / k;
    cam.focus(wx, wy);
  };
  hud.ui.add({ id: 'minimap', x: x0, y: y0, w, h, onClick: move, tip: 'The sector. Click to look there.' });
  if (hud.ui.active === 'minimap' && hud.ui.down) move();
}
