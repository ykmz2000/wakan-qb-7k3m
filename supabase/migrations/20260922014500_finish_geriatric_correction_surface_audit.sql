begin;

with payload as (
  select * from jsonb_to_recordset($qb$[
    {"id":"dd664966-b0a0-5abc-9e1d-0a164eac5619","correction_text":"本症例は、原発性骨粗鬆症とは診断できない","marks":["は","ない"]},
    {"id":"3e10c4dd-8906-5ce7-aafc-0fffef25841e","correction_text":"転倒の危険因子の内的要因と して、視力障害 (白内障、近視) がある","marks":["内的"]}
  ]$qb$::jsonb)
  as x(id uuid,correction_text text,marks jsonb)
)
update public.choices c
set correction_text=p.correction_text
from payload p
where c.id=p.id;

with payload as (
  select * from jsonb_to_recordset($qb$[
    {"id":"dd664966-b0a0-5abc-9e1d-0a164eac5619","correction_text":"本症例は、原発性骨粗鬆症とは診断できない","marks":["は","ない"]},
    {"id":"3e10c4dd-8906-5ce7-aafc-0fffef25841e","correction_text":"転倒の危険因子の内的要因と して、視力障害 (白内障、近視) がある","marks":["内的"]}
  ]$qb$::jsonb)
  as x(id uuid,correction_text text,marks jsonb)
), located as (
  select p.id,p.correction_text,m.mark,m.ord,
         case
           when p.id='dd664966-b0a0-5abc-9e1d-0a164eac5619'::uuid and m.mark='は'
             then strpos(p.correction_text,'とは')
           else strpos(p.correction_text,m.mark)-1
         end as start_pos
  from payload p
  cross join lateral jsonb_array_elements_text(p.marks) with ordinality m(mark,ord)
), ranges as (
  select l.id,l.correction_text,
         jsonb_agg(
           jsonb_build_object(
             'kind',k.kind,
             'start',l.start_pos,
             'end',l.start_pos+char_length(l.mark),
             'expected_text',l.mark
           ) order by l.start_pos,k.kind_order
         ) as ranges
  from located l
  cross join (values ('bold',1),('underline',2),('accent',3)) k(kind,kind_order)
  where l.start_pos>=0
  group by l.id,l.correction_text
)
update public.choices c
set explanation_formatting=jsonb_set(
  coalesce(c.explanation_formatting,'{}'::jsonb),
  '{correction_text}',
  jsonb_build_object('version',1,'source_text',r.correction_text,'ranges',r.ranges),
  true
)
from ranges r
where c.id=r.id;

commit;
