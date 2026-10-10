/**
 * The six houses: a card for each with the game's own banner (its Hearth and its starting fleet,
 * flying), and a panel about the chosen one. Choosing a house gives the whole page its color.
 */
import { drawHouseBanners, startingFleet } from '../app/houseArt';
import { HEIRS, HEIR_BY_ID } from '../game/data/heirs';
import { richHtml } from '../render/rich';
import { drawSubjects, starWindow, subjectsSize, type Look } from '../ui/subjects';
import { calm, chooseHouse, esc, house, stage, watch } from './stage';

/** Seconds each house is shown while the visitor has not chosen one. */
const TOUR = 5;

export class Houses {
  private flag: { seen: boolean };
  private touring = !calm;
  private tourT = TOUR;
  /** The tour shows each house once and ends where it began. */
  private toured = 0;

  constructor(private cards: HTMLElement, private detail: HTMLElement) {
    cards.innerHTML = HEIRS.map(
      (h) => `<button type="button" class="heir" data-heir="${h.id}" style="--hc:${h.color}" aria-pressed="false">
        <canvas class="heir-art" data-heir="${h.id}" height="24" aria-hidden="true"></canvas>
        <span class="hn">${esc(h.name)}</span>
        <span class="ht">${esc(h.title)}</span>
      </button>`,
    ).join('');
    this.flag = watch(cards);
    cards.addEventListener('click', (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('.heir');
      if (!card) return;
      this.touring = false;
      this.show(card.dataset.heir!);
    });
    // Looking closely stops the tour; the visitor leads from here.
    cards.addEventListener('pointerenter', () => (this.touring = false));
    detail.addEventListener('pointerenter', () => (this.touring = false));
    this.show(house.id);
  }

  private show(id: string) {
    const h = HEIR_BY_ID[id];
    if (!h) return;
    chooseHouse(id);
    for (const card of this.cards.querySelectorAll<HTMLElement>('.heir')) {
      const on = card.dataset.heir === id;
      card.classList.toggle('sel', on);
      card.setAttribute('aria-pressed', String(on));
    }
    this.detail.style.setProperty('--hc', h.color);
    this.detail.innerHTML = `<canvas class="ark-art" aria-hidden="true"></canvas>
      <div class="hd-text">
        <p class="hd-tag">${h.cost ? `Earned with <b>◆${h.cost}</b> Legacy. Every run, won or lost, pays some.` : 'Yours from the first run.'}</p>
        <h3>${esc(h.name)}</h3>
        <p class="hd-title">${esc(h.title)}</p>
        <p class="hd-desc">${esc(h.desc)}</p>
        <ul class="hd-bonuses">${h.bonuses.map((b) => `<li>${richHtml(b)}</li>`).join('')}</ul>
        <p class="hd-fleet">Starts with ${esc(startingFleet(h))}.</p>
      </div>`;
    // The house's Ark, turning in its own patch of sky.
    stage(this.detail.querySelector<HTMLCanvasElement>('.ark-art')!, 3, (g, w, hgt, t, lively) => {
      starWindow(g, 0, 0, w, hgt, 41, t, lively);
      let look: Look = { color: h.color, scale: 3, t, lively, turn: true };
      while (look.scale > 1 && (subjectsSize(['ark'], look).w > w - 4 || subjectsSize(['ark'], look).h > hgt - 4)) look = { ...look, scale: look.scale - 1 };
      drawSubjects(g, ['ark'], w / 2, 0, hgt, look, 'center');
    });
  }

  frame(dt: number, t: number) {
    if (!this.flag.seen) return;
    drawHouseBanners(this.cards, calm ? 0 : t);
    if (!this.touring) return;
    this.tourT -= dt;
    if (this.tourT > 0) return;
    this.tourT = TOUR;
    const at = HEIRS.findIndex((h) => h.id === house.id);
    this.show(HEIRS[(at + 1) % HEIRS.length].id);
    if (++this.toured >= HEIRS.length) this.touring = false;
  }
}
