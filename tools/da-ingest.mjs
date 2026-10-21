#!/usr/bin/env node
// Appends one module's quiz, flashcards and notes to the dashboard data files.
// Usage: node tools/da-ingest.mjs --module "Data Modeling" path/to/input.json [--dry-run]
//
// Input JSON (any part optional):
// {
//   "notes": { "key_concepts": [..], "core_principles": [..], "recall": [{ "q": "..", "a": ".." }] },
//   "quiz": [{ "question": "..", "options": ["A) ..", "B) .."], "correct_answer": "C) .." | "C" | ["A","C"], "explanation": "..", "source": ".." }],
//   "flashcards": [{ "front": "..", "back": "..", "mnemonic": "..", "source": ".." }]
// }
// Entries already present for the module (same question / same front) are skipped.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const moduleName = flag('--module');
const input = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--module');
const dryRun = args.includes('--dry-run');
if (!moduleName || !input) {
  console.error('Usage: node tools/da-ingest.mjs --module "<syllabus item name>" input.json [--dry-run]');
  process.exit(2);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataPath = (f) => join(root, 'data', f);
const readData = (f) => JSON.parse(readFileSync(dataPath(f), 'utf8'));
const slug = (s) => String(s).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

const syllabus = readData('da_syllabus.json');
const meta = readData('da_syllabus_meta.json');
const all = syllabus.concat(meta.extraItems || []);
const item = all.find((i) => i.name === moduleName) || all.find((i) => norm(i.name) === norm(moduleName));
if (!item) {
  console.error(`No syllabus item named "${moduleName}". Choose one of:\n  ` + all.map((i) => i.name).join('\n  '));
  process.exit(2);
}
const domain = item.domain || meta.items?.[item.name]?.domain;
if (!domain) { console.error(`No domain mapped for "${item.name}" in da_syllabus_meta.json`); process.exit(2); }
const base = slug(item.name);

const src = JSON.parse(readFileSync(input, 'utf8'));
// Next free number for ids like "<base>-q7"
function nextNum(list, tag) {
  const re = new RegExp(`^${base}-${tag}(\\d+)$`);
  return list.reduce((m, x) => { const r = re.exec(x.id); return r ? Math.max(m, +r[1]) : m; }, 0) + 1;
}
function answerLetters(a, options) {
  // "A, C" or "A and C" means several letters; anything else is one answer (its text may contain commas)
  const s = String(a).trim();
  const list = Array.isArray(a) ? a : /^[A-Z](\s*(,|and|&)\s*[A-Z])+$/.test(s) ? s.split(/\s*(?:,|and|&)\s*/) : [s];
  return list.map((x) => {
    const m = /^\s*([A-Z])(?:[).:\s]|$)/.exec(x);
    if (m) return m[1];
    const hit = options.find((o) => norm(o.replace(/^\s*[A-Z][).:]\s*/, '')) === norm(x));
    return hit ? hit.trim()[0] : null;
  });
}

const added = { questions: 0, flashcards: 0, notes: 0, skipped: 0 };

const questions = readData('da_questions.json');
const haveQ = new Set(questions.filter((q) => q.syllabusItem === item.name).map((q) => norm(q.question)));
let qn = nextNum(questions, 'q');
for (const q of src.quiz || []) {
  if (haveQ.has(norm(q.question))) { added.skipped++; continue; }
  const options = (q.options || []).map((o, i) => (/^\s*[A-Z][).:]/.test(o) ? o.trim() : `${String.fromCharCode(65 + i)}) ${o.trim()}`));
  const answer = answerLetters(q.answer ?? q.correct_answer, options);
  if (answer.some((x) => !x)) { console.error(`Could not read the answer for: ${q.question}`); process.exit(1); }
  questions.push({ id: `${base}-q${qn++}`, syllabusItem: item.name, domain, question: q.question.trim(), options, answer, explanation: q.explanation || '', ...(q.source ? { source: q.source } : {}) });
  haveQ.add(norm(q.question));
  added.questions++;
}

const cards = readData('da_flashcards.json');
const haveC = new Set(cards.filter((c) => c.syllabusItem === item.name).map((c) => norm(c.front)));
let cn = nextNum(cards, 'c');
for (const c of src.flashcards || []) {
  if (haveC.has(norm(c.front))) { added.skipped++; continue; }
  cards.push({ id: `${base}-c${cn++}`, syllabusItem: item.name, domain, front: c.front.trim(), back: c.back.trim(), ...(c.mnemonic ? { mnemonic: c.mnemonic } : {}), ...(c.source ? { source: c.source } : {}) });
  haveC.add(norm(c.front));
  added.flashcards++;
}

const notes = readData('da_module_notes.json');
const n = src.notes || {};
const existing = notes.filter((x) => x.syllabusItem === item.name);
const seenPts = new Set(existing.flatMap((x) => (x.points || []).concat(x.principles || [])).map(norm));
const seenQa = new Set(existing.flatMap((x) => x.recall || []).map((r) => norm(r.q)));
const points = (n.key_concepts || n.points || []).filter((p) => !seenPts.has(norm(p)));
const principles = (n.core_principles || n.principles || []).filter((p) => !seenPts.has(norm(p)));
const recall = (n.recall || []).filter((r) => r.q && r.a && !seenQa.has(norm(r.q)));
if (points.length + principles.length + recall.length) {
  notes.push({ id: `${base}-n${nextNum(notes, 'n')}`, syllabusItem: item.name, domain, points, ...(principles.length ? { principles } : {}), ...(recall.length ? { recall } : {}) });
  added.notes = points.length + principles.length + recall.length;
}

if (!dryRun) {
  writeFileSync(dataPath('da_questions.json'), JSON.stringify(questions, null, 2) + '\n');
  writeFileSync(dataPath('da_flashcards.json'), JSON.stringify(cards, null, 2) + '\n');
  writeFileSync(dataPath('da_module_notes.json'), JSON.stringify(notes, null, 2) + '\n');
}
console.log(`${dryRun ? '[dry run] ' : ''}${item.name} (${base}): +${added.questions} quiz, +${added.flashcards} flashcards, +${added.notes} note points, ${added.skipped} duplicates skipped`);
