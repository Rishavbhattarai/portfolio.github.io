---
name: mule-ingest
description: Publish MuleSoft Developer study content (quiz, notes, flashcards, predict-the-output questions) to the study dashboard (data-architect.html, MuleSoft track). Use when Rishav pastes MuleSoft / Mule 4 / DataWeave / Anypoint study content, mock exam misses to turn into cards, or says "add this to MuleSoft" / runs /mule-ingest. Converts it, validates it, commits only the data files and pushes to GitHub Pages.
---

# mule-ingest: paste MuleSoft study content, publish it to the dashboard

The dashboard is `data-architect.html` (live at https://rishavbhattarai.com.np/data-architect). It hosts two exams. MuleSoft Developer is the **main** exam; its content lives in `data/mule_*.json`:

| File | What | Written by this skill |
|---|---|---|
| `mule_syllabus.json` | 47 exam topics, each with `domain` (exam section) and a docs link | only to add a missing topic, and say so |
| `mule_syllabus_meta.json` | exam facts and the 12 sections with weights | no |
| `mule_plan.json` | the day-by-day plan (Nov 26 to Dec 5, 2026) and pre-exam checklist | only when Rishav asks to change the plan |
| `mule_questions.json` | quiz questions | yes |
| `mule_flashcards.json` | flashcards | yes |
| `mule_module_notes.json` | notes per topic | yes |

## Steps

1. **Match the topic.** Find the `name` in `data/mule_syllabus.json` that the content belongs to. Split a paste across several topics if it covers several. If nothing fits, add a topic to `mule_syllabus.json` with the right `domain` and an official docs.mulesoft.com link (check it returns 200), and mention it in the report.

2. **Normalize into this JSON** (any part may be missing), saved in the session's temp dir, not the repo:
   ```json
   {
     "notes": { "key_concepts": ["Label: detail"], "core_principles": ["..."], "recall": [{ "q": "...", "a": "..." }] },
     "quiz": [{ "question": "...", "code": "optional Mule XML or DataWeave", "options": ["A) ...", "B) ..."], "correct_answer": "B", "explanation": "...", "source": "https://docs.mulesoft.com/..." }],
     "flashcards": [{ "front": "...", "back": "...", "mnemonic": "...", "source": "..." }]
   }
   ```
   - Keep Rishav's wording.
   - Notes follow the study method: `Label: detail` key concepts (the label becomes the map node and recall cue), one fact per flashcard.
   - **Predict-the-output questions** put the flow XML or DataWeave in `code` (shown as a code block above the options) and ask what payload, attributes, vars or HTTP status results. This is the exam's main question style; prefer it whenever the content is about flow behaviour.
   - **Mock exam misses**: for each miss, write one flashcard for the fact that was missed, and note the cause (DataWeave syntax, scope boundaries, error propagation, platform) in the report.

3. **Check the facts** against Mule 4 docs (never Mule 3: no MEL, no inbound/outbound properties). Don't change Rishav's content; list anything doubtful with the official link.

4. **Dry run, then write:**
   ```bash
   node tools/da-ingest.mjs --track mule --module "<exact topic name>" <tmp>/input.json --dry-run
   node tools/da-ingest.mjs --track mule --module "<exact topic name>" <tmp>/input.json
   node tools/da-validate.mjs --track mule
   ```
   Never commit a failing state.

5. **Commit and push only the data files:**
   ```bash
   git add data/mule_questions.json data/mule_flashcards.json data/mule_module_notes.json   # plus mule_syllabus.json if you added a topic
   git commit -m "MuleSoft content: <topic> (+x quiz, +y cards, +z note points)"
   git push origin main
   ```
   Leave other uncommitted changes alone and mention them. If the push is rejected, `git pull --rebase origin main` once and push again; if that fails, stop and report.

6. **Report**: topic, counts, duplicates skipped, flagged facts, and links:
   - `https://rishavbhattarai.com.np/data-architect?track=mule#quiz/<slug>`
   - `https://rishavbhattarai.com.np/data-architect?track=mule#cards/<slug>`
   - `https://rishavbhattarai.com.np/data-architect?track=mule#notes/<slug>`

## Notes

- Data Architect is the side track (about 15 minutes a day). Its content goes through the da-ingest skill.
- To test locally: `python3 -m http.server 8765` then open http://127.0.0.1:8765/data-architect.html?track=mule
