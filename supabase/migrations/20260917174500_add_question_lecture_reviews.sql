create table if not exists public.qb_question_lecture_reviews (
  question_id uuid primary key references public.questions(id) on delete cascade,
  classification text not null check (classification in ('direct','supplemental','none')),
  review_note text not null,
  question_fingerprint text not null,
  reviewed_at timestamptz not null default now()
);

alter table public.qb_question_lecture_reviews enable row level security;
revoke all on table public.qb_question_lecture_reviews from anon, authenticated;

create or replace function public.qb_question_lecture_fingerprint(p_question_id uuid)
returns text
language sql
stable
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
  select md5(concat_ws(E'\n',
    q.stem,
    q.explanation_overview,
    coalesce((select string_agg(concat_ws(E'\n', c.choice_key, c.choice_text, c.explanation), E'\n' order by c.sort_order, c.choice_key)
              from public.choices c where c.question_id=q.id), '')
  ))
  from public.questions q
  where q.id=p_question_id;
$function$;

create or replace function public.qb_question_lecture_review_violations(p_unit_id uuid)
returns table(question_id uuid, canonical_key text, issue text)
language sql
stable security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
  select q.id, q.canonical_key,
    case
      when r.question_id is null then '講義資料該当なしのレビュー未登録'
      when r.question_fingerprint is distinct from public.qb_question_lecture_fingerprint(q.id) then '問題更新後に講義資料レビュー未更新'
      when nullif(btrim(r.review_note),'') is null then '講義資料レビュー理由なし'
    end
  from public.questions q
  left join public.qb_question_lecture_reviews r on r.question_id=q.id and r.classification='none'
  where q.unit_id=p_unit_id
    and q.status='published'
    and not (case when jsonb_typeof(q.explanation_formatting->'references')='array'
                  then jsonb_array_length(q.explanation_formatting->'references')>0 else false end)
    and (r.question_id is null
      or r.question_fingerprint is distinct from public.qb_question_lecture_fingerprint(q.id)
      or nullif(btrim(r.review_note),'') is null);
$function$;

create or replace function public.qb_unit_completion_gate_counts(p_unit_id uuid)
returns table(gate text, violations bigint)
language sql
stable security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
with target as (select u.id unit_id,u.subject_id from public.units u where u.id=p_unit_id),
gates as (
  select 'answer_display'::text gate,count(*)::bigint n from public.qb_answer_display_violations(p_unit_id)
  union all select 'answer_registration',count(*) from target t cross join lateral public.qb_answer_registration_violations(t.subject_id,p_unit_id)
  union all select 'answer_storage',count(*) from public.qb_answer_storage_violations(p_unit_id)
  union all select 'combination_stem',count(*) from public.qb_combination_stem_violations(p_unit_id)
  union all select 'correction_formatting',count(*) from public.qb_correction_formatting_violations(p_unit_id)
  union all select 'choice_correction_review',count(*) from public.qb_choice_correction_review_violations(p_unit_id)
  union all select 'distinction_overuse',count(*) from public.qb_distinction_overuse_violations(p_unit_id)
  union all select 'explanation_duplication',count(*) from public.qb_explanation_duplication_violations(p_unit_id)
  union all select 'instruction_stem',count(*) from public.qb_instruction_stem_violations(p_unit_id)
  union all select 'polarity_underline',count(*) from public.qb_polarity_underline_violations(p_unit_id)
  union all select 'question_polarity',count(*) from public.qb_question_polarity_formatting_violations(p_unit_id)
  union all select 'repeated_correction',count(*) from public.qb_repeated_correction_violations(p_unit_id)
  union all select 'semantic_formatting',count(*) from public.qb_semantic_formatting_violations(p_unit_id)
  union all select 'question_order',count(*) from public.qb_unit_order_review_violations(p_unit_id)
  union all select 'learning_scaffold',count(*) from public.qb_question_learning_review_violations(p_unit_id)
  union all select 'open_revision_cycle',count(*) from public.qb_open_revision_cycle_violations(p_unit_id)
  union all select 'missing_question_explanation',count(*) from public.questions q where q.unit_id=p_unit_id and q.status='published' and (nullif(btrim(q.explanation_overview),'') is null or nullif(btrim(q.examiner_intent),'') is null or nullif(btrim(q.exam_summary),'') is null)
  union all select 'missing_choice_explanation',count(*) from public.choices c join public.questions q on q.id=c.question_id where q.unit_id=p_unit_id and q.status='published' and nullif(btrim(c.explanation),'') is null
  union all select 'occurrence_answer_null',count(*) from public.question_occurrences o join public.questions q on q.id=o.question_id where q.unit_id=p_unit_id and q.status='published' and o.official_answer is null
  union all select 'objective_answer_missing',count(*) from public.questions q where q.unit_id=p_unit_id and q.status='published' and q.answer_mode in ('single','multiple') and not exists(select 1 from public.choices c where c.question_id=q.id and c.is_correct)
  union all select 'visible_verification_issue',count(*) from public.questions q where q.unit_id=p_unit_id and q.status='published' and (q.has_verification_issue or nullif(btrim(q.medical_verification_note),'') is not null)
  union all select 'learner_visible_internal_wording',count(*) from public.questions q where q.unit_id=p_unit_id and q.status='published' and concat_ws(E'\\n',q.explanation_overview,q.examiner_intent,q.exam_summary) ~ '公式.*未確認|未確認.*公式|採点キーは(推定|断定)しない|AI推定を解答として登録していない|模範解答の配布なし|公式解答非公開'
  union all select 'literal_newline_artifact',count(*) from public.questions q where q.unit_id=p_unit_id and q.status='published' and concat_ws(E'\\n',q.stem,q.explanation_overview,q.examiner_intent,q.exam_summary,q.explanation_formatting::text,q.stem_formatting::text) ~ '(/n|\\\\\\\\n)'
  union all select 'question_body_pdf',count(*) from public.question_images qi join public.questions q on q.id=qi.question_id where q.unit_id=p_unit_id and q.status='published' and qi.placement='question' and lower(qi.image_path) like '%.pdf'
  union all select 'lecture_review',count(*) from public.qb_question_lecture_review_violations(p_unit_id)
  union all select 'lecture_reference_missing',count(*) from public.questions q where q.unit_id=p_unit_id and q.status='published'
    and not (case when jsonb_typeof(q.explanation_formatting->'references')='array' then jsonb_array_length(q.explanation_formatting->'references')>0 else false end)
    and not exists(select 1 from public.qb_question_lecture_reviews r where r.question_id=q.id and r.classification='none' and r.question_fingerprint=public.qb_question_lecture_fingerprint(q.id) and nullif(btrim(r.review_note),'') is not null)
  union all select 'excerpt_public_access',count(*) from public.qb_excerpt_access_violations(p_unit_id)
  union all select 'lecture_excerpt_missing',count(*) from public.questions q where q.unit_id=p_unit_id and q.status='published'
    and not exists(select 1 from public.question_images qi where qi.question_id=q.id and qi.placement='explanation_overview' and lower(qi.image_path) like '%.pdf' and (qi.caption ilike '%該当部分%' or qi.alt_text ilike '%該当部分%'))
    and not exists(select 1 from public.qb_question_lecture_reviews r where r.question_id=q.id and r.classification='none' and r.question_fingerprint=public.qb_question_lecture_fingerprint(q.id) and nullif(btrim(r.review_note),'') is not null)
  union all select 'formatting_source_mismatch',count(*) from public.questions q where q.unit_id=p_unit_id and q.status='published' and ((q.explanation_formatting ? 'explanation_overview' and q.explanation_formatting->'explanation_overview'->>'source_text' is distinct from q.explanation_overview) or (q.explanation_formatting ? 'exam_summary' and q.explanation_formatting->'exam_summary'->>'source_text' is distinct from q.exam_summary) or (q.stem_formatting is not null and q.stem_formatting->>'source_text' is distinct from q.stem))
)
select gate,n from gates order by gate;
$function$;
