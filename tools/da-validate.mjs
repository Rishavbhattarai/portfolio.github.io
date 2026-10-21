#!/usr/bin/env node
// Validates the Data Architect dashboard data files. Exits 1 on any error.
// Usage: node tools/da-validate.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const read = (f) => {
  try { return JSON.parse(readFileSync(join(root, 'data', f), 'utf8')); }
  catch (e) { errors.push(`${f}: ${e.message}`); return null; }
};

const syllabus = read('da_syllabus.json') || [];
const meta = read('da_syllabus_meta.json') || {};
const names = new Set(syllabus.concat(meta.extraItems || []).map((i) => i.name));
const domains = new Set((meta.domains || []).map((d) => d.id));
for (const f of ['da_materials.json', 'da_notes.json']) read(f);

function checkList(file, check) {
  const list = read(file);
  if (list === null) return;
  if (!Array.isArray(list)) { errors.push(`${file}: must be an array`); return; }
  const seen = new Set();
  list.forEach((x, i) => {
    const at = `${file}[${i}]${x && x.id ? ` (${x.id})` : ''}`;
    if (!x || typeof x.id !== 'string' || !x.id) errors.push(`${at}: missing string id`);
    else if (seen.has(x.id)) errors.push(`${at}: duplicate id`);
    else seen.add(x.id);
    if (!names.has(x?.syllabusItem)) errors.push(`${at}: syllabusItem "${x?.syllabusItem}" is not in the syllabus`);
    if (!domains.has(x?.domain)) errors.push(`${at}: unknown domain "${x?.domain}"`);
    check(x, at);
  });
  return list.length;
}

const counts = {
  questions: checkList('da_questions.json', (q, at) => {
    if (!q.question) errors.push(`${at}: empty question`);
    const letters = (q.options || []).map((o) => (/^\s*([A-Z])[).:]/.exec(o) || [])[1]);
    if (letters.length < 2 || letters.some((l) => !l)) errors.push(`${at}: options must look like "A) text"`);
    if (new Set(letters).size !== letters.length) errors.push(`${at}: repeated option letter`);
    if (!Array.isArray(q.answer) || !q.answer.length) errors.push(`${at}: answer must be a non-empty array like ["B"]`);
    else q.answer.forEach((a) => { if (!letters.includes(a)) errors.push(`${at}: answer "${a}" is not one of the options`); });
  }),
  flashcards: checkList('da_flashcards.json', (c, at) => {
    if (!c.front || !c.back) errors.push(`${at}: front and back are required`);
  }),
  moduleNotes: checkList('da_module_notes.json', (n, at) => {
    for (const k of ['points', 'principles', 'recall']) if (n[k] !== undefined && !Array.isArray(n[k])) errors.push(`${at}: ${k} must be an array`);
    (n.recall || []).forEach((r, j) => { if (!r.q || !r.a) errors.push(`${at}: recall[${j}] needs q and a`); });
  })
};

if (errors.length) {
  console.error(`da-validate: ${errors.length} problem(s)`);
  errors.forEach((e) => console.error('  - ' + e));
  process.exit(1);
}
console.log(`da-validate: OK (${counts.questions} questions, ${counts.flashcards} flashcards, ${counts.moduleNotes} module note entries)`);
