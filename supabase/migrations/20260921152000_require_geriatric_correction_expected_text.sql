begin;

with rebuilt as (
  select
    c.id as choice_id,
    jsonb_agg(
      r.value || jsonb_build_object(
        'expected_text',
        substring(
          c.correction_text
          from (r.value->>'start')::integer + 1
          for (r.value->>'end')::integer - (r.value->>'start')::integer
        )
      )
      order by r.ordinality
    ) as ranges
  from public.choices as c
  join public.questions as q on q.id = c.question_id
  join public.units as u on u.id = q.unit_id
  join public.subjects as s on s.id = u.subject_id
  cross join lateral jsonb_array_elements(
    c.explanation_formatting->'correction_text'->'ranges'
  ) with ordinality as r(value, ordinality)
  where s.slug = 'geriatric-medicine'
    and q.status = 'published'
    and nullif(btrim(c.correction_text), '') is not null
    and c.explanation_formatting->'correction_text'->>'source_text' = c.correction_text
  group by c.id
)
update public.choices as c
set explanation_formatting = jsonb_set(
  c.explanation_formatting,
  '{correction_text,ranges}',
  rebuilt.ranges,
  true
)
from rebuilt
where c.id = rebuilt.choice_id;

create or replace function public.qb_correction_formatting_violations(p_unit_id uuid default null)
returns table(
  question_id uuid,
  choice_id uuid,
  study_order integer,
  choice_key text,
  violation_code text,
  marked_text text,
  detail text
)
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
with base as (
  select q.id question_id,q.study_order,c.id choice_id,c.choice_key,c.choice_text,c.correction_text,
         c.explanation_formatting->'correction_text' fmt
  from public.questions q join public.choices c on c.question_id=q.id
  where p_unit_id is null or q.unit_id=p_unit_id
), ranges as (
  select b.*,(r.value->>'start')::integer start_pos,(r.value->>'end')::integer end_pos,
         r.value->>'kind' kind,r.value->>'expected_text' expected_text
  from base b cross join lateral jsonb_array_elements(
    case when jsonb_typeof(b.fmt->'ranges')='array' then b.fmt->'ranges' else '[]'::jsonb end
  ) r
), marked as (
  select ranges.*,
         case when start_pos>=0 and end_pos>start_pos
              then substring(correction_text from start_pos+1 for end_pos-start_pos) end marked_value
  from ranges
)
select b.question_id,b.choice_id,b.study_order,b.choice_key,
       'missing_correction_formatting'::text,''::text,'correction_textがあるが修飾範囲がない'::text
from base b
where nullif(btrim(b.correction_text),'') is not null
  and position(b.correction_text in b.choice_text)=0
  and (b.fmt is null or b.fmt->>'source_text' is distinct from b.correction_text
       or jsonb_array_length(case when jsonb_typeof(b.fmt->'ranges')='array'
                                  then b.fmt->'ranges' else '[]'::jsonb end)=0)
union all
select b.question_id,b.choice_id,b.study_order,b.choice_key,
       'source_mismatch'::text,''::text,'修飾source_textがcorrection_textと一致しない'::text
from base b
where b.fmt is not null and b.fmt->>'source_text' is distinct from b.correction_text
union all
select m.question_id,m.choice_id,m.study_order,m.choice_key,
       'invalid_range'::text,coalesce(m.marked_value,''),'修飾範囲が空または本文外'::text
from marked m
where m.start_pos<0 or m.end_pos<=m.start_pos or m.end_pos>char_length(m.correction_text)
union all
select m.question_id,m.choice_id,m.study_order,m.choice_key,
       'expected_text_mismatch'::text,coalesce(m.marked_value,''),
       'expected_textが未登録または実範囲と一致しない'::text
from marked m
where m.expected_text is distinct from m.marked_value
union all
select m.question_id,m.choice_id,m.study_order,m.choice_key,
       'unchanged_text_formatted'::text,m.marked_value,'原文にもそのまま存在する語を強調している'::text
from marked m
where m.kind in ('accent','bold') and char_length(coalesce(m.marked_value,''))>=2
  and position(m.marked_value in m.choice_text)>0
  and position(m.correction_text in m.choice_text)=0
  and position('不'||m.marked_value in m.choice_text)=0
  and position('非'||m.marked_value in m.choice_text)=0
  and position('無'||m.marked_value in m.choice_text)=0
  and position('未'||m.marked_value in m.choice_text)=0
union all
select m.question_id,m.choice_id,m.study_order,m.choice_key,
       'full_sentence_formatted'::text,m.marked_value,'差分ではなく訂正文全体を強調している'::text
from marked m
where m.kind in ('accent','bold') and m.start_pos=0
  and m.end_pos=char_length(m.correction_text) and char_length(m.correction_text)>=8
union all
select m.question_id,m.choice_id,m.study_order,m.choice_key,
       'overwide_range'::text,m.marked_value,'訂正文の75%以上を強調している'::text
from marked m
where m.kind in ('accent','bold')
  and char_length(m.correction_text)>=8
  and m.end_pos-m.start_pos >= ceil(char_length(m.correction_text)*0.75)
  and not (m.start_pos=0 and m.end_pos=char_length(m.correction_text))
order by 3,4,5;
$function$;

update public.qb_choice_correction_reviews as r
set audit_fingerprint = public.qb_choice_correction_fingerprint(r.choice_id),
    reviewed_at = now()
from public.choices as c
join public.questions as q on q.id = c.question_id
join public.units as u on u.id = q.unit_id
join public.subjects as s on s.id = u.subject_id
where r.choice_id = c.id
  and s.slug = 'geriatric-medicine'
  and q.status = 'published'
  and nullif(btrim(c.correction_text), '') is not null;

commit;
