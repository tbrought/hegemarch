/**
 * The dialogs that are read or set, not answered: the menu of a run, its settings, How to Play (the
 * basics, the controls, every tip again), the comms log, and the question before something that cannot
 * be undone.
 */

import { ERAS, LAST_CRADLE_ERA } from '../../game/data/eras';
import { fit, IC, lineHeight, text, textCenter, textWidth, wrap } from '../../render/font';
import { PAL } from '../../render/palette';
import { rect, type Ctx } from '../../render/pixel';
import { fmtTime } from '../../render/Renderer';
import { icon } from '../../render/sprites';
import type { HelpTab, Modals } from '../Modals';
import { TIPS } from '../Tips';

/** The dialogs that are read (Status, How to Play, the Comms Log) are one size: going from one to another, nothing jumps. */
export const BOOK_W = 420;
export const BOOK_H = 250;

/** Tips in the order a run usually meets them. */
const TIP_ORDER = ['role', 'fleet', 'boonReady', 'raid', 'anomalySeen', 'anomaly', 'blueprint', 'hangar', 'arkLevel', 'lostWorld', 'converted', 'crisis'];

/** Tips of the cradle of an Ages run (listed first there, last elsewhere). */
const AGES_TIPS = ['ageReady', 'ageNew', 'ageSiege', 'ageRival', 'ageGone', 'ageArk'];

export function menu(modals: Modals, g: Ctx) {
  const w = 150;
  const items: [string, () => void, boolean?][] = [
    ['RESUME', () => modals.close()],
    ['SETTINGS', () => (modals.s.modal = { kind: 'settings' })],
    ['HOW TO PLAY', () => (modals.s.modal = { kind: 'help' })],
    ['STATUS', () => (modals.s.modal = { kind: 'status' }), !modals.s.reveal().destinies && modals.s.guided],
    ['SAVE AND QUIT', () => modals.s.hooks.quit(true)],
    [
      'ABANDON RUN',
      () => (modals.s.modal = { kind: 'confirm', text: 'Abandon this run? It will count as a defeat.', yes: 'ABANDON', onYes: () => modals.s.hooks.abandon() }),
    ],
  ];
  const h = 22 + items.length * 15 + 4;
  const { x, y } = modals.frame(g, w, h, 'PAUSED');
  items.forEach(([label, act, dis], i) => {
    modals.ui.button(g, 'm-' + i, x + 10, y + 20 + i * 15, w - 20, 13, label, act, { disabled: !!dis, danger: label === 'ABANDON RUN', primary: i === 0 });
  });
}

export function settings(modals: Modals, g: Ctx) {
  const st = modals.s.profile.settings;
  const w = 220;
  const full = modals.s.hooks.fullscreen();
  const h = 178 + (full === null ? 0 : 14);
  const { x, y } = modals.frame(g, w, h, 'SETTINGS');
  modals.closeButton(g, x, y, w);
  const save = () => {
    modals.s.hooks.saveProfile();
    modals.s.hooks.applySettings();
  };
  let ly = y + 20;
  modals.ui.button(g, 'tg-sound', x + 10, ly, w - 20, 12, 'Sound', () => {
    st.muted = !st.muted;
    save();
  }, { right: st.muted ? 'OFF' : 'ON', rightColor: st.muted ? PAL.slate : PAL.teal, align: 'left', tip: 'Music and sound effects, on or off. The volumes below are kept.' });
  ly += 15;
  const vol = (label: string, key: 'master' | 'sfx' | 'music') => {
    text(g, label, x + 10, ly, PAL.mist);
    modals.ui.slider(g, 'vol-' + key, x + 90, ly + 1, w - 104, st[key], (v) => {
      st[key] = Math.round(v * 20) / 20;
      save();
    });
    ly += 13;
  };
  vol('Volume', 'master');
  vol('Effects', 'sfx');
  vol('Music', 'music');
  // The track that plays, and a way on to the next of its mood (a run plays the music that fits the moment).
  const track = modals.s.music.title;
  modals.ui.button(g, 'tg-track', x + 10, ly + 1, w - 20, 12, fit(`Track: ${track ?? 'none'}`, w - 60), () => modals.s.music.skip(), {
    right: 'NEXT', rightColor: PAL.gold, align: 'left', disabled: !track, tip: 'Play another track. A run chooses its music by the moment: a quiet night, a battle. This goes on to the next track of the same kind.',
  });
  ly += 16;
  const toggle = (label: string, key: 'autoPause' | 'crt' | 'edgePan' | 'tips' | 'explainTerms', tip: string) => {
    modals.ui.button(g, 'tg-' + key, x + 10, ly, w - 20, 12, label, () => {
      st[key] = !st[key];
      save();
    }, { right: st[key] ? 'ON' : 'OFF', rightColor: st[key] ? PAL.teal : PAL.slate, align: 'left', tip });
    ly += 14;
  };
  toggle('Auto-pause for decisions', 'autoPause', 'Pause when your ship reaches an anomaly, when a visitor hails you, on the first raid, or when your Hearth is attacked.');
  toggle('First-time tips', 'tips', 'One-line cards that explain things the first time they happen.');
  toggle('Explain game terms', 'explainTerms', 'Boxes beside tooltips that explain game terms such as Kindle, Glow or Hangar.');
  toggle('Scanlines (CRT)', 'crt', 'An old-monitor scanline filter.');
  toggle('Edge scrolling', 'edgePan', 'Move the view when the pointer touches the edge of the screen.');
  if (full !== null) {
    modals.ui.button(g, 'tg-full', x + 10, ly, w - 20, 12, 'Fullscreen', () => modals.s.hooks.toggleFullscreen(), {
      right: full ? 'ON' : 'OFF', rightColor: full ? PAL.teal : PAL.slate, align: 'left', tip: 'Fill the whole screen with the game. Esc leaves it.',
    });
    ly += 14;
  }
  ly += 2;
  text(g, 'Pixel size', x + 10, ly + 3, PAL.mist);
  const sizes: ['small' | 'auto' | 'large', string, string][] = [
    ['small', 'SMALL', 'Small pixels: see more of the sector at once (640×360 game pixels).'],
    ['auto', 'AUTO', 'Fit the window: at least 480×270 game pixels, scaled up in whole steps.'],
    ['large', 'LARGE', 'Large pixels: bigger text and ships (400×225 game pixels).'],
  ];
  let bx = x + 90;
  for (const [id, label, tip] of sizes) {
    modals.ui.button(g, 'px-' + id, bx, ly, 38, 12, label, () => {
      st.pixelSize = id;
      save();
    }, { font: 'tiny', selected: st.pixelSize === id, tip });
    bx += 40;
  }
}

export function help(modals: Modals, g: Ctx) {
  const W = modals.hud.W;
  const H = modals.hud.H;
  const w = Math.min(W - 12, BOOK_W);
  const h = Math.min(H - 12, BOOK_H);
  const { x, y } = modals.frame(g, w, h, 'HOW TO PLAY');
  modals.closeButton(g, x, y, w);
  const tabs: [HelpTab, string][] = [['basics', 'THE BASICS'], ['controls', 'CONTROLS'], ['tips', 'TIPS']];
  let tx = x + 6;
  for (const [id, label] of tabs) {
    const tw = textWidth(label, 'tiny') + 10;
    modals.ui.button(g, 'htab-' + id, tx, y + 15, tw, 11, label, () => {
      modals.helpTab = id;
      modals.helpScroll = 0;
    }, { font: 'tiny', selected: modals.helpTab === id });
    tx += tw + 2;
  }
  const cx = x + 8;
  const top = y + 31;
  const cw = w - 16;
  const seen = modals.s.profile.seenTips;
  // THE BASICS is the game in five numbered moves, each under its own heading, like How to Play on the
  // title screen (app/howto.ts): a page of paragraphs is opened and not read.
  const step = (n: number, head: string, t: string) => ({ n, head, text: t, color: PAL.mist });
  const note = (head: string, t: string) => ({ head, text: t, color: PAL.mist });
  const paras: { text: string; color: string; star?: boolean; head?: string; n?: number }[] =
    modals.helpTab === 'basics' && modals.g.cradle
      ? [
          { text: 'Every house begins here in the Stone Age, all on one planet. Climb the ages, build your Ark, and carry what you have won to the stars, where the crown is decided.', color: PAL.bone },
          step(1, 'KINDLE LANDS', 'Click a grey land and press KINDLE. A firebearer walks out, lights the land and stays there; if the firebearer is killed on the way, the Embers are lost. Each land costs a bit more. Beasts hold the richest lands: drive them off first.'),
          step(2, 'GIVE EACH LAND A ROLE', 'MINE: more Embers. FORGE: builds units. OBSERVATORY: Lore, so a faster climb. BASTION: guns and repairs.'),
          step(3, 'RAISE UNITS', 'Swift units beat siege units, siege units beat sturdy units and walls, sturdy units beat swift ones. Their names change with the ages; the triangle does not.'),
          step(4, 'CLIMB THE AGES', `Your Lore is saved for the next age. When the bar at the top is full, press the button beside it (or A). The step costs Embers and takes time at your Hearth; an attack on the Hearth stops the work. There are five ages: ${ERAS.slice(0, LAST_CRADLE_ERA + 1).map((e) => e.name.replace(' Age', '')).join(', ')}. A new age brings stronger units, more to build (siege units and Bastions with bronze, higher levels later), and one Boon. Every unit you already have is upgraded to it, wherever it stands.`),
          step(5, 'BUILD YOUR ARK', 'The Ark is the last step. When yours is done, your house leaves for the stars with its Boons and Embers. A rival whose Ark leaves first is ahead of you out there; a rival whose Hearth you put out here never follows.'),
          note('THE HEARTH', 'Lose your Hearth and your house goes dark. Put out every rival Hearth before any Ark rises, and the crown is yours at once.'),
        ]
      : modals.helpTab === 'basics'
      ? [
          { text: 'The sector is dark. Light it, world by world, and take the crown.', color: PAL.bone },
          step(1, 'KINDLE WORLDS', 'Click a grey world and press KINDLE. A seed ship flies out, lights it and is used up; if it is destroyed on the way, the Embers are lost. Every lit world earns Embers, and each one costs a bit more than the last.'),
          step(2, 'GIVE EACH WORLD A ROLE', 'MINE: more Embers. FORGE: builds ships. OBSERVATORY: Lore. BASTION: guns, repairs, and it protects your worlds next to it. Raise worlds to level II and III for more of everything.'),
          step(3, 'BUILD A FLEET', 'Strikers beat Breakers, Breakers beat Guardians and worlds, Guardians beat Strikers. New ships come as Blueprint Boons. Scouts wait for your order: select one (click its fleet badge) and press EXPLORE, and it charts the dark by itself.'),
          step(4, 'CHOOSE BOONS', 'When your Lore fills, choose one Boon of three. They shape every run differently, and line the left edge of the screen.'),
          step(5, 'TAKE THE CROWN', 'Follow one of your three Destinies to the crown (U shows them). Lose your Hearth and your house goes dark.'),
          note('WHAT IS COMING', 'Corsairs raid from about 10:00 and rivals attack from about 12:00. Hearth walls start at half strength and are full at 12:00: a rush can win early, but if it fails your rivals will strike back.'),
          note('NOT SURE WHAT SOMETHING IS?', 'Point at it. Tooltips, Boon cards, events and Destinies explain the game terms they use in boxes beside them (Settings can turn this off). To look inside an anomaly (a violet swirl), send any ship there.'),
        ]
      : modals.helpTab === 'controls'
        ? [
            `Left-click: select a world, a ship or a fleet badge (${IC.fleet}, the number of ships beside a world). Drag: select ships.`,
            'With ships selected, click a world (or right-click) to send them; their way shows for a moment, red where you know of danger. Shift+right-click: one more stop on the way. Right-click an enemy ship to attack it.',
            'Wheel: zoom. Right- or middle-drag, or the arrow keys: move the view. C: look at your Hearth.',
            'Space: pause. Paused, you can still look around and give orders; the game goes on when you press Space again. The ½ 1 2 3 buttons at the top right (or + and -): game speed.',
            'Q W E R T Y: with a Forge (or your Hearth) selected, build its ships, in the order of its buttons. Shift: five.',
            'Tab: go to your next Forge, the idle ones first (Shift+Tab: back). The number beside the Forge at the top counts the idle ones.',
            'B: Boons. U: status. L: comms log. F: select all warships. K: kindle the selected world. S: stop. R: retreat.',
            'E: send the selected Scouts exploring. With no Scout selected, E picks your idle Scouts first: press it again to send them.',
            'Shift-click a ship button: queue five. Shift-click ships: add to the selection. Double-click a ship: select all of its kind nearby.',
            'Ctrl+1 to 9: save the selected ships as a group. 1 to 9: select that group again. Esc: cancel, or open the menu.',
          ].map((t) => ({ text: t, color: PAL.mist }))
        : [
            { text: 'Each of these pops up once, the first time it matters. They are all here to read again.', color: PAL.dusk },
            ...(modals.g.cradle ? [...AGES_TIPS, ...TIP_ORDER.filter((id) => ['role', 'fleet', 'hangar', 'lostWorld'].includes(id))] : modals.g.config.mode === 'ages' ? TIP_ORDER : [...TIP_ORDER, ...AGES_TIPS]).map((id) => ({
              text: TIPS[id], color: seen.includes(id) ? PAL.mist : PAL.dusk, star: true,
            })),
          ];
  // Lay out, then draw inside a clipped area that scrolls with the wheel.
  const lh = lineHeight('main');
  // (A tip hangs from its star, a numbered step from its number; a heading stands on a line of its own.)
  const blocks = paras.map((p) => {
    const indent = p.star ? 9 : p.n ? 13 : 0;
    return { ...p, indent, lines: wrap(p.text, cw - indent, 'main'), gap: p.head ? 7 : 4 };
  });
  const total = blocks.reduce((a, b) => a + (b.head ? lh + 1 : 0) + b.lines.length * lh + b.gap, 0);
  const ah = y + h - 6 - top;
  modals.helpScrollMax = Math.max(0, total - ah);
  modals.helpScroll = Math.min(modals.helpScroll, modals.helpScrollMax);
  g.save();
  g.beginPath();
  g.rect(cx, top - 1, cw + 1, ah + 1);
  g.clip();
  let ly = top - modals.helpScroll;
  for (const b of blocks) {
    if (b.head) {
      if (ly + lh > top && ly < top + ah) {
        if (b.n) {
          rect(g, cx, ly - 1, 9, 9, PAL.gold);
          text(g, String(b.n), cx + 2, ly, PAL.void);
        }
        text(g, b.head, cx + b.indent, ly, PAL.gold);
      }
      ly += lh + 1;
    }
    if (b.star) icon(g, 'star', cx, ly, b.color === PAL.mist ? undefined : PAL.slate, b.color !== PAL.mist);
    for (const l of b.lines) {
      if (ly + lh > top && ly < top + ah) text(g, l, cx + b.indent, ly, b.color);
      ly += lh;
    }
    ly += b.gap;
  }
  g.restore();
  if (modals.helpScrollMax > 0) {
    const sx = x + w - 5;
    rect(g, sx, top, 1, ah, PAL.indigo);
    const th = Math.max(10, Math.round((ah * ah) / total));
    rect(g, sx, top + Math.round(((ah - th) * modals.helpScroll) / modals.helpScrollMax), 1, th, PAL.dusk);
  }
}

export function logView(modals: Modals, g: Ctx) {
  const W = modals.hud.W;
  const H = modals.hud.H;
  const w = Math.min(W - 12, BOOK_W);
  const h = Math.min(H - 12, BOOK_H);
  const { x, y } = modals.frame(g, w, h, 'COMMS LOG');
  modals.closeButton(g, x, y, w);
  // Every message in full, newest first, with the time it happened. The wheel scrolls.
  const top = y + 17;
  const ah = y + h - 6 - top;
  const tx = x + 34;
  const tw = w - 46;
  const blocks = [...modals.hud.log].reverse().map((l) => ({ l, lines: wrap(l.text, tw, 'main') }));
  const total = blocks.reduce((a, b) => a + b.lines.length * 10 + 3, 0);
  modals.logScrollMax = Math.max(0, total - ah);
  modals.logScroll = Math.min(modals.logScroll, modals.logScrollMax);
  if (!blocks.length) text(g, 'Nothing has happened yet.', x + 8, top, PAL.dusk);
  g.save();
  g.beginPath();
  g.rect(x + 4, top - 1, w - 8, ah + 1);
  g.clip();
  let ly = top - modals.logScroll;
  for (const { l, lines } of blocks) {
    const bh = lines.length * 10;
    if (ly + bh > top && ly < top + ah) {
      const col = { info: PAL.mist, good: PAL.teal, bad: PAL.red, alert: PAL.ember, event: PAL.violet }[l.kind];
      const jump = l.node !== undefined && l.node >= 0;
      const id = 'loglist-' + l.id;
      if (jump && modals.ui.isHot(id)) rect(g, x + 6, ly - 1, w - 16, bh + 1, PAL.indigo);
      text(g, fmtTime(l.t), x + 8, ly + 1, PAL.slate, 'tiny');
      lines.forEach((t, k) => text(g, t, tx, ly + k * 10, col));
      if (jump) {
        const node = l.node!;
        const cy = Math.max(ly - 1, top);
        modals.ui.hit(id, x + 6, cy, w - 16, Math.min(ly + bh, top + ah) - cy, () => {
          modals.s.focusNode(node);
          modals.close();
        }, `Click to look at ${modals.g.nodes[node].name}.`);
      }
    }
    ly += bh + 3;
  }
  g.restore();
  if (modals.logScrollMax > 0) {
    const sx = x + w - 5;
    const th = Math.max(8, Math.round((ah * ah) / total));
    rect(g, sx, top, 1, ah, PAL.indigo);
    rect(g, sx, top + Math.round(((ah - th) * modals.logScroll) / modals.logScrollMax), 1, th, PAL.dusk);
  }
}

export function confirm(modals: Modals, g: Ctx, msg: string, yes: string, onYes: () => void) {
  const w = 210;
  const lines = wrap(msg, w - 20, 'main');
  const h = 40 + lines.length * 10;
  const { x, y } = modals.frame(g, w, h, 'ARE YOU SURE?', PAL.red);
  lines.forEach((l, i) => textCenter(g, l, x + w / 2, y + 18 + i * 10, PAL.mist));
  const by = y + h - 17;
  modals.ui.button(g, 'cf-no', x + 10, by, 80, 13, 'CANCEL', () => modals.close());
  modals.ui.button(g, 'cf-yes', x + w - 90, by, 80, 13, yes, () => {
    modals.s.modal = null;
    onYes();
  }, { danger: true });
}
