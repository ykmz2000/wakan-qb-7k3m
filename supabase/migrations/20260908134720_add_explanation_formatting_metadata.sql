-- Additive only: no question, choice, answer, image, note, or learning-history rows are rewritten.
-- Existing table grants and RLS remain the authority for public reads and administrator edits.
set lock_timeout = '5s';
alter table public.questions
  add column if not exists explanation_formatting jsonb
  check (explanation_formatting is null or jsonb_typeof(explanation_formatting) = 'object');
alter table public.choices
  add column if not exists explanation_formatting jsonb
  check (explanation_formatting is null or jsonb_typeof(explanation_formatting) = 'object');
comment on column public.questions.explanation_formatting is
  'Optional explanation-only styles keyed by explanation_overview, examiner_intent, exam_summary or medical_verification_note. Entry: {version:1,source_text:exact matching plain text,ranges:[{start,end,kind}]}. UTF-16 offsets; kinds bold/underline/strike/marker/accent. Never used for stem, instruction, or official answers. Ignore metadata when source_text does not match.';
comment on column public.choices.explanation_formatting is
  'Optional explanation-only styles keyed by explanation, correction_text, correct_for_other_context or examiner_distinction. Entry: {version:1,source_text:exact matching plain text,ranges:[{start,end,kind}]}. UTF-16 offsets; kinds bold/underline/strike/marker/accent. Never used for choice_text or is_correct. Ignore metadata when source_text does not match.';
