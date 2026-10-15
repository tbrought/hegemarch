/**
 * The colours of the news: the log, the full log, the line at the top of the screen. A line is coloured
 * by its kind (good, bad, an alarm, an event, plain information) and every house it names is in that
 * house's own colour. A line about another house is in a colour no house wears, so it is never taken for
 * news of the player's own house: every kind's colour is also some house's (teal the Wayfarer Clans', red
 * Vael Imperium's, ember the Ashen Remnant's, and an event's was violet, the Lyceum Collective's), and a
 * playtester playing the Lyceum read "Vael Imperium has claimed the derelict dreadnought" in his own colour.
 */
import type { Game } from '../game/Game';
import type { Faction, Note } from '../game/types';
import { text } from '../render/font';
import { PAL, shade } from '../render/palette';
import type { Ctx } from '../render/pixel';

/** The colour of a line of news by its kind (an event's is a colour no house wears). */
export const KIND_COLOR: Record<Note['kind'], string> = { info: PAL.mist, good: PAL.teal, bad: PAL.red, alert: PAL.ember, event: PAL.bone };
/** The colour of news about another house. */
export const OTHERS = PAL.mist;

/** The houses whose names the news may name. */
function houses(g: Game): Faction[] {
  return g.factions.filter((f) => f.kind === 'empire');
}

/** The names a house goes by in the news, longest first: "The Choir of the First Flame" before "The Choir". */
function namesOf(g: Game): { name: string; f: Faction }[] {
  return houses(g)
    .flatMap((f) => [...new Set([f.name, g.shortName(f)])].map((name) => ({ name, f })))
    .sort((a, b) => b.name.length - a.name.length);
}

/** The house a line of news is about, when it opens with one ("Vael Imperium has…", "The Ark of Vael Imperium…", "Vael Imperium's Gate…"); -1 when none. */
export function newsAbout(g: Game, line: string): number {
  const t = line.replace(/^The (Ark|Hearth) of /, '');
  for (const { name, f } of namesOf(g)) if (t.startsWith(name)) return f.id;
  return -1;
}

/** The colour of a line of news: its kind's, or, when it is about another house, the colour of news about others. */
export function newsColor(g: Game, n: { text: string; kind: Note['kind'] }): string {
  const about = newsAbout(g, n.text);
  return about >= 0 && about !== g.playerId ? OTHERS : KIND_COLOR[n.kind];
}

/**
 * Draw a line of news in its colour, every house it names in that house's own (shaded with the line when
 * it is fading). Returns the x after it.
 */
export function drawNews(g: Ctx, game: Game, line: string, x: number, y: number, color: string, faded = false): number {
  const names = namesOf(game);
  let at = 0;
  let from = 0;
  let px = x;
  const flush = (to: number) => {
    if (to > from) px = text(g, line.slice(from, to), px, y, color);
  };
  while (at < line.length) {
    const prev = at > 0 ? line[at - 1] : ' ';
    const hit = /[A-Za-z]/.test(prev) ? null : names.find((n) => line.startsWith(n.name, at) && !/[A-Za-z]/.test(line[at + n.name.length] ?? ' '));
    if (!hit) {
      at++;
      continue;
    }
    flush(at);
    px = text(g, hit.name, px, y, faded ? shade(hit.f.color) : hit.f.color);
    at += hit.name.length;
    from = at;
  }
  flush(line.length);
  return px;
}
