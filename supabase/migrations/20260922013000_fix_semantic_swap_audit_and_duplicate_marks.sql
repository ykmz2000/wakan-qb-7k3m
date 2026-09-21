begin;

-- A repeated word must be formatted at the changed occurrence, not merely at
-- the first occurrence returned by strpos().
with target as (
  select id, correction_text,
         char_length(correction_text)
           - strpos(reverse(correction_text), reverse('改善'))
           - char_length('改善') + 1 as start_pos
  from public.choices
  where id = '59270e51-3c10-5ccc-b23e-3610eebe39cd'::uuid
), ranges as (
  select id, correction_text,
         jsonb_agg(
           jsonb_build_object(
             'kind', v.kind,
             'start', start_pos,
             'end', start_pos + char_length('改善'),
             'expected_text', '改善'
           ) order by v.ord
         ) as ranges
  from target
  cross join (values ('bold',1),('underline',2),('accent',3)) v(kind,ord)
  group by id, correction_text, start_pos
)
update public.choices c
set explanation_formatting = jsonb_set(
  coalesce(c.explanation_formatting, '{}'::jsonb),
  '{correction_text}',
  jsonb_build_object('version',1,'source_text',r.correction_text,'ranges',r.ranges),
  true
)
from ranges r
where c.id = r.id;

-- The changed relationship is "女性で". Formatting "女性" alone marks text
-- that is unchanged at the same position and hides the grammatical change.
with target as (
  select id, correction_text, strpos(correction_text, '女性で') - 1 as start_pos
  from public.choices
  where id = '99de7cee-07f4-53f1-b086-c2dcdeaa16b9'::uuid
), marks(mark,ord) as (
  values ('女性で',1),('大きな要因',2)
), ranges as (
  select t.id, t.correction_text,
         jsonb_agg(
           jsonb_build_object(
             'kind', v.kind,
             'start', strpos(t.correction_text,m.mark)-1,
             'end', strpos(t.correction_text,m.mark)-1+char_length(m.mark),
             'expected_text', m.mark
           ) order by m.ord,v.ord
         ) as ranges
  from target t
  cross join marks m
  cross join (values ('bold',1),('underline',2),('accent',3)) v(kind,ord)
  where strpos(t.correction_text,m.mark)>0
  group by t.id,t.correction_text
)
update public.choices c
set explanation_formatting = jsonb_set(
  coalesce(c.explanation_formatting, '{}'::jsonb),
  '{correction_text}',
  jsonb_build_object('version',1,'source_text',r.correction_text,'ranges',r.ranges),
  true
)
from ranges r
where c.id = r.id;

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
       'unchanged_text_formatted'::text,m.marked_value,
       '原文と同じ位置にある同一語を強調している'::text
from marked m
where m.kind='accent' and char_length(coalesce(m.marked_value,''))>=2
  and substring(m.choice_text from m.start_pos+1 for m.end_pos-m.start_pos)=m.marked_value
  and position(m.correction_text in m.choice_text)=0
union all
select m.question_id,m.choice_id,m.study_order,m.choice_key,
       'full_sentence_formatted'::text,m.marked_value,'差分ではなく訂正文全体を強調している'::text
from marked m
where m.kind='accent' and m.start_pos=0
  and m.end_pos=char_length(m.correction_text) and char_length(m.correction_text)>=8
union all
select m.question_id,m.choice_id,m.study_order,m.choice_key,
       'overwide_range'::text,m.marked_value,'訂正文の75%以上を強調している'::text
from marked m
where m.kind='accent'
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

commit;
