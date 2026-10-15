/**
 * Runs saved by the version players have (1.18.3, the public site's when these were made), loaded by
 * this one: a player who saved and quits before an update continues after it. Fixtures: a classic run
 * at minute 12 and an Ages run on the cradle at minute 10, made with random orders (tests/fixtures).
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/Game';
import { ascend } from '../src/game/ages';
import { CARD_BY_ID } from '../src/game/data/cards';
import { run } from './helpers';

const load = (name: string) => JSON.parse(zlib.gunzipSync(fs.readFileSync(`tests/fixtures/${name}.json.gz`)).toString('utf8'));

describe('a run saved by 1.18.3 continues', () => {
  for (const name of ['save-1.18.3-classic', 'save-1.18.3-ages']) {
    it(`${name}: loads, plays on, saves and loads again`, () => {
      let g = Game.load(load(name));
      const t0 = g.time;
      run(g, 120);
      // (An Ages run whose Ark has left the cradle goes on among the stars, as the app takes it on.)
      let played = g.time - t0;
      if (g.ascended) {
        const stars = ascend(g);
        expect(stars).toBeTruthy();
        g = stars!;
        played = 120;
      }
      g = Game.load(JSON.parse(JSON.stringify(g.serialize())));
      const t1 = g.time;
      run(g, 60);
      expect(played + g.time - t1).toBeGreaterThan(170);
      // (What the player sees reads right: real Boons, news in words, figures that are numbers.)
      for (const id of g.player.draftOffer ?? []) expect(CARD_BY_ID[id], id).toBeTruthy();
      for (const n of g.notes) expect(n.text, n.text).not.toMatch(/undefined|NaN|\[object/);
      for (const f of g.factions) expect(Number.isFinite(f.embers), f.name).toBe(true);
      // (A run from before discovery is told no keys: every Boon is dealt in it, as it was.)
      expect(g.config.boonKeys).toBeUndefined();
    });
  }
});
