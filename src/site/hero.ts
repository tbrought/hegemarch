/**
 * The website's opening picture: a real sector, played by the game's own AI houses while the visitor
 * watches. It opens on the sector's first minutes sped up (the houses spreading their colors over the
 * dark), then drops into real time and follows the fighting.
 *
 * Beside it: a clock, the houses with the worlds each holds (click one to fly to its Hearth), the news
 * of the sector as it happens, and a sound switch.
 */
import { Attract } from '../app/Attract';
import { playBattleSounds } from '../audio/battleSounds';
import { Music } from '../audio/Music';
import { Sfx } from '../audio/Sfx';
import type { Game } from '../game/Game';
import { VICTORIES } from '../game/data/victories';
import type { Faction } from '../game/types';
import { defaultSettings } from '../meta/profile';
import { fmtTime, Renderer } from '../render/Renderer';
import { Screen } from '../render/Screen';
import { calm, esc, watch } from './stage';

const NEWS_LINES = 4;

export class Hero {
  private attract: Attract;
  private renderer: Renderer;
  private flag: { seen: boolean };
  private running = false;
  private sfx: Sfx | null = null;
  private music: Music | null = null;
  private sound = false;
  /** The sector the panels describe, who held each world when last looked at, and who was alive. */
  private known: Game | null = null;
  private owners: number[] = [];
  private alive: boolean[] = [];
  private panelT = 0;
  private crowned = false;
  private $ = <T extends HTMLElement>(sel: string) => this.root.querySelector<T>(sel);

  constructor(private root: HTMLElement) {
    const canvas = this.$<HTMLCanvasElement>('canvas.sector')!;
    this.renderer = new Renderer(new Screen(canvas, canvas.parentElement ?? root));
    this.attract = new Attract(this.renderer, {
      dawn: true,
      wide: true,
      encore: 8,
      glide: 2.2,
      close: [0.15, 0.25],
      onFx: (g, fx) => {
        if (this.sound && this.sfx) playBattleSounds(fx, g.nodes, this.renderer.cam, this.sfx, () => true);
      },
    });
    this.flag = watch(root);
    this.$('.live-houses')?.addEventListener('click', (e) => this.onHouseClick(e));
    this.$('.sound')?.addEventListener('click', () => this.toggleSound());
    const watchBtn = this.$<HTMLButtonElement>('.watch');
    watchBtn?.addEventListener('click', () => this.start());
    if (calm) {
      // Nothing moves unasked: the still picture stands in, with a button to start the sector.
      root.classList.add('still');
      if (watchBtn) watchBtn.hidden = false;
    } else this.start();
  }

  private start() {
    if (this.running) return;
    this.running = true;
    void this.attract.start();
    this.root.classList.add('on');
    this.root.classList.remove('still');
    for (const sel of ['.live', '.news', '.sound']) {
      const el = this.$(sel);
      if (el) el.hidden = false;
    }
    const watchBtn = this.$('.watch');
    if (watchBtn) watchBtn.hidden = true;
  }

  /** One frame (nothing happens while the picture is off screen: the sector waits). */
  frame(dt: number) {
    if (!this.running || !this.flag.seen) return;
    this.attract.frame(dt);
    this.panelT -= dt;
    if (this.panelT <= 0) {
      this.panelT = 0.25;
      this.panels();
    }
  }

  // ---------------------------------------------------------------------
  // The panels
  // ---------------------------------------------------------------------

  private houses(g: Game): Faction[] {
    return g.factions.filter((f) => f.kind === 'empire');
  }

  private panels() {
    const g = this.attract.game;
    if (!g) return;
    const fresh = g !== this.known;
    if (fresh) {
      this.known = g;
      this.owners = g.nodes.map((n) => n.owner);
      this.alive = g.factions.map((f) => f.alive);
      this.crowned = false;
      const news = this.$('.news');
      if (news) news.innerHTML = '';
      const crown = this.$('.crown');
      if (crown) crown.hidden = true;
      const list = this.$('.live-houses');
      if (list) {
        list.innerHTML = this.houses(g)
          .map((f) => `<li><button type="button" class="chip" data-f="${f.id}" style="--hc:${f.color}" title="Fly to the Hearth of the ${esc(f.name)}"><i></i><b>${esc(f.name)}</b><span></span></button></li>`)
          .join('');
      }
    }
    const dawn = this.attract.phase === 'dawn';
    this.root.classList.toggle('dawn', dawn);
    const clock = this.$('.live-clock');
    if (clock) clock.textContent = fmtTime(g.time);
    const label = this.$('.live-label');
    if (label) label.textContent = dawn ? 'DAWN' : 'LIVE';
    const what = this.$('.live-what');
    if (what) {
      const left = this.houses(g).filter((f) => f.alive).length;
      what.textContent = dawn ? 'The first minutes, sped up: the houses light their first worlds.' : `The game is playing itself, right now, in your browser. ${left} ${left === 1 ? 'house is' : 'houses are'} left.`;
    }
    // Worlds held by each house.
    const held = new Map<number, number>();
    for (const n of g.nodes) if (n.kind === 'planet' && n.owner >= 0) held.set(n.owner, (held.get(n.owner) ?? 0) + 1);
    for (const f of this.houses(g)) {
      const chip = this.$(`.chip[data-f="${f.id}"]`);
      if (!chip) continue;
      chip.classList.toggle('out', !f.alive);
      const count = chip.querySelector('span');
      const worlds = held.get(f.id) ?? 0;
      if (count) count.textContent = f.alive ? `${worlds} ${worlds === 1 ? 'world' : 'worlds'}` : 'fallen';
    }
    this.report(g, dawn);
    if (this.attract.phase === 'over' && !this.crowned) this.crown(g);
  }

  /** News: every world that changed hands since the last look, and every house that fell. */
  private report(g: Game, quiet: boolean) {
    const name = (id: number) => {
      const f = g.factions[id];
      return f ? `<b style="color:${f.color}">${esc(f.name)}</b>` : 'no one';
    };
    for (const n of g.nodes) {
      const was = this.owners[n.id];
      if (was === n.owner) continue;
      this.owners[n.id] = n.owner;
      if (quiet || n.owner < 0) continue;
      const world = `<i>${esc(n.name)}</i>`;
      if (was < 0) this.news(g, `${name(n.owner)} kindled ${world}`);
      else if (n.capitalOf === was) this.news(g, `${name(n.owner)} put out the Hearth of ${name(was)}`, true);
      else this.news(g, `${name(n.owner)} took ${world} from ${name(was)}`);
    }
    g.factions.forEach((f, i) => {
      if (this.alive[i] === f.alive) return;
      this.alive[i] = f.alive;
      if (!f.alive && f.kind === 'empire' && !quiet) this.news(g, `${name(f.id)} has fallen`, true);
    });
  }

  private news(g: Game, html: string, big = false) {
    const list = this.$('.news');
    if (!list) return;
    const li = document.createElement('li');
    if (big) li.className = 'big';
    li.innerHTML = `<time>${fmtTime(g.time)}</time> ${html}`;
    list.prepend(li);
    while (list.children.length > NEWS_LINES) list.lastElementChild?.remove();
  }

  private crown(g: Game) {
    this.crowned = true;
    const o = g.outcome;
    const f = o ? g.factions[o.winner] : undefined;
    const el = this.$('.crown');
    if (!o || !f || !el) return;
    const how = o.victory !== 'defeat' ? VICTORIES[o.victory]?.name : '';
    el.innerHTML = `<b style="color:${f.color}">${esc(f.name)}</b> is crowned Hegemarch<small>${how ? `by ${esc(how)}, ` : ''}after ${fmtTime(o.time)}. A new sector follows.</small>`;
    el.hidden = false;
  }

  private onHouseClick(e: Event) {
    const chip = (e.target as HTMLElement).closest<HTMLElement>('.chip');
    const g = this.attract.game;
    if (!chip || !g || this.attract.phase === 'dawn') return;
    const home = g.nodes[g.factions[Number(chip.dataset.f)]?.capital ?? -1];
    if (home) this.attract.lookAt(home.x, home.y, 0.15, 14);
  }

  // ---------------------------------------------------------------------
  // Sound (off until the visitor asks: the title theme, and the battles in view)
  // ---------------------------------------------------------------------

  private toggleSound() {
    this.sound = !this.sound;
    if (this.sound) {
      if (!this.sfx) {
        this.sfx = new Sfx(defaultSettings());
        this.music = new Music(this.sfx);
      }
      this.sfx.unlock();
      this.music?.play('title');
    } else this.music?.play(null);
    const btn = this.$('.sound');
    if (btn) {
      // (The game's own sound button: a speaker, with waves or a cross, and the words.)
      const marks = this.sound ? '<path d="M5 3h1v3H5zM7 2h1v5H7z"/>' : '<path d="M5 3h1v1H5zM7 3h1v1H7zM6 4h1v1H6zM5 5h1v1H5zM7 5h1v1H7z"/>';
      btn.innerHTML = `<svg viewBox="0 0 9 9" shape-rendering="crispEdges" aria-hidden="true"><path d="M0 3h2v3H0zM2 2h1v5H2zM3 1h1v7H3z"/>${marks}</svg><span>${this.sound ? 'SOUND ON' : 'SOUND OFF'}</span>`;
      btn.setAttribute('aria-pressed', String(this.sound));
    }
  }
}
