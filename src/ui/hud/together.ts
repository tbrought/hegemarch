/**
 * A game played together, on the HUD (1.28, docs/MULTIPLAYER.md): the players (their house, their name, whether
 * they are here), the room's pause, the line the chat is typed on, and what the room has to say in the banner
 * (the connection, a player the game is waiting for, a house that has fallen).
 */

import { fmtTime } from '../../render/Renderer';
import { text, textWidth } from '../../render/font';
import { PAL } from '../../render/palette';
import { box, rect } from '../../render/pixel';
import type { Hud } from '../Hud';

/** The line the chat is typed on (Enter opens it, Enter says it, Esc puts it away; Tab: to your team or to all, in versus). */
export interface ChatDraft {
  text: string;
  team: boolean;
}

/** What a player's state is, in a word, and what it means. */
function stateOf(hud: Hud, seat: number): { word: string; color: string; tip: string } | null {
  const net = hud.s.net!;
  const g = hud.g;
  const f = g.factions[seat];
  const peer = net.peers.find((p) => p.seat === seat);
  if (!f.alive) {
    return g.config.together === 'coop'
      ? { word: 'FALLEN', color: PAL.red, tip: `Their Hearth has gone dark. Take ${f.lostHearth !== undefined && f.lostHearth >= 0 ? g.nodes[f.lostHearth].name : 'it'} back to rekindle it.` }
      : { word: 'OUT', color: PAL.red, tip: 'Their house has fallen.' };
  }
  if (!peer) return { word: 'LEFT', color: PAL.dusk, tip: 'They left the game: the AI leads their house.' };
  if (peer.ai) return { word: 'AI', color: PAL.dusk, tip: peer.online ? 'Coming back: the AI leads their house until they have caught up.' : 'Away for over a minute: the AI leads their house until they come back.' };
  if (!peer.online) return { word: 'AWAY', color: PAL.dusk, tip: 'Their connection is lost. If they are not back within a minute, the AI leads their house until they are.' };
  if (peer.hidden) return { word: 'AWAY', color: PAL.dusk, tip: 'Their game is in a hidden tab: it catches up when they come back to it.' };
  if (peer.lag > 60) return { word: 'SLOW', color: PAL.ember, tip: 'Their game is behind: everyone\'s waits for it.' };
  return null;
}

/** The players, at the top left under the bar: their house's colour, their name, and how they are. */
export function drawPlayers(hud: Hud) {
  const s = hud.s;
  const net = s.net;
  hud.playersRect = { x: 0, y: 0, w: 0, h: 0 };
  if (!net) return;
  const g = s.screen.g;
  const G = hud.g;
  const seats = G.config.seats ?? [];
  const x = 3;
  let y = 18;
  let w = 0;
  const versus = G.config.together === 'versus';
  for (let i = 0; i < seats.length; i++) {
    if (!seats[i].human) continue;
    const f = G.factions[i];
    const me = i === G.playerId;
    const ally = G.allied(i, G.playerId);
    const name = net.nameOf(i);
    const st = stateOf(hud, i);
    const peer = net.peers.find((p) => p.seat === i);
    // (The house's colour as a picture: a square of it. The name in bone, the player's own in gold.)
    rect(g, x, y + 1, 5, 5, f.color);
    text(g, name, x + 8, y, me ? PAL.gold : PAL.bone, 'tiny');
    let tx = x + 8 + textWidth(name, 'tiny') + 3;
    if (st) {
      text(g, st.word, tx, y, st.color, 'tiny');
      tx += textWidth(st.word, 'tiny') + 3;
    }
    if (net.muted.has(i)) {
      text(g, 'MUTED', tx, y, PAL.dusk, 'tiny');
      tx += textWidth('MUTED', 'tiny') + 3;
    }
    if (versus && peer && peer.pauses >= 0) {
      for (let k = 0; k < peer.pauses; k++) rect(g, tx + k * 2, y + 1, 1, 4, PAL.dusk);
      tx += peer.pauses * 2 + (peer.pauses ? 2 : 0);
    }
    const tip = `${name} leads ${f.name}${me ? ' (you)' : ally ? ': your ally' : versus ? ': a rival' : ''}.${st ? ` ${st.tip}` : ''}` +
        `${versus && peer ? ` Pauses left: ${peer.pauses}.` : ''}${peer?.host ? ' The room\'s host.' : ''}` +
        `${me ? '' : net.muted.has(i) ? ' Muted: click to see their chat again.' : ' Click to mute their chat.'}`;
    // (A click on another player mutes their chat on this screen, or unmutes it.)
    hud.ui.hit('player-' + i, x - 1, y - 1, tx - x + 1, 9, me ? undefined : () => {
      if (net.muted.has(i)) net.muted.delete(i);
      else net.muted.add(i);
    }, tip);
    // Allies can be sent Embers.
    if (ally && !me && f.alive && G.player.alive && !G.outcome) {
      hud.ui.iconButton(g, 'gift-' + i, tx, y - 1, 9, 'ember', () => hud.modals.open({ kind: 'gift', to: i }), {
        tip: `Send Embers to ${name}.${versus ? ' A fifth is lost on the way.' : ''}`,
      });
      tx += 11;
    }
    w = Math.max(w, tx - x);
    y += 10;
  }
  hud.playersRect = { x, y: 17, w, h: y - 17 };
}

/** The room's pause, at the foot of the screen: who paused, the count-in, and when this player may go on. */
export function drawNetPause(hud: Hud) {
  const net = hud.s.net!;
  const g = hud.s.screen.g;
  const p = net.pause;
  if (!p) return;
  const by = p.by === hud.g.playerId ? 'YOU' : p.by >= 0 ? net.nameOf(p.by) : 'THE ROOM';
  const count = net.resumeIn;
  let t: string;
  let color: string = PAL.gold;
  if (count !== null) {
    t = `GOING ON IN ${Math.max(1, Math.ceil(count))}`;
    color = PAL.teal;
  } else if (hud.g.config.together === 'versus' && p.by !== hud.g.playerId && net.openIn > 0) {
    t = `PAUSED BY ${by} · YOU CAN GO ON IN ${fmtTime(net.openIn)}`;
  } else t = `PAUSED BY ${by} · SPACE TO GO ON`;
  const w = textWidth(t, 'tiny') + 10;
  let x = Math.round(hud.W / 2 - w / 2);
  if (hud.cardRect.w > 0 && x < hud.cardRect.x + hud.cardRect.w + 4) x = hud.cardRect.x + hud.cardRect.w + 6;
  if (hud.logRight > 0 && hud.logBottom >= hud.H - 14 && x < hud.logRight + 4) x = hud.logRight + 6;
  const right = hud.minimapRect.w > 0 ? hud.minimapRect.x - 4 : hud.W - 3;
  if (x + w > right) x = Math.max(3, right - w);
  const y = hud.H - 13;
  box(g, x, y, w, 9, PAL.night, color);
  text(g, t, x + 5, y + 2, color, 'tiny');
}

/** The chat being typed: a line at the foot of the screen, over the log. */
export function drawChatLine(hud: Hud) {
  const c = hud.chat;
  if (!c || !hud.s.net) return;
  const g = hud.s.screen.g;
  const versus = hud.g.config.together === 'versus';
  const label = versus ? (c.team ? 'TO YOUR TEAM:' : 'TO ALL:') : 'SAY:';
  const caret = Math.floor(hud.clock * 2) % 2 === 0 ? '_' : ' ';
  const w = Math.min(hud.W - 6, 260);
  const x = 3;
  const y = hud.H - 24;
  box(g, x, y, w, 11, PAL.void, PAL.gold);
  text(g, label, x + 4, y + 3, PAL.gold, 'tiny');
  const lx = x + 6 + textWidth(label, 'tiny');
  const room = w - (lx - x) - 6;
  let shown = c.text + caret;
  while (shown.length > 1 && textWidth(shown, 'tiny') > room) shown = shown.slice(1);
  text(g, shown, lx, y + 3, PAL.bone, 'tiny');
  if (versus) text(g, 'TAB', x + w - textWidth('TAB', 'tiny') - 4, y + 3, PAL.dusk, 'tiny');
}

/**
 * What the room has to say in the banner, before anything else: the connection lost, the game played again,
 * a player it waits for, this player's house fallen. Null: nothing.
 */
export function netBanner(hud: Hud): { text: string; color: string; sub?: string } | null {
  const net = hud.s.net;
  if (!net) return null;
  const g = hud.g;
  if (net.ended) return { text: net.ended, color: PAL.red, sub: 'Leave from the menu (Esc).' };
  if (!net.online) return { text: 'The connection to the room was lost. Coming back…', color: PAL.ember };
  if (net.rebuilding) return { text: `${net.rebuilding.why} ${Math.round(net.progress * 100)}%`, color: PAL.sky };
  const me = g.player;
  if (!me.alive && !g.outcome) {
    return g.config.together === 'coop'
      ? { text: `Your Hearth has gone dark. Your allies can rekindle it: take ${me.lostHearth !== undefined && me.lostHearth >= 0 ? g.nodes[me.lostHearth].name : 'it'} back.`, color: PAL.red, sub: 'You see what they see meanwhile.' }
      : { text: 'Your house has fallen. You can watch the rest, or leave from the menu (Esc).', color: PAL.red };
  }
  // (The game has waited a moment for the room, and is not paused: who it waits for, if one of them is behind.)
  if (!net.paused && g.tick >= net.to && net.waitingFor > 1.2) {
    const slow = net.peers.filter((p) => p.seat !== g.playerId && p.online && !p.hidden && p.lag > 30).sort((a, b) => b.lag - a.lag)[0];
    if (slow) return { text: `Waiting for ${net.nameOf(slow.seat)}: their game is behind.`, color: PAL.ember };
    return { text: 'Waiting for the room…', color: PAL.dusk };
  }
  return null;
}
