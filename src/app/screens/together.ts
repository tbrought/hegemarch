/**
 * Games played together (1.28, docs/MULTIPLAYER.md): the page before the game. Host a room or join one by its
 * code (or its link); then the room's lobby, the same for everyone in it: the way to play, the sector, the
 * seats with their players, houses and teams, a word in the chat, and START for the room's host.
 */

import { DIFFICULTY_NAMES } from '../../game/constants';
import { HEIR_BY_ID, HEIRS } from '../../game/data/heirs';
import type { Difficulty } from '../../game/types';
import { cleanName, isCode, MAX_PLAYERS, NET_SPEEDS, startProblem, type LobbySeat, type RoomOptions } from '../../net/protocol';
import { saveProfile } from '../../meta/profile';
import { esc } from '../../ui/format';
import type { App } from '../App';
import { leaveTogether, startNetRun, teardownSession } from '../run';
import { cannotPlayTogether, forgetRoom, hostRoom, joinRoom, keptRoom, type RoomClient } from '../together';
import { copy } from './results';
import type { ScreenActions } from './index';

/** The link to a room: whoever opens it comes to the room (app/App.ts, `#join=`). */
export function roomLink(code: string): string {
  return `${location.origin}${location.pathname}#join=${code}`;
}

/** To the together page: to a room by its code (a link), back to the room this tab was in, or to choose. */
export function openTogether(app: App, code: string | null) {
  const why = cannotPlayTogether(app);
  const kept = keptRoom();
  if (!why && code && isCode(code)) enter(app, joinRoom(app, code, kept?.code === code ? kept.token : ''));
  else if (!why && !code && kept) enter(app, joinRoom(app, kept.code, kept.token));
  else showTogether(app);
}

/** The page holds this room from now: it is drawn again whenever the room says something, and its game begins from it. */
function enter(app: App, room: RoomClient) {
  app.room?.link.close();
  app.room = room;
  room.onChange = () => {
    if (app.screen === 'together' && app.room === room) showTogether(app);
  };
  room.onStart = (m) => startNetRun(app, room, m);
  showTogether(app);
}

export function showTogether(app: App) {
  const room = app.room;
  if (!room) return showEntry(app);
  const L = room.lobby;
  if (!L) {
    app.put('together', page(app, `<h1>ROOM ${esc(room.code)}</h1>
        <div class="px-box notice wide"><span>${esc(room.notice || (room.down ? 'Connecting to the room…' : 'Joining the room…'))}</span></div>
        <div class="foot-actions"><button data-sa="room-leave">${room.notice ? 'BACK' : 'LEAVE'}</button></div>`));
    return;
  }
  const you = L.you;
  const host = you === L.owner;
  const o = L.options;
  const versus = o.together === 'versus';
  const hostOnly = 'The host sets the room up.';
  const btn = (sa: string, label: string, on: boolean, tip: string, enabled = host) =>
    `<button class="small${on ? ' active' : ''}${enabled ? '' : ' disabled'}" ${enabled ? `data-sa="${sa}"` : 'data-sa="room-host-only"'} data-tip="${esc(enabled ? tip : `${hostOnly} ${tip}`)}">${label}</button>`;
  const check = (sa: string, label: string, on: boolean, tip: string) =>
    `<div class="check ${on ? 'on' : ''}${host ? '' : ' disabled'}" ${host ? `data-sa="${sa}"` : 'data-sa="room-host-only"'} role="checkbox" aria-checked="${on}" tabindex="0" data-tip="${esc(host ? tip : `${hostOnly} ${tip}`)}"><span class="box"></span>${label}</div>`;
  const sizes: [RoomOptions['size'], string, string][] = [
    ['small', 'SMALL', '3 houses, about 25 worlds.'], ['medium', 'MEDIUM', '4 houses, about 40 worlds.'], ['large', 'LARGE', '6 houses, about 60 worlds.'],
  ];
  const opts = `<div class="opts together-opts">
      <div class="opt px-box"><h4>WAY TO PLAY</h4><div class="row">
        ${btn('room-mode:coop', 'CO-OP', !versus, 'Allied houses against the AI: you share what you see, send each other Embers, and win together.')}
        ${btn('room-mode:versus', 'VERSUS', versus, 'Player against player (and teams). No perks from the Hall of Heirs: everyone plays by the same rules.')}</div>
        <div class="help">${versus
          ? 'Player against player. <b>No Hall of Heirs perks</b>: every house and every Boon for everyone, as in the Daily. Three pauses of a minute each.'
          : 'Allies against the AI. Your own houses and Hall of Heirs perks. You see what your allies see, and win together; a fallen ally comes back when you retake their Hearth.'}</div></div>
      <div class="opt px-box"><h4>SECTOR</h4><div class="row">${sizes.map(([k, n, d]) => btn(`room-size:${k}`, n, o.size === k, d)).join('')}</div>
        <div class="help">${sizes.find((x) => x[0] === o.size)![2]} Seats that are not a player's are the AI's, or closed.</div></div>
      <div class="opt px-box"><h4>THE AI HOUSES</h4><div class="row">${DIFFICULTY_NAMES.map((n, i) => btn(`room-diff:${i}`, n.toUpperCase(), o.difficulty === i, `The AI houses play on ${n}.`)).join('')}</div>
        <div class="help">How hard the rival houses the AI leads are.</div></div>
      <div class="opt px-box"><h4>SPEED</h4><div class="row">${NET_SPEEDS.map((sp) => btn(`room-speed:${sp}`, `${sp}×`, o.speed === sp, `The game runs at ${sp}× for everyone.`)).join('')}</div>
        <div class="help">${versus ? 'The same for the whole game.' : 'The host can change it during the game.'}</div></div>
      ${versus
        ? `<div class="opt px-box"><h4>FAIRNESS</h4>${check('room-luck', 'The same luck', o.sameLuck, 'Every player\'s Boons are dealt from the same dice: your third offer is the same as theirs, and only the choices differ.')}
          <div class="row" style="margin-top:8px">${[0, 30, 45, 60, 90].map((m) => btn(`room-limit:${m}`, m ? `${m}M` : 'NO LIMIT', o.timeLimit === m, m ? `After ${m} minutes the team furthest toward a Destiny is crowned.` : 'Play until a team is crowned.')).join('')}</div>
          <div class="help">A time limit is optional: then the team furthest toward a Destiny is crowned.</div></div>`
        : `<div class="opt px-box"><h4>THE RIVALS</h4>${check('room-unite', 'The rivals unite', o.unite, 'The AI houses are allies of one another: a harder run.')}
          <div class="help">Each AI house fights for itself, or they stand together against you.</div></div>`}
    </div>`;
  const seats = L.seats.map((s, i) => seatRow(app, room, s, i)).join('');
  const players = L.seats.filter((s) => s.kind === 'player').length;
  const why = startProblem(L.seats, o, L.owner);
  const me = L.seats[you];
  const chat = room.chat.slice(-8).map((c) => `<div class="chat-line"><span class="swatch" style="background:${seatColor(L.seats[c.from])}"></span> <b>${esc(c.name)}</b> ${esc(c.text)}</div>`).join('');
  const over = L.phase !== 'lobby';
  app.put('together', page(app, `<h1>ROOM ${esc(room.code)}</h1>
      <div class="lead">${over
        ? (L.phase === 'playing' ? 'This room\'s game is under way.' : `The game is over. ${host ? 'Start another in this room: the same players, a new sector.' : 'Waiting for the host to start another game in this room.'}`)
        : `Send your friends the code <b class="gold">${esc(room.code)}</b> or the link: up to ${MAX_PLAYERS} players. Everyone plays in their own browser.`}</div>
      ${room.notice ? `<div class="px-box notice wide"><span>${esc(room.notice)}</span></div>` : ''}
      ${room.down ? '<div class="px-box notice wide"><span>The connection to the room was lost. Coming back…</span></div>' : ''}
      <div class="px-box room-link"><input type="text" readonly value="${esc(roomLink(room.code))}" aria-label="The room's link">
        <button class="small" data-sa="room-copy" data-tip="Copies the room's link: whoever opens it comes to this room.">COPY LINK</button>
        <textarea id="room-link-box" readonly hidden rows="1"></textarea></div>
      ${over ? '' : opts}
      <h3 class="seats-head">SEATS <span class="dim">· ${players} player${players === 1 ? '' : 's'}</span></h3>
      <div class="seats">${seats}</div>
      <div class="px-box room-chat"><h4>CHAT</h4><div class="chat-lines">${chat || '<span class="dim">Say hello.</span>'}</div>
        <div class="row"><input id="mp-chat" type="text" maxlength="120" autocomplete="off" placeholder="A word for the room" value="${esc(app.togetherForm.chat)}"><button class="small" data-sa="room-say">SAY</button></div></div>
      <div class="foot-actions"><button data-sa="room-leave">LEAVE</button>
        ${over
          ? host && L.phase === 'over' ? '<button class="primary" data-sa="room-again" data-tip="A new game in this room: the same players, a new sector.">NEW GAME</button>' : ''
          : host
            ? `<button class="primary${why ? ' disabled' : ''}" data-sa="${why ? 'room-why' : 'room-start'}" data-tip="${esc(why ?? 'Start the game for everyone in the room.')}" style="font-size:14px;padding:14px 22px">START</button>`
            : `<button class="${me?.ready ? '' : 'primary'}${me?.heir ? '' : ' disabled'}" data-sa="${me?.heir ? 'room-ready' : 'room-why'}" data-tip="${esc(me?.heir ? (me.ready ? 'Not ready after all.' : 'Tell the host you are ready to start.') : 'Choose a house first.')}">${me?.ready ? 'NOT READY' : 'READY'}</button>`}</div>`));
  // (The chat line keeps the keyboard while the page is drawn again around it.)
  if (app.togetherForm.chat) {
    const el = app.ui.querySelector<HTMLInputElement>('#mp-chat');
    if (el && document.activeElement?.id !== 'mp-chat' && app.togetherForm.chat) el.focus({ preventScroll: true });
  }
}

function page(app: App, body: string): string {
  return `<div class="screen together${app.crt()}"><div class="page">${body}</div></div>`;
}

/** A seat: who sits in it, their house and team, and what this player may change of it. */
function seatRow(app: App, room: RoomClient, s: LobbySeat, i: number): string {
  const L = room.lobby!;
  const you = L.you;
  const host = you === L.owner;
  const versus = L.options.together === 'versus';
  const mine = i === you;
  const heir = s.heir ? HEIR_BY_ID[s.heir] : null;
  const taken = (h: string) => L.seats.some((x, j) => j !== i && x.kind !== 'closed' && x.heir === h);
  const who = s.kind === 'player' ? `${esc(s.name ?? '?')}${i === L.owner ? ' <span class="dim">· HOST</span>' : ''}${mine ? ' <span class="gold">· YOU</span>' : ''}`
    : s.kind === 'ai' ? 'AI' : s.kind === 'open' ? '<span class="dim">OPEN SEAT</span>' : '<span class="dim">CLOSED</span>';
  const state = s.kind === 'player' ? (i === L.owner ? '' : s.ready ? '<span class="dim">·</span> <span class="good">READY</span>' : '<span class="dim">· NOT READY</span>') : '';
  const house = heir ? esc(heir.name) : s.kind === 'ai' ? 'A house at random' : s.kind === 'player' ? '<span class="dim">Choosing a house…</span>' : s.kind === 'open' ? 'Waiting for a player' : 'No house here';
  const team = versus && s.kind !== 'open' && s.kind !== 'closed' ? ` · TEAM ${s.team + 1}` : '';
  const ctl: string[] = [];
  const houseBtns = (sa: string, list: string[], random: boolean) =>
    (random ? [`<button class="small${s.heir === '' ? ' active' : ''}" data-sa="${sa}:" data-tip="A house dealt at random when the game starts.">RANDOM</button>`] : [])
      .concat(list.map((h) => {
        const d = HEIR_BY_ID[h];
        const off = taken(h);
        return `<button class="small house-pick${s.heir === h ? ' active' : ''}${off ? ' disabled' : ''}" style="--hc:${d.color}" data-sa="${off ? 'room-taken' : `${sa}:${h}`}" data-tip="${esc(off ? `${d.name} is taken in this room.` : `${d.name}: ${d.title}.`)}">${esc(SHORT[h] ?? d.name.toUpperCase())}</button>`;
      })).join('');
  const teamBtns = (sa: string) => [0, 1, 2, 3].map((t) => `<button class="small${s.team === t ? ' active' : ''}" data-sa="${sa}:${t}">T${t + 1}</button>`).join('');
  if (mine && s.kind === 'player' && L.phase === 'lobby') {
    const mineHeirs = versus ? HEIRS.map((h) => h.id) : app.profile.heirs;
    ctl.push(`<div class="row">${houseBtns('room-house', mineHeirs, false)}</div>`);
    if (versus) ctl.push(`<div class="row"><span class="dim">TEAM</span>${teamBtns('room-team')}</div>`);
  } else if (host && L.phase === 'lobby' && s.kind !== 'player') {
    ctl.push(`<div class="row">${(['open', 'ai', 'closed'] as const).map((k) => `<button class="small${s.kind === k ? ' active' : ''}" data-sa="room-kind:${i}:${k}" data-tip="${esc(k === 'open' ? 'A seat for a player to take.' : k === 'ai' ? 'The game\'s AI leads a house here.' : 'No house here: a sector with fewer houses.')}">${k === 'open' ? 'OPEN' : k === 'ai' ? 'AI' : 'CLOSE'}</button>`).join('')}</div>`);
    if (s.kind === 'ai') ctl.push(`<div class="row">${houseBtns(`room-ai:${i}`, HEIRS.map((h) => h.id), true)}</div>`);
    if (versus && s.kind === 'ai') ctl.push(`<div class="row"><span class="dim">TEAM</span>${teamBtns(`room-seatteam:${i}`)}</div>`);
  } else if (host && L.phase === 'lobby' && versus && s.kind === 'player' && !mine) {
    ctl.push(`<div class="row"><span class="dim">TEAM</span>${teamBtns(`room-seatteam:${i}`)}</div>`);
  }
  if (host && L.phase === 'lobby' && versus && s.kind === 'player') {
    ctl.push(`<div class="row"><span class="dim" data-tip="An open handicap: more Embers for this player, so that friends of uneven skill have a game. Everyone sees it, here and on the results.">HANDICAP</span>${[0, 0.1, 0.2, 0.3].map((h) => `<button class="small${(s.handicap ?? 0) === h ? ' active' : ''}" data-sa="room-handicap:${i}:${h}">${h ? `+${Math.round(h * 100)}%` : 'NONE'}</button>`).join('')}</div>`);
  } else if (versus && s.handicap) ctl.push(`<div class="dim">Handicap: +${Math.round(s.handicap * 100)}% Embers</div>`);
  return `<div class="seat px-box seat-${s.kind}${mine ? ' mine' : ''}" style="--hc:${heir?.color ?? 'var(--slate)'}">
      ${heir ? `<canvas class="heir-art" data-heir="${heir.id}" height="24" aria-hidden="true"></canvas>` : '<div class="heir-blank"></div>'}
      <div class="seat-who"><div class="seat-name">${who} ${state}</div><div class="seat-house">${house}${team}</div></div>
      <div class="seat-ctl">${ctl.join('')}</div>
    </div>`;
}

/** A house's name on a button: one word. */
const SHORT: Record<string, string> = { concord: 'CONCORD', vael: 'VAEL', wayfarer: 'WAYFARERS', lyceum: 'LYCEUM', choir: 'CHOIR', ashen: 'REMNANT' };

function seatColor(s: LobbySeat | undefined): string {
  return (s?.heir && HEIR_BY_ID[s.heir]?.color) || 'var(--mist)';
}

/** Host or join: the first page. */
function showEntry(app: App) {
  const why = cannotPlayTogether(app);
  const name = cleanName(app.profile.boardName ?? '');
  const off = why ? ' disabled' : '';
  app.put('together', page(app, `<h1>PLAY TOGETHER</h1>
      <div class="lead">Lead a house <em>with friends against the AI</em> (co-op), or <b>against each other</b> (versus). One of you hosts a room;
        the others join it with its code or its link. Everyone plays in their own browser, and up to ${MAX_PLAYERS} can play.</div>
      ${why ? `<div class="px-box notice wide"><span>${esc(why)}</span></div>` : ''}
      ${app.togetherForm.notice ? `<div class="px-box notice wide"><span>${esc(app.togetherForm.notice)}</span></div>` : ''}
      <div class="opts">
        <div class="opt px-box"><h4>YOUR NAME</h4><div class="row"><input id="mp-name" type="text" maxlength="5" placeholder="ABC" autocomplete="off" spellcheck="false" value="${esc(name)}" aria-label="Your name: three to five letters"></div>
          <div class="help">Three to five letters, as on the Daily board: what the others see.</div></div>
        <div class="opt px-box"><h4>HOST A ROOM</h4><div class="row"><button class="primary${off}" data-sa="${why ? 'room-why-entry' : 'room-host'}" data-tip="${esc(why ?? 'Make a room and set it up; then send your friends its code or link.')}">HOST</button></div>
          <div class="help">You choose the way to play, the sector and the seats.</div></div>
        <div class="opt px-box"><h4>JOIN A ROOM</h4><div class="row"><input id="mp-code" type="text" maxlength="5" placeholder="CODE" autocomplete="off" spellcheck="false" value="${esc(app.togetherForm.code)}" aria-label="The room's code">
          <button class="small${off}" data-sa="${why ? 'room-why-entry' : 'room-join'}" data-tip="${esc(why ?? 'Join the room with this code.')}">JOIN</button></div>
          <div class="help">The five letters and figures your host sent you.</div></div>
      </div>
      ${record(app)}
      <div class="foot-actions"><button data-sa="menu">BACK</button></div>`));
}

/** What this browser has kept of games together: played and won, and the record against each name played in versus. */
function record(app: App): string {
  const t = app.profile.together;
  if (!t || t.coop.played + t.versus.played === 0) return '';
  const rivals = Object.entries(t.against).sort((a, b) => b[1][0] + b[1][1] - (a[1][0] + a[1][1])).slice(0, 8);
  return `<div class="px-box together-record"><h4>YOUR GAMES TOGETHER</h4>
      <p>Co-op: <b>${t.coop.played}</b> played, <b class="gold">${t.coop.won}</b> crowned · Versus: <b>${t.versus.played}</b> played, <b class="gold">${t.versus.won}</b> won</p>
      ${rivals.length ? `<p class="dim">Against: ${rivals.map(([n, [w, l]]) => `${esc(n)} <b>${w}–${l}</b>`).join(' · ')}</p>` : ''}
      <p class="dim">Kept in this browser.</p></div>`;
}

/** Enter in the page's inputs: the chat says its word, the code joins its room. */
export function togetherEnter(app: App, e: KeyboardEvent): boolean {
  const id = (e.target as HTMLElement | null)?.id;
  if (id === 'mp-chat') {
    say(app);
    return true;
  }
  if (id === 'mp-code') {
    join(app);
    return true;
  }
  return false;
}

function say(app: App) {
  const text = app.togetherForm.chat.trim();
  if (!text || !app.room) return;
  app.room.send({ t: 'chat', text, team: false });
  app.togetherForm.chat = '';
  const el = app.ui.querySelector<HTMLInputElement>('#mp-chat');
  if (el) el.value = '';
}

function join(app: App) {
  const code = app.togetherForm.code;
  if (!isCode(code)) {
    app.togetherForm.notice = 'A room\'s code is five letters and figures.';
    showTogether(app);
    return;
  }
  app.togetherForm.notice = '';
  enter(app, joinRoom(app, code));
}

const send = (app: App, m: Parameters<RoomClient['send']>[0]) => app.room?.send(m);

export const togetherActions: ScreenActions = {
  together: (app) => {
    if (!app.profile.togetherSeen) {
      app.profile.togetherSeen = true;
      saveProfile(app.profile);
    }
    openTogether(app, null);
  },
  'room-host': (app) => {
    app.togetherForm.notice = '';
    void hostRoom(app).then(
      (room) => enter(app, room),
      (err: Error) => {
        app.togetherForm.notice = `No room could be made: ${err.message}`;
        showTogether(app);
      },
    );
  },
  'room-join': (app) => join(app),
  'room-leave': (app) => {
    // (After a game, from the results: the room is left, and so is the run.)
    if (app.session?.net) {
      leaveTogether(app);
      return;
    }
    app.room?.leave();
    app.room = null;
    forgetRoom();
    showTogether(app);
  },
  'room-back': (app) => {
    // The results of a game together: back to its room's lobby (the same seats; the host starts another).
    teardownSession(app);
    app.room?.attach();
    void app.attract.start();
    app.music.play('title');
    showTogether(app);
  },
  'room-copy': (app, _arg, el) => {
    if (app.room) copy(app, el, roomLink(app.room.code), '#room-link-box');
  },
  'room-mode': (app, arg) => send(app, { t: 'options', options: { together: arg === 'versus' ? 'versus' : 'coop' } }),
  'room-size': (app, arg) => send(app, { t: 'options', options: { size: arg as RoomOptions['size'] } }),
  'room-diff': (app, arg) => send(app, { t: 'options', options: { difficulty: parseInt(arg, 10) as Difficulty } }),
  'room-speed': (app, arg) => send(app, { t: 'options', options: { speed: parseFloat(arg) } }),
  'room-luck': (app) => send(app, { t: 'options', options: { sameLuck: !app.room?.lobby?.options.sameLuck } }),
  'room-unite': (app) => send(app, { t: 'options', options: { unite: !app.room?.lobby?.options.unite } }),
  'room-limit': (app, arg) => send(app, { t: 'options', options: { timeLimit: parseInt(arg, 10) } }),
  'room-house': (app, arg) => send(app, { t: 'house', heir: arg }),
  'room-team': (app, arg) => send(app, { t: 'team', team: parseInt(arg, 10) }),
  'room-ready': (app) => send(app, { t: 'ready', on: !app.room?.lobby?.seats[app.room.lobby.you]?.ready }),
  'room-kind': (app, arg) => {
    const [i, k] = arg.split(':');
    send(app, { t: 'seat', seat: parseInt(i, 10), kind: k as 'open' | 'ai' | 'closed' });
  },
  'room-ai': (app, arg) => {
    const [i, h] = arg.split(':');
    send(app, { t: 'seat', seat: parseInt(i, 10), heir: h ?? '' });
  },
  'room-seatteam': (app, arg) => {
    const [i, t] = arg.split(':');
    send(app, { t: 'seat', seat: parseInt(i, 10), team: parseInt(t, 10) });
  },
  'room-handicap': (app, arg) => {
    const [i, h] = arg.split(':');
    send(app, { t: 'seat', seat: parseInt(i, 10), handicap: parseFloat(h) });
  },
  'room-start': (app) => send(app, { t: 'start' }),
  'room-again': (app) => send(app, { t: 'again' }),
  'room-say': (app) => say(app),
  // (Greyed buttons: the sound of a refusal is played by App; the tooltip already says why.)
  'room-why': () => {},
  'room-why-entry': () => {},
  'room-host-only': () => {},
  'room-taken': () => {},
};
