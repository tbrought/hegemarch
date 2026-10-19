/**
 * The House Power's button (1.27): always there in a run (greyed, with the reason, when the power cannot be
 * cast), above the minimap, in the house's colour, with its key (D) on it and the time until it is back filling
 * under its name. D, or a click, aims it: the map shows what it would do (Renderer) and the banner says it
 * (`aimLine`); D again, or a click, casts it. Escape or a right-click puts it away.
 */

import { burnable, dawnGuards, dawnWorlds, levyWorlds, POWER_WHY, powerClock, powerOf, rivalArk, wayTargets, wayWhy } from '../../game/commands/power';
import { ABILITY_BY_ID, LEVY_SHIPS, POWER_FIRST } from '../../game/data/abilities';
import { conversionTargets } from '../../game/systems/abilities';
import { possessive } from '../../game/util';
import { fit, text, textWidth } from '../../render/font';
import { PAL, shade } from '../../render/palette';
import { box, rect } from '../../render/pixel';
import { gloss } from '../glossary';
import type { Hud } from '../Hud';

/** The power's key. */
export const POWER_KEY = 'D';

/** Where the power's button stands: over the minimap, as wide as it is; in the corner if there is no minimap. */
function place(hud: Hud): { x: number; y: number; w: number; h: number } {
  const h = 15;
  const m = hud.minimapRect;
  if (m.w > 0) return { x: m.x, y: m.y - h - 3, w: m.w, h };
  const w = 110;
  return { x: hud.W - 3 - w, y: hud.H - 3 - h, w, h };
}

export function drawPower(hud: Hud) {
  hud.powerRect = { x: 0, y: 0, w: 0, h: 0 };
  const game = hud.g;
  const p = game.player;
  const def = powerOf(p);
  if (!def) return;
  const g = hud.s.screen.g;
  const why = game.checkPower(p.id);
  const ready = !why || why === POWER_WHY.aim;
  const aiming = !!hud.s.view.powerAim;
  const { x, y, w, h } = place(hud);
  const hot = hud.ui.isHot('power');
  // Ready: lit; aimed: gold; not ready: greyed, as a button that cannot be pressed is. (Nothing in the house's
  // colour, border or name: words are never in a house's colour, for Vael's is the red of danger and of a cost.)
  const border = aiming ? PAL.gold : ready ? PAL.mist : hot ? PAL.slate : PAL.indigo;
  box(g, x, y, w, h, aiming ? PAL.wine : hot ? PAL.indigo : PAL.night, border);
  // The key, in a box of its own at the left.
  box(g, x + 2, y + 2, 11, h - 4, PAL.void, ready ? border : PAL.indigo);
  text(g, POWER_KEY, x + 5, y + 4, ready ? PAL.bone : PAL.slate, 'main');
  // Its name; on the right what it waits for: READY, AIMED, or the time until it is back.
  const name = hud.words(def.name.toUpperCase());
  // (On the cradle of an Ages run there is no Ark yet: no time to count, only the reason, in its tooltip.)
  const counting = p.powerCd > 0 && !p.wager && !game.cradle;
  const state = aiming ? 'AIMED' : ready ? 'READY' : counting ? powerClock(p.powerCd) : '';
  const sw = state ? textWidth(state, 'tiny') : 0;
  // (A long name, CALL TO ARMS or FATE'S WAGER, in the small letters where the large would run into its state.)
  const room = w - 16 - (sw ? sw + 7 : 4);
  const font = textWidth(name, 'main') <= room ? 'main' : 'tiny';
  text(g, fit(name, room, font), x + 16, y + (font === 'main' ? 4 : 5), ready ? (aiming ? PAL.gold : PAL.bone) : PAL.slate, font);
  if (state) text(g, state, x + w - 4 - sw, y + 5, aiming || ready ? PAL.gold : PAL.dusk, 'tiny');
  // The time until it is back, filling along its foot.
  if (!ready && counting) {
    const total = Math.max(p.powerCd, game.time < POWER_FIRST + 1 ? POWER_FIRST : ABILITY_BY_ID[def.id].cd);
    const k = 1 - p.powerCd / total;
    rect(g, x + 15, y + h - 3, Math.round((w - 18) * k), 1, shade(p.color));
  }
  const tip = () => {
    const lines = [`{${def.name}}: ${def.desc}`, `[${POWER_KEY}] aims it: the map shows what it will do. [${POWER_KEY}] again, or a click here, casts it.`];
    if (!ready && why) lines.push(`[!${why}]`);
    return lines.join('\n');
  };
  hud.ui.hit('power', x, y, w, h, () => hud.actions.power(), tip, () => hud.actions.cancelPower(), { terms: gloss('ab-' + def.id, 'power') });
  hud.powerRect = { x, y, w, h };
}

/**
 * The colour of the banner while a power is aimed: gold, as its button is, for every house. Not the power's own
 * (that is for its rings and lines on the map): the banner reads a red or ember line as a warning, and Vael's
 * Call to Arms is red, the Remnant's Wager ember.
 */
const AIMED = PAL.gold;

/** The words of the banner while the power is aimed: what it would do now, and how to cast it or put it away. */
export function aimLine(hud: Hud): { text: string; color: string; sub: string } | null {
  const s = hud.s;
  if (!s.view.powerAim) return null;
  const g = hud.g;
  const p = g.player;
  const def = powerOf(p);
  const ark = def && p.ark >= 0 ? g.units.get(p.ark) : undefined;
  if (!def || !ark || ark.dead) return null;
  const cast = `${POWER_KEY} AGAIN OR CLICK THE POWER TO CAST · ESC TO PUT IT AWAY`;
  const head = def.name.toUpperCase();
  switch (def.id) {
    case 'dawn': {
      const worlds = dawnWorlds(g, p, ark);
      const ws = worlds.map((n) => n.name);
      // (The guards that would burn, as many as the player can see.)
      const k = worlds.reduce((sum, n) => sum + (p.visible[n.id] ? dawnGuards(g, n).length : 0), 0);
      const burn = k ? `, and ${k} ${k === 1 ? 'guard burns' : 'guards burn'}` : '';
      return { text: `${head}: ${list(ws)} ${ws.length === 1 ? 'is' : 'are'} kindled at once${burn}.`, color: AIMED, sub: cast };
    }
    case 'callarms': {
      const n = levyWorlds(g, p, ark).length;
      return { text: `${head}: ${n} ${n === 1 ? 'Forge sends' : 'Forges send'} your Ark ${n * LEVY_SHIPS.length} warships.`, color: AIMED, sub: cast };
    }
    case 'wayfinder': {
      const n = s.view.hoverNode;
      const sub = 'CLICK A WORLD · ESC TO PUT IT AWAY';
      if (n >= 0 && n !== ark.node) {
        const why = wayWhy(g, p, ark, n);
        return { text: why ? `${head}: ${why}.` : `${head}: a new starlane to ${g.nodes[n].name}.`, color: why ? PAL.red : AIMED, sub };
      }
      const k = wayTargets(g, p, ark).length;
      return { text: `${head}: click a world for a new starlane (${k} within reach).`, color: AIMED, sub };
    }
    case 'mindtheft': {
      const r = rivalArk(g, p, ark);
      const who = r ? possessive(g.factions[r.owner].name) : 'a rival';
      return { text: `${head}: your Ark reads ${who} Ark, and learns the rarest of its Boons that it can.`, color: AIMED, sub: cast };
    }
    case 'conversion': {
      const n = conversionTargets(g, ark).length;
      return { text: `${head}: ${n} enemy ${n === 1 ? 'ship goes' : 'ships go'} over to your house.`, color: AIMED, sub: cast };
    }
    case 'wager': {
      const n = burnable(g, p, ark.node).length;
      return { text: `${head}: heads, ${n} enemy ${n === 1 ? 'warship burns' : 'warships burn'}. Tails, your Ark does.`, color: AIMED, sub: cast };
    }
  }
  return null;
}

/** "A, B and 3 more". */
function list(names: string[]): string {
  if (names.length > 3) return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : (names[0] ?? 'nothing');
}

/** Put the power away when it can no longer be cast as it was aimed: a dialog, the run's end, the Ark gone. */
export function keepAim(hud: Hud) {
  const s = hud.s;
  if (!s.view.powerAim) return;
  const why = hud.g.checkPower(hud.g.playerId);
  if (s.modal || s.mode !== 'play' || (why && why !== POWER_WHY.aim)) s.view.powerAim = false;
}
