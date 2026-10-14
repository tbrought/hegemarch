import type { Game } from '../Game';
import { UNITS } from '../data/units';

/**
 * Recompute what every house can currently see. Owned worlds light their neighbours; the Hearth and
 * Observatories see one starlane further; scouts and the Ark light the worlds next to them.
 *
 * A Starfall lights the whole system it is armed in for its house, and goes on doing so while the star
 * it set alight burns (1.18). Until then its house saw the star alone while the fuse ran, and nothing
 * once the device was gone: it paid 2,500 Embers for an eruption and was told the result in a note.
 */
export function visibilityTick(g: Game) {
  for (const f of g.factions) {
    if (f.kind !== 'empire' || !f.alive) continue;
    const vis = f.visible;
    vis.fill(0);
    /** The systems its Starfall lights. */
    let lit: number[] | null = null;
    for (const n of g.nodes) {
      if (n.hazard && n.hazard.by === f.id) (lit ??= []).push(n.system);
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
        if (u.fuse !== undefined) (lit ??= []).push(g.nodes[u.node].system);
        const role = UNITS[u.type].role;
        if (role === 'scout' || u.type === 'ark') for (const nb of g.nodes[u.node].lanes) vis[nb] = 1;
      } else if (u.lane && u.lane.t > 0.85) {
        vis[u.lane.to] = 1;
      }
    }
    if (lit) for (const n of g.nodes) if (lit.includes(n.system)) vis[n.id] = 1;
    for (let i = 0; i < vis.length; i++) {
      if (vis[i]) {
        f.explored[i] = 1;
        f.seenOwner[i] = g.nodes[i].owner;
      }
    }
  }
}
