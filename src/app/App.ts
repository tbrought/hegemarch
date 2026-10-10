import { Music, type SongId } from '../audio/Music';
import { Sfx, type SoundId } from '../audio/Sfx';
import { Game } from '../game/Game';
import { DIFFICULTY_NAMES, TICK } from '../game/constants';
import { AMBITION_BY_ID } from '../game/data/ambitions';
import { CARD_BY_ID, PACT_COLOR, RARITY_COLOR } from '../game/data/cards';
import { HEIRS, HEIR_BY_ID } from '../game/data/heirs';
import { RELIC_BY_ID } from '../game/data/relics';
import { TRAIT_BY_ID } from '../game/data/traits';
import { VICTORIES } from '../game/data/victories';
import { dailySeed, hashString, randomSeed } from '../game/rng';
import type { Difficulty, GameConfig, MapSize } from '../game/types';
import { applyRunToProfile, computeLegacy, PERKS, UNLOCKS, type LegacyReport } from '../meta/legacy';
import { clearRun, defaultProfile, hasRun, loadProfile, loadRun, saveProfile, saveRun, todayKey, type Profile } from '../meta/profile';
import { emptyView, fmtTime, Renderer } from '../render/Renderer';
import { drawHouseBanners, startingFleet } from './houseArt';
import { Screen } from '../render/Screen';
import { groupBoons } from '../ui/boons';
import { installDomTips } from '../ui/domtips';
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
<p><b>Kindle:</b> click a grey world and press KINDLE. A seed ship flies out and lights it in your color. Each world costs a few more Embers than the last.</p>
<p><b>Scouts:</b> your Scout waits at your Hearth for orders. Select it (click the fleet badge) and press EXPLORE, or E, and it charts the dark world after world by itself. To look inside an <b>anomaly</b> (a violet swirl), send any ship there.</p>
<p><b>Worlds:</b> every world earns <b>Embers</b>, your only currency, and has one role. MINE: more Embers. FORGE: builds ships. OBSERVATORY: makes Lore and sees further. BASTION: guns, armor and repairs. Raise worlds to level II and III for more of everything.</p>
<p><b>Ships:</b> Strikers beat Breakers. Breakers beat Guardians and take worlds. Guardians beat Strikers. Carriers, Lancers, Dreadnoughts and Starbases come as Blueprint Boons.</p>
<p><b>Boons:</b> when your <b>Lore</b> fills, choose a Boon. Every run's choices are different.</p>
<p><b>Danger:</b> any house may attack at any time. Corsairs raid from about ten minutes in, rivals attack from about twelve (on Hard and Brutal, warlike houses rush sooner), and the Hollow may wake. If your <b>Hearth</b> falls, your house goes dark.</p>
<p><b>Rushing:</b> every Hearth's walls start at half strength and reach full strength at 12:00. Take a rival's Hearth and you win its worlds, half its hoard and a free Boon. Fail, and your rivals will make you pay.</p>
<p><b>Controls:</b> click to select (a world, a ship, or the fleet badge <span class="fleet-badge">3</span> beside a world, which selects all your ships there), click a world to send selected ships (or right-click). Drag to select ships. Wheel to zoom, right-drag or arrow keys to move. Space pauses; E sends selected Scouts exploring; B for Boons, U for status, H for help. In a run, How to Play (H) lists every control and every tip.</p>`;

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
  private attract: Game | null = null;
  private attractT = 0;
  private attractView = emptyView(true);
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
  private setup: { heir: string; size: MapSize; difficulty: Difficulty; seed: string; daily: boolean; confirm: '' | 'launch' | 'first-night'; guided: boolean; custom: boolean } = {
    heir: 'concord', size: 'medium', difficulty: 1, seed: '', daily: false, confirm: '', guided: true, custom: false,
  };
  private confirmReset = false;
  /** One line about the saved run (house, sector, time played), read when the setup screen opens. */
  private savedRun = '';

  constructor() {
    this.canvas = document.getElementById('game') as HTMLCanvasElement;
    this.ui = document.getElementById('ui') as HTMLElement;
    this.profile = loadProfile();
    this.screenObj = new Screen(this.canvas);
    this.screenObj.setPixelSize(this.profile.settings.pixelSize);
    this.renderer = new Renderer(this.screenObj);
    this.sfx = new Sfx(this.profile.settings);
    this.music = new Music(this.sfx);
    this.setup.guided = !this.profile.tutorialDone;
    if (!this.profile.heirs.includes(this.setup.heir)) this.setup.heir = this.profile.heirs[0];
    const unlock = () => {
      this.sfx.unlock();
      if (!this.music.playing) this.music.play(this.screen === 'game' ? 'night' : 'title');
    };
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
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
    void this.startAttract();
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
      else if (this.attract) this.frameAttract(dt);
      else {
        const g = this.screenObj.g;
        g.fillStyle = '#0b0a1a';
        g.fillRect(0, 0, this.screenObj.W, this.screenObj.H);
      }
      if (this.screen === 'setup') drawHouseBanners(this.ui, now / 1000);
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

  private frameAttract(dt: number) {
    const g = this.attract!;
    this.acc += dt;
    let steps = 0;
    while (this.acc >= TICK && steps < 4) {
      g.step();
      this.acc -= TICK;
      steps++;
    }
    if (steps >= 4) this.acc = 0;
    if (g.outcome) {
      void this.startAttract();
      return;
    }
    this.attractT -= dt;
    if (this.attractT <= 0) {
      this.attractT = 16;
      let best = g.nodes[g.rng.int(0, g.nodes.length - 1)];
      let bc = -1;
      for (const n of g.nodes) {
        const c = g.buckets[n.id].length + (n.kind === 'planet' && n.owner >= 0 ? 3 : 0) + Math.random() * 8;
        if (c > bc) {
          bc = c;
          best = n;
        }
      }
      this.renderer.cam.focus(best.x, best.y, 0.1 + Math.random() * 0.12);
    }
    this.processFx(g, () => true, false);
    this.renderer.fx.update(dt);
    this.renderer.render(g, Math.min(1, this.acc / TICK), dt, this.attractView, true);
  }

  private processFx(g: Game, visible: (n: number) => boolean, sound: boolean) {
    const cam = this.renderer.cam;
    const near = (x: number, y: number, pad: number) => cam.sees(x, y, pad);
    this.renderer.fx.ingest(g.fx, visible, near, cam.zoom);
    if (sound && this.sfx.ctx) {
      const R = Math.max(cam.w, cam.h) / 2 / cam.zoom;
      const zoomGain = Math.max(0.15, Math.min(1, cam.zoom * 5));
      for (const f of g.fx) {
        if ('node' in f && f.node >= 0 && !visible(f.node)) continue;
        let id: SoundId | null = null;
        let base = 0.3;
        let x = 0;
        let y = 0;
        switch (f.k) {
          case 'beam':
            id = 'laser';
            base = 0.2;
            x = f.x1;
            y = f.y1;
            break;
          case 'shot':
            id = f.kind === 'lance' ? 'lance' : f.kind === 'shell' ? 'shell' : 'bolt';
            base = f.kind === 'shell' ? 0.45 : 0.22;
            x = f.x;
            y = f.y;
            break;
          case 'boom':
            id = f.size >= 20 ? 'bigboom' : 'boom';
            base = f.size >= 20 ? 0.9 : 0.45;
            x = f.x;
            y = f.y;
            break;
          case 'jumpOut':
            id = 'jump';
            base = 0.2;
            x = f.x;
            y = f.y;
            break;
          case 'capture':
            id = 'capture';
            base = 0.6;
            x = g.nodes[f.node].x;
            y = g.nodes[f.node].y;
            break;
          case 'ability':
            id = 'ability';
            base = 0.5;
            x = f.x;
            y = f.y;
            break;
          default:
            break;
        }
        if (!id) continue;
        const d = Math.hypot(x - cam.x, y - cam.y);
        const att = Math.max(0, Math.min(1, 1.25 - d / R));
        const vol = base * att * (id === 'capture' ? 1 : zoomGain);
        if (vol > 0.02) this.sfx.play(id, vol, Math.max(-1, Math.min(1, ((x - cam.x) / R) * 0.6)));
      }
    }
    g.fx.length = 0;
  }

  // =====================================================================
  // Attract mode (a live sector behind the menus)
  // =====================================================================

  private async startAttract() {
    const token = ++this.prepToken;
    const heir = HEIRS[Math.floor(Math.random() * HEIRS.length)].id;
    const g = Game.create({ seed: randomSeed(), size: 'small', difficulty: 2, heir, perks: {}, unlockLegendary: true, unlockPacts: true, autoplay: true });
    g.fxEnabled = false;
    for (let chunk = 0; chunk < 14; chunk++) {
      for (let i = 0; i < 1200; i++) g.step();
      await new Promise((r) => setTimeout(r, 0));
      if (token !== this.prepToken) return;
    }
    g.fx.length = 0;
    g.fxEnabled = true;
    this.attract = g;
    this.attractT = 0;
    this.renderer.prepare(g);
    this.renderer.cam.fitAll();
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
      tutorial: st.guided && !st.daily,
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
    };
  }

  private async startRun(config: GameConfig) {
    this.teardownSession();
    clearRun();
    this.attract = null;
    const token = ++this.prepToken;
    this.screen = 'loading';
    this.renderLoading(0.2);
    await new Promise((r) => setTimeout(r, 40));
    let g: Game;
    try {
      g = Game.create(config);
    } catch (e) {
      console.error(e);
      this.showMenu();
      return;
    }
    this.renderLoading(0.8);
    await new Promise((r) => setTimeout(r, 30));
    if (token !== this.prepToken) return;
    this.beginSession(g);
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
    this.attract = null;
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
        void this.startAttract();
      },
      abandon: () => {
        g.declareWinner(-1, 'defeat', 'You abandoned the run.');
        this.endRun();
      },
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
    else if (!g.config.tutorial && g.time < 1) s.modal = { kind: 'omens' };
    this.music.play('night');
    this.canvas.focus();
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
      stats: [
        ['Run time', fmtTime(o.time)],
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
      ],
      cards: [...p.cards],
      relics: [...p.relics],
      heir: p.heir,
      ambition: g.ambition,
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
        st.confirm = '';
        this.savedRun = this.describeSavedRun();
        this.showSetup();
        break;
      case 'daily':
        st.daily = true;
        st.confirm = '';
        st.custom = true;
        this.savedRun = this.describeSavedRun();
        this.showSetup();
        break;
      case 'custom':
        st.custom = true;
        this.showSetup();
        break;
      case 'first-night':
        // A saved run would be replaced: ask first, in a pop-up over the page.
        if (hasRun()) {
          st.confirm = 'first-night';
          this.showSetup();
          break;
        }
        void this.startRun(this.firstNightConfig());
        break;
      case 'confirm-new': {
        const which = st.confirm;
        st.confirm = '';
        if (which) void this.startRun(which === 'first-night' ? this.firstNightConfig() : this.buildConfig());
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
        this.setup.custom = false;
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
          this.setup.custom = false;
        }
        this.showSettings();
        break;
      case 'results-hall':
        this.teardownSession();
        this.showHall();
        void this.startAttract();
        this.music.play('title');
        break;
      case 'results-again':
        this.teardownSession();
        st.daily = false;
        st.confirm = '';
        this.showSetup();
        void this.startAttract();
        this.music.play('title');
        break;
    }
  }

  private crt(): string {
    return this.profile.settings.crt ? ' crt' : '';
  }

  private showMenu() {
    this.screen = 'menu';
    if (this.sfx.ctx && this.music.playing !== 'title') this.music.play('title');
    const p = this.profile;
    const saved = hasRun();
    const dailyDone = p.lastDaily === todayKey();
    queueMicrotask(() => (this.menuNotice = ''));
    this.ui.innerHTML = `<div class="screen menu${this.crt()}">
      <div class="logo">HEGEMARCH</div>
      <div class="tagline">The last Hegemarch fell, and the sector went dark. Light it again, world by world, and take the crown.</div>
      ${this.menuNotice ? `<div class="px-box notice">${esc(this.menuNotice)}</div>` : ''}
      <div class="menu-buttons">
        ${saved ? '<button class="primary" data-sa="continue">CONTINUE</button>' : ''}
        <button class="${saved ? '' : 'primary'}" data-sa="setup">NEW RUN</button>
        <button data-sa="daily" data-tip="The same sector for every player today: medium, Normal, with [Legacy ×1.25].">DAILY RUN${dailyDone ? ' ✓' : ''}</button>
        <button data-sa="hall" data-tip="Spend Legacy, earned by every run, on new houses, perks and unlocks.">HALL OF HEIRS · <span class="gold">◆${p.legacy}</span></button>
        <button data-sa="howto">HOW TO PLAY</button>
        <button data-sa="settings">SETTINGS</button>
      </div>
      <div class="menu-foot">Runs ${p.runs} · Crowned ${p.wins}${p.bestTime !== null ? ` · Fastest crown ${fmtTime(p.bestTime)}` : ''}<br>
      Real-time strategy · a new sector, new rivals and new Boons every run · v${GAME_VERSION}</div>
    </div>`;
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

  /** "Solar Concord · Medium sector · Normal · 12:34 played" for the saved run ('' if there is none). */
  private describeSavedRun(): string {
    const d = loadRun();
    if (!d) return '';
    try {
      const size = d.config.size[0].toUpperCase() + d.config.size.slice(1);
      const kind = d.config.daily ? ' · daily run' : d.config.tutorial ? ' · the First Night' : '';
      return `${HEIR_BY_ID[d.config.heir]?.name ?? 'Your house'} · ${size} sector · ${DIFFICULTY_NAMES[d.config.difficulty]} · ${fmtTime(d.time)} played${kind}`;
    } catch {
      return 'a saved run';
    }
  }

  private showSetup() {
    const st = this.setup;
    const p = this.profile;
    const saved = hasRun();
    if (!saved) st.confirm = '';
    // A run is already in progress: say so at the top, before any choices are made...
    const savedNote = saved
      ? `<div class="px-box notice wide"><span>You have a run in progress${this.savedRun ? `: <b>${esc(this.savedRun)}</b>` : ''}. Starting a new run replaces it.</span>
          <button class="small" data-sa="continue">CONTINUE IT</button></div>`
      : '';
    // ...and ask in a pop-up over the page when a new run is launched (never as a line below the fold).
    const dialog = st.confirm
      ? `<div class="dialog-back"><div class="px-box dialog" role="dialog" aria-modal="true">
          <h2>REPLACE YOUR SAVED RUN?</h2>
          <p>You have a run in progress${this.savedRun ? `:<br><b>${esc(this.savedRun)}</b>` : '.'}</p>
          <p>Starting a new run replaces it for good. A replaced run earns no Legacy.</p>
          <div class="dialog-actions">
            <button class="danger" data-sa="confirm-new">START NEW RUN</button>
            <button class="primary" data-sa="continue">CONTINUE SAVED RUN</button>
            <button data-sa="confirm-cancel">CANCEL</button>
          </div>
        </div></div>`
      : '';
    // A simpler first-run setup: one big choice.
    if (!p.tutorialDone && p.runs === 0 && !st.custom && !st.daily) {
      this.put('setup', `<div class="screen${this.crt()}"><div class="page" style="max-width:760px">
        ${savedNote}
        <div class="px-box first-night" style="--hc:${HEIR_BY_ID.concord.color}">
          <canvas class="heir-art chosen" data-heir="concord" height="24" data-tip="${esc(`You start with ${startingFleet(HEIR_BY_ID.concord)}.`)}"></canvas>
          <h1>THE FIRST NIGHT</h1>
          <div class="big">Your first run is guided. You lead the <span class="gold">Solar Concord</span> in a small, quiet sector, and the game shows you the first few moves one at a time.</div>
          <button class="primary" data-sa="first-night" style="font-size:14px;padding:16px 22px">BEGIN</button>
        </div>
        <div class="foot-actions"><button data-sa="menu">BACK</button><button data-sa="custom" class="small">CHOOSE MY OWN SETUP</button></div>
      </div></div>${dialog}`);
      return;
    }
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
    const sizes: [MapSize, string, string][] = [
      ['small', 'SMALL', '3 houses · about 25 worlds · 25 to 40 minutes'],
      ['medium', 'MEDIUM', '4 houses · about 40 worlds · 35 to 50 minutes'],
      ['large', 'LARGE', '6 houses · about 60 worlds · 45 to 70 minutes'],
    ];
    const diffHelp = ['Rivals earn less and attack late. Good for learning.', 'A fair fight.', 'Richer, faster, bolder rivals.', 'Merciless.'];
    const daily = st.daily;
    this.put('setup', `<div class="screen${this.crt()}"><div class="page">
      <h1>${daily ? 'DAILY RUN' : 'NEW RUN'}</h1>
      <div class="lead">${daily ? `Today's sector is the same for everyone: medium, Normal, seed ${dailySeed()}. Legacy ×1.25.` : 'Choose a house to bid for the crown of Hegemarch. The sector, your rivals, your Destinies and your Boons are new every run.'}</div>
      ${savedNote}
      <div class="heirs">${heirs}</div>
      ${daily ? '' : `<div class="opts">
        <div class="opt px-box"><h4>SECTOR</h4><div class="row">${sizes.map(([k, n, d]) => `<button class="small ${st.size === k ? 'active' : ''}" data-sa="size:${k}" data-tip="${esc(d)}">${n}</button>`).join('')}</div>
          <div class="help">${sizes.find((x) => x[0] === st.size)![2]}</div></div>
        <div class="opt px-box"><h4>DIFFICULTY</h4><div class="row">${DIFFICULTY_NAMES.map((n, i) => `<button class="small ${st.difficulty === i ? 'active' : ''} ${i > p.maxDifficulty ? 'disabled' : ''}" data-sa="diff:${i}" data-tip="${esc(i > p.maxDifficulty ? `Locked: win a run on ${DIFFICULTY_NAMES[i - 1]} to unlock it.` : diffHelp[i])}">${n.toUpperCase()}${i > p.maxDifficulty ? ' ×' : ''}</button>`).join('')}</div>
          <div class="help">${diffHelp[st.difficulty]}${p.maxDifficulty < 3 ? ' Win to unlock the next one.' : ''}</div></div>
        <div class="opt px-box"><h4>SEED</h4><div class="row"><input type="text" id="seed-input" placeholder="random" value="${esc(st.seed)}"><button class="small" data-sa="reseed" data-tip="Pick a random seed. The same seed always builds the same sector.">ROLL</button></div>
          <div class="help">Share a seed to replay the same sector.</div></div>
        <div class="opt px-box"><h4>GUIDE</h4><div class="check ${st.guided ? 'on' : ''}" data-sa="guided"><span class="box"></span>Guided First Night</div>
          <div class="help">Shows the first few moves step by step and reveals the screen as you go.</div></div>
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
      return `<div class="perk px-box"><div><div class="pn">${esc(pk.name.toUpperCase())} <span class="dim">${rank}/${max}</span></div><div class="pd">${glossHtml(pk.desc)}</div></div>
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
      <div class="lead">Every heir who falls leaves a legacy for the next. <span class="gl" data-gl="legacy">Legacy</span>: <span class="legacy-badge">◆${p.legacy}</span> <span class="dim">(${p.totalLegacy} earned in all)</span></div>
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

  private renderLoading(p: number) {
    if (this.screen !== 'loading') return;
    const existing = this.ui.querySelector('#load-bar') as HTMLElement | null;
    if (existing) {
      existing.style.width = Math.round(p * 100) + '%';
      return;
    }
    const lines = ['Charting the starlanes…', 'Waking the old stars…', 'Counting the heirs who came before…', 'Listening for the Hollow…', 'Dusting off the Hegemarch’s empty throne…'];
    this.ui.innerHTML = `<div class="screen loading${this.crt()}"><div class="logo" style="font-size:28px">HEGEMARCH</div>
      <div class="tagline">${lines[Math.floor(Math.random() * lines.length)]}</div>
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
    this.ui.innerHTML = `<div class="screen results${this.crt()}"><div class="page">
      <div class="logo" style="font-size:clamp(28px,6vw,56px);${r.won ? '' : 'color:var(--red);text-shadow:4px 4px 0 var(--wine),8px 8px 0 var(--night)'}">${r.title}</div>
      <div class="reason">${esc(r.reason)}</div>
      <div class="cols">
        <div class="px-box"><h3>THE REIGN OF THE ${esc((heir?.name ?? '').toUpperCase())}</h3><table class="stats">${r.stats.map(([k, v]) => `<tr><td>${k}</td><td>${esc(v)}</td></tr>`).join('')}</table></div>
        <div class="px-box"><h3>LEGACY EARNED</h3><table class="stats">
          ${r.report.lines.filter(([k]) => !k.startsWith('Ambition')).map(([k, v]) => `<tr><td>${esc(k)}</td><td>+${v}</td></tr>`).join('')}
          <tr><td>Difficulty${daily ? ' and daily' : ''} multiplier</td><td>×${r.report.multiplier.toFixed(2)}</td></tr>
          ${ambLine ? `<tr><td class="gold" data-tip="${esc(amb?.desc ?? '')}">${esc(ambLine[0])}</td><td>+${ambLine[1]}</td></tr>` : amb ? `<tr><td class="dim" data-tip="${esc(`${amb.desc} Missed this time.`)}">Ambition: ${esc(amb.name)} (missed)</td><td>—</td></tr>` : ''}
          <tr class="total"><td>TOTAL</td><td>◆<span id="legacy-total">0</span></td></tr></table>
          ${r.unlocked ? `<div class="good" style="margin-top:10px">New difficulty unlocked: <b>${r.unlocked}</b></div>` : ''}
          <div class="dim" style="margin-top:8px"><span class="gl" data-gl="legacy">Legacy</span> to spend: ◆${this.profile.legacy}</div></div>
      </div>
      <div class="px-box" style="margin-top:16px"><h3>BOONS</h3><div class="chips">${cards || '<span class="dim">None</span>'}</div>
        ${relics ? `<h3 style="margin-top:12px">RELICS</h3><div class="chips">${relics}</div>` : ''}</div>
      <div class="foot-actions"><button data-sa="results-hall">HALL OF HEIRS</button><button class="primary" data-sa="results-again">NEW RUN</button></div>
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
