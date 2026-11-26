#!/usr/bin/env node
// Builds the card-catalog syllabus figure for the MuleSoft track.
//   node tools/mule-catalog/build.mjs            -> js/mule-catalog.js, css/mule-catalog.css, tools/mule-catalog/preview*.html
// The drawing kit is the Anatomy skill's kit/iso-kit.mjs (MIT, github.com/wheresryan22/anatomy),
// vendored next to this file and inlined into one plain script that old iPads can run (Safari 12).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const kitSrc = readFileSync(join(HERE, 'iso-kit.mjs'), 'utf8');
const { ISO_CSS } = await import(join(HERE, 'iso-kit.mjs'));

// 1. Kit as plain script: no exports, and the two ?? replaced (Safari < 13.1 can't parse them)
let kit = kitSrc.replace(/^export /gm, '');
kit = kit.replace('const convex = options.convex ?? true;', 'const convex = options.convex === undefined || options.convex === null ? true : options.convex;');
kit = kit.replace('(groups.get(level) ?? "")', '(groups.get(level) || "")');
// ISO_CSS ships as a stylesheet instead of a string in the script
kit = kit.replace(/const ISO_CSS = `[\s\S]*?`;\n?/, '');
const src = readFileSync(join(HERE, 'catalog.src.js'), 'utf8');
const js = `/* Built by tools/mule-catalog/build.mjs. Do not edit; edit catalog.src.js. Kit: Anatomy (MIT). */\n(function () {\n${kit}\n${src}\n})();\n`;

// Features Safari 12 can't run. The app itself avoids the same list.
const banned = [
  [/\?\?/, 'nullish ??'], [/\?\.[a-zA-Z_$[(]/, 'optional chaining ?.'], [/\(\?<[=!a-zA-Z]/, 'regex lookbehind or named group'],
  [/\b\d+_\d+\b/, 'numeric separator'], [/catch\s*\{/, 'optional catch binding'], [/\.at\(/, '.at()'], [/\.flat(Map)?\(/, '.flat()'],
  [/Object\.(fromEntries|hasOwn)/, 'Object.fromEntries/hasOwn'], [/replaceAll\(/, 'replaceAll'], [/\bPointerEvent\b|pointer(move|down|up|leave)/, 'pointer events'],
  [/Promise\.allSettled|globalThis|structuredClone/, 'post-2019 API'], [/\bstatic\s+[a-z]+\s*=|#[a-z]\w*\s*=/, 'class fields'],
];
const problems = banned.filter(([re]) => re.test(js)).map(([, name]) => name);
if (problems.length) { console.error('Not Safari 12 safe:', problems.join(', ')); process.exit(1); }
new Function(js); // syntax check under this Node
writeFileSync(join(ROOT, 'js', 'mule-catalog.js'), js);

// 2. Stylesheet: the kit's tokens, themed by the dashboard's own theme switch
const tokens = (block) => {
  const m = ISO_CSS.match(new RegExp(block.replace(/[[\]".]/g, '\\$&') + '\\{([\\s\\S]*?)\\n\\}'));
  return m[1].trim();
};
const dark = tokens('.iso');
const light = tokens('.iso[data-theme="light"]');
const rules = ISO_CSS.replace(/\.iso\{[\s\S]*?\n\}\n/, '').replace(/\.iso\[data-theme="light"\]\{[\s\S]*?\n\}\n/, '');
const css = `/* Built by tools/mule-catalog/build.mjs from the Anatomy kit's ISO_CSS (MIT). */
.mcat{${light}}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) .mcat{${dark}}}
:root[data-theme="dark"] .mcat{${dark}}
${rules}
/* Dashboard fit and old-Safari fallbacks (no inset, no flex gap, no CSS filter on SVG children) */
.mcat .iso-figure{margin:0}
.mcat .iso-plate{border-radius:var(--r-card,18px);box-shadow:none;border:1px solid var(--anatomy-faint)}
.mcat .iso-plate-corners{top:18px;right:20px;bottom:18px;left:20px}
.mcat .iso-svg{max-width:760px}
.mcat .iso-keys>*{margin:3px 18px 3px 0}
.mcat .iso-keys{gap:0}
.mcat .iso-key>.iso-swatch{margin-right:7px}
.mcat .iso-key{gap:0}
.mcat-halo{fill:var(--anatomy-halo);opacity:var(--anatomy-halo-opacity)}
.mcat-stage{outline:none;cursor:pointer;-webkit-tap-highlight-color:transparent}
.mcat-stage:focus-visible{box-shadow:0 0 0 2px var(--accent,#3b6cff);border-radius:8px}
.mcat-front{cursor:pointer}
.mcat-detail{margin-top:16px;display:grid;grid-gap:12px}
.mcat-detail__head{display:flex;flex-wrap:wrap;align-items:baseline}
.mcat-detail__head>*{margin:0 10px 4px 0}
.mcat-detail__head h3{font-size:17px}
.mcat-detail__head .mono{color:var(--text-faint)}
.mcat-detail__list{margin:0;padding-left:22px;color:var(--text-dim);font-size:14.5px;line-height:1.55}
.mcat-detail__list li+li{margin-top:4px}
.mcat-detail .btn{justify-self:start}
@media (max-width:560px){.mcat .iso-plate{padding:46px 10px 64px}}
`;
writeFileSync(join(ROOT, 'css', 'mule-catalog.css'), css);

// 3. Standalone previews (sample progress) for the skill's capture, drive and line checks
const obj = JSON.parse(readFileSync(join(ROOT, 'data', 'mule_objectives.json'), 'utf8'));
const sample = obj.sections.map((s, i) => ({ ...s, topics: 3 + (i % 4), done: i % 4, frac: (i % 4) / (3 + (i % 4)) }));
for (const theme of ['dark', 'light']) {
  const page = `<!doctype html><html lang="en" data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Card catalog</title>
<style>body{margin:0;background:${theme === 'dark' ? '#0C0D10' : '#F6F7F9'};color:${theme === 'dark' ? '#e6e6e6' : '#18181a'};font:14px/1.6 -apple-system,system-ui,sans-serif;--text-dim:#888;--text-faint:#777}main{width:860px;max-width:calc(100% - 32px);margin:40px auto}.chip,.btn{display:inline-block;border:1px solid #8885;border-radius:99px;padding:2px 10px;font-size:13px}.btn{background:none;color:inherit}</style>
<style>${css}</style></head><body><main><div class="mcat" id="fig"></div></main>
<script>${js.replace(/<\/(script)/gi, "<\\/$1")}</script><script>MuleCatalog.mount(document.getElementById('fig'), { sections: ${JSON.stringify(sample)}, selected: ${process.argv.includes('--pick') ? 7 : 0} });</script></body></html>`;
  writeFileSync(join(HERE, theme === 'dark' ? 'preview.html' : 'preview-light.html'), page);
}
console.log(`built js/mule-catalog.js (${(js.length / 1024).toFixed(1)} KB), css/mule-catalog.css, previews`);
