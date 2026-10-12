/** A player's records: what a run is measured against when it ends. */
import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/Game';
import { TRACKS } from '../src/audio/Music';
import { runFigures, runTime } from '../src/meta/legacy';
import { applyRecords, beats, bracketOf, recordsOf, type Records } from '../src/meta/records';

const run = (over: Partial<Parameters<typeof recordsOf>[0]> = {}) => ({ won: true, time: 1800, worlds: 10, kills: 100, boons: 8, legacy: 150, ...over });

describe('records', () => {
  it('a first run of its kind sets every record and beats none: there was nothing to beat', () => {
    const all: Record<string, Records> = {};
    const marks = applyRecords(all, 'classic:medium:1', run());
    expect(all['classic:medium:1']).toEqual({ crown: 1800, worlds: 10, kills: 100, boons: 8, legacy: 150 });
    for (const m of Object.values(marks)) expect(m).toEqual({ was: undefined, beaten: false });
  });

  it('a faster crown beats the record, a slower one does not; every other figure is a most', () => {
    const all: Record<string, Records> = {};
    applyRecords(all, 'b', run());
    const slower = applyRecords(all, 'b', run({ time: 2000, worlds: 12, kills: 90 }));
    expect(slower.crown).toEqual({ was: 1800, beaten: false });
    expect(slower.worlds).toEqual({ was: 10, beaten: true });
    expect(slower.kills).toEqual({ was: 100, beaten: false });
    expect(all.b).toMatchObject({ crown: 1800, worlds: 12, kills: 100 });
    const faster = applyRecords(all, 'b', run({ time: 1500 }));
    expect(faster.crown).toEqual({ was: 1800, beaten: true });
    expect(all.b.crown).toBe(1500);
    expect(beats('crown', 100, 100)).toBe(false);
    expect(beats('stand', 100, 100)).toBe(false);
  });

  it('a run that was lost is measured by how long the house lasted, and leaves the fastest crown alone', () => {
    const all: Record<string, Records> = {};
    applyRecords(all, 'b', run());
    const lost = applyRecords(all, 'b', run({ won: false, time: 900 }));
    expect(lost.crown).toBeUndefined();
    expect(lost.stand).toEqual({ was: undefined, beaten: false });
    expect(applyRecords(all, 'b', run({ won: false, time: 1200 })).stand).toEqual({ was: 900, beaten: true });
    expect(all.b).toMatchObject({ crown: 1800, stand: 1200 });
  });

  it('each kind of run has its own: the mode, the size of the sector, the difficulty', () => {
    expect(bracketOf({ size: 'medium', difficulty: 1 })).toBe('classic:medium:1');
    expect(bracketOf({ mode: 'ages', size: 'large', difficulty: 3 })).toBe('ages:large:3');
    const all: Record<string, Records> = {};
    applyRecords(all, 'classic:small:1', run({ time: 900 }));
    expect(applyRecords(all, 'classic:large:1', run({ time: 2400 })).crown).toEqual({ was: undefined, beaten: false });
  });

  it('a run is measured by its own figures', () => {
    const g = Game.create({ seed: 4242, size: 'small', difficulty: 1, heir: 'concord', perks: {}, unlockLegendary: true, unlockPacts: true });
    for (let i = 0; i < 400; i++) g.step();
    g.declareWinner(g.playerId, 'conquest', 'Every rival Hearth is dark.');
    expect(runTime(g)).toBeCloseTo(20, 5);
    const f = runFigures(g, 77);
    expect(f).toEqual({ won: true, time: runTime(g), worlds: g.player.stats.maxWorlds, kills: g.player.stats.kills, boons: g.player.boons, legacy: 77 });
  });

  it('a house that falls remembers where its Hearth stood, for the ending to go there', () => {
    const g = Game.create({ seed: 4242, size: 'small', difficulty: 1, heir: 'concord', perks: {}, unlockLegendary: true, unlockPacts: true });
    const rival = g.empires().find((f) => f.id !== g.playerId)!;
    const hearth = rival.capital;
    g.planetDefeated(g.nodes[hearth], g.playerId);
    g.flushDeferred();
    expect(rival.capital).toBe(-1);
    expect(rival.lostHearth).toBe(hearth);
    const back = Game.load(JSON.parse(JSON.stringify(g.serialize())));
    expect(back.factions[rival.id].lostHearth).toBe(hearth);
  });
});

describe('the music of a crowning', () => {
  it('is one track in the major, long enough to be crowned to', () => {
    const crown = TRACKS.filter((t) => t.mood === 'crown');
    expect(crown.map((t) => t.name)).toEqual(['The Crowning']);
    // (C major: the key of the fanfare it follows.)
    expect([...crown[0].scale].sort((a, b) => a - b)).toEqual([0, 2, 4, 5, 7, 9, 11]);
  });
});
