create extension if not exists pg_trgm with schema extensions;

create table if not exists public.qb_question_search_documents (
  question_id uuid primary key references public.questions(id) on delete cascade,
  subject_id uuid not null,
  unit_id uuid,
  study_order integer,
  stem text not null default '',
  academic_year integer,
  original_question_number text,
  problem_text text not null default '',
  choice_text text not null default '',
  answer_text text not null default '',
  explanation_text text not null default '',
  search_document text not null default ''
);

alter table public.qb_question_search_documents enable row level security;

drop policy if exists qb_question_search_documents_read on public.qb_question_search_documents;
create policy qb_question_search_documents_read
on public.qb_question_search_documents
for select
to authenticated
using (true);

revoke all on table public.qb_question_search_documents from public, anon;
grant select on table public.qb_question_search_documents to authenticated, service_role;

create index if not exists qb_question_search_documents_subject_order_idx
on public.qb_question_search_documents(subject_id, study_order, question_id);

create index if not exists qb_question_search_documents_trgm_idx
on public.qb_question_search_documents
using gin (search_document extensions.gin_trgm_ops);

create or replace function public.qb_refresh_question_search_document(p_question_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.qb_question_search_documents d
  where d.question_id = p_question_id;

  insert into public.qb_question_search_documents (
    question_id,
    subject_id,
    unit_id,
    study_order,
    stem,
    academic_year,
    original_question_number,
    problem_text,
    choice_text,
    answer_text,
    explanation_text,
    search_document
  )
  select
    q.id,
    q.subject_id,
    q.unit_id,
    q.study_order,
    coalesce(q.stem, ''),
    latest.academic_year,
    latest.original_question_number,
    docs.problem_text,
    docs.choice_text,
    docs.answer_text,
    docs.explanation_text,
    lower(concat_ws(' ', docs.problem_text, docs.choice_text, docs.answer_text, docs.explanation_text))
  from public.questions q
  left join lateral (
    select o.academic_year, o.original_question_number
    from public.question_occurrences o
    where o.question_id = q.id
    order by o.academic_year desc nulls last, o.exam_type, o.original_question_number
    limit 1
  ) latest on true
  cross join lateral (
    select
      concat_ws(' ', q.stem, q.instruction) as problem_text,
      concat_ws(' ',
        (select string_agg(concat_ws(' ', c.choice_key, c.choice_text), ' ' order by c.sort_order, c.choice_key)
         from public.choices c where c.question_id = q.id)
      ) as choice_text,
      concat_ws(' ',
        (select string_agg(concat_ws(' ', c.choice_key, c.choice_text), ' ' order by c.sort_order, c.choice_key)
         from public.choices c where c.question_id = q.id and c.is_correct),
        (select string_agg(o.official_answer::text, ' ' order by o.academic_year desc nulls last, o.exam_type, o.original_question_number)
         from public.question_occurrences o where o.question_id = q.id)
      ) as answer_text,
      concat_ws(' ',
        q.explanation_overview,
        q.examiner_intent,
        q.exam_summary,
        q.medical_verification_note,
        (select string_agg(concat_ws(' ', c.explanation, c.correction_text, c.correct_for_other_context, c.examiner_distinction), ' ' order by c.sort_order, c.choice_key)
         from public.choices c where c.question_id = q.id)
      ) as explanation_text
  ) docs
  where q.id = p_question_id
    and q.status = 'published';
end;
$$;

revoke all on function public.qb_refresh_question_search_document(uuid) from public, anon, authenticated;
grant execute on function public.qb_refresh_question_search_document(uuid) to service_role;

create or replace function public.qb_sync_question_search_document()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_question_id uuid;
begin
  if tg_table_name = 'questions' then
    if tg_op = 'DELETE' then target_question_id := old.id;
    else target_question_id := new.id;
    end if;
  else
    if tg_op = 'DELETE' then
      target_question_id := old.question_id;
    else
      target_question_id := new.question_id;
      if tg_op = 'UPDATE' and old.question_id is distinct from new.question_id then
        perform public.qb_refresh_question_search_document(old.question_id);
      end if;
    end if;
  end if;

  perform public.qb_refresh_question_search_document(target_question_id);
  return null;
end;
$$;

revoke all on function public.qb_sync_question_search_document() from public, anon, authenticated;

drop trigger if exists qb_sync_question_search_from_questions on public.questions;
create trigger qb_sync_question_search_from_questions
after insert or update or delete on public.questions
for each row execute function public.qb_sync_question_search_document();

drop trigger if exists qb_sync_question_search_from_choices on public.choices;
create trigger qb_sync_question_search_from_choices
after insert or update or delete on public.choices
for each row execute function public.qb_sync_question_search_document();

drop trigger if exists qb_sync_question_search_from_occurrences on public.question_occurrences;
create trigger qb_sync_question_search_from_occurrences
after insert or update or delete on public.question_occurrences
for each row execute function public.qb_sync_question_search_document();

select public.qb_refresh_question_search_document(q.id)
from public.questions q;

create or replace function public.qb_search_question_cards(
  p_tokens text[],
  p_subject_id uuid default null,
  p_allowed_subject_ids uuid[] default '{}'::uuid[],
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  id uuid,
  subject_id uuid,
  unit_id uuid,
  stem text,
  academic_year integer,
  original_question_number text,
  hit_kinds text[],
  snippet text,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with tokens as (
    select array_agg(lower(token)) as rows
    from unnest(p_tokens) token
    where token <> ''
  ),
  matched as (
    select d.*, count(*) over() as total_count
    from public.qb_question_search_documents d
    cross join tokens t
    where coalesce(cardinality(t.rows), 0) > 0
      and (
        (p_subject_id is not null and d.subject_id = p_subject_id)
        or (
          p_subject_id is null
          and (
            coalesce(cardinality(p_allowed_subject_ids), 0) = 0
            or d.subject_id = any(p_allowed_subject_ids)
          )
        )
      )
      and not exists (
        select 1
        from unnest(t.rows) token
        where strpos(d.search_document, token) = 0
      )
    order by d.study_order nulls last, d.question_id
    limit least(greatest(coalesce(p_limit, 100), 1), 100)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select
    m.question_id,
    m.subject_id,
    m.unit_id,
    m.stem,
    m.academic_year,
    m.original_question_number,
    array_remove(array[
      case when exists (select 1 from unnest(t.rows) token where strpos(lower(m.problem_text), token) > 0) then '問題文' end,
      case when exists (select 1 from unnest(t.rows) token where strpos(lower(m.choice_text), token) > 0) then '選択肢' end,
      case when exists (select 1 from unnest(t.rows) token where strpos(lower(m.answer_text), token) > 0) then '解答' end,
      case when exists (select 1 from unnest(t.rows) token where strpos(lower(m.explanation_text), token) > 0) then '解説' end
    ], null) as hit_kinds,
    left(regexp_replace(
      case
        when strpos(lower(m.problem_text), t.rows[1]) > 0 then m.problem_text
        when strpos(lower(m.choice_text), t.rows[1]) > 0 then m.choice_text
        when strpos(lower(m.answer_text), t.rows[1]) > 0 then m.answer_text
        else m.explanation_text
      end,
      E'\\s+', ' ', 'g'
    ), 150) as snippet,
    m.total_count
  from matched m
  cross join tokens t;
$$;

revoke all on function public.qb_search_question_cards(text[], uuid, uuid[], integer, integer) from public, anon;
grant execute on function public.qb_search_question_cards(text[], uuid, uuid[], integer, integer) to authenticated, service_role;
