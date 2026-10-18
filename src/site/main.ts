/**
 * The website (hegemarch.com): the landing page's moving parts, built from the game's own code so
 * that what the page shows is the game and not a picture of it. `npm run package` builds this file
 * into release/site/site.js; the page itself is site/index.html.
 */
import { startAges } from './ages';
import { startBoard } from './board';
import { Draft } from './draft';
import { startFleet } from './fleet';
import { Hero } from './hero';
import { Houses } from './houses';
import { startDailyClock, startDestinies, startLane, startPictures } from './page';
import { drawStages } from './stage';
import { startThrone } from './throne';

/** One part failing must not take the rest of the page with it. */
function part<T>(name: string, make: () => T): T | null {
  try {
    return make();
  } catch (err) {
    console.error(`site: ${name}`, err);
    return null;
  }
}

const byId = (id: string) => document.getElementById(id);

function boot() {
  const heroEl = byId('hero');
  const hero = heroEl && part('hero', () => new Hero(heroEl));
  const cards = byId('house-cards');
  const detail = byId('house-detail');
  const houses = cards && detail && part('houses', () => new Houses(cards, detail));
  const fleet = byId('fleet');
  if (fleet) part('fleet', () => startFleet(fleet));
  const draftEl = byId('draft');
  const draft = draftEl && part('draft', () => new Draft(draftEl));
  const destinies = byId('destiny-list');
  if (destinies) part('destinies', () => startDestinies(destinies));
  const agesEl = byId('ages-art');
  const ages = agesEl && part('ages', () => startAges(agesEl));
  part('lane', startLane);
  part('pictures', startPictures);
  part('daily', startDailyClock);
  const board = byId('board');
  if (board) part('board', () => startBoard(board));
  part('throne', () => startThrone(document.querySelector<HTMLElement>('#hero .throne'), board));
  // For the site's own tests (scripts/site.mjs): ?debug hands them the moving parts.
  if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { __site: { hero, houses, draft } });

  let last = performance.now();
  const loop = (now: number) => {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    try {
      hero?.frame(dt);
      houses?.frame(dt, now / 1000);
      ages?.(now / 1000);
      drawStages(now / 1000);
    } catch (err) {
      console.error(err);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
