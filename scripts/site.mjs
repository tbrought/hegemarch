// The website (release/site, as `npm run package` builds it) end to end: the live sector that opens
// the page, the houses, the fleet, the Boon draft, the lighting of sections, and the page at phone
// width, with motion reduced and with scripts off. Saves screenshots to .shots/site-*.png.
//   node scripts/site.mjs            (run `npm run package` first)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const ROOT = path.resolve('release/site');
if (!fs.existsSync(path.join(ROOT, 'site.js'))) throw new Error('site: run `npm run package` first');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.zip': 'application/zip', '.xml': 'application/xml', '.txt': 'text/plain' };
const server = http.createServer((req, res) => {
  let file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(ROOT)) return res.writeHead(403).end();
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) return res.writeHead(404).end('not found');
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const executablePath = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
].find((p) => fs.existsSync(p));
fs.mkdirSync('.shots', { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });

let failed = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? `  (${extra})` : ''}`);
};

/** Open the page in a fresh context; returns the page and the errors it logs. */
async function open(opts = {}, query = '?debug') {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(base + query);
  return { page, errors, context };
}

/** How many differently colored pixels a canvas shows, and a number that changes when its picture does. */
const look = (page, sel) =>
  page.evaluate((s) => {
    const c = document.querySelector(s);
    if (!c || !c.width) return { colors: 0, sum: 0 };
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const seen = new Set();
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) {
      const v = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
      seen.add(v);
      sum = (sum * 31 + v + i) >>> 0;
    }
    return { colors: seen.size, sum };
  }, sel);
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const scrollTo = async (page, sel) => {
  await page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: 'start', behavior: 'instant' }), sel);
  await page.waitForTimeout(1300);
};

try {
  // ------------------------------------------------------------------ desktop
  const { page, errors } = await open();
  const wait = (ms) => page.waitForTimeout(ms);
  await wait(1500);
  check('the sector starts by itself', await page.evaluate(() => document.getElementById('hero').classList.contains('on')));
  check('the first house is shown to begin with', (await page.textContent('#house-detail h3')) === 'Solar Concord');
  check('it opens on the dawn, sped up', await page.evaluate(() => document.getElementById('hero').classList.contains('dawn') && document.querySelector('.live-label').textContent === 'DAWN'));
  const dawn1 = await look(page, '.sector');
  const clock1 = await page.textContent('.live-clock');
  await page.screenshot({ path: '.shots/site-hero-dawn.png' });
  await wait(1200);
  const dawn2 = await look(page, '.sector');
  const clock2 = await page.textContent('.live-clock');
  check('the dawn moves', dawn1.sum !== dawn2.sum && dawn1.colors > 8, `${dawn1.colors} colors`);
  const secs = (s) => s.split(':').reduce((a, n) => a * 60 + Number(n), 0);
  check('minutes pass in moments', secs(clock2) - secs(clock1) > 60, `${clock1} -> ${clock2}`);
  await page.waitForFunction(() => document.querySelector('.live-label').textContent === 'LIVE', null, { timeout: 30000 });
  await wait(2500);
  check('then it is live, about fourteen minutes in', Math.abs(secs(await page.textContent('.live-clock')) - 14 * 60) < 30, await page.textContent('.live-clock'));
  const chips = await page.$$eval('.chip', (els) => els.map((e) => e.textContent.trim()));
  check('the houses are listed with their worlds', chips.length >= 2 && chips.every((c) => /\d+ worlds?|fallen/.test(c)), chips.join(' | '));
  await page.screenshot({ path: '.shots/site-hero-live.png' });
  check('the hero fits the window', await noSideScroll(page));

  // A world changes hands: the news says so.
  await page.evaluate(() => {
    const g = window.__site.hero.attract.game;
    const houses = g.factions.filter((f) => f.kind === 'empire' && f.alive);
    const n = g.nodes.find((x) => x.kind === 'planet' && x.owner === houses[0].id && x.capitalOf < 0) ?? g.nodes.find((x) => x.kind === 'planet' && x.owner === houses[0].id);
    n.owner = houses[1].id;
  });
  await wait(600);
  const news = await page.$$eval('.news li', (els) => els.map((e) => e.textContent));
  check('news of a world changing hands', news.length >= 1 && / took | put out /.test(news[0]), news[0]);

  // Click a house: the camera flies to its Hearth.
  const flew = await page.evaluate(async () => {
    const hero = window.__site.hero;
    const g = hero.attract.game;
    const chip = [...document.querySelectorAll('.chip')].find((c) => !c.classList.contains('out'));
    const home = g.nodes[g.factions[Number(chip.dataset.f)].capital];
    chip.click();
    const cam = hero.renderer.cam;
    return Math.hypot(cam.tx - home.x, cam.ty - home.y) < 1;
  });
  check('a click on a house flies to its Hearth', flew);

  // Sound: off until asked for.
  check('sound is off to begin with', (await page.getAttribute('.sound', 'aria-pressed')) === 'false' && (await page.evaluate(() => window.__site.hero.sfx === null)));
  await page.click('.sound');
  await wait(700);
  check('the switch turns it on', await page.evaluate(() => window.__site.hero.sfx?.ctx?.state === 'running' && window.__site.hero.music.playing === 'title' && document.querySelector('.sound').textContent.includes('ON')));
  await page.click('.sound');
  check('and off again', await page.evaluate(() => window.__site.hero.music.playing === null && document.querySelector('.sound').getAttribute('aria-pressed') === 'false'));

  // A house is crowned: the page says so, then a new sector begins (once).
  await page.evaluate(() => {
    const a = window.__site.hero.attract;
    window.__old = a.game;
    a.game.declareWinner(a.game.factions.find((f) => f.kind === 'empire' && f.alive).id, 'conquest', 'test');
  });
  await wait(700);
  check('the winner is announced', await page.evaluate(() => !document.querySelector('.crown').hidden && /is crowned Hegemarch/.test(document.querySelector('.crown').textContent)), await page.textContent('.crown'));
  await page.screenshot({ path: '.shots/site-hero-crown.png' });
  await page.evaluate(() => (window.__site.hero.attract.overT = 0.3));
  await wait(1500);
  const again = await page.evaluate(() => {
    const a = window.__site.hero.attract;
    return { fresh: a.game !== window.__old, phase: a.phase, crown: document.querySelector('.crown').hidden, news: document.querySelectorAll('.news li').length };
  });
  check('a new sector follows', again.fresh && again.phase === 'dawn' && again.crown && again.news === 0, JSON.stringify(again));
  const g1 = await page.evaluate(() => (window.__g1 = window.__site.hero.attract.game) && true);
  await wait(1500);
  check('only one new sector', g1 && (await page.evaluate(() => window.__g1 === window.__site.hero.attract.game)));

  // ---------------- sections light as they are reached
  const lit0 = await page.$$eval('.band', (els) => els.map((e) => e.classList.contains('lit')));
  check('sections below the fold start unlit', lit0.slice(1).every((x) => !x), JSON.stringify(lit0));
  await scrollTo(page, '#run');
  check('the first section lights when reached', await page.evaluate(() => document.getElementById('run').classList.contains('lit')));
  check('its world is drawn, lit', (await look(page, '#run .node')).colors >= 5);
  for (const sel of ['#run .pic[data-subjects="seed,kindle"]', '#run .pic[data-subjects="hearth,ark"]']) {
    const a = await look(page, sel);
    await wait(500);
    const b = await look(page, sel);
    check(`picture drawn and moving: ${sel}`, a.colors >= 4 && a.sum !== b.sum, `${a.colors} colors`);
  }
  await page.screenshot({ path: '.shots/site-run.png' });

  // ---------------- houses
  await scrollTo(page, '#houses');
  const cards = await page.$$eval('#house-cards .heir', (els) => els.map((e) => e.querySelector('.hn').textContent));
  check('six house cards', cards.length === 6, cards.join(', '));
  let moving = 0;
  for (let i = 0; i < 6; i++) {
    const sel = `#house-cards .heir:nth-child(${i + 1}) .heir-art`;
    const a = await look(page, sel);
    await wait(250);
    const b = await look(page, sel);
    if (a.colors >= 6 && a.sum !== b.sum) moving++;
  }
  check('every banner is drawn and moving', moving === 6, `${moving}/6`);
  await page.screenshot({ path: '.shots/site-houses.png' });
  await page.mouse.move(5, 5);
  const shown = await page.textContent('#house-detail h3');
  await wait(5600);
  check('left alone, the page tours the houses', (await page.textContent('#house-detail h3')) !== shown, `${shown} -> ${await page.textContent('#house-detail h3')}`);
  await page.click('#house-cards .heir[data-heir="vael"]');
  await wait(300);
  const vael = await page.evaluate(() => ({
    name: document.querySelector('#house-detail h3').textContent,
    sel: document.querySelector('.heir.sel').dataset.heir,
    color: document.documentElement.style.getPropertyValue('--house'),
    bonuses: document.querySelectorAll('.hd-bonuses li').length,
    fleet: document.querySelector('.hd-fleet').textContent,
    gain: document.querySelectorAll('.hd-bonuses .rt-gain').length,
  }));
  check('choosing a house shows it and colors the page', vael.name === 'Vael Imperium' && vael.sel === 'vael' && vael.color === '#e0402f' && vael.bonuses === 4 && vael.gain >= 2 && /Ark Tyrant/.test(vael.fleet), JSON.stringify(vael));
  await wait(5600);
  check('a choice ends the tour', (await page.textContent('#house-detail h3')) === 'Vael Imperium');
  const ark = await look(page, '.ark-art');
  check('the Ark is drawn', ark.colors >= 6, `${ark.colors} colors`);
  await page.screenshot({ path: '.shots/site-houses-vael.png' });
  check('an earned house says what it costs', await page.evaluate(() => (document.querySelector('.heir[data-heir="ashen"]').click(), /◆250/.test(document.querySelector('.hd-tag').textContent))));

  // ---------------- the fleet
  await scrollTo(page, '#ships');
  const tri1 = await look(page, '.triangle');
  await wait(400);
  const tri2 = await look(page, '.triangle');
  check('the triangle is drawn and moving', tri1.colors >= 8 && tri1.sum !== tri2.sum, `${tri1.colors} colors`);
  const ships = await page.$$eval('.ship-list li b, .blueprint-list li b', (els) => els.map((e) => e.textContent));
  check('three core ships and four Blueprint ships', ships.join() === 'Striker,Guardian,Breaker,Lancer,Carrier,Dreadnought,Starbase', ships.join());
  await page.screenshot({ path: '.shots/site-ships.png' });
  await page.evaluate(() => document.querySelector('.blueprint-list').scrollIntoView({ block: 'center', behavior: 'instant' }));
  await wait(500);
  let drawn = 0;
  for (const t of ships) if ((await look(page, `.ship-art[data-ship="${t.toLowerCase()}"]`)).colors >= 2) drawn++;
  check('every ship has its picture', drawn === 7, `${drawn}/7`);

  // ---------------- the draft (Ashen Remnant is chosen: its drafts offer one more choice)
  await scrollTo(page, '#boons');
  // (Four choices for the Ashen Remnant, or five when the Epic Boon it starts with is the one that adds a choice.)
  const dealt = (await page.$$('.boon')).length;
  check('the draft was dealt for the chosen house (Ashen Remnant: one more choice)', dealt >= 4 && dealt <= 5 && /Boon 1 of 4 for the Ashen Remnant/.test(await page.textContent('.draft-head')), `${dealt} choices`);
  const art = await look(page, '.boon:nth-child(1) .boon-art');
  check('Boon cards show what they affect', art.colors >= 4, `${art.colors} colors`);
  await page.screenshot({ path: '.shots/site-draft.png' });
  const before = await page.$$eval('.boon', (els) => els.map((e) => e.dataset.card).join());
  await page.click('[data-act="reroll"]');
  await wait(200);
  check('a reroll deals again', (await page.$$eval('.boon', (els) => els.map((e) => e.dataset.card).join())) !== before && /1 left/.test(await page.textContent('[data-act="reroll"]')));
  const first = await page.textContent('.boon:nth-child(2) .boon-name');
  await page.click('.boon:nth-child(2)');
  await wait(150);
  check('a pick flashes and the others fall dark', await page.evaluate(() => document.querySelector('.boon.taken') !== null && document.querySelectorAll('.boon.passed').length === document.querySelectorAll('.boon').length - 1));
  await wait(700);
  check('the pick is kept and the next Boon is dealt', /Boon 2 of 4/.test(await page.textContent('.draft-head')) && (await page.textContent('.tray li')) === first, first);
  for (let i = 0; i < 3; i++) {
    await page.click('.boon:nth-child(1)');
    await wait(750);
  }
  const end = await page.evaluate(() => ({ end: !!document.querySelector('.draft-end'), tray: document.querySelectorAll('.tray li').length, play: document.querySelector('.draft-end a')?.getAttribute('href'), text: document.querySelector('.draft-head').textContent }));
  check('after four picks the draft sums up and points to the game', end.end && end.tray === 4 && end.play === 'play/' && /That is 4 of \d+ Boons/.test(end.text), JSON.stringify(end));
  await page.screenshot({ path: '.shots/site-draft-end.png' });
  await page.evaluate(() => document.querySelector('.heir[data-heir="lyceum"]').click());
  await page.click('[data-act="again"]');
  await wait(300);
  const nyx = await page.evaluate(() => ({ n: document.querySelectorAll('.boon').length, head: document.querySelector('.draft-head').textContent }));
  check('drafting again deals for the house now chosen', nyx.n === 3 && /Lyceum Collective/.test(nyx.head), JSON.stringify(nyx));
  await page.screenshot({ path: '.shots/site-draft-again.png' });

  // ---------------- the rest
  await scrollTo(page, '#destinies');
  const dest = await page.$$eval('#destiny-list h3', (els) => els.map((e) => e.textContent));
  check('six Destinies, Conquest first', dest.length === 6 && dest[0] === 'CONQUEST', dest.join(', '));
  await page.screenshot({ path: '.shots/site-destinies.png' });
  // The Ages run has its section: the climb the game's title screen draws, with the six ages named under it.
  await scrollTo(page, '#ages');
  await page.waitForTimeout(600);
  const ages = await page.evaluate(() => {
    const c = document.querySelector('#ages canvas.mode-art');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    return { names: [...document.querySelectorAll('#ages .ages-names li')].map((x) => x.textContent).join(' '), drawn: n };
  });
  check('the Ages run has its section: the climb, with the six ages named', ages.names === 'STONE BRONZE IRON POWDER MACHINE SPACE' && ages.drawn > 50, `${ages.names}; ${ages.drawn} pixels`);
  await page.screenshot({ path: '.shots/site-ages.png' });
  await scrollTo(page, '#play');
  check('the Daily Run clock counts down', /^\d\d:\d\d:\d\d$/.test(await page.textContent('[data-daily-clock]')), await page.textContent('[data-daily-clock]'));
  check('every section is lit by the end', (await page.$$eval('.band', (els) => els.every((e) => e.classList.contains('lit')))) === true);
  await page.screenshot({ path: '.shots/site-play.png' });
  const links = await page.$$eval('a[href="play/"]', (els) => els.length);
  check('the page offers the game', links >= 2, `${links} links`);
  check('the game and the download are where the links point', (await fetch(base + 'play/')).ok && (await fetch(base + 'hegemarch.zip')).ok);
  check('the footer shows the version', /Hegemarch v\d+\.\d+\.\d+/.test(await page.textContent('footer')), await page.textContent('footer'));
  const foot = await page.$$eval('footer a', (els) => els.map((e) => e.getAttribute('href')));
  check('the footer leads to itch.io and to the source', foot.includes('https://hegemarch.itch.io/hegemarch') && foot.includes('https://github.com/tbrought/hegemarch'), foot.join(' '));
  // The page carries its own typefaces: it asks nothing of another site.
  const asked = await page.evaluate(async () => {
    await document.fonts.ready;
    return {
      fonts: document.fonts.check('12px "Press Start 2P"') && document.fonts.check('16px "Pixelify Sans"'),
      outside: performance.getEntriesByType('resource').map((e) => e.name).filter((u) => !u.startsWith(location.origin) && !u.startsWith('data:')),
    };
  });
  check('its typefaces come with it, and it asks nothing of another site', asked.fonts && asked.outside.length === 0, asked.outside.join(' '));
  check("the sound button is the game's: a speaker and the words", (await page.$('.sound svg')) !== null && /^SOUND (ON|OFF)$/.test((await page.textContent('.sound')).trim()), (await page.textContent('.sound')).trim());
  const lost = await (await fetch(base + '404.html')).text();
  check('an address with nothing at it has a page of its own, with the way back', /THIS WORLD IS DARK/.test(lost) && /href="\/play\/"/.test(lost) && !lost.includes('{{'));
  const game = await (await fetch(base + 'play/')).text();
  check("the game's page says what it is to a link, and says so with scripts off", /<noscript>/.test(game) && /name="description"/.test(game) && /theme-color/.test(game) && !/fonts\.googleapis/.test(game));
  check('nothing runs off the side', await noSideScroll(page));
  await page.screenshot({ path: '.shots/site-full.png', fullPage: true });
  check('no errors on the page', errors.length === 0, errors.slice(0, 3).join(' | '));

  // ------------------------------------------------------------------ other widths
  for (const [name, width, height] of [['laptop', 1180, 760], ['tablet', 820, 1100], ['phone', 390, 844]]) {
    const o = await open({ viewport: { width, height }, deviceScaleFactor: name === 'phone' ? 3 : 1, hasTouch: name === 'phone', isMobile: name === 'phone' });
    await o.page.waitForFunction(() => document.querySelector('.live-label')?.textContent === 'LIVE', null, { timeout: 40000 });
    await o.page.waitForTimeout(1500);
    await o.page.screenshot({ path: `.shots/site-${name}-hero.png` });
    const fits = await o.page.evaluate(() => {
      const hero = document.getElementById('hero').getBoundingClientRect();
      const play = document.querySelector('.hero .btn.primary').getBoundingClientRect();
      const logo = document.querySelector('.logo').getBoundingClientRect();
      const live = document.querySelector('.live').getBoundingClientRect();
      return { play: play.bottom <= hero.bottom + 1 && play.top >= 0, logo: logo.right <= window.innerWidth && logo.left >= 0, clear: logo.bottom < live.top && (live.bottom <= play.top + 1 || live.right <= play.left + 1) };
    });
    check(`${name}: the title, the live panel and PLAY all fit the opening screen`, fits.play && fits.logo && fits.clear, JSON.stringify(fits));
    for (const sel of ['#run', '#houses', '#ships', '#boons', '#destinies', '#ages', '#play']) await scrollTo(o.page, sel);
    check(`${name}: nothing runs off the side`, await noSideScroll(o.page));
    check(`${name}: every section lit`, await o.page.$$eval('.band', (els) => els.every((e) => e.classList.contains('lit'))));
    await o.page.screenshot({ path: `.shots/site-${name}-full.png`, fullPage: true });
    check(`${name}: no errors`, o.errors.length === 0, o.errors.slice(0, 3).join(' | '));
    await o.context.close();
  }

  // ------------------------------------------------------------------ less motion asked for
  {
    const o = await open({ reducedMotion: 'reduce' });
    await o.page.waitForTimeout(1200);
    const still = await o.page.evaluate(() => ({
      on: document.getElementById('hero').classList.contains('on'),
      watch: !document.querySelector('.watch').hidden,
      lit: [...document.querySelectorAll('.band')].every((e) => e.classList.contains('lit')),
      poster: getComputedStyle(document.querySelector('.poster')).opacity,
    }));
    check('with less motion: nothing starts by itself, a still picture stands in, every section is lit', !still.on && still.watch && still.lit && still.poster === '1', JSON.stringify(still));
    await o.page.screenshot({ path: '.shots/site-still.png' });
    await scrollTo(o.page, '#houses');
    const a = await look(o.page, '#house-cards .heir:nth-child(1) .heir-art');
    await o.page.waitForTimeout(400);
    const b = await look(o.page, '#house-cards .heir:nth-child(1) .heir-art');
    check('with less motion: pictures are drawn but stand still', a.colors >= 6 && a.sum === b.sum, `${a.colors} colors`);
    await o.page.evaluate(() => window.scrollTo(0, 0));
    await o.page.click('.watch');
    await o.page.waitForTimeout(1200);
    check('with less motion: the sector plays when asked', await o.page.evaluate(() => document.getElementById('hero').classList.contains('on') && document.querySelector('.watch').hidden));
    check('with less motion: no errors', o.errors.length === 0, o.errors.slice(0, 3).join(' | '));
    await o.context.close();
  }

  // ------------------------------------------------------------------ scripts off
  {
    const o = await open({ javaScriptEnabled: false }, '');
    await o.page.waitForTimeout(600);
    const plain = await o.page.evaluate(() => ({
      poster: getComputedStyle(document.querySelector('.poster')).opacity,
      play: document.querySelector('a[href="play/"]') !== null,
      hidden: [...document.querySelectorAll('.needs-js')].every((e) => getComputedStyle(e).display === 'none'),
      shown: getComputedStyle(document.getElementById('run')).display !== 'none',
      grey: getComputedStyle(document.querySelector('#run .band-body')).filter,
    })).catch(() => null);
    // (page.evaluate still works with the page's own scripts off.)
    check('with scripts off: the picture, the pitch and PLAY are there; empty sections are not', !!plain && plain.poster === '1' && plain.play && plain.hidden && plain.shown && plain.grey === 'none', JSON.stringify(plain));
    await o.page.screenshot({ path: '.shots/site-noscript.png', fullPage: true });
    await o.context.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
