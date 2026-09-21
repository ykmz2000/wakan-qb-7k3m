create or replace function public.qb_order_normalized_stem(
  p_stem text,
  p_answer_mode text default null
)
returns text
language sql
immutable
set search_path to 'public', 'pg_temp'
as $function$
  select regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          lower(coalesce(p_stem, '')),
          '^[[:space:]]*[（(][[:space:]]*[）)][[:space:]]*(の中)?に適切な(語句|言葉)を入れよ[。.]?',
          '',
          'g'
        ),
        '[（(][[:space:]]*[a-zａ-ｚA-ZＡ-Ｚ0-9０-９]*[[:space:]]*[）)]',
        '□',
        'g'
      ),
      '＿+|_+|□+|○+|〇+',
      '□',
      'g'
    ),
    '[[:space:][:punct:]0-9０-９]',
    '',
    'g'
  );
$function$;

create or replace function public.qb_question_series_order_violations(p_unit_id uuid)
returns table(
  first_key text,
  last_key text,
  member_count integer,
  first_position integer,
  last_position integer,
  detail text
)
language sql
stable security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
with recursive published as (
  select
    q.id,
    q.canonical_key,
    q.answer_mode,
    row_number() over(order by q.study_order nulls last, q.created_at, q.id)::integer as rn,
    public.qb_order_normalized_stem(q.stem, q.answer_mode) as norm_stem
  from public.questions q
  where q.unit_id=p_unit_id and q.status='published'
), edge_source as (
  select a.id as left_id,b.id as right_id
  from published a
  join published b on b.id>a.id
  where length(a.norm_stem)>=12
    and length(b.norm_stem)>=12
    and a.norm_stem not in (
      '次のうち正しいのはどれか',
      '正しいのはどれか',
      '次のうち適切なのはどれか',
      '誤っているのはどれか'
    )
    and (
      a.norm_stem=b.norm_stem
      or extensions.similarity(a.norm_stem,b.norm_stem)>=0.82
      or (
        a.answer_mode='fill_blank'
        and b.answer_mode='fill_blank'
        and least(length(a.norm_stem),length(b.norm_stem))>=45
        and extensions.similarity(a.norm_stem,b.norm_stem)>=0.55
      )
    )
), edges as (
  select left_id,right_id from edge_source
  union all
  select right_id,left_id from edge_source
), reach(start_id,node_id) as (
  select id,id from published
  union
  select r.start_id,e.right_id
  from reach r
  join edges e on e.left_id=r.node_id
), labels as (
  select node_id,min(start_id::text)::uuid as component_id
  from reach
  group by node_id
), grouped as (
  select
    l.component_id,
    count(*)::integer as member_count,
    min(p.rn)::integer as first_position,
    max(p.rn)::integer as last_position,
    (array_agg(p.canonical_key order by p.rn))[1] as first_key,
    (array_agg(p.canonical_key order by p.rn desc))[1] as last_key
  from labels l
  join published p on p.id=l.node_id
  group by l.component_id
  having count(*)>1
)
select
  g.first_key,
  g.last_key,
  g.member_count,
  g.first_position,
  g.last_position,
  'series members occupy positions '
    ||g.first_position||'..'||g.last_position
    ||' but contain '||g.member_count||' question(s)' as detail
from grouped g
where g.last_position-g.first_position+1<>g.member_count
order by g.first_position,g.first_key;
$function$;

create or replace function public.qb_question_order_audit(p_unit_id uuid)
returns table(
  severity text,
  issue_type text,
  canonical_key text,
  peer_key text,
  detail text
)
language sql
stable
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
with ordered as (
  select
    q.id,
    q.canonical_key,
    q.study_order,
    row_number() over(order by q.study_order nulls last,q.created_at,q.id) as rn
  from public.questions q
  where q.unit_id=p_unit_id
), dupes as (
  select study_order
  from ordered
  where study_order is not null
  group by study_order
  having count(*)>1
), mechanical as (
  select
    'failure'::text as severity,
    case
      when o.study_order is null then 'missing_order'
      when d.study_order is not null then 'duplicate_order'
      when o.study_order<>o.rn*10 then 'noncanonical_sequence'
    end::text as issue_type,
    o.canonical_key,
    null::text as peer_key,
    case
      when o.study_order is null then 'study_order is null'
      when d.study_order is not null then 'study_order '||o.study_order||' is duplicated'
      else 'expected '||(o.rn*10)||', found '||o.study_order
    end::text as detail
  from ordered o
  left join dupes d using(study_order)
  where o.study_order is null
    or d.study_order is not null
    or o.study_order<>o.rn*10
), series as (
  select
    'warning'::text as severity,
    'separated_question_series'::text as issue_type,
    s.first_key as canonical_key,
    s.last_key as peer_key,
    s.detail
  from public.qb_question_series_order_violations(p_unit_id) s
)
select * from mechanical
union all
select * from series
order by severity,issue_type,canonical_key,peer_key;
$function$;

create temporary table tmp_geriatric_question_order on commit drop as
with recursive subject as (
  select id from public.subjects where slug='geriatric-medicine'
), published as (
  select
    q.id,
    q.unit_id,
    q.canonical_key,
    q.answer_mode,
    q.study_order,
    q.created_at,
    row_number() over(
      partition by q.unit_id
      order by q.study_order nulls last,q.created_at,q.id
    )::integer as rn,
    public.qb_order_normalized_stem(q.stem,q.answer_mode) as norm_stem
  from public.questions q
  join subject s on s.id=q.subject_id
  where q.status='published'
), edge_source as (
  select a.unit_id,a.id as left_id,b.id as right_id
  from published a
  join published b on b.unit_id=a.unit_id and b.id>a.id
  where length(a.norm_stem)>=12
    and length(b.norm_stem)>=12
    and a.norm_stem not in (
      '次のうち正しいのはどれか',
      '正しいのはどれか',
      '次のうち適切なのはどれか',
      '誤っているのはどれか'
    )
    and (
      a.norm_stem=b.norm_stem
      or extensions.similarity(a.norm_stem,b.norm_stem)>=0.82
      or (
        a.answer_mode='fill_blank'
        and b.answer_mode='fill_blank'
        and least(length(a.norm_stem),length(b.norm_stem))>=45
        and extensions.similarity(a.norm_stem,b.norm_stem)>=0.55
      )
    )
), edges as (
  select unit_id,left_id,right_id from edge_source
  union all
  select unit_id,right_id,left_id from edge_source
), reach(unit_id,start_id,node_id) as (
  select unit_id,id,id from published
  union
  select r.unit_id,r.start_id,e.right_id
  from reach r
  join edges e on e.unit_id=r.unit_id and e.left_id=r.node_id
), labels as (
  select unit_id,node_id,min(start_id::text)::uuid as component_id
  from reach
  group by unit_id,node_id
), clustered as (
  select
    p.id,
    p.unit_id,
    p.rn,
    min(p2.rn) over(partition by l.unit_id,l.component_id) as anchor_rn
  from published p
  join labels l on l.node_id=p.id
  join published p2 on p2.id=l.node_id
), published_ranked as (
  select
    c.id,
    c.unit_id,
    row_number() over(
      partition by c.unit_id
      order by c.anchor_rn,c.rn,c.id
    )::integer as final_rn
  from clustered c
), published_counts as (
  select unit_id,count(*)::integer as n
  from published_ranked
  group by unit_id
), hidden_ranked as (
  select
    q.id,
    q.unit_id,
    coalesce(pc.n,0)+row_number() over(
      partition by q.unit_id
      order by q.study_order nulls last,q.created_at,q.id
    )::integer as final_rn
  from public.questions q
  join subject s on s.id=q.subject_id
  left join published_counts pc on pc.unit_id=q.unit_id
  where q.status<>'published'
), final_order as (
  select * from published_ranked
  union all
  select * from hidden_ranked
)
select id,unit_id,final_rn*10 as study_order
from final_order;

update public.questions q
set study_order=o.study_order,updated_at=now()
from tmp_geriatric_question_order o
where q.id=o.id and q.study_order is distinct from o.study_order;

insert into public.qb_unit_order_reviews(
  unit_id,
  audit_fingerprint,
  question_count,
  boundary_count,
  concept_blocks,
  near_duplicate_warning_count,
  warnings_reviewed,
  review_note,
  reviewed_at
)
select
  u.id,
  public.qb_order_audit_fingerprint(u.id),
  qs.question_count,
  greatest(qs.question_count-1,0)::integer,
  coalesce(
    old.concept_blocks,
    case u.name
      when '高齢者の薬物療法' then
        '["薬物動態の加齢変化","処方・服薬支援・ポリファーマシー","薬剤有害事象","疾患別薬物療法"]'::jsonb
      when '内分泌・代謝' then
        '["加齢と内分泌","甲状腺","糖尿病","脂質異常症","電解質・代謝"]'::jsonb
      else jsonb_build_array(u.name)
    end
  ),
  audits.warning_count,
  true,
  coalesce(old.review_note||' ','')
    ||'2026-09-22：同一設問骨格で空欄・年度・選択肢だけが異なるシリーズを連続配置し、公開問題を先頭、非公開問題を末尾として10刻みへ再採番。',
  now()
from public.units u
join public.subjects s on s.id=u.subject_id and s.slug='geriatric-medicine'
left join public.qb_unit_order_reviews old on old.unit_id=u.id
cross join lateral (
  select count(*)::integer as question_count
  from public.questions q
  where q.unit_id=u.id
) qs
cross join lateral (
  select count(*) filter(where a.severity='warning')::integer as warning_count
  from public.qb_question_order_audit(u.id) a
) audits
on conflict(unit_id) do update set
  audit_fingerprint=excluded.audit_fingerprint,
  question_count=excluded.question_count,
  boundary_count=excluded.boundary_count,
  concept_blocks=excluded.concept_blocks,
  near_duplicate_warning_count=excluded.near_duplicate_warning_count,
  warnings_reviewed=excluded.warnings_reviewed,
  review_note=excluded.review_note,
  reviewed_at=excluded.reviewed_at;
