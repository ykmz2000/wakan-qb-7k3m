create or replace function public.qb_question_polarity_formatting_violations(
  p_unit_id uuid default null
)
returns table(
  question_id uuid,
  study_order integer,
  stem text,
  expected_token text,
  reason text
)
language sql
stable
set search_path = public, pg_temp
as $function$
with base as (
  select q.id, q.study_order, q.stem, q.stem_formatting
  from public.questions q
  where q.status = 'published'
    and (p_unit_id is null or q.unit_id = p_unit_id)
), required_tokens as (
  select distinct b.id, b.study_order, b.stem, b.stem_formatting, t.token
  from base b
  cross join lateral (
    select v.token
    from (values
      ('登録されていない'), ('挙げられていない'),
      ('まちがっている'), ('間違っている'), ('誤っている'),
      ('正しくない'), ('適切でない'), ('不適切'),
      ('該当しない'), ('含まれない'), ('起こりにくい'),
      ('評価しない'), ('給付されない'), ('不要なもの'),
      ('通常判断しない'), ('考えないもの'), ('誤り')
    ) as v(token)
    where strpos(b.stem, v.token) > 0
    union all
    select 'でない'
    where b.stem ~ '項目でないのは'
    union all
    select m.match[1]
    from regexp_matches(
      b.stem,
      '(すべて選べ|複数選べ|[二三四五２３４５2-5][[:space:]]*つ[[:space:]]*(選べ|答えよ|記載せよ|かけ))',
      'g'
    ) as m(match)
  ) t
), checked as (
  select r.*,
    coalesce((r.stem_formatting->>'version')::integer = 1, false) as supported_version,
    r.stem_formatting->>'source_text' = r.stem as source_matches,
    coalesce((
      select bool_or(
        f->>'kind' = 'underline'
        and (f->>'start')::integer = strpos(r.stem, r.token) - 1
        and (f->>'end')::integer = strpos(r.stem, r.token) - 1 + char_length(r.token)
      )
      from jsonb_array_elements(
        case
          when jsonb_typeof(r.stem_formatting->'ranges') = 'array'
            then r.stem_formatting->'ranges'
          else '[]'::jsonb
        end
      ) f
    ), false) as has_exact_underline
  from required_tokens r
), token_violations as (
  select id, study_order, stem, token,
    case
      when not supported_version then 'formatting_version_missing_or_unsupported'
      when not source_matches then 'source_text_mismatch'
      when not has_exact_underline then 'answer_condition_not_exactly_underlined'
    end as reason
  from checked
  where not supported_version or not source_matches or not has_exact_underline
), ordinary_underlines as (
  select b.id, b.study_order, b.stem, null::text as token,
    'ordinary_stem_underlined'::text as reason
  from base b
  where not exists (select 1 from required_tokens r where r.id = b.id)
    and exists (
      select 1
      from jsonb_array_elements(
        case
          when jsonb_typeof(b.stem_formatting->'ranges') = 'array'
            then b.stem_formatting->'ranges'
          else '[]'::jsonb
        end
      ) f
      where f->>'kind' = 'underline'
    )
)
select id, study_order, stem, token, reason from token_violations
union all
select id, study_order, stem, token, reason from ordinary_underlines;
$function$;

comment on function public.qb_question_polarity_formatting_violations(uuid) is
  'Rejects published stems when every answer-changing negative or multiple-answer cue is not exactly underlined with renderable version-1 metadata whose source_text matches the stem.';
