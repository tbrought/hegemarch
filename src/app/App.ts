import { Music } from '../audio/Music';
import { Sfx } from '../audio/Sfx';
import { TICK } from '../game/constants';
import { HEIR_BY_ID } from '../game/data/heirs';
import type { Difficulty, MapSize } from '../game/types';
import { loadProfile, saveProfile, type Profile } from '../meta/profile';
import { Renderer } from '../render/Renderer';
import { Attract } from './Attract';
import { drawHouseBanners } from './houseArt';
import { drawModeArt } from './modeArt';
import { Screen } from '../render/Screen';
import { installDomTips } from '../ui/domtips';
import { Hud } from '../ui/Hud';
import { Input } from '../ui/Input';
import { challengeFromHash, type Challenge } from './share';
import { Session } from './Session';
import { autosave, describeSavedRun, endRun, teardownSession } from './run';
import { FANFARE, pickMusic, pickTrack, processFx, syncSound, syncTracks, toggleSound } from './sound';
import { showMenu, tickMenu } from './screens/menu';
import { showSetup } from './screens/setup';
import { showSettings } from './screens/settings';
import { type ResultsData, showResults } from './screens/results';
import { showThrone, throneKey, wantsThrone } from './screens/throne';
import { SCREEN_ACTIONS } from './screens/index';

/**
 * The app: the one object behind the page. It owns the canvas and the menu pages over it, the sound,
 * the player's profile, and the run that is being played, if one is.
 *
 * This class is the frame loop (`loop`, `frameGame`: step the game, draw it, draw the HUD), what
 * listens to the page, and the state the rest shares. The rest is functions that take the app:
 *
 *   run.ts          a run's life: started, continued from its save, carried to the stars, saved, ended
 *   sound.ts        which music plays, the sounds of what happens, the sound button
 *   screens/        the menu pages (title, setup, Hall of Heirs, Settings, How to Play, results):
 *                   each draws itself as HTML and has a table of what its buttons do
 *   Session.ts      what the HUD and the input share about the run on the screen (selection, pause, speed)
 *   Attract.ts      the sector that plays itself behind the menus
 */
type ScreenId = 'menu' | 'setup' | 'hall' | 'howto' | 'settings' | 'loading' | 'game' | 'throne' | 'results';

export class App {
  canvas: HTMLCanvasElement;
  ui: HTMLElement;
  screenObj: Screen;
  renderer: Renderer;
  sfx: Sfx;
  music: Music;
  profile: Profile;
  screen: ScreenId = 'menu';
  session: Session | null = null;
  hud: Hud | null = null;
  input: Input | null = null;
  attract: Attract;
  prepToken = 0;
  private last = performance.now();
  acc = 0;
  autosaveT = 0;
  warHeat = 0;
  results: ResultsData | null = null;
  private hudError = false;
  /** A one-time message on the title screen. */
  menuNotice = '';
  /** `confirm`: the launch that waits for an answer about the saved run it would replace ('' = none). */
  setup: { heir: string; size: MapSize; difficulty: Difficulty; seed: string; daily: boolean; ages: boolean; confirm: '' | 'launch'; guided: boolean } = {
    heir: 'concord', size: 'medium', difficulty: 1, seed: '', daily: false, ages: false, confirm: '', guided: true,
  };
  confirmReset = false;
  /** One line about the saved run (house, sector, time played), read when the setup screen opens. */
  savedRun = '';
  /** The Legacy the saved run earns if a new run ends it now (null: it cannot be read), worked out when the question is asked. */
  savedLegacy: number | null = null;
  /** A challenge taken up from a link and not yet played (app/share.ts): the setup opens on its sector. */
  challenge: Challenge | null = null;
  /** The day (UTC) the title screen was drawn for: when it turns, the daily run is a new one. */
  menuDay = '';
  /** The sound button in the corner of every menu screen, and what it says now (see `syncSound`). */
  soundBtn: HTMLButtonElement;
  soundState = '';
  /** When the fanfare of the run's end is over, on the sound engine's clock. */
  fanfareEnds = 0;
  /** The track the selector under Settings shows as playing (see `syncTracks`). */
  trackShown: string | null = null;
  /** Was the sound still asleep when the click or key now being handled began? Then that click woke it. */
  gestureWoke = false;

  constructor() {
    this.canvas = document.getElementById('game') as HTMLCanvasElement;
    this.ui = document.getElementById('ui') as HTMLElement;
    this.profile = loadProfile();
    this.screenObj = new Screen(this.canvas);
    this.screenObj.setPixelSize(this.profile.settings.pixelSize);
    this.renderer = new Renderer(this.screenObj);
    this.attract = new Attract(this.renderer);
    this.sfx = new Sfx(this.profile.settings);
    this.music = new Music(this.sfx);
    this.music.pace = this.profile.settings.musicPace;
    this.setup.guided = !this.profile.tutorialDone;
    // The setup opens on what was chosen last time (if it can still be chosen).
    const last = this.profile.lastSetup;
    if (last) {
      if (HEIR_BY_ID[last.heir]) this.setup.heir = last.heir;
      if (['small', 'medium', 'large'].includes(last.size)) this.setup.size = last.size;
      if (last.difficulty >= 0 && last.difficulty <= this.profile.maxDifficulty) this.setup.difficulty = last.difficulty;
    }
    if (!this.profile.heirs.includes(this.setup.heir)) this.setup.heir = this.profile.heirs[0];
    // Sound starts with the page where the browser lets it: for a visitor who clicked PLAY on the site
    // the click carries over, and the title music is there with the title. Everywhere else a browser
    // plays nothing before the first click or key on the page; that click, wherever it lands, starts
    // it, and until then the sound button says so. (It used to start at the first click and say
    // nothing: a silent title screen, and music from nowhere at the first button pressed.)
    this.sfx.unlock();
    this.music.play('title');
    const unlock = (e: Event) => {
      if (e.type === 'pointerdown' || e.type === 'keydown') this.gestureWoke = !this.sfx.live;
      this.sfx.unlock();
      // (In a run the music of the moment is chosen by app/sound.ts, and a quiet night may have none.)
      if (!this.music.playing && this.screen !== 'game') this.music.play('title');
    };
    // (A touch counts as the player's say-so when the finger lifts, not when it lands.)
    for (const ev of ['pointerdown', 'keydown', 'pointerup', 'click']) window.addEventListener(ev, unlock, { capture: true });
    this.soundBtn = document.createElement('button');
    this.soundBtn.id = 'sound';
    this.soundBtn.className = 'small';
    this.soundBtn.hidden = true;
    this.soundBtn.addEventListener('click', () => toggleSound(this));
    this.ui.addEventListener('click', (e) => this.onScreenAction(e));
    window.addEventListener('keydown', (e) => {
      // (The throne takes letters as an arcade does: every key it knows is its own.)
      if (throneKey(this, e)) return;
      if (e.code === 'Escape' && this.screen === 'setup' && this.setup.confirm) {
        this.setup.confirm = '';
        showSetup(this);
      } else if (e.code === 'Escape' && (this.screen === 'setup' || this.screen === 'hall' || this.screen === 'howto' || this.screen === 'settings')) {
        // Escape is BACK on every page behind the title screen.
        this.sfx.play('ui', 0.5);
        showMenu(this);
      } else if ((e.code === 'Enter' || e.code === 'Space') && this.screen !== 'game') {
        // A house card and a tick box are not buttons, but the keyboard works them like buttons.
        const el = document.activeElement as HTMLElement | null;
        if (el && el.tagName !== 'BUTTON' && el.dataset?.sa && this.ui.contains(el)) {
          e.preventDefault();
          el.click();
        }
      }
    });
    document.addEventListener('fullscreenchange', () => {
      if (this.screen === 'settings') showSettings(this);
    });
    this.ui.addEventListener('input', (e) => this.onScreenInput(e));
    installDomTips();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) autosave(this);
      this.sfx.hush(document.hidden);
    });
    window.addEventListener('beforeunload', () => autosave(this));
    // Opened by a challenge link: the setup, on that sector. (The link's tail is dropped from the address,
    // so that a page that is loaded again is the game and not the challenge once more.)
    this.challenge = challengeFromHash(location.hash);
    if (this.challenge) {
      try {
        history.replaceState(null, '', location.pathname + location.search);
      } catch {
        /* (An address that cannot be rewritten is no reason not to play.) */
      }
      this.setup.daily = false;
      this.setup.ages = this.challenge.ages;
      if (this.profile.heirs.includes(this.challenge.heir)) this.setup.heir = this.challenge.heir;
      this.savedRun = describeSavedRun();
      showSetup(this);
    } else if (location.hash === '#daily') {
      // Opened from the website's throne (1.25.2): today's Daily, ready to play. (A first visit is shown the
      // title screen instead, where the First Night is offered.)
      try {
        history.replaceState(null, '', location.pathname + location.search);
      } catch {
        /* (As above.) */
      }
      if (this.profile.runs > 0) {
        this.setup.daily = true;
        this.setup.ages = false;
        this.setup.confirm = '';
        this.savedRun = describeSavedRun();
        showSetup(this);
      } else showMenu(this);
    } else showMenu(this);
    void this.attract.start();
    requestAnimationFrame(this.loop);
    // Dev-only hook for automated browser tests.
    if (import.meta.env.DEV) (window as unknown as { __app: App }).__app = this;
  }

  // =====================================================================
  // Main loop
  // =====================================================================

  private loop = (now: number) => {
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    try {
      if ((this.screen === 'game' || this.screen === 'results') && this.session) this.frameGame(dt);
      else if (!this.attract.frame(dt)) {
        const g = this.screenObj.g;
        g.fillStyle = '#0b0a1a';
        g.fillRect(0, 0, this.screenObj.W, this.screenObj.H);
      }
      if (this.screen === 'menu' || this.screen === 'setup') {
        drawHouseBanners(this.ui, now / 1000);
        drawModeArt(this.ui, now / 1000);
      } else if (this.screen === 'howto') drawModeArt(this.ui, now / 1000);
      else if (this.screen === 'hall') drawHouseBanners(this.ui, now / 1000);
      if (this.screen === 'menu') tickMenu(this);
      else if (this.screen === 'settings') syncTracks(this);
      syncSound(this);
    } catch (err) {
      console.error(err);
    }
    requestAnimationFrame(this.loop);
  };

  private frameGame(dt: number) {
    const s = this.session!;
    const g = s.game;
    const playing = this.screen === 'game';
    if (playing) this.input?.update(dt);
    if (playing && !s.halted) {
      this.acc += dt * s.speed;
      let steps = 0;
      while (this.acc >= TICK && steps < 14) {
        g.step();
        this.acc -= TICK;
        steps++;
      }
      if (steps >= 14) this.acc = 0;
    }
    const alpha = s.halted ? 1 : Math.min(1, this.acc / TICK);
    processFx(this, g, s.visible, playing);
    this.renderer.fx.update(s.halted && !g.outcome ? 0 : dt * (g.outcome ? 1 : s.speed));
    this.renderer.render(g, alpha, dt, s.view, !playing);
    // Ages: the player's Ark has left the cradle. A card says what goes with it; its button takes the run on.
    if (playing && g.ascended && !g.outcome && s.modal?.kind !== 'ascend') {
      if (!s.modal) {
        this.sfx.play('victory', 0.6);
        this.music.duck(FANFARE);
      }
      s.modal = { kind: 'ascend', unbidden: true };
    }
    if (playing && this.hud) {
      try {
        this.hud.update(dt);
        this.hud.draw(dt);
      } catch (err) {
        // A HUD bug must never stop the run from ending or saving; report it once.
        if (!this.hudError) console.error(err);
        this.hudError = true;
      }
    }
    if (!playing) return;
    pickMusic(this, g, dt);
    if (g.outcome && !g.outcomeHandled) endRun(this);
    this.autosaveT += dt;
    if (this.autosaveT > 45) {
      this.autosaveT = 0;
      autosave(this);
    }
  }

  // =====================================================================
  // Screens
  // =====================================================================

  private onScreenInput(e: Event) {
    const t = e.target as HTMLInputElement;
    if (t.id === 'seed-input') this.setup.seed = t.value;
    // (Three to five letters for the Daily board: A to Z, as they are typed.)
    if (t.id === 'board-name') t.value = t.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5);
    if (t.dataset.track !== undefined) pickTrack(this, t.value);
    const key = t.dataset.setting as 'master' | 'sfx' | 'music' | undefined;
    if (key) {
      this.profile.settings[key] = parseFloat(t.value);
      this.sfx.apply(this.profile.settings);
      saveProfile(this.profile);
    }
  }

  private onScreenAction(e: MouseEvent) {
    if (this.screen === 'game') return;
    const el = (e.target as HTMLElement).closest('[data-sa]') as HTMLElement | null;
    if (!el) return;
    if (el.classList.contains('disabled')) {
      this.sfx.play('error', 0.5);
      return;
    }
    this.sfx.unlock();
    this.sfx.play('ui', 0.5);
    // A button of a menu page says what it does in its `data-sa`: a name, and after a colon what it is
    // about ("heir:vael"). The name is looked up in the pages' tables (screens/index.ts).
    const [name, arg] = el.dataset.sa!.split(':');
    // (REFUND ALL asks once; any other click and it asks again.)
    if (name !== 'refund') this.refundAsked = false;
    SCREEN_ACTIONS[name]?.(this, arg, el);
  }

  // ---- To a page, and the run put away, for whoever is outside the pages (the end of a run, a changed setting, the browser tests) ----
  showMenu() { showMenu(this); }
  autosave() { autosave(this); }
  teardownSession() { teardownSession(this); }
  /** The results of the run that has ended: a crowned Daily the board takes goes by the throne first (screens/throne.ts). */
  showResults() { if (wantsThrone(this)) showThrone(this); else showResults(this); }
  showSettings() { showSettings(this); }

  crt(): string {
    return this.profile.settings.crt ? ' crt' : '';
  }

  /**
   * Put a menu screen up. Drawing again the screen that is already showing (after a click on one of
   * its options) keeps the place it was scrolled to, instead of jumping back to the top.
   */
  put(screen: ScreenId, html: string) {
    const same = this.screen === screen;
    const was = same ? (this.ui.querySelector('.screen')?.scrollTop ?? 0) : 0;
    // (And the keyboard stays on the control that was just used: drawn again, the page would drop it.)
    const held = same ? (document.activeElement as HTMLElement | null) : null;
    const focus = held && this.ui.contains(held) ? held.dataset.sa : undefined;
    this.screen = screen;
    this.ui.innerHTML = html;
    const now = this.ui.querySelector('.screen');
    if (was && now) now.scrollTop = was;
    if (focus) this.ui.querySelector<HTMLElement>(`[data-sa="${focus}"]`)?.focus({ preventScroll: true });
  }

  /** The Hall's REFUND ALL has been clicked once: the next click gives the perks back. */
  refundAsked = false;
}
