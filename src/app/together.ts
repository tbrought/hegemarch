/**
 * A room of a game played together, as the app holds it (1.28): the connection, what the room says of its
 * lobby, and, when its game begins, the run (run.ts `startNetRun`). The room's code and this player's token
 * are kept for the tab (sessionStorage), so that a page reloaded in a lobby or a game comes back to it.
 */

import { HEIRS } from '../game/data/heirs';
import { cleanName, NET_VERSION, type Bringing, type ClientMsg, type LobbyState, type RoomMsg } from '../net/protocol';
import { canPlayTogether, newRoom, roomBase, WsLink } from '../net/links';
import type { StartMsg } from '../net/Lockstep';
import type { App } from './App';
import { GAME_VERSION } from './env';

const KEEP = 'hegemarch.room';

export class RoomClient {
  link: WsLink;
  token = '';
  lobby: LobbyState | null = null;
  /** The room's last word against something asked (the game cannot start yet, the room is full). */
  notice = '';
  /** Words in the lobby's chat. */
  chat: { from: number; name: string; text: string }[] = [];
  /** Called on every change the lobby page shows; and when the game begins, with the room's word for it. */
  onChange: (() => void) | null = null;
  onStart: ((m: StartMsg) => void) | null = null;
  /** The connection is down (it is coming back by itself). */
  down = false;
  /** The room has let this player in (until then, a refusal is final). */
  private welcomed = false;

  constructor(
    public code: string,
    private bring: () => Bringing,
    token = '',
  ) {
    this.token = token;
    this.link = new WsLink(`${roomBase()}/${code}/ws`, () => this.hello());
    this.link.onMessage = (m) => this.hear(m);
    this.link.onStatus = (up) => {
      this.down = !up;
      this.onChange?.();
    };
  }

  private hello(): ClientMsg {
    return { t: 'hello', version: NET_VERSION, build: GAME_VERSION, bring: this.bring(), token: this.token || undefined };
  }

  hear(m: RoomMsg) {
    switch (m.t) {
      case 'welcome':
        this.welcomed = true;
        this.token = m.token;
        keepRoom(this.code, this.token);
        return;
      case 'lobby':
        this.lobby = m.state;
        this.notice = '';
        break;
      case 'error':
        this.notice = m.text;
        // (Turned away before being let in, as by a room that is full or gone: trying again would be turned away again.)
        if (!this.welcomed) {
          this.link.close();
          // (A room this tab kept that has gone: forgotten.)
          forgetRoom();
        }
        break;
      case 'chat': {
        const s = this.lobby?.seats[m.from];
        this.chat.push({ from: m.from, name: s?.name ?? '?', text: m.text });
        if (this.chat.length > 40) this.chat.shift();
        break;
      }
      case 'start':
        this.onStart?.(m);
        return;
      default:
        return;
    }
    this.onChange?.();
  }

  send(m: ClientMsg) {
    this.link.send(m);
  }

  /** What the room says goes to this client again (after a game: the room is a lobby once more). */
  attach() {
    this.link.onMessage = (m) => this.hear(m);
    this.link.onStatus = (up) => {
      this.down = !up;
      this.onChange?.();
    };
  }

  /** Leave the room for good (the seat is freed; in a game, the AI takes the house). */
  leave() {
    this.link.send({ t: 'leave' });
    setTimeout(() => this.link.close(), 150);
    forgetRoom();
  }
}

/** What a player brings to a room: their letters, the houses they have, their Hall (co-op uses it). */
export function bringing(app: App): Bringing {
  const p = app.profile;
  return {
    name: cleanName(p.boardName ?? '') || 'GUEST',
    heirs: p.heirs.filter((h) => HEIRS.some((x) => x.id === h)),
    perks: { ...p.perks },
    legendary: !!p.unlockLegendary,
    pacts: !!p.unlockPacts,
  };
}

/** Host a new room: made on the server, then joined. */
export async function hostRoom(app: App): Promise<RoomClient> {
  const code = await newRoom();
  return new RoomClient(code, () => bringing(app));
}

export function joinRoom(app: App, code: string, token = ''): RoomClient {
  return new RoomClient(code, () => bringing(app), token);
}

export function keepRoom(code: string, token: string) {
  try {
    sessionStorage.setItem(KEEP, JSON.stringify({ code, token }));
  } catch {
    /* private mode */
  }
}

export function keptRoom(): { code: string; token: string } | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEEP) ?? 'null') as { code: string; token: string } | null;
    return v && typeof v.code === 'string' && typeof v.token === 'string' ? v : null;
  } catch {
    return null;
  }
}

export function forgetRoom() {
  try {
    sessionStorage.removeItem(KEEP);
  } catch {
    /* private mode */
  }
}

/** Why this page cannot play together (null: it can). */
export function cannotPlayTogether(app: App): string | null {
  if (!canPlayTogether()) return 'Games together are played at hegemarch.com (in a browser), not from a downloaded file or itch.io.';
  if (!app.profile.tutorialDone) return 'Play the First Night first: everyone in a game together knows the basics.';
  return null;
}
