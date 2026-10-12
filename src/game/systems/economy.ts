import type { Game } from '../Game';
import { ECON } from '../data/worlds';
import { mul } from '../mods';
import type { Faction } from '../types';
import { isHearth, recomputeHangar } from '../worldStats';

export function economyTick(g: Game, dt: number) {
  const nF = g.factions.length;
  const embers = new Float64Array(nF);
  const lore = new Float64Array(nF);
  const worlds = new Int32Array(nF);

  for (const n of g.nodes) {
    if (n.kind !== 'planet' || n.owner < 0) continue;
    const f = g.factions[n.owner];
    if (f.kind !== 'empire' || g.asleep(f.id)) continue;
    worlds[f.id]++;
    if (n.glow < 1) n.glow = Math.min(1, n.glow + ((1 - ECON.glowStart) / ECON.glowTime) * mul(f.mods.glowRate) * dt);
    if (n.retool > 0) {
      n.retool = Math.max(0, n.retool - dt);
      if (n.retool <= 0) g.refreshWorld(n);
    }
    embers[f.id] += g.worldEmbers(n);
    lore[f.id] += g.worldLore(n);
  }

  for (const f of g.factions) {
    if (f.kind !== 'empire' || !f.alive || g.asleep(f.id)) continue;
    const fm = f.mods;
    const boom = f.boomT > 0 ? 1.4 : 1;
    f.income = embers[f.id] * mul(fm.embers) * boom * f.incomeMul;
    f.loreRate = lore[f.id] * mul(fm.lore) * f.incomeMul;
    f.embers += f.income * dt;
    f.stats.embersEarned += f.income * dt;
    f.lore += f.loreRate * dt;
    let guard = 0;
    while (!g.cradle && f.lore >= g.boonCostOf(f) && guard++ < 5) {
      f.lore -= g.boonCostOf(f);
      f.boons++;
      f.pendingDrafts++;
      if (f.isPlayer) g.notify(f.id, 'Your Lore is full: a Boon is ready! (B)', 'good');
    }
    f.stats.maxWorlds = Math.max(f.stats.maxWorlds, worlds[f.id]);
    f.stats.maxRelics = Math.max(f.stats.maxRelics, f.relics.length);

    // Timed effects
    if (f.boomT > 0) f.boomT = Math.max(0, f.boomT - dt);
    const interest = fm.flags.interest ?? 0;
    if (interest > 0) {
      f.interestT += dt;
      if (f.interestT >= 30) {
        f.interestT = 0;
        const gain = Math.min(200, f.embers * interest);
        f.embers += gain;
        if (gain >= 15) g.notify(f.id, `Banking Clans: +${Math.round(gain)} Embers in interest.`, 'info');
      }
    }
    if ((fm.flags.echo ?? 0) > 0 && f.capital >= 0) {
      f.echoT += dt;
      if (f.echoT >= 150) {
        f.echoT = 0;
        for (let i = 0; i < 2; i++) g.spawnUnit('guardian', f.id, f.capital);
        g.notify(f.id, 'Echo Fleet: two Guardians arrive at your Hearth.', 'good', f.capital);
      }
    }
    if ((fm.flags.storm ?? 0) > 0) {
      f.stormT += dt;
      if (f.stormT >= 15) {
        f.stormT = 0;
        stormStrike(g, f);
      }
    }
  }

  if (g.tick % 10 === 0) for (const f of g.factions) recomputeHangar(g, f);
  // Hearth walls rise through the opening.
  if (g.tick % 20 === 0 && g.time <= ECON.wallsTime + 1) for (const n of g.nodes) if (isHearth(n)) g.refreshWorld(n);
  for (const n of g.nodes) {
    if (n.militiaCd > 0) n.militiaCd -= dt;
  }
}

function stormStrike(g: Game, f: Faction) {
  for (let nid = 0; nid < g.nodes.length; nid++) {
    const b = g.buckets[nid];
    if (!b.some((u) => u.owner === f.id)) continue;
    const enemies = b.filter((u) => !u.dead && g.hostile(u.owner, f.id));
    if (enemies.length === 0) continue;
    g.rng.shuffle(enemies);
    for (const e of enemies.slice(0, 3)) {
      if (g.fxEnabled) g.fx.push({ k: 'beam', x1: e.x + (Math.random() - 0.5) * 120, y1: e.y - 420, x2: e.x, y2: e.y, color: '#3fa7ff', w: 3, node: nid });
      g.damageUnit(e, 300, 'energy', f.id, null);
    }
  }
}
