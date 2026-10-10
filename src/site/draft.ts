/**
 * A Boon draft to try on the website. It is the game's own draft: a real (unplayed) run of the chosen
 * house deals the choices by the game's rules, so rarities, Blueprints, Pacts and a house's extra
 * choice all behave as they do in play. After a few picks it shows what was built and sends the
 * visitor on to the game.
 */
import { Game } from '../game/Game';
import { CARD_BY_ID, CARDS, CAT_LABEL, PACT_COLOR, RARITY_COLOR, type CardDef } from '../game/data/cards';
import { HEIR_BY_ID } from '../game/data/heirs';
import { randomSeed } from '../game/rng';
import { richHtml } from '../render/rich';
import { boonSubjects, drawSubjects, starWindow, subjectNames, subjectsSize, type Look } from '../ui/subjects';
import { esc, house, onHouse, stage, watch } from './stage';

/** Picks before the draft is summed up. */
const PICKS = 4;
const REROLLS = 2;

const colorOf = (c: CardDef) => (c.pact ? PACT_COLOR : RARITY_COLOR[c.rarity]);
const kindOf = (c: CardDef) => (c.pact ? 'Pact' : `${c.rarity[0].toUpperCase()}${c.rarity.slice(1)} · ${CAT_LABEL[c.cat]}`);

export class Draft {
  private game!: Game;
  private picked: CardDef[] = [];
  /** A pick is being shown off; clicks wait. */
  private busy = false;
  private color = house.color;

  constructor(private root: HTMLElement) {
    root.addEventListener('click', (e) => this.onClick(e));
    this.begin();
    // A new house gets a new deal, unless the visitor is in the middle of this one or looking at it.
    const flag = watch(root);
    onHouse(() => {
      if (!this.picked.length && !this.busy && !flag.seen) this.begin();
    });
  }

  /** A fresh run of the house the visitor has chosen, with drafts waiting. */
  private begin() {
    this.game = Game.create({ seed: randomSeed(), size: 'small', difficulty: 1, heir: house.id, perks: {}, unlockLegendary: true, unlockPacts: true });
    const f = this.game.factions[0];
    this.color = HEIR_BY_ID[f.heir].color;
    f.pendingDrafts = PICKS;
    f.rerolls = REROLLS;
    this.picked = [];
    this.busy = false;
    this.deal();
  }

  private deal() {
    const g = this.game;
    const f = g.factions[0];
    const offer = (g.ensureOffer(f) ?? []).map((id) => CARD_BY_ID[id]);
    const heir = HEIR_BY_ID[f.heir];
    this.root.innerHTML = `
      <p class="draft-head"><b>Boon ${this.picked.length + 1} of ${PICKS}</b> for the ${esc(heir.name)}: choose one.</p>
      <div class="boons n${offer.length}">${offer.map((c, i) => this.card(c, i)).join('')}</div>
      <div class="draft-foot">
        <button type="button" class="btn small" data-act="reroll"${f.rerolls > 0 ? '' : ' disabled'}>REROLL · ${f.rerolls} left</button>
        ${this.tray()}
      </div>`;
    offer.forEach((c, i) => this.picture(c, i));
  }

  private card(c: CardDef, i: number): string {
    const subs = boonSubjects(this.game, this.game.factions[0], c);
    return `<button type="button" class="boon" data-card="${c.id}" style="--rc:${colorOf(c)}">
      <canvas class="boon-art" data-i="${i}" role="img" aria-label="${esc(subs.length ? `Affects: ${subjectNames(subs)}` : '')}"></canvas>
      <span class="boon-kind">${esc(kindOf(c))}</span>
      <b class="boon-name">${esc(c.name)}</b>
      <span class="boon-desc">${richHtml(c.desc)}</span>
    </button>`;
  }

  /** The card's window: what the Boon affects, alive, in the color of the house it was dealt for. */
  private picture(c: CardDef, i: number) {
    const el = this.root.querySelector<HTMLCanvasElement>(`.boon-art[data-i="${i}"]`);
    if (!el) return;
    const subs = boonSubjects(this.game, this.game.factions[0], c);
    const seed = [...c.id].reduce((a, ch) => a + ch.charCodeAt(0), i * 31);
    stage(
      el,
      3,
      (g, w, h, t, lively) => {
        starWindow(g, 0, 0, w, h, seed, t, lively);
        let look: Look = { color: this.color, scale: 2, iconScale: 3, t, lively, turn: true };
        if (subjectsSize(subs, look).w > w - 4) look = { ...look, iconScale: 2 };
        if (subjectsSize(subs, look).w > w - 4) look = { ...look, scale: 1 };
        drawSubjects(g, subs, w / 2, 0, h, look, 'center');
      },
      el.closest('.boon') ?? el,
    );
  }

  private tray(): string {
    if (!this.picked.length) return '<p class="tray empty">Your Boons will gather here.</p>';
    return `<ul class="tray">${this.picked.map((c) => `<li style="--rc:${colorOf(c)}">${esc(c.name)}</li>`).join('')}</ul>`;
  }

  private onClick(e: Event) {
    const target = e.target as HTMLElement;
    const act = target.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'again') return this.begin();
    if (this.busy) return;
    if (act === 'reroll') {
      if (this.game.cmdReroll(0)) this.deal();
      return;
    }
    const el = target.closest<HTMLElement>('.boon');
    const c = el && CARD_BY_ID[el.dataset.card ?? ''];
    if (!el || !c || !this.game.cmdChooseCard(0, c.id)) return;
    this.picked.push(c);
    // Show the choice off for a moment: it flashes, the others fall dark.
    this.busy = true;
    el.classList.add('taken');
    for (const other of this.root.querySelectorAll('.boon')) if (other !== el) other.classList.add('passed');
    window.setTimeout(() => {
      this.busy = false;
      if (this.picked.length >= PICKS) this.sumUp();
      else this.deal();
    }, 520);
  }

  private sumUp() {
    // (The Boons a run among the stars can deal; the cradle of an Ages run has its own.)
    const total = CARDS.filter((c) => !c.hidden && !c.cradle).length;
    this.root.innerHTML = `
      <div class="draft-end">
        <p class="draft-head"><b>That is ${PICKS} of ${total} Boons.</b> A run deals you many more, and no two runs deal the same.</p>
        ${this.tray()}
        <div class="actions">
          <a class="btn primary" href="play/">PLAY THE REAL THING<small>Free, nothing to install</small></a>
          <button type="button" class="btn" data-act="again">DRAFT AGAIN<small>A new deal</small></button>
        </div>
      </div>`;
  }
}
