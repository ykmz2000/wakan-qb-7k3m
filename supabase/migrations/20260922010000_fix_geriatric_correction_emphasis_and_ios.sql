begin;

-- A correction's changed semantic span must carry all three learner-visible
-- cues.  A previous audit accepted a bold/accent pair without an underline,
-- so 73 geriatric choices could pass structural checks with inconsistent
-- emphasis.  Rebuild only the inconsistent choices from the union of their
-- existing semantic spans; canonical option and correction text are untouched.
with base as (
  select
    c.id,
    c.correction_text,
    c.explanation_formatting,
    c.explanation_formatting->'correction_text'->'ranges' as ranges
  from public.choices c
  join public.questions q on q.id=c.question_id
  join public.units u on u.id=q.unit_id
  where u.subject_id='189f5813-caf7-46aa-b0cb-3a1280e5364c'
    and q.status='published'
    and nullif(btrim(c.correction_text),'') is not null
    and c.explanation_formatting->'correction_text'->>'source_text'=c.correction_text
    and jsonb_typeof(c.explanation_formatting->'correction_text'->'ranges')='array'
), semantic_spans as (
  select distinct
    b.id,
    b.correction_text,
    (r.value->>'start')::integer as start_pos,
    (r.value->>'end')::integer as end_pos
  from base b
  cross join lateral jsonb_array_elements(b.ranges) r(value)
  where r.value->>'kind' in ('bold','underline','accent')
), mismatched as (
  select b.id
  from base b
  cross join lateral jsonb_array_elements(b.ranges) r(value)
  where r.value->>'kind' in ('bold','underline','accent')
  group by b.id,(r.value->>'start')::integer,(r.value->>'end')::integer
  having count(distinct r.value->>'kind')<>3
), rebuilt as (
  select
    b.id,
    jsonb_agg(x.range_value order by x.start_pos,x.end_pos,x.kind_order) as ranges
  from base b
  join mismatched m on m.id=b.id
  cross join lateral (
    select
      (r.value->>'start')::integer start_pos,
      (r.value->>'end')::integer end_pos,
      10 kind_order,
      r.value range_value
    from jsonb_array_elements(b.ranges) r(value)
    where r.value->>'kind' not in ('bold','underline','accent')

    union all

    select
      s.start_pos,
      s.end_pos,
      case k.kind when 'bold' then 1 when 'underline' then 2 else 3 end,
      jsonb_build_object(
        'kind',k.kind,
        'start',s.start_pos,
        'end',s.end_pos,
        'expected_text',substring(
          b.correction_text
          from s.start_pos+1
          for s.end_pos-s.start_pos
        )
      )
    from semantic_spans s
    cross join (values ('bold'),('underline'),('accent')) k(kind)
    where s.id=b.id
  ) x
  group by b.id
)
update public.choices c
set explanation_formatting=jsonb_set(
  c.explanation_formatting,
  '{correction_text,ranges}',
  r.ranges,
  true
)
from rebuilt r
where c.id=r.id;

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
), style_spans as (
  select question_id,choice_id,study_order,choice_key,start_pos,end_pos,
         count(distinct kind) filter(where kind in ('bold','underline','accent')) style_count
  from ranges
  where kind in ('bold','underline','accent')
  group by question_id,choice_id,study_order,choice_key,start_pos,end_pos
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
union all
select s.question_id,s.choice_id,s.study_order,s.choice_key,
       'style_triplet_mismatch'::text,
       substring(b.correction_text from s.start_pos+1 for s.end_pos-s.start_pos),
       '変更された核心語に太字・下線・アクセント色の3種がそろっていない'::text
from style_spans s
join base b on b.choice_id=s.choice_id
where s.style_count<>3
order by 3,4,5;
$function$;

update public.qb_choice_correction_reviews r
set audit_fingerprint=public.qb_choice_correction_fingerprint(r.choice_id),
    reviewed_at=now()
from public.choices c
join public.questions q on q.id=c.question_id
join public.units u on u.id=q.unit_id
where r.choice_id=c.id
  and u.subject_id='189f5813-caf7-46aa-b0cb-3a1280e5364c'
  and q.status='published';

commit;
