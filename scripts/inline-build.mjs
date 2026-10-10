// Post-build step: inline the bundled JS and CSS into a single self-contained HTML file
// (dist/hegemarch.html) that runs straight from disk, with no server required.
import fs from 'node:fs';
import path from 'node:path';

const dist = 'dist';
let html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
let inlinedJs = 0;
let inlinedCss = 0;

html = html.replace(/<link\b[^>]*rel="stylesheet"[^>]*href="(\.?\/?assets\/[^"]+\.css)"[^>]*>/g, (_m, href) => {
  inlinedCss++;
  return `<style>${fs.readFileSync(path.join(dist, href), 'utf8')}</style>`;
});

html = html.replace(/<script\b[^>]*type="module"[^>]*src="(\.?\/?assets\/[^"]+\.js)"[^>]*><\/script>/g, (_m, src) => {
  inlinedJs++;
  const js = fs.readFileSync(path.join(dist, src), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script type="module">${js}</script>`;
});

if (!inlinedJs) throw new Error('inline-build: no module script found in dist/index.html');
const out = path.join(dist, 'hegemarch.html');
fs.writeFileSync(out, html);
console.log(`inline-build: wrote ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB, ${inlinedJs} script, ${inlinedCss} stylesheet)`);
