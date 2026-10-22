/**
 * A game, in one number (1.28): every screen of a game together sends it to the room each second of game
 * time, and the room compares them. Two screens whose games have gone apart are found within a second.
 *
 * It reads what the game plays by, to the last bit of every figure, and nothing that is a screen's own
 * (the notes of its log, the outcome as this screen reads it, `Game.ui`).
 */

import type { Game } from '../game/Game';

const buf = new DataView(new ArrayBuffer(8));

/** FNV-1a over the bytes of a number, as a double (exactly what the game holds). */
function mix(h: number, x: number): number {
  buf.setFloat64(0, x);
  for (let i = 0; i < 8; i++) h = Math.imul(h ^ buf.getUint8(i), 0x01000193) >>> 0;
  return h;
}

function mixStr(h: number, s: string): number {
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

export function gameHash(g: Game): number {
  let h = 0x811c9dc5;
  h = mix(h, g.tick);
  for (const x of g.rng.state()) h = mix(h, x);
  h = mix(h, g.nextId);
  h = mix(h, g.prompts.length);
  for (const f of g.factions) {
    h = mix(h, f.embers);
    h = mix(h, f.lore);
    h = mix(h, f.alive ? 1 : 0);
    h = mix(h, f.capital);
    h = mix(h, f.cards.length);
    h = mix(h, f.pendingDrafts);
    h = mix(h, f.rerolls);
    h = mix(h, f.isPlayer ? 1 : 0);
    h = mix(h, f.relics.length);
    h = mix(h, f.powerCd);
    if (f.dice) for (const x of f.dice) h = mix(h, x);
    if (f.draftOffer) for (const id of f.draftOffer) h = mixStr(h, id);
  }
  for (const n of g.nodes) {
    h = mix(h, n.owner);
    h = mix(h, n.hp);
    h = mix(h, n.sh);
    h = mix(h, n.level);
  }
  for (const u of g.unitList) {
    if (u.dead) continue;
    h = mix(h, u.id);
    h = mix(h, u.owner);
    h = mix(h, u.hp);
    h = mix(h, u.x);
    h = mix(h, u.y);
    h = mix(h, u.node);
  }
  return h;
}
