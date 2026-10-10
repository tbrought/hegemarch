import type { Game } from '../Game';
import { EVENT_BY_ID, type EventCtx } from '../data/events';
import type { Faction, Unit } from '../types';

export function eventsTick(g: Game, _dt: number) {
  if (g.tick % 10 === 5) anomalyCheck(g);
  if (g.time >= g.nextGalactic) {
    galacticEvent(g);
    g.nextGalactic = g.time + g.rng.float(300, 360);
  }
}

function anomalyCheck(g: Game) {
  for (const n of g.nodes) {
    if (!n.anomaly) continue;
    const b = g.buckets[n.id];
    if (b.length === 0) continue;
    let chosen: Unit | null = null;
    for (const u of b) {
      if (u.dead || u.type === 'fighter') continue;
      const f = g.factions[u.owner];
      if (f.kind !== 'empire') continue;
      // The player's ships look only when sent here: ships passing through and Scouts out exploring fly on.
      if (f.isPlayer && (u.path.length > 0 || u.order === 'explore')) continue;
      if (g.hasHostiles(n.id, u.owner)) continue;
      if (!chosen || (f.isPlayer && !g.factions[chosen.owner].isPlayer)) chosen = u;
    }
    if (!chosen) continue;
    const evId = n.anomaly;
    n.anomaly = null;
    const f = g.factions[chosen.owner];
    if (f.isPlayer) {
      g.prompts.push({ id: g.promptId++, event: evId, node: n.id, unit: chosen.id });
      g.notify(f.id, `Anomaly found at ${n.name}: ${EVENT_BY_ID[evId]?.title ?? ''}`, 'event', n.id, true);
    } else {
      aiResolveEvent(g, f, evId, { node: n.id, unit: chosen.id });
      f.stats.eventsResolved++;
    }
  }
}

export function aiResolveEvent(g: Game, f: Faction, evId: string, ctx: EventCtx) {
  const ev = EVENT_BY_ID[evId];
  if (!ev) return;
  const valid = ev.choices.filter((c) => !c.cond || c.cond(g, f, ctx));
  const active = valid.filter((c) => !c.passive);
  const pick = active.length ? g.rng.pick(active) : valid[0];
  if (pick) pick.run(g, f, ctx);
}

function galacticEvent(g: Game) {
  const kinds = ['tradeBoom', 'solarFlare', 'pirateBounty', 'derelict', 'offer', 'offer', 'offer'];
  const kind = g.rng.pick(kinds);
  const emp = g.aliveEmpires();
  if (emp.length === 0) return;
  switch (kind) {
    case 'tradeBoom': {
      for (const f of emp) f.boomT = 120;
      g.notify(-1, 'Ember Boom! Every house earns 40% more Embers for 2 minutes.', 'event');
      return;
    }
    case 'solarFlare': {
      const stars = g.nodes.filter((n) => n.kind === 'star' && !n.hazard);
      if (!stars.length) return;
      const n = g.rng.pick(stars);
      n.hazard = { warn: 15, t: 10, dps: 70 };
      g.notify(-1, `Solar flare: ${n.name} will erupt in 15 seconds! Ships near it will be scorched.`, 'alert', n.id);
      return;
    }
    case 'pirateBounty': {
      if (!g.pirates.alive) break;
      let leader = emp[0];
      for (const f of emp) if (g.score(f) > g.score(leader)) leader = f;
      g.pirates.marked = leader.id;
      g.pirates.nextRaid = Math.min(g.pirates.nextRaid, g.time + 25);
      g.notify(-1, `The Corsairs have put a bounty on ${leader.name}! A raid is coming.`, leader.isPlayer ? 'alert' : 'event');
      return;
    }
    case 'derelict': {
      const spots = g.nodes.filter((n) => (n.kind === 'star' || (n.kind === 'planet' && n.owner < 0)) && !n.claim && !n.hazard);
      if (!spots.length) return;
      const n = g.rng.pick(spots);
      n.claim = { what: 'derelict', f: -1, t: 0 };
      g.notify(-1, `A derelict Dreadnought has drifted into ${n.name}. Hold it alone for 15 seconds to claim it.`, 'event', n.id);
      return;
    }
  }
  // Offer (also the fallback)
  const evId = g.drawOffer();
  const p = g.player;
  if (p.alive && !g.config.autoplay) {
    g.prompts.push({ id: g.promptId++, event: evId, node: p.capital, unit: -1 });
    g.notify(p.id, `${EVENT_BY_ID[evId]?.title ?? 'A visitor'} hails your Hearth.`, 'event', p.capital, true);
  }
  for (const f of emp) {
    if (f.isPlayer) continue;
    if (g.rng.chance(0.6)) aiResolveEvent(g, f, evId, { node: f.capital, unit: -1 });
  }
}
