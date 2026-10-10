import type { Game } from '../Game';
import { UNITS } from '../data/units';

/**
 * Recompute what every house can currently see. Owned worlds light their neighbours; the Hearth and
 * Observatories see one starlane further; scouts and the Ark light the worlds next to them.
 */
export function visibilityTick(g: Game) {
  for (const f of g.factions) {
    if (f.kind !== 'empire' || !f.alive) continue;
    const vis = f.visible;
    vis.fill(0);
    for (const n of g.nodes) {
      if (n.owner !== f.id) continue;
      vis[n.id] = 1;
      const far = g.hasRole(n, 'observatory');
      for (const nb of n.lanes) {
        vis[nb] = 1;
        if (far) for (const nb2 of g.nodes[nb].lanes) vis[nb2] = 1;
      }
    }
    for (const u of g.unitList) {
      if (u.dead || u.owner !== f.id) continue;
      if (u.node >= 0) {
        vis[u.node] = 1;
        const role = UNITS[u.type].role;
        if (role === 'scout' || u.type === 'ark') for (const nb of g.nodes[u.node].lanes) vis[nb] = 1;
      } else if (u.lane && u.lane.t > 0.85) {
        vis[u.lane.to] = 1;
      }
    }
    for (let i = 0; i < vis.length; i++) {
      if (vis[i]) {
        f.explored[i] = 1;
        f.seenOwner[i] = g.nodes[i].owner;
      }
    }
  }
}
