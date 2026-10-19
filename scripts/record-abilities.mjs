// Films of every ability as the player sees it (1.26: render/abilityLooks.ts): for each, a run of the house
// it belongs to, its Ark at home with ships of its own and a rival's staged round it so that the ability has
// its reason, the camera on the Ark; it is cast a second in, and its look, its words and its sound are filmed
// with the game's own screen at its nearest zoom, at the speed the game is played, the part of the screen
// round the Ark filmed larger (the game's own pixels, bigger). One film each (.shots/cast-<id>.mp4).
// A House Power (1.27) is cast as the player casts it: D aims it (the whole screen is filmed, so that its
// button, the banner and the map's preview are seen), and a second later D again, or a click on a world.
//   node scripts/record-abilities.mjs [id,id...]     (npm run record:abilities; needs a dev server)
import { endFilm, filmRun, lookAt, startFilm } from './lib/film.mjs';

const HEIRS = ['concord', 'vael', 'wayfarer', 'lyceum', 'choir', 'ashen'];
/**
 * Each scene: the ability (given to the Ark for the scene) or the House Power (`power`: the house's own, cast with
 * D), the house played, the player's ships placed round the Ark (hurt: at half their hull), the rival's (at that
 * distance), the zoom.
 */
const SCENES = [
  { id: 'barrage', heir: 'vael', allies: [['striker', 3]], enemies: [['striker', 6, 200], ['guardian', 2, 260]], zoom: 0.6 },
  { id: 'nanite', heir: 'wayfarer', allies: [['striker', 6], ['guardian', 2]], hurt: true, enemies: [['striker', 3, 260]], zoom: 0.6 },
  { id: 'aegis', heir: 'concord', allies: [['striker', 6], ['guardian', 3]], enemies: [['striker', 8, 150], ['breaker', 2, 200]], zoom: 0.6 },
  { id: 'strikewing', heir: 'lyceum', allies: [['striker', 2]], enemies: [['striker', 5, 220]], zoom: 0.6 },
  { id: 'conversion', heir: 'choir', level: 5, power: true, allies: [['striker', 2]], enemies: [['striker', 6, 200], ['guardian', 1, 240]], zoom: 0.5 },
  { id: 'phaselance', heir: 'ashen', allies: [['striker', 3]], enemies: [['dreadnought', 1, 170], ['striker', 4, 230]], zoom: 0.6 },
  { id: 'emp', heir: 'lyceum', allies: [['striker', 3]], enemies: [['guardian', 3, 200], ['striker', 5, 160]], zoom: 0.6 },
  { id: 'overdrive', heir: 'vael', allies: [['striker', 2]], enemies: [['guardian', 2, 160], ['striker', 3, 200]], zoom: 0.6 },
  { id: 'snare', heir: 'lyceum', allies: [['striker', 2]], enemies: [['striker', 5, 180], ['guardian', 3, 420]], zoom: 0.45 },
  { id: 'rally', heir: 'concord', allies: [['striker', 5], ['guardian', 2]], enemies: [['striker', 5, 240]], zoom: 0.6 },
  { id: 'repairdrones', heir: 'ashen', arkHurt: true, allies: [['striker', 2]], enemies: [['striker', 2, 260]], zoom: 0.6 },
  // The House Powers (1.27): Dawn from the star of the home system, among its dark worlds; a Call to Arms with two
  // Forges beside the Hearth; a Wayfinder's starlane to the farthest world it can reach; a Mind Theft from a rival
  // Ark beside it; Fate's Wager over a rival fleet, heads (and once tails).
  { id: 'dawn', heir: 'concord', power: true, at: 'star', allies: [], enemies: [], zoom: 0.11 },
  { id: 'callarms', heir: 'vael', power: true, at: 'star', forges: 2, allies: [], enemies: [], zoom: 0.11 },
  { id: 'wayfinder', heir: 'wayfarer', power: true, allies: [], enemies: [], zoom: 0.05 },
  { id: 'mindtheft', heir: 'lyceum', power: true, rivalArk: true, allies: [['striker', 2]], enemies: [], zoom: 0.5 },
  { id: 'wager', heir: 'ashen', power: true, heads: true, allies: [['striker', 2]], enemies: [['striker', 5, 200], ['guardian', 3, 240]], zoom: 0.5 },
  { id: 'wager-tails', heir: 'ashen', power: true, heads: false, allies: [['striker', 2]], enemies: [['striker', 5, 200], ['guardian', 3, 240]], zoom: 0.5 },
  // (Zeal: the Choir's Strikers, already hurt, against Dreadnoughts: each one lost raises it, and the world says how high.)
  { id: 'zeal', heir: 'choir', allies: [['striker', 8]], hurt: 0.3, enemies: [['dreadnought', 2, 120], ['guardian', 3, 140]], zoom: 0.45, world: true },
];

const only = process.argv[2]?.split(',');
for (const sc of SCENES.filter((x) => !only || only.includes(x.id))) {
  const { browser, page, errors } = await filmRun('20261013', {
    heirs: HEIRS,
    lastSetup: { heir: sc.heir, size: 'small', difficulty: 1 },
    settings: { autoPause: false, tips: false, muted: false, master: 0.8, sfx: 0.9, music: 0 },
  });
  await page.evaluate((sc) => {
    const a = window.__app;
    const s = a.session;
    const g = s.game;
    const p = g.player;
    // (The houses' minds are stopped: what is staged stays where it is put, and fights where it stands.)
    for (const f of g.factions) f.ai = null;
    const rival = g.empires().find((f) => f.id !== p.id);
    const ark = g.units.get(p.ark);
    if (sc.level) ark.level = sc.level;
    if (sc.power) ark.abil = [];
    else if (sc.id !== 'zeal') ark.abil = [{ id: sc.id, cd: 1.2 }];
    else ark.abil = [];
    if (sc.power) {
      p.powerCd = 0;
      // Where it acts: the star of the home system (its worlds one starlane away), Forges of its own, a chart of
      // the whole sector, a rival Ark beside it that knows a Boon, the coin's face.
      const home = g.nodes[p.capital];
      if (sc.at === 'star') {
        const star = g.nodes[g.systems[home.system].star];
        Object.assign(ark, { node: star.id, x: star.x + star.r + 60, y: star.y, px: star.x + star.r + 60, py: star.y });
        g.rebuildBuckets();
      }
      for (const n of g.nodes.filter((x) => x.kind === 'planet' && x.owner < 0 && x.system === home.system).slice(0, sc.forges ?? 0)) {
        g.kindleWorld(n, p.id, true);
        n.role = 'forge';
      }
      if (sc.id === 'wayfinder') g.exploreAll(p);
      if (sc.rivalArk) {
        g.killUnit(g.units.get(rival.ark), -1);
        g.spawnUnit('ark', rival.id, ark.node, { x: ark.x + 130, y: ark.y - 20 });
        g.addCard(rival, 'hotBarrels');
      }
      if (sc.heads !== undefined) {
        const chance = g.rng.chance.bind(g.rng);
        let once = true;
        g.rng.chance = (q) => (once ? ((once = false), sc.heads) : chance(q));
      }
    }
    if (sc.arkHurt) ark.hp = ark.maxHp * 0.45;
    const ring = (n, r, i, off = 0) => ({ x: ark.x + Math.cos((i / n) * Math.PI * 2 + off) * r, y: ark.y + Math.sin((i / n) * Math.PI * 2 + off) * r * 0.7 });
    let k = 0;
    const mine = sc.allies.reduce((t, [, n]) => t + n, 0);
    for (const [type, n] of sc.allies) {
      for (let i = 0; i < n; i++) {
        const u = g.spawnUnit(type, p.id, p.capital, ring(mine, 55 + (k % 2) * 25, k++, 0.3));
        if (sc.hurt) u.hp = u.maxHp * (typeof sc.hurt === 'number' ? sc.hurt : 0.5);
      }
    }
    for (const [type, n, r] of sc.enemies) {
      // (On the far side of the Ark from home, a fan of them.)
      for (let i = 0; i < n; i++) g.spawnUnit(type, rival.id, p.capital, ring(n * 3, r, i - (n - 1) / 2, 0));
    }
    const cam = s.renderer.cam;
    const home = g.nodes[p.capital];
    let cx = sc.world ? (ark.x + home.x) / 2 : ark.x;
    let cy = sc.world ? (ark.y + home.y) / 2 + 20 : ark.y + 15;
    // (A Wayfinder: the Ark's world and the farthest world in reach, both on the screen.)
    if (sc.id === 'wayfinder') {
      const far = g.nodes.filter((n) => !g.checkPower(p.id, n.id)).sort((a, b) => g.hops(ark.node, b.id) - g.hops(ark.node, a.id))[0];
      window.__target = far.id;
      cx = (g.nodes[ark.node].x + far.x) / 2;
      cy = (g.nodes[ark.node].y + far.y) / 2;
      sc.zoom = Math.min(0.12, (0.7 * s.screen.H) / Math.max(1, Math.hypot(far.x - g.nodes[ark.node].x, far.y - g.nodes[ark.node].y)));
    }
    cam.x = cam.tx = cx;
    cam.y = cam.ty = cy;
    cam.zoom = cam.tzoom = sc.zoom;
    s.selected?.clear?.();
  }, sc);
  // (The middle of the screen, filmed this much larger; a power, the whole screen: its button and the banner.)
  const BY = sc.power ? 1 : 1.7;
  const { W, H } = await page.evaluate(() => ({ W: window.__app.session.screen.W, H: window.__app.session.screen.H }));
  await startFilm(page, { zoom: BY });
  await lookAt(page, W / 2 - W / (2 * BY), H / 2 - H / (2 * BY), true);
  await page.waitForTimeout(700);
  await page.evaluate(() => (window.__app.session.paused = false));
  if (sc.power) {
    // As the player casts it: D, a look at what it would do, and D again (a Wayfinder: its world, clicked).
    await page.keyboard.press('KeyD');
    await page.waitForTimeout(1600);
    if (sc.id === 'wayfinder') await page.evaluate(() => window.__app.hud.actions.powerAt(window.__target));
    else await page.keyboard.press('KeyD');
  }
  await page.waitForTimeout(sc.id === 'zeal' ? 7500 : 6000);
  await page.evaluate(() => (window.__app.session.paused = true));
  await page.waitForTimeout(300);
  await endFilm(page, `.shots/cast-${sc.id}`);
  await browser.close();
  if (errors.length) console.log(sc.id, 'errors:', errors);
}
