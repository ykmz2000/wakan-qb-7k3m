# Current-question identity incident audit — 2026-09-07

## Scope

Inline admin editing, official/personal media, personal notes, and self-rating shared a compatibility resolver (`window.pq`) that inferred the current question from the visible question stem. Published questions can legitimately share the same stem, so a stem-only lookup could resolve to a sibling canonical question.

Audit window starts at 2026-09-05 09:20 UTC, when the shared compatibility bridge was introduced.

## Root cause

`shared-explanation-ui.js` resolved the current question using the first item in `window.QB_QUESTIONS` whose `stem` matched the visible question text. For duplicate stems, `.find()` returned the first sibling rather than the question actually being practiced.

The base practice flow itself uses `practice[pi]` -> `questions.find(q => q.id === practice[pi])`, so attempts and `user_question_state` were written with the actual practice question ID. The identity mismatch affected modules that relied on `window.pq()`.

Confirmed example: five emergency-medicine questions in the same unit share the stem `大動脈救急領域において、以下の記載から正しいものを2つ選べ。`; their choices differ. The prior resolver could show/edit the first sibling's choice data while another sibling was on screen.

## Code remediation

Added `current-question-identity-v1.js` and loaded it immediately after `shared-explanation-ui.js`.

Resolution now proceeds as follows:

1. Use an exact question ID captured from the practice selection event when available.
2. Verify that the exact-ID question still matches the visible stem and ordered choice signature.
3. Otherwise match by visible stem + ordered choice keys/text.
4. If multiple candidates remain, additionally match displayed occurrence year and exam type.
5. If the candidate is still not unique, return `null` rather than choosing the first item (fail closed).
6. Editor/upload controls are stamped with the question ID they were opened for; save/upload is blocked if the current resolved ID has changed.

Current production cache key: `current-question-identity-v1.js?v=20260907-02`.

Relevant commits:

- `6744ca8794a0dac641a3b699590a928362baa89b` — initial identity guard
- `b42383d054d53f3a127ade74a88ff9c11d88297a` — prefer exact question ID and retain signature verification
- `53eb1526790bc9139117ced8802fa8f08b39fa17` — load guard from index
- `7b2b1060dd22e35364df55f8c10e53e406650987` — cache bust for final guard

The GitHub Pages deployment workflow completed successfully after the repair and audit commits.

## Duplicate-stem exposure

Published same-subject/same-unit duplicate-stem groups contained:

- 整形外科・リハビリテーション医学: 19 groups / 44 questions
- 救急医学: 14 groups / 35 questions
- 臨床診断学: 17 groups / 35 questions
- 和漢医学概論: 6 groups / 15 questions

After adding ordered choices to the identity signature, 9 groups / 18 questions still had an identical full stem+choice signature. All 9 groups were distinguished by the displayed latest occurrence year + exam type in the current data; zero groups remained ambiguous after that discriminator.

## Post-incident data audit

### Self-ratings — confirmed corruption and repaired

A bad auto-rating event was considered confirmed when, within the audit window, a rating on one duplicate-stem sibling was written within 2 seconds of the same user's actual attempt (or review-only explanation view) on another sibling with the same subject/unit/stem.

Confirmed:

- 34 attempt-linked misbindings
- 2 review-only misbindings
- 36 total misbound rating events

Repair performed:

- 36 intended-question ratings written/upserted
- 35 erroneous source-question ratings restored from that source question's most recent legitimate prior interaction
- 1 erroneous source-question rating deleted because no legitimate prior source interaction existed

Post-repair recheck:

- remaining attempt-linked misbindings: 0
- remaining review-only misbindings: 0

### Source-text integrity check

Duplicate-stem canonical questions were compared against `question_occurrences.exact_stem` / `exact_choices`, without rewriting any source fields.

Choice-text verification where exact source choices are available:

- 和漢医学概論: 15 / 15 match, 0 mismatch
- 救急医学: 35 / 35 match, 0 mismatch
- 整形外科・リハビリテーション医学: 44 / 44 match, 0 mismatch
- 臨床診断学: 15 / 15 verifiable rows match, 0 mismatch; 20 rows have no source choice payload available for automated comparison

Stem verification where `exact_stem` is available:

- 和漢医学概論: 15 / 15 match, 0 mismatch
- 救急医学: 35 / 35 match, 0 mismatch
- 整形外科・リハビリテーション医学: 44 / 44 match after accounting for instruction separation, 0 mismatch
- 臨床診断学: 27 / 27 verifiable rows match, 0 mismatch; 8 rows have no exact stem payload available for automated comparison

Therefore no confirmed canonical stem/choice corruption was found in the source-verifiable duplicate-stem set.

### Personal notes

Within duplicate-stem groups during the audit window:

- `user_notes`: 0 writes
- `user_note_images`: 0 writes

No note-data repair was required.

### Occurrence / official-answer data

No `question_occurrences` update occurred within the confirmed bad-rating event windows on the wrongly resolved source question. No confirmed occurrence/official-answer misbinding was identified; no occurrence row was automatically modified by this audit.

### Question / choice explanation data

Candidate writes near confirmed identity-mismatch events were manually sampled against their stored question and choice text. The inspected rows were internally consistent with the question they are currently attached to (for example RA classification criteria, lumbar disc/root findings, degenerative spondylolisthesis, TKA, critical-care oxygen delivery, and SAH explanation sets). No cross-question explanation corruption was confirmed, so no destructive rollback was performed.

### Official question images — review required, not auto-moved

45 `question_images` rows were created on duplicate-stem questions during the audit window. Temporal correlation produced a subset of possible candidates near known mismatch events, but timestamps alone do not prove the intended image target. Several candidate images were created immediately after a legitimate interaction with the currently stored/source question, while others occurred closer to a sibling interaction.

`question_images` contains no uploader/user identifier, and these rows have no captions or alt text that can prove visual ownership. The available DB metadata therefore cannot safely determine which sibling was intended.

Because the available evidence cannot prove visual ownership, no image row or Storage object was moved/deleted automatically. This preserves source integrity and avoids creating new corruption from an uncertain repair.

## Remaining follow-up

- Visually/provenance-review the temporally suspicious `question_images` rows before moving any image.
- Independently consider canonical deduplication for the 9 groups whose stem+choices are identical but occurrence metadata differs. This is a normalization task, not part of this incident repair, and requires source comparison before merging.

## Safety outcome

The prior dangerous behavior — silently choosing the first same-stem question — is no longer used by the active editor/media compatibility path. Ambiguous identity now fails closed, and saving through an editor opened for a different question ID is blocked.
