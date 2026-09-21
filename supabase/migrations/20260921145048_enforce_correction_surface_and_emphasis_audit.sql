create or replace function public.qb_correction_unformatted_anchors_preserved(
  p_choice_text text,
  p_correction_text text,
  p_format jsonb
)
returns boolean
language plpgsql
immutable
set search_path to 'public', 'pg_temp'
as $function$
declare
  r record;
  previous_end integer := 0;
  source_cursor integer := 1;
  anchor text;
  relative_position integer;
  has_bold boolean := false;
begin
  if p_choice_text is null or p_correction_text is null or p_format is null
     or p_format->>'source_text' is distinct from p_correction_text
     or jsonb_typeof(p_format->'ranges') <> 'array' then
    return false;
  end if;

  for r in
    select distinct
      (value->>'start')::integer as start_pos,
      (value->>'end')::integer as end_pos
    from jsonb_array_elements(p_format->'ranges')
    where value->>'kind' = 'bold'
    order by 1,2
  loop
    has_bold := true;
    if r.start_pos < previous_end
       or r.start_pos < 0
       or r.end_pos <= r.start_pos
       or r.end_pos > char_length(p_correction_text) then
      return false;
    end if;

    anchor := substring(
      p_correction_text
      from previous_end + 1
      for r.start_pos - previous_end
    );
    if anchor <> '' then
      relative_position := strpos(substring(p_choice_text from source_cursor), anchor);
      if relative_position = 0 then return false; end if;
      source_cursor := source_cursor + relative_position - 1 + char_length(anchor);
    end if;
    previous_end := r.end_pos;
  end loop;

  if not has_bold then return false; end if;

  anchor := substring(p_correction_text from previous_end + 1);
  if anchor <> '' and strpos(substring(p_choice_text from source_cursor), anchor) = 0 then
    return false;
  end if;
  return true;
end;
$function$;

create or replace function public.qb_correction_surface_violations(p_unit_id uuid default null)
returns table(
  question_id uuid,
  choice_id uuid,
  study_order integer,
  choice_key text,
  violation_code text,
  detail text
)
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  select
    q.id,
    c.id,
    q.study_order,
    c.choice_key,
    'unformatted_text_changed'::text,
    '訂正文の修飾外で、原文にない空白削除・句読点変更・言い換えがある'::text
  from public.questions q
  join public.choices c on c.question_id = q.id
  where q.status = 'published'
    and (p_unit_id is null or q.unit_id = p_unit_id)
    and nullif(btrim(c.correction_text), '') is not null
    and not public.qb_correction_unformatted_anchors_preserved(
      c.choice_text,
      c.correction_text,
      c.explanation_formatting->'correction_text'
    )
  order by q.study_order,c.choice_key;
$function$;

create or replace function public.qb_unit_completion_gate_counts(p_unit_id uuid)
returns table(gate text, violations bigint)
language sql
stable security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
  select b.gate,b.violations
  from public.qb_unit_completion_gate_counts_with_media_base(p_unit_id) b
  where b.gate <> 'literal_newline_artifact'

  union all

  select 'literal_newline_artifact'::text,count(*)::bigint
  from public.questions q
  where q.unit_id = p_unit_id
    and q.status = 'published'
    and concat_ws(E'\\\\n',q.stem,q.explanation_overview,q.examiner_intent,q.exam_summary,q.explanation_formatting::text,q.stem_formatting::text)
      ~ '(/n|\\\\\\\\\\\\\\\\n)'

  union all

  select 'source_link_missing'::text,count(*)::bigint
  from public.qb_source_link_missing_violations(p_unit_id)

  union all

  select 'correction_surface'::text,count(*)::bigint
  from public.qb_correction_surface_violations(p_unit_id)

  order by gate;
$function$;

revoke all on function public.qb_correction_unformatted_anchors_preserved(text,text,jsonb) from public;
revoke all on function public.qb_correction_surface_violations(uuid) from public;
revoke all on function public.qb_unit_completion_gate_counts(uuid) from public;
grant execute on function public.qb_unit_completion_gate_counts(uuid) to authenticated;
