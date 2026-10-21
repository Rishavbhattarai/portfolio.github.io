---
name: da-ingest
description: Publish a Trailhead module's quiz, notes and flashcards to the Data Architect study dashboard (data-architect.html). Use when Rishav pastes study content for a module (JSON, bullets, tables or Gemini output) or says "add this to the dashboard" / runs /da-ingest. Converts it, validates it, commits only the data files and pushes to GitHub Pages.
---

# da-ingest: paste study content, publish it to the dashboard

The dashboard is `data-architect.html` in this repo (GitHub Pages, live at https://rishavbhattarai.com.np/data-architect). Its content lives in `data/`:

| File | What | Written by this skill |
|---|---|---|
| `da_syllabus.json` | Rishav's syllabus (35 items). **Never edit.** | no |
| `da_syllabus_meta.json` | domain mapping + link fixes per item | no |
| `da_questions.json` | quiz questions | yes |
| `da_flashcards.json` | flashcards (separate from the quiz) | yes |
| `da_module_notes.json` | notes per syllabus item | yes |

## Steps

1. **Identify the module.** Match the paste to a `name` in `data/da_syllabus.json` (or `extraItems` in the meta file). Use the title Rishav gives, or the content. If two items are plausible, ask him once which one. Don't guess.

2. **Normalize the paste into this JSON** (any part may be missing) and save it under the session's temp dir, not in the repo:
   ```json
   {
     "notes": { "key_concepts": ["..."], "core_principles": ["..."], "recall": [{ "q": "...", "a": "..." }] },
     "quiz": [{ "question": "...", "options": ["A) ...", "B) ..."], "correct_answer": "B) ..." , "explanation": "...", "source": "https://..." }],
     "flashcards": [{ "front": "...", "back": "...", "mnemonic": "...", "source": "https://..." }]
   }
   ```
   - Keep Rishav's wording. Don't rewrite his questions or cards.
   - `correct_answer` can be `"C"`, `"C) Record"`, `["A","C"]` or `"A, C"` (choose-2).
   - Notes that are headings + bullets go into `key_concepts`; rules of thumb into `core_principles`; question/answer style notes into `recall`.
   - If the paste is already in this shape, use it as is.

3. **Check the facts** before publishing. Read each quiz answer and flashcard against what you know of the official Salesforce docs/Trailhead. Don't change his content; list anything doubtful in the report (item, why, link to the official source). Fix only clear formatting problems (missing option letters, stray numbering).

4. **Dry run, then write:**
   ```bash
   node tools/da-ingest.mjs --module "<exact syllabus name>" <tmp>/input.json --dry-run
   node tools/da-ingest.mjs --module "<exact syllabus name>" <tmp>/input.json
   node tools/da-validate.mjs
   ```
   The ingest script assigns ids (`<module-slug>-q<n>`, `-c<n>`, `-n<n>`), sets `syllabusItem` and `domain`, and skips entries already present for that module, so re-pasting is safe. If `da-validate` fails, fix the input and rerun; **never commit a failing state**.

5. **Commit and push only the data files:**
   ```bash
   git add data/da_questions.json data/da_flashcards.json data/da_module_notes.json
   git commit -m "Study content: <module> (+x quiz, +y cards, +z note points)"
   git push origin main
   ```
   Don't stage anything else. If `git status` shows other uncommitted changes, leave them alone and mention them. If the push is rejected, `git pull --rebase origin main` once and push again; if that fails, stop and report.

6. **Report** in a few lines: module, counts added, duplicates skipped, any flagged facts, and the links:
   - `https://rishavbhattarai.com.np/data-architect#quiz/<slug>`
   - `https://rishavbhattarai.com.np/data-architect#cards/<slug>`
   - `https://rishavbhattarai.com.np/data-architect#notes/<slug>`

   GitHub Pages takes about a minute to update.

## Notes

- Quiz and flashcards are different things. Never turn quiz questions into flashcards or the other way round unless Rishav asks.
- One fact per flashcard. If a pasted card holds several facts, keep it but mention it in the report.
- To test the page locally: `npx serve -l 4317 .` then open http://localhost:4317/data-architect.
