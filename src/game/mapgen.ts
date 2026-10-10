import { ECON, PLANETS, sizeForRadius } from './data/worlds';
import { ANOMALY_NAMES, LAND_NAMES, RELIC_SITE_NAMES, STAR_COLORS, STAR_NAMES } from './data/names';
import { RNG } from './rng';
import type { GNode, Lane, MapSize, NodeKind, PlanetType } from './types';
import { dist, roman } from './util';

export interface SystemInfo {
  id: number;
  star: number;
  x: number;
  y: number;
  name: string;
  color: string;
  home: boolean;
  radius: number;
}

export interface MapGenResult {
  nodes: GNode[];
  lanes: Lane[];
  systems: SystemInfo[];
  homes: number[];
  pirateBase: number;
  rift: number;
  relicSites: number[];
  anomalies: number[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface MapGenOptions {
  size: MapSize;
  empires: number;
  crisis: boolean;
}

const SIZE_PARAMS: Record<MapSize, { cores: number; relics: number; homePlanets: [number, number]; corePlanets: [number, number] }> = {
  small: { cores: 1, relics: 3, homePlanets: [5, 6], corePlanets: [6, 7] },
  medium: { cores: 2, relics: 5, homePlanets: [5, 6], corePlanets: [6, 7] },
  large: { cores: 2, relics: 7, homePlanets: [5, 6], corePlanets: [7, 8] },
};

export const EMPIRES_BY_SIZE: Record<MapSize, number> = { small: 3, medium: 4, large: 6 };

const ORBITS = [1150, 1700, 2250, 2800];
const SYSTEM_RADIUS = 3000;

function blankNode(id: number, kind: NodeKind, system: number, x: number, y: number, seed: number): GNode {
  return {
    id, name: '', kind, ptype: null, size: 'M', system, x, y, r: 40, well: 400, lanes: [], seed, starColor: '#ffd23f',
    owner: -1, capitalOf: -1, level: 1, role: null, retool: 0, glow: 1, hp: 0, maxHp: 0, sh: 0, maxSh: 0,
    shipQ: [], buildQ: [], gunCd: 0, lastHit: 999, lastHitBy: -1,
    anomaly: null, relic: null, claim: null, lastStand: false, militiaCd: 0, hazard: null, tag: '', rally: -1,
  };
}

export function setPlanetType(n: GNode, t: PlanetType, rng: RNG, radius?: number) {
  const d = PLANETS[t];
  n.kind = 'planet';
  n.ptype = t;
  n.r = radius ?? rng.float(d.radius[0], d.radius[1]);
  n.well = Math.round(n.r + 380);
  n.size = t === 'gas' ? 'L' : sizeForRadius(n.r);
  n.maxHp = ECON.hp[n.size];
  n.hp = n.maxHp;
  n.maxSh = Math.round(n.maxHp * ECON.shieldFrac);
  n.sh = n.maxSh;
}

/** Relative neighborhood graph edges over a point set (always connected). */
function rngEdges(pts: { x: number; y: number }[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const dij = dist(pts[i].x, pts[i].y, pts[j].x, pts[j].y);
      let ok = true;
      for (let k = 0; k < pts.length && ok; k++) {
        if (k === i || k === j) continue;
        const dik = dist(pts[i].x, pts[i].y, pts[k].x, pts[k].y);
        const djk = dist(pts[j].x, pts[j].y, pts[k].x, pts[k].y);
        if (Math.max(dik, djk) < dij) ok = false;
      }
      if (ok) out.push([i, j]);
    }
  }
  return out;
}

/** Gabriel graph edges (superset of RNG) — used to add a few loops. */
function gabrielEdges(pts: { x: number; y: number }[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const mx = (pts[i].x + pts[j].x) / 2;
      const my = (pts[i].y + pts[j].y) / 2;
      const r2 = ((pts[i].x - pts[j].x) ** 2 + (pts[i].y - pts[j].y) ** 2) / 4;
      let ok = true;
      for (let k = 0; k < pts.length && ok; k++) {
        if (k === i || k === j) continue;
        if ((pts[k].x - mx) ** 2 + (pts[k].y - my) ** 2 < r2) ok = false;
      }
      if (ok) out.push([i, j]);
    }
  }
  return out;
}

export function generateMap(seed: number, opts: MapGenOptions): MapGenResult {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      return tryGenerate((seed + attempt * 7919) >>> 0, opts);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

function tryGenerate(seed: number, opts: MapGenOptions): MapGenResult {
  const rng = new RNG(seed ^ 0x5eed);
  const P = SIZE_PARAMS[opts.size];
  const nHomes = opts.empires;
  const nCores = P.cores;
  const nSys = nHomes + nCores;

  // ---------- System placement ----------
  const sysPos: { x: number; y: number; home: boolean }[] = [];
  const coreSep = 7600;
  const coreAngle = rng.float(0, Math.PI);
  for (let i = 0; i < nCores; i++) {
    const off = nCores === 1 ? 0 : (i === 0 ? -0.5 : 0.5) * coreSep;
    sysPos.push({ x: Math.cos(coreAngle) * off, y: Math.sin(coreAngle) * off * 0.7, home: false });
  }
  const minSep = SYSTEM_RADIUS * 2 + 1700;
  const ringR = Math.max(minSep / (2 * Math.sin(Math.PI / nHomes)) + 600, minSep + (nCores > 1 ? coreSep / 2 : 0) + 300);
  const a0 = rng.float(0, Math.PI * 2);
  for (let i = 0; i < nHomes; i++) {
    const a = a0 + (i / nHomes) * Math.PI * 2 + rng.float(-0.18, 0.18);
    const r = ringR * rng.float(0.95, 1.08);
    sysPos.push({ x: Math.cos(a) * r * 1.25, y: Math.sin(a) * r * 0.85, home: true });
  }
  // Relaxation so no systems overlap.
  for (let it = 0; it < 80; it++) {
    for (let i = 0; i < nSys; i++) {
      for (let j = i + 1; j < nSys; j++) {
        const dx = sysPos[j].x - sysPos[i].x;
        const dy = sysPos[j].y - sysPos[i].y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < minSep) {
          const push = (minSep - d) / 2 + 1;
          const ux = dx / d;
          const uy = dy / d;
          const wi = sysPos[i].home ? 1 : 0.35;
          const wj = sysPos[j].home ? 1 : 0.35;
          sysPos[i].x -= ux * push * wi;
          sysPos[i].y -= uy * push * wi;
          sysPos[j].x += ux * push * wj;
          sysPos[j].y += uy * push * wj;
        }
      }
    }
  }

  const starNames = rng.shuffle([...STAR_NAMES]);
  const nodes: GNode[] = [];
  const systems: SystemInfo[] = [];
  const lanes: Lane[] = [];
  const laneSet = new Set<string>();
  const addLane = (a: number, b: number) => {
    if (a === b) return;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (laneSet.has(key)) return;
    laneSet.add(key);
    const len = dist(nodes[a].x, nodes[a].y, nodes[b].x, nodes[b].y);
    lanes.push({ a, b, len });
    nodes[a].lanes.push(b);
    nodes[b].lanes.push(a);
  };

  const homes: number[] = [];
  const relicSites: number[] = [];
  const anomalies: number[] = [];
  let pirateBase = -1;
  let rift = -1;

  // Decide special placements per system.
  const coreIds = sysPos.map((s, i) => (s.home ? -1 : i)).filter((i) => i >= 0);
  const homeIds = sysPos.map((s, i) => (s.home ? i : -1)).filter((i) => i >= 0);
  const pirateSystem = rng.pick(coreIds);
  const riftSystem = opts.crisis ? (coreIds.find((c) => c !== pirateSystem) ?? coreIds[0]) : -1;
  // Relic distribution: prefer cores, overflow to home systems (outer orbit).
  const relicCount: number[] = new Array(nSys).fill(0);
  let relicsLeft = P.relics;
  let ci = 0;
  const coreRelicCap = 2;
  while (relicsLeft > 0 && coreIds.length > 0 && coreIds.some((c) => relicCount[c] < coreRelicCap)) {
    const c = coreIds[ci % coreIds.length];
    if (relicCount[c] < coreRelicCap) {
      relicCount[c]++;
      relicsLeft--;
    }
    ci++;
  }
  const homeOrder = rng.shuffle([...homeIds]);
  for (let i = 0; relicsLeft > 0; i++) {
    relicCount[homeOrder[i % homeOrder.length]]++;
    relicsLeft--;
  }

  const relicNames = rng.shuffle([...RELIC_SITE_NAMES]);
  const anomalyNames = rng.shuffle([...ANOMALY_NAMES]);

  for (let s = 0; s < nSys; s++) {
    const sp = sysPos[s];
    const starId = nodes.length;
    const star = blankNode(starId, 'star', s, sp.x, sp.y, rng.fork());
    star.r = rng.float(110, 170);
    star.well = Math.round(star.r + 460);
    star.starColor = rng.pick(STAR_COLORS);
    star.name = starNames[s % starNames.length];
    nodes.push(star);
    systems.push({ id: s, star: starId, x: sp.x, y: sp.y, name: star.name, color: star.starColor, home: sp.home, radius: SYSTEM_RADIUS });

    // ---- Build the list of bodies to place ----
    type Body = { kind: NodeKind; ptype?: PlanetType; home?: boolean; militia?: number; tag?: string };
    const bodies: Body[] = [];
    if (sp.home) {
      bodies.push({ kind: 'planet', ptype: rng.pick(['terran', 'ocean'] as PlanetType[]), home: true });
      bodies.push({ kind: 'planet', ptype: rng.pick(['terran', 'ocean', 'desert'] as PlanetType[]) });
      bodies.push({ kind: 'planet', ptype: rng.pick(['desert', 'volcanic', 'barren'] as PlanetType[]) });
      bodies.push({ kind: 'planet', ptype: rng.pick(['ice', 'gas'] as PlanetType[]) });
      bodies.push({ kind: 'planet', ptype: 'asteroid' });
      const extra = rng.int(P.homePlanets[0], P.homePlanets[1]) - 5;
      for (let i = 0; i < extra; i++) {
        bodies.push({ kind: 'planet', ptype: rng.pick(['volcanic', 'ice', 'barren', 'desert', 'gas'] as PlanetType[]), militia: rng.chance(0.6) ? 1 : 0 });
      }
      if (rng.chance(0.65)) bodies.push({ kind: 'anomaly' });
    } else {
      const n = rng.int(P.corePlanets[0], P.corePlanets[1]);
      const pool: PlanetType[] = ['terran', 'ocean', 'gas', 'desert', 'volcanic', 'ice', 'barren', 'terran', 'gas'];
      for (let i = 0; i < n; i++) bodies.push({ kind: 'planet', ptype: rng.pick(pool), militia: rng.int(1, 3) });
      bodies.push({ kind: 'anomaly' });
      if (rng.chance(0.5)) bodies.push({ kind: 'anomaly' });
      if (s === pirateSystem) bodies.push({ kind: 'pirate' });
      if (s === riftSystem) bodies.push({ kind: 'rift' });
    }
    for (let i = 0; i < relicCount[s]; i++) bodies.push({ kind: 'relic' });

    // ---- Place bodies on orbits ----
    const sysNodes: number[] = [starId];
    // Homeworld goes first so it gets a central orbit; relic sites last so they land outermost.
    const order = bodies.map((_, i) => i).sort((i, j) => {
      const pri = (b: Body) => (b.home ? 0 : b.kind === 'relic' || b.kind === 'pirate' ? 2 : 1);
      return pri(bodies[i]) - pri(bodies[j]);
    });
    for (const bi of order) {
      const b = bodies[bi];
      // Roll the body's size first so spacing can respect the real gravity-well radii.
      let bodyR = 60;
      let bodyWell = 440;
      if (b.kind === 'planet' && b.ptype) {
        const d = PLANETS[b.ptype].radius;
        bodyR = rng.float(d[0], d[1]);
        if (b.home) bodyR = Math.max(bodyR, 82);
        bodyWell = Math.round(bodyR + (b.home ? 400 : 380));
      } else if (b.kind === 'anomaly') {
        bodyR = 70;
        bodyWell = 420;
      } else if (b.kind === 'pirate') {
        bodyR = 70;
        bodyWell = 480;
      } else if (b.kind === 'rift') {
        bodyR = 120;
        bodyWell = 560;
      }
      let placed = false;
      for (let attempt = 0; attempt < 260 && !placed; attempt++) {
        let orbitIdx: number;
        if (b.home) orbitIdx = 1;
        else if (b.kind === 'relic' || b.kind === 'pirate') orbitIdx = attempt < 120 ? 3 : rng.int(1, 3);
        else orbitIdx = rng.int(0, ORBITS.length - 1);
        const rad = ORBITS[orbitIdx] + rng.float(-140, 140) + (attempt > 150 ? rng.float(0, 500) : 0);
        let ang = rng.float(0, Math.PI * 2);
        if (b.home) ang = Math.atan2(sp.y, sp.x) + rng.float(-0.6, 0.6); // face away from the core
        const x = sp.x + Math.cos(ang) * rad;
        const y = sp.y + Math.sin(ang) * rad * 0.92;
        let ok = true;
        for (const other of nodes) {
          const need = Math.max(other.system === s ? 1000 : 1700, other.well + bodyWell + 90);
          if (dist(x, y, other.x, other.y) < need) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        placed = true;
        const id = nodes.length;
        const n = blankNode(id, b.kind, s, x, y, rng.fork());
        if (b.kind === 'planet' && b.ptype) {
          setPlanetType(n, b.ptype, rng, bodyR);
          n.well = bodyWell;
          if (b.home) {
            n.tag = 'home';
            homes.push(id);
          }
          if (b.militia) n.tag = 'militia:' + b.militia;
        } else if (b.kind === 'anomaly') {
          n.r = 70;
          n.well = 420;
          n.name = anomalyNames[anomalies.length % anomalyNames.length];
          anomalies.push(id);
        } else if (b.kind === 'relic') {
          n.r = 60;
          n.well = 440;
          n.name = relicNames[relicSites.length % relicNames.length];
          relicSites.push(id);
        } else if (b.kind === 'pirate') {
          n.r = 70;
          n.well = 480;
          n.name = 'Blackstar Haven';
          pirateBase = id;
        } else if (b.kind === 'rift') {
          n.r = 120;
          n.well = 560;
          n.name = 'The Maw';
          rift = id;
        }
        nodes.push(n);
        sysNodes.push(id);
      }
      if (!placed && b.home) throw new Error('Failed to place homeworld');
      if (!placed && b.kind === 'pirate') throw new Error('Failed to place pirate base');
      if (!placed && b.kind === 'rift') throw new Error('Failed to place rift');
    }

    // ---- Name planets by orbital distance ----
    const planets = sysNodes.filter((id) => nodes[id].kind === 'planet');
    planets.sort((a, b) => dist(nodes[a].x, nodes[a].y, sp.x, sp.y) - dist(nodes[b].x, nodes[b].y, sp.x, sp.y));
    planets.forEach((id, i) => (nodes[id].name = `${star.name} ${roman(i + 1)}`));

    // ---- Intra-system lanes ----
    const pts = sysNodes.map((id) => nodes[id]);
    for (const [i, j] of rngEdges(pts)) addLane(sysNodes[i], sysNodes[j]);
    const gab = gabrielEdges(pts);
    for (const [i, j] of gab) if (rng.chance(0.3)) addLane(sysNodes[i], sysNodes[j]);
    // Make sure the star is a hub with at least two lanes.
    if (nodes[starId].lanes.length < 2) {
      const near = sysNodes
        .filter((id) => id !== starId && !nodes[starId].lanes.includes(id))
        .sort((a, b) => dist(nodes[a].x, nodes[a].y, sp.x, sp.y) - dist(nodes[b].x, nodes[b].y, sp.x, sp.y));
      for (const id of near.slice(0, 2 - nodes[starId].lanes.length)) addLane(starId, id);
    }
  }

  // ---------- Interstellar lanes (star to star) ----------
  const starOf = (s: number) => systems[s].star;
  const sysPts = systems.map((s) => ({ x: s.x, y: s.y }));
  const sysEdges = rngEdges(sysPts);
  for (const [i, j] of sysEdges) addLane(starOf(i), starOf(j));
  // Every home connects to its nearest core; sprinkle in extra Gabriel links for loops.
  for (const h of homeIds) {
    let best = -1;
    let bd = Infinity;
    for (const c of coreIds) {
      const d = dist(sysPos[h].x, sysPos[h].y, sysPos[c].x, sysPos[c].y);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    if (best >= 0) addLane(starOf(h), starOf(best));
  }
  for (const [i, j] of gabrielEdges(sysPts)) if (rng.chance(0.35)) addLane(starOf(i), starOf(j));

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x - n.well);
    minY = Math.min(minY, n.y - n.well);
    maxX = Math.max(maxX, n.x + n.well);
    maxY = Math.max(maxY, n.y + n.well);
  }

  return { nodes, lanes, systems, homes, pirateBase, rift, relicSites, anomalies, minX, minY, maxX, maxY };
}

// ---------------------------------------------------------------------------
// The cradle world (Ages runs)
// ---------------------------------------------------------------------------

/** Lands stand at least this far apart, so that their grounds never touch. */
const LAND_SEP = 1180;

/**
 * The cradle world of an Ages run: one planet, laid out as a map of lands joined by paths. Every
 * house has its Hearth on the rim with a few lands of its own around it. Between neighbours lie
 * border lands, and in the middle the richest lands, held by beasts.
 */
export function generateCradle(seed: number, opts: { houses: number }): MapGenResult {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      return tryCradle((seed + attempt * 7919) >>> 0, opts.houses);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

function tryCradle(seed: number, houses: number): MapGenResult {
  const rng = new RNG(seed ^ 0xc4ad1e);
  const nodes: GNode[] = [];
  const lanes: Lane[] = [];
  const homes: number[] = [];
  const names = rng.shuffle([...LAND_NAMES]);
  const free = (x: number, y: number, sep = LAND_SEP) => nodes.every((n) => dist(x, y, n.x, n.y) >= sep);
  const add = (x: number, y: number, type: PlanetType, beasts = 0): GNode => {
    const n = blankNode(nodes.length, 'planet', 0, x, y, rng.fork());
    setPlanetType(n, type, rng);
    n.name = names[nodes.length % names.length];
    if (beasts > 0) n.tag = 'militia:' + beasts;
    nodes.push(n);
    return n;
  };

  // Hearths on a wide ring (the screen is wider than it is tall).
  const ring = Math.max(2500, (LAND_SEP * 2.6 * houses) / (2 * Math.PI) + 700);
  const a0 = rng.float(0, Math.PI * 2);
  const homePos: { x: number; y: number; a: number }[] = [];
  for (let i = 0; i < houses; i++) {
    const a = a0 + (i / houses) * Math.PI * 2 + rng.float(-0.12, 0.12);
    const r = ring * rng.float(0.96, 1.06);
    homePos.push({ x: Math.cos(a) * r * 1.25, y: Math.sin(a) * r * 0.85, a });
  }
  for (const h of homePos) {
    const n = add(h.x, h.y, 'terran');
    n.tag = 'home';
    homes.push(n.id);
  }
  // Three lands of its own around each Hearth: nearer to it than to any other.
  const OWN: PlanetType[] = ['desert', 'terran', 'ocean', 'barren', 'desert'];
  for (let i = 0; i < houses; i++) {
    const h = homePos[i];
    let placed = 0;
    for (let attempt = 0; attempt < 400 && placed < 3; attempt++) {
      const a = rng.float(0, Math.PI * 2);
      const r = rng.float(LAND_SEP + 40, LAND_SEP + 620 + attempt * 2);
      const x = h.x + Math.cos(a) * r;
      const y = h.y + Math.sin(a) * r * 0.9;
      if (!free(x, y)) continue;
      if (homePos.some((o, j) => j !== i && dist(x, y, o.x, o.y) < r + 500)) continue;
      add(x, y, rng.pick(OWN));
      placed++;
    }
    if (placed < 3) throw new Error('Failed to place a house\'s lands');
  }
  // A border land between each pair of neighbours.
  const BORDER: PlanetType[] = ['volcanic', 'ice', 'barren', 'desert'];
  for (let i = 0; i < houses; i++) {
    const p = homePos[i];
    const q = homePos[(i + 1) % houses];
    for (let attempt = 0; attempt < 200; attempt++) {
      const k = rng.float(0.4, 0.6);
      const x = p.x + (q.x - p.x) * k + rng.float(-300, 300) * (1 + attempt / 60);
      const y = p.y + (q.y - p.y) * k + rng.float(-300, 300) * (1 + attempt / 60);
      if (!free(x, y)) continue;
      add(x, y, rng.pick(BORDER), rng.chance(0.5) ? 1 : 0);
      break;
    }
  }
  // The middle: the richest lands, each held by beasts.
  const MIDDLE: PlanetType[] = ['terran', 'ocean', 'desert', 'terran'];
  const middle = houses + 2;
  let placedMid = 0;
  for (let attempt = 0; attempt < 900 && placedMid < middle; attempt++) {
    const a = rng.float(0, Math.PI * 2);
    const r = Math.sqrt(rng.float(0, 1)) * ring * (0.5 + attempt / 1800);
    const x = Math.cos(a) * r * 1.25;
    const y = Math.sin(a) * r * 0.85;
    if (!free(x, y)) continue;
    const n = add(x, y, rng.pick(MIDDLE), rng.int(1, 2));
    n.r = Math.max(n.r, 76);
    n.size = 'L';
    n.well = Math.round(n.r + 380);
    placedMid++;
  }
  if (placedMid < Math.min(3, middle)) throw new Error('Failed to place the middle lands');

  // Paths: every land reaches every other, with a few loops, and no Hearth is a dead end.
  const laneSet = new Set<string>();
  const addLane = (a: number, b: number) => {
    if (a === b) return;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (laneSet.has(key)) return;
    laneSet.add(key);
    lanes.push({ a, b, len: dist(nodes[a].x, nodes[a].y, nodes[b].x, nodes[b].y) });
    nodes[a].lanes.push(b);
    nodes[b].lanes.push(a);
  };
  for (const [i, j] of rngEdges(nodes)) addLane(i, j);
  for (const [i, j] of gabrielEdges(nodes)) if (rng.chance(0.35)) addLane(i, j);
  for (const h of homes) {
    if (nodes[h].lanes.length >= 2) continue;
    const near = nodes
      .filter((n) => n.id !== h && !nodes[h].lanes.includes(n.id) && n.tag !== 'home')
      .sort((p, q) => dist(p.x, p.y, nodes[h].x, nodes[h].y) - dist(q.x, q.y, nodes[h].x, nodes[h].y));
    if (near[0]) addLane(h, near[0].id);
  }
  // No path may run from one Hearth straight to another: there is always a land between.
  for (const l of lanes) if (nodes[l.a].tag === 'home' && nodes[l.b].tag === 'home') throw new Error('Two Hearths are neighbours');

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x - n.well - 420);
    minY = Math.min(minY, n.y - n.well - 420);
    maxX = Math.max(maxX, n.x + n.well + 420);
    maxY = Math.max(maxY, n.y + n.well + 420);
  }
  return { nodes, lanes, systems: [], homes, pirateBase: -1, rift: -1, relicSites: [], anomalies: [], minX, minY, maxX, maxY };
}

/** All-pairs shortest path (by lane length) with next-hop table. */
export function computePaths(nodes: GNode[], lanes: Lane[]): { dist: Float64Array; next: Int32Array; hops: Int32Array } {
  const n = nodes.length;
  const D = new Float64Array(n * n).fill(Infinity);
  const N = new Int32Array(n * n).fill(-1);
  const H = new Int32Array(n * n).fill(1 << 20);
  for (let i = 0; i < n; i++) {
    D[i * n + i] = 0;
    N[i * n + i] = i;
    H[i * n + i] = 0;
  }
  for (const l of lanes) {
    // Phase charge time is a fixed cost per jump; model it as extra distance.
    const w = l.len + 900;
    D[l.a * n + l.b] = w;
    D[l.b * n + l.a] = w;
    N[l.a * n + l.b] = l.b;
    N[l.b * n + l.a] = l.a;
    H[l.a * n + l.b] = 1;
    H[l.b * n + l.a] = 1;
  }
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      const dik = D[i * n + k];
      if (dik === Infinity) continue;
      for (let j = 0; j < n; j++) {
        const nd = dik + D[k * n + j];
        if (nd < D[i * n + j]) {
          D[i * n + j] = nd;
          N[i * n + j] = N[i * n + k];
        }
        const nh = H[i * n + k] + H[k * n + j];
        if (nh < H[i * n + j]) H[i * n + j] = nh;
      }
    }
  }
  return { dist: D, next: N, hops: H };
}
