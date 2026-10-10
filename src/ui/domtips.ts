/**
 * Hover tooltips for the DOM menus, in the game's pixel style:
 *   data-gl="kindle"            explains a glossary term (glossHtml marks these up)
 *   data-tip="text"             explains a control (effect markup allowed), data-tip-title adds a heading
 */
import { richHtml } from '../render/rich';
import { esc } from './format';
import { GLOSS_BY_ID } from './glossary';

export function installDomTips() {
  const tip = document.createElement('div');
  tip.className = 'gtip';
  tip.hidden = true;
  document.body.appendChild(tip);
  let current: HTMLElement | null = null;

  const place = (x: number, y: number) => {
    const r = tip.getBoundingClientRect();
    let left = x + 14;
    let top = y + 18;
    if (left + r.width > window.innerWidth - 8) left = Math.max(8, x - r.width - 12);
    if (top + r.height > window.innerHeight - 8) top = Math.max(8, y - r.height - 12);
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  };
  const hide = () => {
    tip.hidden = true;
    current = null;
  };
  const show = (el: HTMLElement, x: number, y: number) => {
    const entry = el.dataset.gl ? GLOSS_BY_ID[el.dataset.gl] : undefined;
    if (entry) tip.innerHTML = `<b>${esc(entry.name)}</b><div>${richHtml(entry.text)}</div>`;
    else if (el.dataset.tip) tip.innerHTML = `${el.dataset.tipTitle ? `<b>${esc(el.dataset.tipTitle)}</b>` : ''}<div>${richHtml(el.dataset.tip)}</div>`;
    else return hide();
    current = el;
    tip.hidden = false;
    place(x, y);
  };

  document.addEventListener('mouseover', (e) => {
    const el = (e.target as Element | null)?.closest?.('[data-gl],[data-tip]') as HTMLElement | null;
    if (!el) hide();
    else if (el !== current) show(el, e.clientX, e.clientY);
  });
  document.addEventListener('mousemove', (e) => {
    if (!current) return;
    // Menus are re-rendered on every click: drop a tooltip whose element is gone.
    if (!current.isConnected) hide();
    else place(e.clientX, e.clientY);
  });
  document.addEventListener('pointerdown', hide, true);
  window.addEventListener('blur', hide);
}
