-- Additive only: existing answers, question text, images, files and learning history are not rewritten.
set lock_timeout = '5s';

alter table public.question_occurrences
  add column if not exists official_answer_formatting jsonb
  check (official_answer_formatting is null or jsonb_typeof(official_answer_formatting) = 'object');

alter table public.questions
  add column if not exists source_answer_formatting jsonb
  check (source_answer_formatting is null or jsonb_typeof(source_answer_formatting) = 'object');

comment on column public.question_occurrences.official_answer_formatting is
  'Optional styles keyed by official_answer field key. Entry: {version:1,source_text:exact matching plain text,ranges:[{start,end,kind}]}. UTF-16 offsets; kinds bold/underline/strike/marker/accent/link. Ignore metadata when source_text does not match.';

comment on column public.questions.source_answer_formatting is
  'Optional styles keyed by source_answer field key for questions without an occurrence. Same versioned range format as official_answer_formatting; ignore metadata when source_text does not match.';
