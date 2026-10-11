/**
 * How to Play, the page behind the title screen. It is for someone who has not played yet and will give
 * it half a minute: the game in five moves, each a picture and a sentence, then what is coming and the
 * controls as things to look up. (It was ten paragraphs of text, opened and not read. What it said
 * beyond this is taught in a run: by the First Night, by the tips, and by How to Play there, H.)
 *
 * Three of the pictures move (app/modeArt.ts: `kindle`, `fleet`, `boons`); the rest are the game's own
 * icons.
 */
import { VICTORIES } from '../game/data/victories';
import type { VictoryId } from '../game/types';
import { esc } from '../ui/format';
import { iconPic } from './pics';

const pic = (name: string) => iconPic(name, 'how-icon');

const art = (id: string) => `<canvas class="mode-art how-art" data-art="${id}" aria-hidden="true"></canvas>`;

/** What each role makes of a world, in a word or two. */
const ROLES: [string, string, string][] = [
  ['mine', 'MINE', 'more Embers'],
  ['forge', 'FORGE', 'builds ships'],
  ['observatory', 'OBSERVATORY', 'Lore, sight'],
  ['bastion', 'BASTION', 'guns, repairs'],
];

const DESTINIES: VictoryId[] = ['conquest', 'domination', 'ascension', 'relics', 'treasury', 'crisis'];

function step(n: number, title: string, picture: string, say: string): string {
  return `<li class="how-step"><div class="how-pic">${picture}</div>
    <div class="how-say"><h3><span class="how-n">${n}</span>${title}</h3><p>${say}</p></div></li>`;
}

export function howtoHtml(): string {
  const roles = `<div class="how-tiles">${ROLES.map(([id, name, gives]) => `<div class="how-tile">${pic(id)}<span><b>${name}</b>${gives}</span></div>`).join('')}</div>`;
  const fleet = `${art('fleet')}<div class="how-names"><span>STRIKER</span><span>BREAKER</span><span>GUARDIAN</span></div>`;
  const crowns = `<div class="how-tiles names">${DESTINIES.map((id) => `<div class="how-tile" data-tip="${esc(VICTORIES[id].short)}">${pic(id)}<span>${esc(VICTORIES[id].name)}</span></div>`).join('')}</div>`;
  return `
    <p class="how-lede">The sector is dark. Light it, world by world, and take the crown.</p>
    <ol class="how-steps">
      ${step(1, 'KINDLE WORLDS', art('kindle'), 'Click a grey world and press <kbd>KINDLE</kbd>. A seed ship flies out, lights it in your color and is used up. Every lit world earns <b>Embers</b>.')}
      ${step(2, 'GIVE EACH WORLD A ROLE', roles, 'One role to a world. Change it when your needs change, and raise worlds to level II and III.')}
      ${step(3, 'BUILD A FLEET', fleet, 'Each ship beats the next: Strikers beat Breakers, Breakers beat Guardians, Guardians beat Strikers. <b>Breakers</b> take worlds.')}
      ${step(4, 'CHOOSE BOONS', art('boons'), 'When your <b>Lore</b> fills, take one Boon of three. No two runs deal the same, and some bring new ships.')}
      ${step(5, 'TAKE THE CROWN', crowns, 'Every run deals you three <b>Destinies</b>. Fulfil one and you are the Hegemarch. Lose your <b>Hearth</b> and your house goes dark.')}
    </ol>
    <h2>WHAT IS COMING</h2>
    <div class="how-clock">
      <div class="calm"><b>0:00</b><span>Quiet. Send your Scout exploring (<kbd>E</kbd>) and kindle.</span></div>
      <div><b>10:00</b><span>Corsairs begin to raid.</span></div>
      <div><b>12:00</b><span>Rivals attack. Every Hearth's walls are at full strength.</span></div>
      <div><b>18:00</b><span>The Hollow may wake.</span></div>
    </div>
    <p class="how-note"><b>Rushing:</b> walls start at half strength. Take a rival's Hearth and its worlds, half its hoard and a Boon are yours.</p>
    <h2>CONTROLS</h2>
    <div class="how-controls">
      <ul class="how-keys">
        <li><kbd>Click</kbd> Select a world, a ship, or a fleet badge <span class="fleet-badge">3</span> (all your ships there)</li>
        <li><kbd>Click</kbd> or <kbd>Right-click</kbd> a world: send the selected ships</li>
        <li><kbd>Drag</kbd> Select ships in a box</li>
        <li><kbd>Wheel</kbd> Zoom</li>
        <li><kbd>Right-drag</kbd> <kbd>Arrows</kbd> Move the view</li>
      </ul>
      <ul class="how-keys">
        <li><kbd>Space</kbd> Pause. Paused, you can still give orders: think, then go on.</li>
        <li><kbd>E</kbd> Send selected Scouts exploring</li>
        <li><kbd>Q</kbd> <kbd>W</kbd> <kbd>E</kbd> <kbd>R</kbd> <kbd>T</kbd> With a Forge selected, build its ships</li>
        <li><kbd>Tab</kbd> Your next Forge, the idle ones first</li>
        <li><kbd>B</kbd> Your Boons</li>
        <li><kbd>U</kbd> Your house: worlds, fleets, Destinies</li>
        <li><kbd>H</kbd> In a run: every control and every tip</li>
      </ul>
    </div>
    <div class="how-ages">
      <canvas class="mode-art" data-art="ages" aria-hidden="true"></canvas>
      <div><h3>AGES RUN</h3><p>The long game. Every house starts in the Stone Age on one world, climbs five ages, builds its Ark, and carries what it has won to the stars.</p></div>
    </div>`;
}
