import { Music, type SongId } from '../audio/Music';
import { playBattleSounds } from '../audio/battleSounds';
import { Sfx } from '../audio/Sfx';
import { Game } from '../game/Game';
import { ascend } from '../game/ages';
import { DIFFICULTY_NAMES, TICK } from '../game/constants';
import { AMBITION_BY_ID } from '../game/data/ambitions';
import { CARD_BY_ID, PACT_COLOR, RARITY_COLOR } from '../game/data/cards';
import { ERAS, LAST_CRADLE_ERA } from '../game/data/eras';
import { HEIRS, HEIR_BY_ID } from '../game/data/heirs';
import { RELIC_BY_ID } from '../game/data/relics';
import { TRAIT_BY_ID } from '../game/data/traits';
import { VICTORIES } from '../game/data/victories';
import { dailySeed, hashString, randomSeed } from '../game/rng';
import type { Difficulty, GameConfig, MapSize } from '../game/types';
import { applyRunToProfile, computeLegacy, perkDesc, PERKS, UNLOCKS, type LegacyReport } from '../meta/legacy';
import { clearRun, defaultProfile, hasRun, loadProfile, loadRun, saveProfile, saveRun, todayKey, type Profile } from '../meta/profile';
import { fmtTime, Renderer } from '../render/Renderer';
import { Attract } from './Attract';
import { drawHouseBanners, startingFleet } from './houseArt';
import { drawModeArt } from './modeArt';
import { Screen } from '../render/Screen';
import { groupBoons } from '../ui/boons';
import { installDomTips } from '../ui/domtips';
import { cradleVocabulary } from '../ui/vocab';
import { esc, fmt } from '../ui/format';
import { glossHtml } from '../ui/glossary';
import { Hud } from '../ui/Hud';
import { Input } from '../ui/Input';
import { Session } from './Session';

type ScreenId = 'menu' | 'setup' | 'hall' | 'howto' | 'settings' | 'loading' | 'game' | 'results';

interface ResultsData {
  report: LegacyReport;
  unlocked: string | null;
  won: boolean;
  title: string;
  reason: string;
  stats: [string, string][];
  cards: string[];
  relics: string[];
  heir: string;
  ambition: string;
  /** The run in one paragraph, for a bug report: version, seed, setup, how it ended. */
  details: string;
}

/** Shown on the title screen: package.json's version, put in by Vite (vite.config.ts). */
declare const __GAME_VERSION__: string;
const GAME_VERSION = __GAME_VERSION__;

const PIXEL_TIPS = {
  small: 'Small pixels: see more of the sector at once (640×360 game pixels).',
  auto: 'Fit the window: at least 480×270 game pixels, scaled up in whole steps.',
  large: 'Large pixels: bigger text and ships (400×225 game pixels).',
} as const;

const HOWTO = `
<p>The last <b>Hegemarch</b> fell, and the sector went dark. Your house lights it back up, one world at a time. Follow one of your three <b>Destinies</b> and be crowned the next Hegemarch.</p>
<p><b>Kindle:</b> click a grey world and press KINDLE. You pay for a seed ship, which flies out, lights the world in your color and is used up. If it is destroyed on the way, the Embers are lost and you kindle again. Each world costs a few more Embers than the last.</p>
<p><b>Scouts:</b> your Scout waits at your Hearth for orders. Select it (click the fleet badge) and press EXPLORE, or E, and it charts the dark world after world by itself. To look inside an <b>anomaly</b> (a violet swirl), send any ship there.</p>
<p><b>Worlds:</b> every world earns <b>Embers</b>, your only currency, and has one role. MINE: more Embers. FORGE: builds ships. OBSERVATORY: makes Lore and sees further. BASTION: guns, armor and repairs. Raise worlds to level II and III for more of everything.</p>
<p><b>Ships:</b> Strikers beat Breakers. Breakers beat Guardians and take worlds. Guardians beat Strikers. Carriers, Lancers, Dreadnoughts and Starbases come as Blueprint Boons.</p>
<p><b>Boons:</b> when your <b>Lore</b> fills, choose a Boon. Every run's choices are different.</p>
<p><b>Danger:</b> any house may attack at any time. Corsairs raid from about ten minutes in, rivals attack from about twelve (on Hard and Brutal, warlike houses rush sooner), and the Hollow may wake. If your <b>Hearth</b> falls, your house goes dark.</p>
<p><b>Rushing:</b> every Hearth's walls start at half strength and reach full strength at 12:00. Take a rival's Hearth and you win its worlds, half its hoard and a free Boon. Fail, and your rivals will make you pay.</p>
<p><b>Ages runs</b> are a longer game. Every house starts in the Stone Age on one cradle world: gather Lore, advance through five ages (each brings stronger units and a Boon), then build your Ark and carry what you have won to the stars, where the run goes on as above.</p>
<p><b>Controls:</b> click to select (a world, a ship, or the fleet badge <span class="fleet-badge">3</span> beside a world, which selects all your ships there), click a world to send selected ships (or right-click). Drag to select ships. Wheel to zoom, right-drag or arrow keys to move. Space pauses; E sends selected Scouts exploring; B for Boons, U for status, H for help. In a run, How to Play (H) lists every control and every tip. While the game is paused you can look around and read, but not give orders: press Space again first.</p>`;

export class App {
  private canvas: HTMLCanvasElement;
  private ui: HTMLElement;
  private screenObj: Screen;
  private renderer: Renderer;
  private sfx: Sfx;
  private music: Music;
  private profile: Profile;
  private screen: ScreenId = 'menu';
  private session: Session | null = null;
  private hud: Hud | null = null;
  private input: Input | null = null;
  private attract: Attract;
  private prepToken = 0;
  private last = performance.now();
  private acc = 0;
  private autosaveT = 0;
  private warHeat = 0;
  private results: ResultsData | null = null;
  private hudError = false;
  /** A one-time message on the title screen. */
  private menuNotice = '';
  /** `confirm`: the launch that waits for an answer about the saved run it would replace ('' = none). */
  private setup: { heir: string; size: MapSize; difficulty: Difficulty; seed: string; daily: boolean; ages: boolean; confirm: '' | 'launch'; guided: boolean } = {
    heir: 'concord', size: 'medium', difficulty: 1, seed: '', daily: false, ages: false, confirm: '', guided: true,
  };
  private confirmReset = false;
  /** One line about the saved run (house, sector, time played), read when the setup screen opens. */
  private savedRun = '';
  /** The Legacy the saved run earns if a new run ends it now (null: it cannot be read), worked out when the question is asked. */
  private savedLegacy: number | null = null;
  /** The day (UTC) the title screen was drawn for: when it turns, the daily run is a new one. */
  private menuDay = '';
  /** The sound button in the corner of every menu screen, and what it says now (see `syncSound`). */
  private soundBtn: HTMLButtonElement;
  private soundState = '';
  /** Was the sound still asleep when the click or key now being handled began? Then that click woke it. */
  private gestureWoke = false;

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
    this.setup.guided = !this.profile.tutorialDone;
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
      if (!this.music.playing) this.music.play(this.screen === 'game' ? 'night' : 'title');
    };
    // (A touch counts as the player's say-so when the finger lifts, not when it lands.)
    for (const ev of ['pointerdown', 'keydown', 'pointerup', 'click']) window.addEventListener(ev, unlock, { capture: true });
    this.soundBtn = document.createElement('button');
    this.soundBtn.id = 'sound';
    this.soundBtn.className = 'small';
    this.soundBtn.hidden = true;
    this.soundBtn.addEventListener('click', () => this.toggleSound());
    document.body.appendChild(this.soundBtn);
    this.ui.addEventListener('click', (e) => this.onScreenAction(e));
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.screen === 'setup' && this.setup.confirm) {
        this.setup.confirm = '';
        this.showSetup();
      }
    });
    this.ui.addEventListener('input', (e) => this.onScreenInput(e));
    installDomTips();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.autosave();
    });
    window.addEventListener('beforeunload', () => this.autosave());
    this.showMenu();
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
      }
      if (this.screen === 'menu') this.tickMenu();
      this.syncSound();
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
    this.processFx(g, s.visible, playing);
    this.renderer.fx.update(s.halted && !g.outcome ? 0 : dt * (g.outcome ? 1 : s.speed));
    this.renderer.render(g, alpha, dt, s.view, !playing);
    // Ages: the player's Ark has left the cradle. A card says what goes with it; its button takes the run on.
    if (playing && g.ascended && !g.outcome && s.modal?.kind !== 'ascend') {
      if (!s.modal) this.sfx.play('victory', 0.6);
      s.modal = { kind: 'ascend' };
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
    this.pickMusic(g, dt);
    if (g.outcome && !g.outcomeHandled) this.endRun();
    this.autosaveT += dt;
    if (this.autosaveT > 45) {
      this.autosaveT = 0;
      this.autosave();
    }
  }

  /** Night music normally; war music while the player's worlds or fleets are fighting. */
  private pickMusic(g: Game, dt: number) {
    const p = g.player;
    let fighting = false;
    if (g.tick % 10 === 0) {
      for (const n of g.nodes) {
        if (n.owner === p.id && n.lastHit < 4) fighting = true;
      }
      if (!fighting) for (const u of g.unitList) if (!u.dead && u.owner === p.id && u.lastHit < 3 && u.type !== 'fighter') fighting = true;
      this.warHeat = fighting ? Math.min(30, this.warHeat + 3) : this.warHeat;
    }
    this.warHeat = Math.max(0, this.warHeat - dt * 0.6);
    const want: SongId = this.warHeat > 8 ? 'war' : 'night';
    if (this.music.playing !== want && (want === 'war' || this.warHeat <= 0.5)) this.music.play(want);
  }

  private processFx(g: Game, visible: (n: number) => boolean, sound: boolean) {
    const cam = this.renderer.cam;
    const near = (x: number, y: number, pad: number) => cam.sees(x, y, pad);
    this.renderer.fx.ingest(g.fx, visible, near, cam.zoom);
    if (sound) playBattleSounds(g.fx, g.nodes, cam, this.sfx, visible);
    g.fx.length = 0;
  }

  // =====================================================================
  // Runs
  // =====================================================================

  private buildConfig(): GameConfig {
    const st = this.setup;
    let seed: number;
    if (st.daily) seed = dailySeed();
    else if (st.seed.trim()) seed = /^\d+$/.test(st.seed.trim()) ? parseInt(st.seed.trim(), 10) >>> 0 : hashString(st.seed.trim());
    else seed = randomSeed();
    return {
      seed,
      size: st.daily ? 'medium' : st.size,
      difficulty: st.daily ? 1 : st.difficulty,
      heir: st.heir,
      perks: { ...this.profile.perks },
      unlockLegendary: this.profile.unlockLegendary,
      unlockPacts: this.profile.unlockPacts,
      daily: st.daily,
      tutorial: st.guided && !st.daily && !st.ages,
      // An Ages run begins on the cradle world.
      ...(st.ages ? { mode: 'ages' as const, stage: 'cradle' as const } : {}),
    };
  }

  /** The simple first run: a small, easy sector with the First Night guide. */
  private firstNightConfig(): GameConfig {
    return {
      seed: randomSeed(),
      size: 'small',
      difficulty: 0,
      heir: 'concord',
      perks: { ...this.profile.perks },
      unlockLegendary: this.profile.unlockLegendary,
      unlockPacts: this.profile.unlockPacts,
      tutorial: true,
      // The three Destinies that need the least explaining (and no Maw in a first game).
      forcedVictories: ['conquest', 'domination', 'ascension'],
    };
  }

  /**
   * The saved run, ended as an abandoned one: the game, and the Legacy it earns. Nothing is stored.
   * Null if there is no saved run, or it cannot be read.
   */
  private endedSavedRun(): { game: Game; legacy: number } | null {
    const data = loadRun();
    if (!data) return null;
    try {
      const g = Game.load(data);
      g.ascended = false;
      g.declareWinner(-1, 'defeat', 'You left this run for a new one.');
      return { game: g, legacy: computeLegacy(g).total };
    } catch {
      return null;
    }
  }

  /**
   * A new run takes the place of the saved one. The saved run ends as an abandoned run would: it is
   * paid its Legacy and entered in the Chronicle, so that nothing but the run itself is lost. Returns
   * the Legacy paid (null if there was no saved run, or it could not be read).
   */
  private retireSavedRun(): number | null {
    const ended = this.endedSavedRun();
    clearRun();
    if (!ended) return null;
    const c = ended.game.config;
    applyRunToProfile(this.profile, ended.game, ended.legacy);
    if (c.daily && c.seed === dailySeed()) this.profile.lastDaily = todayKey();
    saveProfile(this.profile);
    return ended.legacy;
  }

  private async startRun(config: GameConfig) {
    this.teardownSession();
    this.attract.stop();
    const token = ++this.prepToken;
    this.screen = 'loading';
    this.renderLoading(0.2);
    await new Promise((r) => setTimeout(r, 40));
    let g: Game;
    try {
      g = Game.create(config);
      // The First Night leaves little to chance: now and then (one sector in a hundred) every way out of
      // the home system is guarded, and a Scout sent exploring would have nowhere safe to go. Deal again.
      for (let i = 0; i < 8 && config.tutorial && !config.daily && g.chartable(g.playerId) < 6; i++) {
        config = { ...config, seed: randomSeed() };
        g = Game.create(config);
      }
    } catch (e) {
      console.error(e);
      this.showMenu();
      return;
    }
    // (Only now that the new run exists does the saved one end.)
    const paid = this.retireSavedRun();
    this.renderLoading(0.8);
    await new Promise((r) => setTimeout(r, 30));
    if (token !== this.prepToken) return;
    this.beginSession(g);
    if (paid !== null) this.session?.showToast(`Your last run ended: +${paid} Legacy.`, '#ffd23f', 9);
  }

  private async continueRun() {
    const data = loadRun();
    if (!data) {
      this.showMenu();
      return;
    }
    let g: Game;
    try {
      g = Game.load(data);
    } catch (e) {
      console.error(e);
      clearRun();
      this.menuNotice = 'Your saved run was made by an older version of Hegemarch and could not be continued, so it was cleared. Your Legacy and unlocks are safe.';
      this.showMenu();
      return;
    }
    this.teardownSession();
    this.attract.stop();
    ++this.prepToken;
    this.beginSession(g);
    const s = this.session!;
    s.paused = true;
    s.showToast('Run restored. Paused: press Space to go on.', '#c8cbe6', 6);
  }

  private beginSession(g: Game) {
    this.ui.innerHTML = '';
    this.renderer.prepare(g);
    const s = new Session(g, this.renderer, this.screenObj, this.sfx, this.music, this.profile, {
      quit: (save) => {
        if (save) this.autosave();
        this.teardownSession();
        this.showMenu();
        void this.attract.start();
      },
      abandon: () => {
        g.ascended = false;
        g.declareWinner(-1, 'defeat', 'You abandoned the run.');
        this.endRun();
      },
      ascend: () => void this.toStars(g),
      saveProfile: () => saveProfile(this.profile),
      applySettings: () => this.applySettings(),
      showResults: () => {
        if (this.screen === 'game' && this.results) this.showResults();
      },
    });
    this.session = s;
    this.hud = new Hud(s);
    this.input = new Input(s, this.hud, this.canvas);
    this.screen = 'game';
    this.acc = 0;
    this.autosaveT = 0;
    this.warHeat = 0;
    const cap = g.player.capital;
    if (cap >= 0) {
      const n = g.nodes[cap];
      this.renderer.cam.focus(n.x, n.y + 90, 0.2);
      this.renderer.cam.x = n.x;
      this.renderer.cam.y = n.y;
      this.renderer.cam.zoom = 0.07;
    }
    if (g.config.tutorial && !g.ui.tut) this.hud.tutorial.start();
    else if (g.cradle && g.time < 1) s.modal = { kind: 'cradle' };
    else if (!g.cradle && !g.config.tutorial && (g.time < 1 || (g.config.ages && !g.ui.arrived))) {
      // (An Ages run arrives among the stars some minutes into that game: its omens are shown then.)
      s.modal = { kind: 'omens' };
      g.ui.arrived = 1;
    }
    this.music.play('night');
    this.canvas.focus();
  }

  /**
   * Ages: the player's Ark has left the cradle. Build the game among the stars from it, play that game
   * forward to the moment the player arrives (rivals whose Arks left earlier have had that long), and go on.
   */
  private async toStars(cradle: Game) {
    this.teardownSession();
    const token = ++this.prepToken;
    this.screen = 'loading';
    this.renderLoading(0.05, 'Your Ark crosses the dark…');
    await new Promise((r) => setTimeout(r, 60));
    let g: Game | null;
    try {
      g = ascend(cradle);
    } catch (e) {
      console.error(e);
      g = null;
    }
    if (token !== this.prepToken) return;
    if (!g) {
      // No rival is left to meet out there: the crown is already won.
      cradle.ascended = false;
      cradle.declareWinner(cradle.playerId, 'conquest', 'No rival house was left to follow you to the stars.');
      this.beginSession(cradle);
      return;
    }
    const arrival = g.config.ages?.arrival ?? 0;
    g.fxEnabled = false;
    while (g.time < arrival && !g.outcome) {
      for (let i = 0; i < 400 && g.time < arrival && !g.outcome; i++) g.step();
      this.renderLoading(0.05 + 0.9 * Math.min(1, g.time / Math.max(1, arrival)));
      await new Promise((r) => setTimeout(r, 0));
      if (token !== this.prepToken) return;
    }
    g.fx.length = 0;
    g.fxEnabled = true;
    this.beginSession(g);
    saveRun(g.serialize());
  }

  private teardownSession() {
    this.input?.destroy();
    this.input = null;
    this.hud = null;
    this.session = null;
  }

  private autosave() {
    const s = this.session;
    if (!s || this.screen !== 'game' || s.game.outcome) return;
    saveRun(s.game.serialize());
  }

  /**
   * The sound button: in the corner of every menu screen (in a run, sound is under Menu, Settings). It
   * says what is heard: on, off, or waiting for the browser, which plays nothing before the first
   * click on a page.
   */
  private syncSound() {
    const b = this.soundBtn;
    if (this.screen === 'game' || this.screen === 'loading') {
      this.soundState = '';
      b.hidden = true;
      return;
    }
    const state = this.profile.settings.muted ? 'off' : this.sfx.live ? 'on' : 'asleep';
    if (state === this.soundState) return;
    this.soundState = state;
    b.hidden = false;
    const say = { on: 'SOUND ON', off: 'SOUND OFF', asleep: 'CLICK FOR SOUND' }[state];
    const tip = {
      on: 'Music and sound effects are on. Click to turn them off. (Volumes are under Settings.)',
      off: 'Music and sound effects are off. Click to turn them on.',
      asleep: 'A browser plays no sound before your first click on a page. Click anywhere and the music starts.',
    }[state];
    const marks = state === 'off' ? '<path d="M5 3h1v1H5zM7 3h1v1H7zM6 4h1v1H6zM5 5h1v1H5zM7 5h1v1H7z"/>' : '<path d="M5 3h1v3H5zM7 2h1v5H7z"/>';
    b.dataset.state = state;
    b.dataset.tip = tip;
    b.setAttribute('aria-label', `${say}. ${tip}`);
    b.setAttribute('aria-pressed', String(state !== 'off'));
    b.innerHTML = `<svg viewBox="0 0 9 9" shape-rendering="crispEdges" aria-hidden="true"><path d="M0 3h2v3H0zM2 2h1v5H2zM3 1h1v7H3z"/>${marks}</svg><span>${say}</span>`;
  }

  private toggleSound() {
    const st = this.profile.settings;
    // (The click that woke the sound has turned it on: it is not also a click to turn it off.)
    if (this.gestureWoke && !st.muted) return;
    this.setMuted(!st.muted);
  }

  private setMuted(muted: boolean) {
    this.profile.settings.muted = muted;
    saveProfile(this.profile);
    this.sfx.apply(this.profile.settings);
    if (!muted) this.sfx.play('ui', 0.5);
  }

  private applySettings() {
    this.sfx.apply(this.profile.settings);
    this.screenObj.setPixelSize(this.profile.settings.pixelSize);
    for (const el of this.ui.querySelectorAll('.screen')) el.classList.toggle('crt', this.profile.settings.crt);
  }

  private endRun() {
    const s = this.session!;
    const g = s.game;
    g.outcomeHandled = true;
    const o = g.outcome!;
    const report = computeLegacy(g);
    // (A run that ended on the cradle is told in the cradle's words: lands, units.)
    if (g.cradle) for (const l of report.lines) l[0] = cradleVocabulary(LAST_CRADLE_ERA + 1)(l[0]);
    const unlocked = applyRunToProfile(this.profile, g, report.total);
    if (g.config.daily) this.profile.lastDaily = todayKey();
    if (g.config.tutorial) this.profile.tutorialDone = true;
    saveProfile(this.profile);
    clearRun();
    const p = g.player;
    this.sfx.play(o.playerWon ? 'victory' : 'defeat', 0.9);
    this.music.play(null);
    const winner = o.winner >= 0 ? g.factions[o.winner] : null;
    const vname = (v: string) => VICTORIES[v as keyof typeof VICTORIES]?.name ?? v;
    this.results = {
      report,
      unlocked,
      won: o.playerWon,
      title: o.playerWon ? 'VICTORY' : 'DEFEAT',
      reason: o.playerWon
        ? `You are crowned Hegemarch by ${vname(o.victory)}. ${o.reason}`
        : winner && o.victory !== 'defeat'
          ? `${winner.name} is crowned Hegemarch by ${vname(o.victory)}. ${o.reason}`
          : o.reason,
      stats: (
        [
        // (An Ages run: the time on the cradle, plus the time among the stars since the player arrived there.)
        ['Run time', fmtTime(g.config.ages ? g.config.ages.cradleTime + Math.max(0, o.time - g.config.ages.arrival) : o.time)],
        ['Most worlds held', String(p.stats.maxWorlds)],
        ['Worlds kindled', String(p.stats.worldsKindled)],
        ['Worlds captured', String(p.stats.worldsCaptured)],
        ['Ships built', String(p.stats.shipsBuilt)],
        ['Enemy ships destroyed', String(p.stats.kills)],
        ['Ships lost', String(p.stats.shipsLost)],
        ['Boons from Lore', String(p.boons)],
        ['Anomalies resolved', String(p.stats.eventsResolved)],
        ['Embers earned', fmt(p.stats.embersEarned)],
        ['Omens', g.traits.map((t) => TRAIT_BY_ID[t]?.name ?? t).join(', ')],
        // (The seed rebuilds the same sector: with the setup beside it, a run can be played again.)
        ['Seed', `${g.config.seed} · ${g.config.size[0].toUpperCase() + g.config.size.slice(1)} · ${DIFFICULTY_NAMES[g.config.difficulty]}`],
        // An Ages run: how long the cradle took (or, if the run ended there, how far the climb came).
        ...(g.config.ages ? [['Time on the cradle', fmtTime(g.config.ages.cradleTime)], ['Lands held when the Ark left', String(g.config.ages.lands)]] : []),
        ...(g.cradle ? [['Age reached', ERAS[Math.min(p.era, LAST_CRADLE_ERA)].name]] : []),
        ] as [string, string][]
      )
        .filter(([, v]) => v !== '')
        // (A run that ended on the cradle is told in the cradle's words: lands, units.)
        .map(([k, v]) => [g.cradle ? cradleVocabulary(LAST_CRADLE_ERA + 1)(k) : k, v] as [string, string]),
      cards: [...p.cards],
      relics: [...p.relics],
      heir: p.heir,
      ambition: g.ambition,
      details: [
        `Hegemarch v${GAME_VERSION}`,
        `${g.config.mode === 'ages' ? 'Ages run' : g.config.daily ? 'Daily run' : g.config.tutorial ? 'First Night' : 'Classic run'}, seed ${g.config.seed}, ${g.config.size}, ${DIFFICULTY_NAMES[g.config.difficulty]}, ${HEIR_BY_ID[p.heir]?.name ?? p.heir}`,
        `${o.playerWon ? 'Victory' : 'Defeat'} by ${vname(o.victory)} at ${fmtTime(o.time)}: ${o.reason}`,
        `Destinies: ${g.victories.map(vname).join(', ')}. Omens: ${g.traits.map((t) => TRAIT_BY_ID[t]?.name ?? t).join(', ') || 'none'}.`,
        `Boons: ${groupBoons(p.cards).map(({ id, count }) => (CARD_BY_ID[id]?.name ?? id) + (count > 1 ? ` x${count}` : '')).join(', ') || 'none'}.`,
        `Worlds ${p.stats.maxWorlds} at most, ships built ${p.stats.shipsBuilt}, lost ${p.stats.shipsLost}, destroyed ${p.stats.kills}.`,
      ].join('\n'),
    };
    s.modal = null;
    s.paused = true;
    window.setTimeout(() => {
      if (this.session === s && this.screen === 'game') this.showResults();
    }, 4200);
  }

  // =====================================================================
  // Screens
  // =====================================================================

  private onScreenInput(e: Event) {
    const t = e.target as HTMLInputElement;
    if (t.id === 'seed-input') this.setup.seed = t.value;
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
    const [a, b] = el.dataset.sa!.split(':');
    const st = this.setup;
    switch (a) {
      case 'menu':
        this.showMenu();
        break;
      case 'continue':
        void this.continueRun();
        break;
      case 'setup':
        st.daily = false;
        st.ages = false;
        st.confirm = '';
        this.savedRun = this.describeSavedRun();
        this.showSetup();
        break;
      case 'ages':
        st.daily = false;
        st.ages = true;
        st.confirm = '';
        if (!this.profile.agesSeen) {
          this.profile.agesSeen = true;
          saveProfile(this.profile);
        }
        this.savedRun = this.describeSavedRun();
        this.showSetup();
        break;
      case 'daily':
        st.daily = true;
        st.ages = false;
        st.confirm = '';
        this.savedRun = this.describeSavedRun();
        this.showSetup();
        break;
      case 'first-night':
        // (The title screen offers the First Night only when no run is saved; a saved one is never replaced unasked.)
        if (hasRun()) this.showMenu();
        else void this.startRun(this.firstNightConfig());
        break;
      case 'confirm-new': {
        const which = st.confirm;
        st.confirm = '';
        if (which) void this.startRun(this.buildConfig());
        break;
      }
      case 'confirm-cancel':
        st.confirm = '';
        this.showSetup();
        break;
      case 'hall':
        this.showHall();
        break;
      case 'howto':
        this.screen = 'howto';
        this.ui.innerHTML = `<div class="screen${this.crt()}"><div class="page px-box howto" style="max-width:760px"><h1>HOW TO PLAY</h1>${HOWTO}<div class="foot-actions"><button data-sa="menu">BACK</button></div></div></div>`;
        break;
      case 'settings':
        this.confirmReset = false;
        this.showSettings();
        break;
      case 'heir':
        if (this.profile.heirs.includes(b)) st.heir = b;
        this.showSetup();
        break;
      case 'size':
        st.size = b as MapSize;
        this.showSetup();
        break;
      case 'diff':
        st.difficulty = parseInt(b, 10) as Difficulty;
        this.showSetup();
        break;
      case 'guided':
        st.guided = !st.guided;
        this.showSetup();
        break;
      case 'reseed':
        st.seed = String(randomSeed());
        this.showSetup();
        break;
      case 'launch':
        if (hasRun()) {
          this.savedLegacy = this.endedSavedRun()?.legacy ?? null;
          st.confirm = 'launch';
          this.showSetup();
          break;
        }
        void this.startRun(this.buildConfig());
        break;
      case 'unlock-heir': {
        const h = HEIR_BY_ID[b];
        if (h && !this.profile.heirs.includes(b) && this.profile.legacy >= h.cost) {
          this.profile.legacy -= h.cost;
          this.profile.heirs.push(b);
          saveProfile(this.profile);
          this.sfx.play('good', 0.7);
        }
        this.showHall();
        break;
      }
      case 'perk': {
        const perk = PERKS.find((p) => p.id === b);
        const rank = this.profile.perks[b] ?? 0;
        if (perk && rank < perk.costs.length && this.profile.legacy >= perk.costs[rank]) {
          this.profile.legacy -= perk.costs[rank];
          this.profile.perks[b] = rank + 1;
          saveProfile(this.profile);
          this.sfx.play('good', 0.7);
        }
        this.showHall();
        break;
      }
      case 'unlock': {
        const u = UNLOCKS.find((x) => x.id === b);
        const owned = b === 'pacts' ? this.profile.unlockPacts : this.profile.unlockLegendary;
        if (u && !owned && this.profile.legacy >= u.cost) {
          this.profile.legacy -= u.cost;
          if (b === 'pacts') this.profile.unlockPacts = true;
          else this.profile.unlockLegendary = true;
          saveProfile(this.profile);
          this.sfx.play('good', 0.7);
        }
        this.showHall();
        break;
      }
      case 'toggle': {
        const k = b as 'edgePan' | 'tips' | 'autoPause' | 'crt' | 'explainTerms';
        this.profile.settings[k] = !this.profile.settings[k];
        saveProfile(this.profile);
        this.applySettings();
        this.showSettings();
        break;
      }
      case 'sound':
        this.setMuted(b === 'off');
        this.showSettings();
        break;
      case 'pixels':
        this.profile.settings.pixelSize = b as 'small' | 'auto' | 'large';
        saveProfile(this.profile);
        this.applySettings();
        this.showSettings();
        break;
      case 'replay-tutorial':
        this.profile.tutorialDone = false;
        this.profile.seenTips = [];
        saveProfile(this.profile);
        this.setup.guided = true;
        this.showSettings();
        break;
      case 'reset':
        if (!this.confirmReset) {
          this.confirmReset = true;
        } else {
          this.profile = defaultProfile();
          saveProfile(this.profile);
          clearRun();
          this.confirmReset = false;
          this.setup.guided = true;
        }
        this.showSettings();
        break;
      case 'copy-run': {
        // (A copy has to start in the click itself; where the clipboard is refused, show the text to select.)
        const text = this.results?.details ?? '';
        const done = () => (el.textContent = 'COPIED');
        const show = () => {
          const box = this.ui.querySelector<HTMLTextAreaElement>('#run-details');
          if (!box) return;
          box.hidden = false;
          box.focus();
          box.select();
        };
        try {
          navigator.clipboard.writeText(text).then(done, show);
        } catch {
          show();
        }
        break;
      }
      case 'results-hall':
        this.teardownSession();
        this.showHall();
        void this.attract.start();
        this.music.play('title');
        break;
      case 'results-again':
        this.teardownSession();
        st.daily = false;
        st.confirm = '';
        this.showSetup();
        void this.attract.start();
        this.music.play('title');
        break;
    }
  }

  private crt(): string {
    return this.profile.settings.crt ? ' crt' : '';
  }

  /**
   * The title screen. What the player most likely wants is the largest thing on it: the run in progress,
   * or, for a new player, the guided First Night. Under it the ways to play stand side by side, each
   * with a living picture of what it is (app/modeArt.ts); everything else is a quiet row at the foot.
   */
  private showMenu() {
    this.screen = 'menu';
    if (this.sfx.ctx && this.music.playing !== 'title') this.music.play('title');
    const p = this.profile;
    const saved = hasRun();
    const run = saved ? this.savedRunInfo() : null;
    const first = !saved && !p.tutorialDone && p.runs === 0;
    const dailyDone = p.lastDaily === todayKey();
    this.menuDay = todayKey();
    queueMicrotask(() => (this.menuNotice = ''));
    const banner = (heir: string) => `<canvas class="heir-art chosen" data-heir="${heir}" height="24" aria-hidden="true"></canvas>`;
    const hero = saved
      ? `<button class="hero" data-sa="continue" style="--hc:${run?.color ?? 'var(--gold)'}">
          ${run && run.era >= 0 ? `<canvas class="mode-art" data-art="ages" data-era="${run.era}" data-color="${run.color}" aria-hidden="true"></canvas>` : banner(run?.heir ?? 'concord')}
          <span class="hero-text"><span class="hero-kicker">${esc((run?.kind ?? 'Run').toUpperCase())} IN PROGRESS</span>
            <span class="hero-title">${esc((run?.name ?? 'Your saved run').toUpperCase())}</span>
            <span class="hero-line">${esc(run?.line ?? 'Pick it up where you left it.')}</span></span>
          <span class="hero-go">CONTINUE</span>
        </button>`
      : first
        ? `<button class="hero" data-sa="first-night" style="--hc:${HEIR_BY_ID.concord.color}">
          ${banner('concord')}
          <span class="hero-text"><span class="hero-kicker">YOUR FIRST RUN</span>
            <span class="hero-title">THE FIRST NIGHT</span>
            <span class="hero-line">A guided run in a small, quiet sector. The game shows you the first few moves, one at a time.</span></span>
          <span class="hero-go">BEGIN</span>
        </button>`
        : '';
    const offers = this.hallOffers();
    this.ui.innerHTML = `<div class="screen menu${this.crt()}">
      <div class="logo">HEGEMARCH</div>
      <div class="tagline">The last Hegemarch fell, and the sector went dark. Light it again, world by world, and take the crown.</div>
      ${this.menuNotice ? `<div class="px-box notice">${esc(this.menuNotice)}</div>` : ''}
      <div class="home${hero ? '' : ' solo'}">
        ${hero}
        <div class="home-label"><span>${saved ? 'OR START A NEW RUN' : first ? 'OR CHOOSE YOUR OWN RUN' : 'CHOOSE YOUR RUN'}</span></div>
        <div class="modes">
          <button class="mode sector" data-sa="setup" data-tip="Choose a house, a sector and a difficulty. 3 to 6 houses, 25 to 70 minutes. The sector, your rivals, your Destinies and your Boons are new every run.">
            <canvas class="mode-art" data-art="sector" aria-hidden="true"></canvas>
            <span class="mode-name">CLASSIC RUN</span>
            <span class="mode-pitch">A dark sector, rival houses and one crown.</span>
            <span class="mode-meta">25 TO 70 MIN</span>
          </button>
          <button class="mode ages" data-sa="ages" data-tip="A longer game. Every house starts in the Stone Age on one world, and climbs age by age to the stars.">
            ${p.agesSeen ? '' : '<span class="mode-flag">NEW</span>'}
            <canvas class="mode-art" data-art="ages" aria-hidden="true"></canvas>
            <span class="mode-name">AGES RUN</span>
            <span class="mode-pitch">The long game. From the Stone Age to the stars.</span>
            <span class="mode-meta">50 TO 110 MIN</span>
          </button>
          <button class="mode daily" data-sa="daily" data-tip="The same sector for every player today: medium, Normal, with [Legacy ×1.25]. The picture is the chart of today's sector.">
            <canvas class="mode-art" data-art="daily" aria-hidden="true"></canvas>
            <span class="mode-name">DAILY RUN${dailyDone ? ' ✓' : ''}</span>
            <span class="mode-pitch">Today's sector, the same for every player. Legacy ×1.25.</span>
            <span class="mode-meta" data-daily>${this.dailyLine()}</span>
          </button>
        </div>
        <div class="home-links">
          <button class="small" data-sa="hall" data-tip="Spend Legacy, earned by every run, on new houses, perks and unlocks.${offers ? ` [You can afford ${offers} of them now.]` : ''}">HALL OF HEIRS · <span class="gold">◆${p.legacy}${offers ? ' TO SPEND' : ''}</span>${offers ? '<span class="pip" aria-hidden="true"></span>' : ''}</button>
          <button class="small" data-sa="howto">HOW TO PLAY</button>
          <button class="small" data-sa="settings">SETTINGS</button>
        </div>
      </div>
      <div class="menu-foot">Runs ${p.runs} · Crowned ${p.wins}${p.bestTime !== null ? ` · Fastest crown ${fmtTime(p.bestTime)}` : ''}<br>
      Real-time strategy · a new sector, new rivals and new Boons every run · v${GAME_VERSION}</div>
    </div>`;
  }

  /** While the title screen shows: the daily run counts down to the next one, and turns over with the day. */
  private tickMenu() {
    if (todayKey() !== this.menuDay) {
      this.showMenu();
      return;
    }
    const el = this.ui.querySelector('[data-daily]');
    const line = this.dailyLine();
    if (el && el.textContent !== line) el.textContent = line;
  }

  /** "ENDS IN 5H 12M": how long today's daily sector lasts (the day turns at midnight, UTC). */
  private dailyLine(): string {
    const now = new Date();
    const left = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime();
    const m = Math.max(1, Math.ceil(left / 60000));
    const span = m >= 60 ? `${Math.floor(m / 60)}H ${String(m % 60).padStart(2, '0')}M` : `${m}M`;
    return this.profile.lastDaily === todayKey() ? `PLAYED · NEXT IN ${span}` : `ENDS IN ${span}`;
  }

  /** Everything in the Hall of Heirs the player does not have yet, cheapest first: its name and its price. */
  private hallShop(): { name: string; cost: number }[] {
    const p = this.profile;
    const out: { name: string; cost: number }[] = [];
    for (const h of HEIRS) if (h.cost > 0 && !p.heirs.includes(h.id)) out.push({ name: h.name, cost: h.cost });
    for (const pk of PERKS) {
      const rank = p.perks[pk.id] ?? 0;
      if (rank < pk.costs.length) out.push({ name: pk.name, cost: pk.costs[rank] });
    }
    for (const u of UNLOCKS) if (!(u.id === 'pacts' ? p.unlockPacts : p.unlockLegendary)) out.push({ name: u.name, cost: u.cost });
    return out.sort((a, b) => a.cost - b.cost);
  }

  /** How many things in the Hall of Heirs the player's Legacy would buy right now. */
  private hallOffers(): number {
    return this.hallShop().filter((x) => x.cost <= this.profile.legacy).length;
  }

  /**
   * Put a menu screen up. Drawing again the screen that is already showing (after a click on one of
   * its options) keeps the place it was scrolled to, instead of jumping back to the top.
   */
  private put(screen: ScreenId, html: string) {
    const was = this.screen === screen ? (this.ui.querySelector('.screen')?.scrollTop ?? 0) : 0;
    this.screen = screen;
    this.ui.innerHTML = html;
    const now = this.ui.querySelector('.screen');
    if (was && now) now.scrollTop = was;
  }

  /**
   * The saved run, for the title screen and the setup: its house, the kind of run ("Classic run"), and a
   * line like "Medium · Normal · 7 worlds · 12:34 played". `era`: the age an Ages run has reached on its
   * cradle (-1 for any other run). Null if there is no saved run, or it cannot be read.
   */
  private savedRunInfo(): { heir: string; name: string; color: string; kind: string; line: string; era: number } | null {
    const d = loadRun();
    if (!d) return null;
    try {
      const c = d.config;
      const heir = HEIR_BY_ID[c.heir];
      const ages = c.mode === 'ages';
      const cradle = ages && c.stage !== 'stars';
      const era = cradle ? Math.max(0, Math.min(LAST_CRADLE_ERA, d.factions[d.playerId]?.era ?? 0)) : -1;
      const kind = ages ? 'Ages run' : c.daily ? 'Daily run' : c.tutorial ? 'First Night' : 'Classic run';
      const held = d.nodes.filter((n) => n.kind === 'planet' && n.owner === d.playerId).length;
      // (An Ages run: the time on the cradle, plus the time among the stars since the player arrived there.)
      const played = c.ages ? c.ages.cradleTime + Math.max(0, d.time - c.ages.arrival) : d.time;
      const where = cradle ? [ERAS[era].name] : ages ? ['Among the stars'] : [];
      const line = [...where, c.size[0].toUpperCase() + c.size.slice(1), DIFFICULTY_NAMES[c.difficulty], `${held} ${cradle ? 'land' : 'world'}${held === 1 ? '' : 's'}`, `${fmtTime(played)} played`].join(' · ');
      return { heir: c.heir, name: heir?.name ?? 'Your house', color: heir?.color ?? '#ffd23f', kind, line, era };
    } catch {
      return null;
    }
  }

  /** "Solar Concord · Classic run · Medium · Normal · 7 worlds · 12:34 played" for the saved run ('' if there is none). */
  private describeSavedRun(): string {
    if (!hasRun()) return '';
    const run = this.savedRunInfo();
    return run ? `${run.name} · ${run.kind} · ${run.line}` : 'a saved run';
  }

  private showSetup() {
    const st = this.setup;
    const p = this.profile;
    const saved = hasRun();
    if (!saved) st.confirm = '';
    // A run is already in progress: ask in a pop-up over the page when a new run is launched (never as a
    // line below the fold, and not as a notice over the setup either: the pop-up says it when it matters).
    // The question has two answers, and the marked one is what the player just asked for. (Continuing the
    // saved run is not one of them: the title screen has offered that already, and here it only undid a
    // launch by a stray click.) The saved run ends as an abandoned one, Legacy paid.
    const dialog = st.confirm
      ? `<div class="dialog-back"><div class="px-box dialog" role="dialog" aria-modal="true">
          <h2>START A NEW RUN?</h2>
          <p>Your saved run ends here${this.savedRun ? `:<br><b>${esc(this.savedRun)}</b>` : '.'}</p>
          ${this.savedLegacy !== null ? `<p>It keeps the Legacy it has earned: <span class="gold">◆${this.savedLegacy}</span>.</p>` : ''}
          <div class="dialog-actions">
            <button class="primary" data-sa="confirm-new">START NEW RUN</button>
            <button data-sa="confirm-cancel">GO BACK</button>
          </div>
        </div></div>`
      : '';
    const heirs = HEIRS.map((h) => {
      const owned = p.heirs.includes(h.id);
      return `<div class="heir px-box ${st.heir === h.id ? 'sel' : ''} ${owned ? '' : 'locked'}" style="--hc:${h.color}" data-sa="heir:${h.id}">
        <canvas class="heir-art" data-heir="${h.id}" height="24" data-tip="${esc(`${h.name} starts with ${startingFleet(h)}${h.start.epicCard ? ', and a random Epic Boon' : ''}.`)}"></canvas>
        <div class="hn">${esc(h.name.toUpperCase())}</div>
        <div class="ht">${esc(h.title)}${owned ? '' : ` · locked: ◆${h.cost} in the Hall of Heirs`}${p.winsByHeir[h.id] ? ` · <span class="gold">${p.winsByHeir[h.id]} win${p.winsByHeir[h.id] > 1 ? 's' : ''}</span>` : ''}</div>
        <div class="hd">${glossHtml(h.desc)}</div>
        <ul>${h.bonuses.map((b) => `<li>${glossHtml(b)}</li>`).join('')}</ul>
      </div>`;
    }).join('');
    const ages = st.ages;
    const sizes: [MapSize, string, string][] = ages
      ? [
          ['small', 'SMALL', '3 houses on the cradle · about 50 to 70 minutes in all'],
          ['medium', 'MEDIUM', '4 houses on the cradle · about 60 to 85 minutes in all'],
          ['large', 'LARGE', '6 houses on the cradle · about 75 to 110 minutes in all'],
        ]
      : [
          ['small', 'SMALL', '3 houses · about 25 worlds · 25 to 40 minutes'],
          ['medium', 'MEDIUM', '4 houses · about 40 worlds · 35 to 50 minutes'],
          ['large', 'LARGE', '6 houses · about 60 worlds · 45 to 70 minutes'],
        ];
    const diffHelp = ['Rivals earn less and attack late. Good for learning.', 'A fair fight.', 'Richer, faster, bolder rivals.', 'Merciless.'];
    const daily = st.daily;
    // The ways to play, as tabs: a change of mind costs one click here, not a trip back to the title screen.
    const tab = (sa: string, name: string, on: boolean) => `<button class="small${on ? ' active' : ''}" data-sa="${sa}" role="tab" aria-selected="${on}">${name}</button>`;
    this.put('setup', `<div class="screen${this.crt()}"><div class="page">
      <h1>NEW RUN</h1>
      <div class="mode-tabs" role="tablist">${tab('setup', 'CLASSIC RUN', !daily && !ages)}${tab('ages', 'AGES RUN', ages)}${tab('daily', `DAILY RUN${p.lastDaily === todayKey() ? ' ✓' : ''}`, daily)}</div>
      <div class="lead">${daily ? `Today's sector is the same for everyone: medium, Normal, seed ${dailySeed()}. Legacy ×1.25.` : ages ? 'A longer game. Every house begins as a tribe in the Stone Age, all on one cradle world. Climb through the ages, build your Ark, and carry what you have won to the stars, where the crown is decided.' : 'Choose a house to bid for the crown of Hegemarch. The sector, your rivals, your Destinies and your Boons are new every run.'}</div>
      ${ages ? `<div class="px-box ages-head"><canvas class="mode-art" data-art="ages" aria-hidden="true"></canvas>
        <div class="ages-names">${ERAS.map((e) => `<span>${e.short}</span>`).join('')}</div></div>` : ''}
      ${ages && !p.tutorialDone ? '<div class="px-box notice wide"><span>New to Hegemarch? An Ages run is the long game. The guided First Night (a Classic run with GUIDE ticked) teaches the basics in a few minutes.</span></div>' : ''}
      <div class="heirs">${heirs}</div>
      ${daily ? '' : `<div class="opts">
        <div class="opt px-box"><h4>${ages ? 'SIZE' : 'SECTOR'}</h4><div class="row">${sizes.map(([k, n, d]) => `<button class="small ${st.size === k ? 'active' : ''}" data-sa="size:${k}" data-tip="${esc(d)}">${n}</button>`).join('')}</div>
          <div class="help">${sizes.find((x) => x[0] === st.size)![2]}</div></div>
        <div class="opt px-box"><h4>DIFFICULTY</h4><div class="row">${DIFFICULTY_NAMES.map((n, i) => `<button class="small ${st.difficulty === i ? 'active' : ''} ${i > p.maxDifficulty ? 'disabled' : ''}" data-sa="diff:${i}" data-tip="${esc(i > p.maxDifficulty ? `Locked: win a run on ${DIFFICULTY_NAMES[i - 1]} to unlock it.` : diffHelp[i])}">${n.toUpperCase()}${i > p.maxDifficulty ? ' ×' : ''}</button>`).join('')}</div>
          <div class="help">${diffHelp[st.difficulty]}${p.maxDifficulty < 3 ? ' Win to unlock the next one.' : ''}</div></div>
        <div class="opt px-box"><h4>SEED</h4><div class="row"><input type="text" id="seed-input" placeholder="random" value="${esc(st.seed)}"><button class="small" data-sa="reseed" data-tip="Pick a random seed. The same seed always builds the same sector.">ROLL</button></div>
          <div class="help">Share a seed to replay the same sector.</div></div>
        ${ages ? '' : `<div class="opt px-box"><h4>GUIDE</h4><div class="check ${st.guided ? 'on' : ''}" data-sa="guided"><span class="box"></span>Guided First Night</div>
          <div class="help">Shows the first few moves step by step and reveals the screen as you go.</div></div>`}
      </div>`}
      <div class="foot-actions"><button data-sa="menu">BACK</button>
        <button class="primary" data-sa="launch" style="font-size:14px;padding:14px 22px">LAUNCH</button></div>
    </div></div>${dialog}`);
  }

  private showHall() {
    const p = this.profile;
    const heirs = HEIRS.filter((h) => h.cost > 0)
      .map((h) => {
        const owned = p.heirs.includes(h.id);
        return `<div class="perk px-box"><div><div class="pn" style="color:${h.color}">${esc(h.name.toUpperCase())}</div><div class="pd">${glossHtml(h.desc)}</div>
          <div class="pd">${h.bonuses.map((b) => glossHtml(b)).join(' · ')}</div></div>
        ${owned ? '<span class="good">OWNED</span>' : `<button class="small ${p.legacy >= h.cost ? 'primary' : 'disabled'}" data-sa="unlock-heir:${h.id}">◆${h.cost}</button>`}</div>`;
      })
      .join('');
    const perks = PERKS.map((pk) => {
      const rank = p.perks[pk.id] ?? 0;
      const max = pk.costs.length;
      const cost = pk.costs[rank];
      return `<div class="perk px-box"><div><div class="pn">${esc(pk.name.toUpperCase())} <span class="dim">${rank}/${max}</span></div><div class="pd">${glossHtml(perkDesc(pk, rank))}</div></div>
        ${rank >= max ? '<span class="good">MASTERED</span>' : `<button class="small ${p.legacy >= cost ? 'primary' : 'disabled'}" data-sa="perk:${pk.id}">◆${cost}</button>`}</div>`;
    }).join('');
    const unlocks = UNLOCKS.map((u) => {
      const owned = u.id === 'pacts' ? p.unlockPacts : p.unlockLegendary;
      return `<div class="perk px-box"><div><div class="pn">${esc(u.name.toUpperCase())}</div><div class="pd">${glossHtml(u.desc)}</div></div>
        ${owned ? '<span class="good">OWNED</span>' : `<button class="small ${p.legacy >= u.cost ? 'primary' : 'disabled'}" data-sa="unlock:${u.id}">◆${u.cost}</button>`}</div>`;
    }).join('');
    const hist = p.history.length
      ? `<table class="history"><tr><th>DATE</th><th>HOUSE</th><th>SECTOR</th><th>RESULT</th><th>TIME</th><th>LEGACY</th></tr>${p.history
          .slice(0, 10)
          .map(
            (r) => `<tr><td>${new Date(r.date).toLocaleDateString()}</td><td style="color:${HEIR_BY_ID[r.heir]?.color}">${esc(HEIR_BY_ID[r.heir]?.name ?? r.heir)}</td>
          <td>${r.size} · ${DIFFICULTY_NAMES[r.difficulty]}${r.daily ? ' · daily' : ''}</td><td class="${r.won ? 'good' : 'bad'}">${r.won ? 'Crowned · ' + (VICTORIES[r.victory as keyof typeof VICTORIES]?.name ?? '') : 'Defeat'}</td>
          <td>${fmtTime(r.time)}</td><td class="gold">+${r.legacy}</td></tr>`,
          )
          .join('')}</table>`
      : '<div class="dim">No runs yet. The first heir is waiting.</div>';
    this.put('hall', `<div class="screen${this.crt()}"><div class="page">
      <h1>HALL OF HEIRS</h1>
      <div class="lead">Every heir who falls leaves a legacy for the next. Every run earns Legacy, win or lose; what you buy with it here is yours in every run after. <span class="gl" data-gl="legacy">Legacy</span>: <span class="legacy-badge">◆${p.legacy}</span> <span class="dim">(${p.totalLegacy} earned in all)</span></div>
      <h2>HOUSES</h2><div class="perks">${heirs}</div>
      <h2>INHERITANCE</h2><div class="perks">${perks}</div>
      <h2>FORBIDDEN KNOWLEDGE</h2><div class="perks">${unlocks}</div>
      <h2>CHRONICLE · ${p.runs} RUNS · ${p.wins} ${p.wins === 1 ? 'HEGEMARCH' : 'HEGEMARCHS'} CROWNED</h2><div class="px-box">${hist}</div>
      <div class="foot-actions"><button data-sa="menu">BACK</button><button class="primary" data-sa="setup">NEW RUN</button></div>
    </div></div>`);
  }

  private showSettings() {
    const s = this.profile.settings;
    const tog = (k: string, label: string, on: boolean) => `<div class="check ${on ? 'on' : ''}" data-sa="toggle:${k}"><span class="box"></span>${label}</div>`;
    this.put('settings', `<div class="screen${this.crt()}"><div class="page px-box" style="max-width:620px">
      <h1>SETTINGS</h1>
      <div class="kv">
        <b>Sound</b><div class="row"><button class="small ${s.muted ? '' : 'active'}" data-sa="sound:on">ON</button><button class="small ${s.muted ? 'active' : ''}" data-sa="sound:off">OFF</button></div>
        <b>Volume</b><input type="range" min="0" max="1" step="0.05" value="${s.master}" data-setting="master">
        <b>Effects</b><input type="range" min="0" max="1" step="0.05" value="${s.sfx}" data-setting="sfx">
        <b>Music</b><input type="range" min="0" max="1" step="0.05" value="${s.music}" data-setting="music">
        <b>Pixel size</b><div class="row">${(['small', 'auto', 'large'] as const).map((k) => `<button class="small ${s.pixelSize === k ? 'active' : ''}" data-sa="pixels:${k}" data-tip="${PIXEL_TIPS[k]}">${k.toUpperCase()}</button>`).join('')}</div>
      </div>
      <div style="display:grid;gap:12px;margin-top:20px">
        ${tog('autoPause', 'Pause automatically when a decision is needed', s.autoPause)}
        ${tog('tips', 'Show a tip the first time something new happens', s.tips)}
        ${tog('explainTerms', 'Explain game terms (Kindle, Hangar…) beside tooltips', s.explainTerms)}
        ${tog('crt', 'Scanline (CRT) filter', s.crt)}
        ${tog('edgePan', 'Scroll the map at the screen edge', s.edgePan)}
      </div>
      <h2>PROGRESS</h2>
      <div class="row"><button class="small" data-sa="replay-tutorial" data-tip="Your next new run starts with the guided First Night again, and the first-time tips come back.">REPLAY THE FIRST NIGHT</button>
        <button class="small danger" data-sa="reset">${this.confirmReset ? 'CLICK AGAIN TO ERASE EVERYTHING' : 'RESET ALL PROGRESS'}</button></div>
      <div class="foot-actions"><button data-sa="menu">BACK</button></div>
    </div></div>`);
  }

  private renderLoading(p: number, line?: string) {
    if (this.screen !== 'loading') return;
    const existing = this.ui.querySelector('#load-bar') as HTMLElement | null;
    if (existing) {
      existing.style.width = Math.round(p * 100) + '%';
      return;
    }
    const lines = ['Charting the starlanes…', 'Waking the old stars…', 'Counting the heirs who came before…', 'Listening for the Hollow…', 'Dusting off the Hegemarch’s empty throne…'];
    this.ui.innerHTML = `<div class="screen loading${this.crt()}"><div class="logo" style="font-size:28px">HEGEMARCH</div>
      <div class="tagline">${line ?? lines[Math.floor(Math.random() * lines.length)]}</div>
      <div class="bar"><i id="load-bar" style="width:${Math.round(p * 100)}%"></i></div></div>`;
  }

  private showResults() {
    const r = this.results;
    if (!r) return;
    this.input?.destroy();
    this.input = null;
    this.hud = null;
    this.screen = 'results';
    this.music.play('title');
    const heir = HEIR_BY_ID[r.heir];
    const ambLine = r.report.lines.find(([k]) => k.startsWith('Ambition'));
    const cards = groupBoons(r.cards)
      .map(({ id, count }) => {
        const c = CARD_BY_ID[id];
        return `<span class="chip" style="--rc:${c.pact ? PACT_COLOR : RARITY_COLOR[c.rarity]}" data-tip-title="${esc(c.name)}" data-tip="${esc(c.desc)}">${esc(c.name)}${count > 1 ? ` <b>×${count}</b>` : ''}</span>`;
      })
      .join('');
    const relics = r.relics.map((id) => `<span class="chip" style="--rc:var(--sky)" data-tip-title="${esc(RELIC_BY_ID[id]?.name ?? id)}" data-tip="${esc(RELIC_BY_ID[id]?.desc ?? '')}">♦ ${esc(RELIC_BY_ID[id]?.name ?? id)}</span>`).join('');
    const amb = AMBITION_BY_ID[r.ambition];
    const daily = this.session?.game.config.daily;
    // Legacy is what a run leaves behind, and the reason to play another: it is the headline here, with
    // what it buys right now, or how far the next thing is. (As one dim line under a table it was missed.)
    const have = this.profile.legacy;
    const shop = this.hallShop();
    const afford = shop.filter((x) => x.cost <= have);
    const next = shop.find((x) => x.cost > have);
    const buys = afford.length
      ? `<div class="lh-buys"><span>Enough for:</span>${afford.slice(0, 4).map((x) => `<span class="chip" style="--rc:var(--gold)">${esc(x.name)} ◆${x.cost}</span>`).join('')}${afford.length > 4 ? `<span class="dim">and ${afford.length - 4} more</span>` : ''}</div>`
      : next
        ? `<div class="lh-buys"><span>Next: <b>${esc(next.name)}</b> ◆${next.cost}, <b>◆${next.cost - have}</b> to go</span><span class="lh-bar"><i style="width:${Math.round((100 * have) / next.cost)}%"></i></span></div>`
        : '<div class="lh-buys"><span>Everything in the Hall of Heirs is yours.</span></div>';
    const legacyHero = `<div class="px-box legacy-hero">
        <div class="lh-earned"><span class="lh-num">◆<span id="legacy-total">0</span></span><span class="lh-label">LEGACY EARNED</span></div>
        <div class="lh-text"><p><b>Legacy is yours to keep.</b> Every run earns it, win or lose. Spend it in the <b>Hall of Heirs</b> on new houses to play, on perks that every future run starts with, and on rarer Boons. You have <b class="gold">◆${have}</b> to spend.</p>${buys}</div>
        <button class="${afford.length ? 'primary' : ''}" data-sa="results-hall">${afford.length ? 'SPEND IT' : 'SEE THE HALL'}</button>
      </div>`;
    this.ui.innerHTML = `<div class="screen results${this.crt()}"><div class="page">
      <div class="logo" style="font-size:clamp(28px,6vw,56px);${r.won ? '' : 'color:var(--red);text-shadow:4px 4px 0 var(--wine),8px 8px 0 var(--night)'}">${r.title}</div>
      <div class="reason">${esc(r.reason)}</div>
      ${legacyHero}
      <div class="cols">
        <div class="px-box"><h3>THE REIGN OF THE ${esc((heir?.name ?? '').toUpperCase())}</h3><table class="stats">${r.stats.map(([k, v]) => `<tr><td>${k}</td><td>${esc(v)}</td></tr>`).join('')}</table></div>
        <div class="px-box"><h3>LEGACY EARNED</h3><table class="stats">
          ${r.report.lines.filter(([k]) => !k.startsWith('Ambition')).map(([k, v]) => `<tr><td>${esc(k)}</td><td>+${v}</td></tr>`).join('')}
          <tr><td>Difficulty${daily ? ' and daily' : ''} multiplier</td><td>×${r.report.multiplier.toFixed(2)}</td></tr>
          ${ambLine ? `<tr><td class="gold" data-tip="${esc(amb?.desc ?? '')}">${esc(ambLine[0])}</td><td>+${ambLine[1]}</td></tr>` : amb ? `<tr><td class="dim" data-tip="${esc(`${amb.desc} Missed this time.`)}">Ambition: ${esc(amb.name)} (missed)</td><td>—</td></tr>` : ''}
          <tr class="total"><td>TOTAL</td><td>◆${r.report.total}</td></tr></table>
          ${r.unlocked ? `<div class="good" style="margin-top:10px">New difficulty unlocked: <b>${r.unlocked}</b></div>` : ''}</div>
      </div>
      <div class="px-box" style="margin-top:16px"><h3>BOONS</h3><div class="chips">${cards || '<span class="dim">None</span>'}</div>
        ${relics ? `<h3 style="margin-top:12px">RELICS</h3><div class="chips">${relics}</div>` : ''}</div>
      <div class="run-details">
        <button class="small" data-sa="copy-run" data-tip="Copies this run's version, seed, setup and outcome, to send with a bug report or to play the same sector again.">COPY RUN DETAILS</button>
        <textarea id="run-details" readonly hidden rows="6">${esc(r.details)}</textarea>
      </div>
      <div class="foot-actions"><button class="${afford.length ? 'primary' : ''}" data-sa="results-hall">${afford.length ? 'SPEND LEGACY IN THE HALL OF HEIRS' : 'HALL OF HEIRS'}</button><button class="${afford.length ? '' : 'primary'}" data-sa="results-again">NEW RUN</button></div>
    </div></div>`;
    // The Legacy total counts up like a score.
    const el = this.ui.querySelector('#legacy-total');
    const total = r.report.total;
    const t0 = performance.now();
    const step = () => {
      if (!el?.isConnected) return;
      const k = Math.min(1, (performance.now() - t0 - 500) / 900);
      const v = Math.round(total * Math.max(0, k) * (2 - Math.max(0, k)));
      if (el.textContent !== String(v)) {
        el.textContent = String(v);
        if (v > 0) this.sfx.play('tick', 0.35);
      }
      if (k < 1) requestAnimationFrame(step);
      else if (total > 0) this.sfx.play('good', 0.5);
    };
    requestAnimationFrame(step);
  }
}
