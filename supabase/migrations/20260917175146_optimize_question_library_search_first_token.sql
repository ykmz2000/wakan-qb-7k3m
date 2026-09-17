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
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_tokens text[];
  v_pattern text;
begin
  select array_agg(lower(token))
  into v_tokens
  from unnest(p_tokens) token
  where token <> '';

  if coalesce(cardinality(v_tokens), 0) = 0 then
    return;
  end if;

  v_pattern := '%' || v_tokens[1] || '%';

  -- Supplying the first token as a safely quoted literal lets Postgres plan
  -- against the existing pg_trgm index. The remaining values stay bound.
  return query execute format($sql$
    with matched as (
      select d.*, count(*) over() as total_count
      from public.qb_question_search_documents d
      where (
          ($1 is not null and d.subject_id = $1)
          or (
            $1 is null
            and (
              coalesce(cardinality($2), 0) = 0
              or d.subject_id = any($2)
            )
          )
        )
        and d.search_document like %L
        and not exists (
          select 1
          from unnest($5[2:cardinality($5)]) token
          where strpos(d.search_document, token) = 0
        )
      order by d.study_order nulls last, d.question_id
      limit least(greatest(coalesce($3, 100), 1), 100)
      offset greatest(coalesce($4, 0), 0)
    )
    select
      m.question_id,
      m.subject_id,
      m.unit_id,
      m.stem,
      m.academic_year,
      m.original_question_number,
      array_remove(array[
        case when exists (select 1 from unnest($5) token where strpos(lower(m.problem_text), token) > 0) then '問題文' end,
        case when exists (select 1 from unnest($5) token where strpos(lower(m.choice_text), token) > 0) then '選択肢' end,
        case when exists (select 1 from unnest($5) token where strpos(lower(m.answer_text), token) > 0) then '解答' end,
        case when exists (select 1 from unnest($5) token where strpos(lower(m.explanation_text), token) > 0) then '解説' end
      ], null),
      left(regexp_replace(
        case
          when strpos(lower(m.problem_text), $5[1]) > 0 then m.problem_text
          when strpos(lower(m.choice_text), $5[1]) > 0 then m.choice_text
          when strpos(lower(m.answer_text), $5[1]) > 0 then m.answer_text
          else m.explanation_text
        end,
        E'\\s+', ' ', 'g'
      ), 150),
      m.total_count
    from matched m
  $sql$, v_pattern)
  using p_subject_id, p_allowed_subject_ids, p_limit, p_offset, v_tokens;
end;
$$;

revoke all on function public.qb_search_question_cards(text[], uuid, uuid[], integer, integer) from public, anon;
grant execute on function public.qb_search_question_cards(text[], uuid, uuid[], integer, integer) to authenticated, service_role;
