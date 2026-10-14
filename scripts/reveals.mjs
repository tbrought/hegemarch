// Things that come in (the omens, a decision and its outcome, a Boon draft, a level-up) and the keys and
// clicks that meet them: held for a moment when they opened by themselves, a key or a click bringing all
// of it and choosing nothing, a double click choosing once, put away and opened again. And where the new
// moments meet: a herald behind a dialog and at the end of the run, goals reached behind a dialog and two
// at once (the Ember count never held back while a dialog stays open).
//   node scripts/reveals.mjs     (npm run test:reveals; needs a dev server)
import { checks, DEV_URL, gameUi, openBrowser } from './lib/browser.mjs';

const { browser, page, errors } = await openBrowser({ viewport: { width: 1280, height: 720 } });
const { wait, ev, uiRect } = gameUi(page);
const { check, done } = checks();
await page.addInitScript(() => localStorage.setItem('hegemarch.profile.v1', JSON.stringify({
  tutorialDone: true, runs: 6, seenTips: ['role', 'raid', 'anomaly', 'fleet', 'hangar', 'boonReady', 'anomalySeen', 'blueprint', 'crisis', 'arkLevel', 'lostWorld', 'converted', 'starfall'],
  settings: { autoPause: false, tips: true },
})));
await page.goto(DEV_URL);
await wait(1500);
await page.click('[data-sa="setup"]');
await page.click('[data-sa="launch"]');
await page.waitForFunction(() => window.__app?.screen === 'game', null, { timeout: 60000 });
await wait(600);
const st = () => ev(() => {
  const a = window.__app;
  const m = a.hud.modals;
  return { modal: a.session.modal?.kind ?? null, guarded: m.guarded(), revealing: m.revealing() };
});
/** A region's middle on the page. */
const onPage = (id) =>
  ev((rid) => {
    const a = window.__app;
    const r = a.hud.ui.rectOf(rid);
    const c = a.canvas.getBoundingClientRect();
    const k = c.width / a.session.screen.W;
    return r && { x: c.left + (r.x + r.w / 2) * k, y: c.top + (r.y + r.h / 2) * k };
  }, id);
/** A click at a region's place now, guard or no guard. */
const clickAt = async (id) => {
  const p = await onPage(id);
  if (!p) return false;
  await page.mouse.click(p.x, p.y);
  return true;
};
const key = async (k) => {
  await page.keyboard.press(k);
  await wait(60);
};

// ---- The omens: a key in the guard does nothing; after it, Enter brings all and keeps the card; Enter then closes it.
await ev(() => (window.__app.session.modal = { kind: 'omens', unbidden: true }));
await wait(100);
await key('Enter');
let s = await st();
check('omens: Enter while it is held does nothing', s.modal === 'omens' && s.revealing, JSON.stringify(s));
await wait(1000);
await clickAt('omens-begin');
await wait(80);
s = await st();
check('omens: a click on BEGIN while they come brings them all, and does not begin', s.modal === 'omens' && !s.revealing, JSON.stringify(s));
await wait(100);
const begunAt = await ev(() => window.__app.hud.clock);
const flashBefore = await ev(() => window.__app.hud.boonReadyAt);
await clickAt('omens-begin');
await wait(80);
check('omens: BEGIN then begins', (await st()).modal === null);
// The run opened with a Boon waiting: its button flashes once the omens are put away, not unseen under them.
check('the BOON button flashes once the omens are put away, not under them', flashBefore < 0 && (await ev(() => window.__app.hud.boonReadyAt)) >= begunAt, `${flashBefore} ${begunAt} ${await ev(() => window.__app.hud.boonReadyAt)}`);

// ---- A decision that opens by itself: held, then a key brings all and answers nothing; then it answers; the outcome.
await ev(() => {
  const a = window.__app;
  const g = a.session.game;
  g.player.embers = 5000;
  g.prompts.push({ id: 990001, event: 'comet', node: g.player.capital, unit: -1 });
  a.hud.modals.open({ kind: 'event', promptId: 990001, unbidden: true });
});
await wait(100);
await key('Digit1');
await clickAt('ev-skip');
s = await st();
const unanswered = () => ev(() => window.__app.session.game.prompts.find((p) => p.id === 990001)?.result === undefined);
check('decision: a key or a click in its first second does nothing', s.revealing && (await unanswered()), JSON.stringify(s));
await wait(1000);
await key('Digit1');
s = await st();
check('decision: then a number brings all of it and answers nothing', !s.revealing && (await unanswered()), JSON.stringify(s));
// A double click on a choice answers once.
const c0 = await onPage('choice-0');
await page.mouse.dblclick(c0.x, c0.y);
await wait(80);
s = await st();
check('decision: a double click answers once; the outcome comes in', !(await unanswered()) && s.modal === 'event' && s.revealing, JSON.stringify(s));
await wait(600);
await key('Enter');
s = await st();
check('decision: Enter brings all of the outcome', s.modal === 'event' && !s.revealing && !!(await uiRect('ev-ok')), JSON.stringify(s));
await key('Enter');
check('decision: and Enter then goes on, as CONTINUE does', (await st()).modal === null && (await ev(() => !window.__app.session.game.prompts.some((p) => p.id === 990001))));

// ---- Esc while a decision comes in puts it away; opened again, it is all there at once.
await ev(() => {
  const a = window.__app;
  const g = a.session.game;
  g.prompts.push({ id: 990002, event: 'derelict', node: g.player.capital, unit: -1 });
  a.hud.modals.open({ kind: 'event', promptId: 990002 });
});
await wait(300);
await key('Escape');
check('decision: Esc while it comes puts it away, unanswered', (await st()).modal === null && (await ev(() => window.__app.session.game.prompts.find((p) => p.id === 990002)?.result === undefined)));
await wait(2600);
await ev(() => window.__app.hud.modals.open({ kind: 'event', promptId: 990002 }));
await wait(150);
check('decision: opened again once its time is past, it is all there at once', !(await st()).revealing);
await ev(() => {
  window.__app.hud.modals.close();
  window.__app.session.game.prompts = window.__app.session.game.prompts.filter((p) => p.id !== 990002);
});

// ---- A Boon draft: a number while it is dealt brings all and takes none; then takes one; the next deal; a key in the guard after a choice does nothing.
await ev(() => {
  const a = window.__app;
  const p = a.session.game.player;
  p.pendingDrafts = 2;
  p.draftOffer = null;
  a.hud.modals.open({ kind: 'draft' });
});
await wait(150);
const boons = () => ev(() => window.__app.session.game.player.cards.length);
const b0 = await boons();
await key('Digit2');
s = await st();
check('draft: a number while it is dealt brings all and takes none', !s.revealing && (await boons()) === b0, JSON.stringify(s));
await key('Digit2');
s = await st();
check('draft: then it takes that one, and the next is dealt', (await boons()) === b0 + 1 && s.modal === 'draft' && s.revealing, JSON.stringify(s));
await key('Digit1');
check('draft: a number in the moment after a choice takes nothing', (await boons()) === b0 + 1);
await wait(400);
await clickAt('reroll');
await wait(80);
s = await st();
check('draft: a reroll while it is dealt deals anew', s.revealing || (await ev(() => window.__app.session.game.player.rerolls)) === 0, JSON.stringify(s));
await clickAt('later');
await wait(2600);
await ev(() => window.__app.hud.modals.open({ kind: 'draft' }));
await wait(150);
check('draft: put off and opened again once its time is past, it is all there at once', !(await st()).revealing);
await ev(() => {
  const p = window.__app.session.game.player;
  p.pendingDrafts = 0;
  p.draftOffer = null;
  window.__app.session.modal = null;
});

// ---- A level-up of two levels: held; a key brings all; a number takes one; the next comes in anew.
await ev(() => {
  const a = window.__app;
  const g = a.session.game;
  const ark = g.units.get(g.player.ark);
  ark.pendingAbil = [];
  g.grantLevels(ark, 5 - ark.level);
  a.hud.modals.open({ kind: 'ability', unitId: ark.id, unbidden: true });
});
await wait(100);
await key('Digit1');
const pend = () => ev(() => window.__app.session.game.units.get(window.__app.session.game.player.ark).pendingAbil.length);
s = await st();
check('level-up: a key in its first second does nothing', s.revealing && (await pend()) === 2, JSON.stringify(s));
await wait(1000);
await key('Digit1');
s = await st();
check('level-up: then a number brings all and takes none', !s.revealing && (await pend()) === 2, JSON.stringify(s));
await key('Digit2');
s = await st();
check('level-up: then a number takes one, and the next comes in anew', (await pend()) === 1 && s.modal === 'ability' && s.revealing, JSON.stringify(s));
await key('Digit1');
check('level-up: a number in the moment after a choice takes nothing', (await pend()) === 1);
await key('Escape');
await wait(1500);
await ev(() => window.__app.hud.modals.open({ kind: 'ability', unitId: window.__app.session.game.player.ark }));
await wait(150);
check('level-up: put off and opened again, it is all there at once', !(await st()).revealing && (await pend()) === 1);
await ev(() => {
  const g = window.__app.session.game;
  const ark = g.units.get(g.player.ark);
  g.cmdChooseAbility(g.playerId, ark.id, ark.pendingAbil[0][0]);
  window.__app.session.modal = null;
});

// ---- A herald waits behind a dialog; is never drawn over the end of the run.
const tell = (title) => ev((t) => window.__app.session.game.notify(-1, t, 'alert', undefined, false, { title: t, sub: 'A line.', tone: 'red' }), title);
await ev(() => window.__app.hud.modals.open({ kind: 'status' }));
await tell('BEHIND A DIALOG');
await wait(500);
check('herald: waits while a dialog is open', (await ev(() => window.__app.hud.heralds[0]?.at)) === -1);
await ev(() => window.__app.hud.modals.close());
await wait(300);
check('herald: and shows once it is closed', (await ev(() => window.__app.hud.heraldRect.w)) > 0);
await ev(() => (window.__app.hud.heralds.length = 0));
// One that has begun stands still behind a dialog opened over it, and goes on where it was.
await tell('OVERTAKEN BY A DIALOG');
await wait(300);
await ev(() => window.__app.hud.modals.open({ kind: 'status' }));
await wait(4000);
await ev(() => window.__app.hud.modals.close());
await wait(200);
check('herald: one that has begun stands still behind a dialog opened over it, and goes on after', (await ev(() => window.__app.hud.heralds[0]?.h.title)) === 'OVERTAKEN BY A DIALOG' && (await ev(() => window.__app.hud.heraldRect.w)) > 0);
await ev(() => (window.__app.hud.heralds.length = 0));
// It waits behind a tip card that holds the game (the same news often brings one).
await ev(() => {
  const a = window.__app;
  a.session.profile.settings.autoPause = true;
  a.session.profile.seenTips = a.session.profile.seenTips.filter((x) => x !== 'crisis');
  a.hud.tips.show('crisis');
});
await tell('BEHIND A TIP');
await wait(4000);
check('herald: waits behind a tip card that holds the game', (await ev(() => window.__app.session.tipHold && window.__app.hud.heralds[0]?.h.title === 'BEHIND A TIP' && !window.__app.hud.heraldRect.w)));
await ev(() => window.__app.hud.tips.dismiss());
await wait(300);
check('herald: and shows once the card is put away', (await ev(() => window.__app.hud.heraldRect.w)) > 0);
await ev(() => {
  window.__app.hud.heralds.length = 0;
  window.__app.session.profile.settings.autoPause = false;
});
// Once it has come in, it keeps its place: a card that comes up meanwhile does not make it jump.
await tell('KEEPS ITS PLACE');
await wait(700);
const placed = await ev(() => window.__app.hud.heraldRect.y);
await ev(() => {
  const a = window.__app;
  a.session.profile.seenTips = a.session.profile.seenTips.filter((x) => x !== 'ageReady');
  a.hud.tips.show('ageReady');
});
await wait(400);
check('herald: once in, it keeps its place when a card comes up', (await ev(() => window.__app.hud.tips.rect.w)) > 0 && (await ev(() => window.__app.hud.heraldRect.y)) === placed, `${placed} ${await ev(() => window.__app.hud.heraldRect.y)}`);
await ev(() => {
  window.__app.hud.tips.dismiss();
  window.__app.hud.heralds.length = 0;
});
// The same moment again within a minute: told at the top as any other news, not heralded.
await tell('BEHIND A TIP');
await wait(200);
check('herald: the same moment again within a minute is told at the top, not heralded', (await ev(() => window.__app.hud.heralds.length === 0 && /BEHIND A TIP/.test(window.__app.session.toast?.text ?? ''))));

// ---- A goal reached while a dialog is open: the count must not show less than the house has while it waits.
await ev(() => {
  const a = window.__app;
  a.session.profile.goalsDone = [];
  a.session.paused = false;
  a.hud.modals.open({ kind: 'status' });
  a.session.game.ui.roleSet = 1;
});
await wait(1500);
const held = await ev(() => ({ away: window.__app.hud.embersAway, shown: Math.round(window.__app.hud.embersShown), embers: Math.round(window.__app.session.game.player.embers), marking: window.__app.hud.goals.marking() }));
check('goal: reached behind a dialog, the count is not held back while the dialog stays open', held.marking && Math.abs(held.shown - held.embers) <= 2, JSON.stringify(held));
await ev(() => window.__app.hud.modals.close());
await wait(2600);
const after = await ev(() => ({ away: window.__app.hud.embersAway, shown: Math.round(window.__app.hud.embersShown), embers: Math.round(window.__app.session.game.player.embers), marking: window.__app.hud.goals.marking() }));
check('goal: once it is closed, it is marked, and the count is right', !after.marking && after.away === 0 && Math.abs(after.shown - after.embers) <= 2, JSON.stringify(after));

// ---- Two goals reached at once: marked one after the other; the count right at the end.
await ev(() => {
  const g = window.__app.session.game;
  g.ui.raised = 1;
  window.__app.session.profile.goalsDone = window.__app.session.profile.goalsDone.filter((x) => x !== 'role');
  delete g.ui['goal:role'];
});
await wait(800);
const two = await ev(() => ({ away: window.__app.hud.embersAway, marking: window.__app.hud.goals.marking() }));
check('goals: two at once are both marked', two.marking && two.away >= 40, JSON.stringify(two));
await wait(5000);
const end = await ev(() => ({ away: window.__app.hud.embersAway, shown: Math.round(window.__app.hud.embersShown), embers: Math.round(window.__app.session.game.player.embers), marking: window.__app.hud.goals.marking() }));
check('goals: then the count holds them all', !end.marking && end.away === 0 && Math.abs(end.shown - end.embers) <= 3, JSON.stringify(end));

// ---- News that comes together plays each of its sounds once (a Hearth taken: its fall, its Boon, its goal).
const sounds = await ev(() => {
  const a = window.__app;
  const heard = [];
  const play = a.sfx.play.bind(a.sfx);
  a.sfx.play = (id, v) => {
    heard.push(`${Math.round(a.hud.clock * 100)}:${id}`);
    return play(id, v);
  };
  a.__heard = heard;
  const g = a.session.game;
  const r = g.empires().find((f) => f.id !== g.playerId && f.alive);
  g.planetDefeated(g.nodes[r.capital], g.playerId);
  g.flushDeferred();
  return true;
});
await wait(400);
const heard = await ev(() => window.__app.__heard);
check('news that comes together plays each of its sounds once', sounds && heard.length > 0 && new Set(heard).size === heard.length, heard.join(', '));
// A level-up that opens has its own sound, and not the dialog's click over it.
await ev(() => {
  const a = window.__app;
  a.__heard.length = 0;
  a.session.modal = null;
  const g = a.session.game;
  const ark = g.units.get(g.player.ark);
  ark.pendingAbil = [];
  g.grantLevels(ark, 7 - ark.level);
  a.hud.modals.open({ kind: 'ability', unitId: ark.id, unbidden: true });
});
await wait(300);
const opened = await ev(() => window.__app.__heard.map((x) => x.split(':')[1]));
check('a level-up opens with its own sound, not the click of a dialog over it', opened.includes('levelup') && !opened.includes('ui'), opened.join(', '));
await ev(() => {
  const g = window.__app.session.game;
  g.units.get(g.player.ark).pendingAbil = [];
  window.__app.session.modal = null;
});

// ---- The run's end leaves no herald on screen.
await tell('THE LAST HERALD');
await ev(() => window.__app.session.game.declareWinner(window.__app.session.game.playerId, 'conquest', 'Test.'));
await wait(500);
check('herald: never over the end of the run', (await ev(() => window.__app.hud.heraldRect.w)) === 0);
check('no console errors', errors.length === 0, errors.join(' | '));
await browser.close();
process.exit(done(errors));
