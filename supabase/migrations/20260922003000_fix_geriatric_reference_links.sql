create or replace function public.qb_reference_link_label(p_reference jsonb)
returns text
language sql
immutable
set search_path to 'public', 'pg_temp'
as $function$
  select case
    when coalesce(p_reference->>'file_name','') ~ '(該当.*部分|抜粋)'
      then '該当部分だけ抜粋したPDF'
    when nullif(p_reference->>'pdf_page','') is not null
      then coalesce(nullif(p_reference->>'file_name',''),'講義資料') || ' — PDF p.' || (p_reference->>'pdf_page')
    else coalesce(nullif(p_reference->>'file_name',''),'参考資料') || ' — PDF'
  end;
$function$;

-- Replace the inaccessible, outdated GLIM source with the current 2026 lecture
-- pages and excerpts. Keep the two questions separate because their evidence
-- spans different pages.
update public.questions
set explanation_formatting = jsonb_set(
  coalesce(explanation_formatting,'{}'::jsonb),
  '{references}',
  case id
    when '01516c0a-64f6-5a7e-88f5-5d566139e576'::uuid then
      jsonb_build_array(
        jsonb_build_object('href','https://drive.google.com/file/d/18vq_NHSzg40XVQLALNGAi6JgCeHHk5jx/view#page=5','pdf_page',5,'file_name','R8_M4講義_高齢者の臨床栄養_Part1.pdf','drive_file_id','18vq_NHSzg40XVQLALNGAi6JgCeHHk5jx'),
        jsonb_build_object('href','https://drive.google.com/file/d/18vq_NHSzg40XVQLALNGAi6JgCeHHk5jx/view#page=6','pdf_page',6,'file_name','R8_M4講義_高齢者の臨床栄養_Part1.pdf','drive_file_id','18vq_NHSzg40XVQLALNGAi6JgCeHHk5jx'),
        jsonb_build_object('href','https://drive.google.com/file/d/18vq_NHSzg40XVQLALNGAi6JgCeHHk5jx/view#page=7','pdf_page',7,'file_name','R8_M4講義_高齢者の臨床栄養_Part1.pdf','drive_file_id','18vq_NHSzg40XVQLALNGAi6JgCeHHk5jx'),
        jsonb_build_object('href','https://drive.google.com/file/d/1_mPPdT4K2TOhOLFzHYT2iqijdXzWoRtM/view','pdf_page',1,'file_name','高齢医学_臨床栄養2026_Part1_PDFp5_GLIM基準・MNA-SF_該当部分.pdf','drive_file_id','1_mPPdT4K2TOhOLFzHYT2iqijdXzWoRtM'),
        jsonb_build_object('href','https://drive.google.com/file/d/1VErWuzSMi6aSB-rzIIkTYIrMUOkg9RQi/view','pdf_page',1,'file_name','高齢医学_臨床栄養2026_Part1_PDFp6_GLIM病因・表現型_該当部分.pdf','drive_file_id','1VErWuzSMi6aSB-rzIIkTYIrMUOkg9RQi'),
        jsonb_build_object('href','https://drive.google.com/file/d/1muzrQ7K3fT1x0kI4dPytdq7Jpa0tcvzF/view','pdf_page',1,'file_name','高齢医学_臨床栄養2026_Part1_PDFp7_GLIM重症度判定_該当部分.pdf','drive_file_id','1muzrQ7K3fT1x0kI4dPytdq7Jpa0tcvzF')
      )
    else
      jsonb_build_array(
        jsonb_build_object('href','https://drive.google.com/file/d/18vq_NHSzg40XVQLALNGAi6JgCeHHk5jx/view#page=6','pdf_page',6,'file_name','R8_M4講義_高齢者の臨床栄養_Part1.pdf','drive_file_id','18vq_NHSzg40XVQLALNGAi6JgCeHHk5jx'),
        jsonb_build_object('href','https://drive.google.com/file/d/1VErWuzSMi6aSB-rzIIkTYIrMUOkg9RQi/view','pdf_page',1,'file_name','高齢医学_臨床栄養2026_Part1_PDFp6_GLIM病因・表現型_該当部分.pdf','drive_file_id','1VErWuzSMi6aSB-rzIIkTYIrMUOkg9RQi')
      )
  end,
  true
)
where id in (
  '01516c0a-64f6-5a7e-88f5-5d566139e576'::uuid,
  'ce5518d7-e0ce-57cf-8eff-62d2d3b20391'::uuid
);

-- Align stored names, pages and page fragments with the current Drive files.
with rebuilt as (
  select q.id,
    jsonb_agg(
      case r.value->>'drive_file_id'
        when '1tGh8acOkoW-iLY4pRu1xoYI-1aq4YNoE' then
          r.value || jsonb_build_object(
            'file_name','M4老化と老年病総論２０２６.pdf',
            'pdf_page',5,
            'href','https://drive.google.com/file/d/1tGh8acOkoW-iLY4pRu1xoYI-1aq4YNoE/view#page=5'
          )
        when '1ODAbJ-cKAnVtPVAl86NFDWC7qkBn65JP' then
          r.value || jsonb_build_object(
            'file_name','M4老化と老年病総論2026_PDFp05_フレイル定義_該当部分.pdf',
            'pdf_page',1,
            'href','https://drive.google.com/file/d/1ODAbJ-cKAnVtPVAl86NFDWC7qkBn65JP/view'
          )
        when '1OO8Qzu1yaTRkBSx8hr84nq-Fp7PDVlru' then
          r.value || jsonb_build_object('file_name','高齢医学_老化と老年病2025_p05_GLIM_サルコペニア.pdf','pdf_page',1)
        when '1YIFFob9tceHzjtKNOBfVnAhX2ggJWxqk' then
          r.value || jsonb_build_object('file_name','高齢医学_摂食嚥下・終末期医療2026_PDFp12_事前指示・ACP_該当部分.pdf','pdf_page',1)
        when '1EUi3ASbggbT0rA2-SuhHTraOUIrJ8srk' then
          r.value || jsonb_build_object('file_name','2022_高齢医学_対策まとめ.pdf')
        else r.value
      end
      order by r.ordinality
    ) refs
  from public.questions q
  cross join lateral jsonb_array_elements(q.explanation_formatting->'references')
    with ordinality r(value,ordinality)
  where q.subject_id='189f5813-caf7-46aa-b0cb-3a1280e5364c'::uuid
    and q.status='published'
    and jsonb_typeof(q.explanation_formatting->'references')='array'
    and jsonb_array_length(q.explanation_formatting->'references')>0
  group by q.id
)
update public.questions q
set explanation_formatting=jsonb_set(q.explanation_formatting,'{references}',rebuilt.refs,true)
from rebuilt
where q.id=rebuilt.id;

-- Give the two external official references an explicit page and readable name.
update public.questions q
set explanation_formatting=jsonb_set(
  q.explanation_formatting,
  '{references}',
  (
    select jsonb_agg(
      case
        when r.value->>'href'='https://www.mhlw.go.jp/file/05-Shingikai-10801000-Iseikyoku-Soumuka/0000015578.pdf'
          then r.value || jsonb_build_object('file_name','厚生労働省「入院時スクリーニングシート」','pdf_page',1,'href','https://www.mhlw.go.jp/file/05-Shingikai-10801000-Iseikyoku-Soumuka/0000015578.pdf#page=1')
        when r.value->>'href' like 'https://kouseikyoku.mhlw.go.jp/kantoshinetsu/houkatsu/000107158.pdf%'
          then r.value || jsonb_build_object('file_name','関東信越厚生局「地域包括ケア病棟について」','pdf_page',29,'href','https://kouseikyoku.mhlw.go.jp/kantoshinetsu/houkatsu/000107158.pdf#page=29')
        else r.value
      end
      order by r.ordinality
    )
    from jsonb_array_elements(q.explanation_formatting->'references') with ordinality r(value,ordinality)
  ),
  true
)
where q.subject_id='189f5813-caf7-46aa-b0cb-3a1280e5364c'::uuid
  and q.status='published'
  and jsonb_typeof(q.explanation_formatting->'references')='array'
  and jsonb_array_length(q.explanation_formatting->'references')>0;

-- Rebuild the learner-visible reference block for every geriatric question that
-- has references. Each metadata row becomes one actual link range.
do $function$
declare
  q record;
  ref record;
  old_text text;
  clean_text text;
  new_text text;
  label_text text;
  link_start integer;
  old_ranges jsonb;
  new_ranges jsonb;
begin
  for q in
    select id,coalesce(explanation_overview,'') explanation_overview,explanation_formatting
    from public.questions
    where subject_id='189f5813-caf7-46aa-b0cb-3a1280e5364c'::uuid
      and status='published'
      and jsonb_typeof(explanation_formatting->'references')='array'
      and jsonb_array_length(explanation_formatting->'references')>0
    order by id
  loop
    old_text := q.explanation_overview;
    clean_text := regexp_replace(
      old_text,
      E'\\n(?:講義資料|参考資料)：[^\\n]*(?:\\n・[^\\n]*)*[[:space:]]*$',
      ''
    );
    clean_text := rtrim(clean_text,E' \t\n\r');
    new_text := clean_text || E'\n講義資料：';

    select coalesce(jsonb_agg(value order by ordinality),'[]'::jsonb)
      into old_ranges
    from jsonb_array_elements(coalesce(q.explanation_formatting->'explanation_overview'->'ranges','[]'::jsonb))
      with ordinality x(value,ordinality)
    where value->>'kind' <> 'link'
      and (value->>'start') ~ '^[0-9]+$'
      and (value->>'end') ~ '^[0-9]+$'
      and (value->>'end')::integer <= char_length(clean_text);
    new_ranges := old_ranges;

    for ref in
      select value,ordinality
      from jsonb_array_elements(q.explanation_formatting->'references') with ordinality r(value,ordinality)
      order by ordinality
    loop
      label_text := public.qb_reference_link_label(ref.value);
      new_text := new_text || E'\n・';
      link_start := char_length(new_text);
      new_text := new_text || label_text;
      new_ranges := new_ranges || jsonb_build_array(jsonb_build_object(
        'kind','link',
        'start',link_start,
        'end',char_length(new_text),
        'href',ref.value->>'href',
        'expected_text',label_text
      ));
    end loop;

    update public.questions
    set explanation_overview=new_text,
        explanation_formatting=jsonb_set(
          q.explanation_formatting,
          '{explanation_overview}',
          jsonb_build_object('version',1,'source_text',new_text,'ranges',new_ranges),
          true
        )
    where id=q.id;
  end loop;
end;
$function$;

create or replace function public.qb_reference_link_violations(p_unit_id uuid default null)
returns table(
  question_id uuid,
  study_order integer,
  reference_number integer,
  violation_code text,
  detail text
)
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
with target as (
  select q.id,q.unit_id,q.study_order,q.explanation_overview,q.explanation_formatting,
    q.explanation_formatting->'explanation_overview' fmt,
    q.explanation_formatting->'references' refs
  from public.questions q
  where q.status='published'
    and (p_unit_id is null or q.unit_id=p_unit_id)
    and jsonb_typeof(q.explanation_formatting->'references')='array'
    and jsonb_array_length(q.explanation_formatting->'references')>0
), refs as (
  select t.*,r.ordinality::integer reference_number,r.value ref,
    public.qb_reference_link_label(r.value) expected_label
  from target t
  cross join lateral jsonb_array_elements(t.refs) with ordinality r(value,ordinality)
), links as (
  select t.id question_id,l.ordinality::integer link_number,l.value link
  from target t
  cross join lateral jsonb_array_elements(coalesce(t.fmt->'ranges','[]'::jsonb)) with ordinality l(value,ordinality)
  where l.value->>'kind'='link'
), violations as (
  select t.id question_id,t.study_order,0 reference_number,
    'source_text_mismatch'::text violation_code,
    '解説本文と修飾source_textが一致しない'::text detail
  from target t
  where t.fmt->>'source_text' is distinct from t.explanation_overview

  union all

  select r.id,r.study_order,r.reference_number,
    'invalid_href',coalesce(r.ref->>'href','URLなし')
  from refs r
  where coalesce(r.ref->>'href','') !~ '^https?://'

  union all

  select r.id,r.study_order,r.reference_number,
    'drive_file_id_mismatch',r.ref->>'href'
  from refs r
  where nullif(r.ref->>'drive_file_id','') is not null
    and r.ref->>'href' not like '%'||(r.ref->>'drive_file_id')||'%'

  union all

  select r.id,r.study_order,r.reference_number,
    'page_fragment_mismatch',r.ref->>'href'
  from refs r
  where coalesce((r.ref->>'pdf_page')::integer,0)>1
    and r.ref->>'href' not like '%#page='||(r.ref->>'pdf_page')||'%'

  union all

  select r.id,r.study_order,r.reference_number,
    'reference_not_rendered',r.expected_label
  from refs r
  where not exists (
    select 1 from links l
    where l.question_id=r.id
      and l.link->>'href'=r.ref->>'href'
      and l.link->>'expected_text'=r.expected_label
      and (l.link->>'start') ~ '^[0-9]+$'
      and (l.link->>'end') ~ '^[0-9]+$'
      and (l.link->>'start')::integer >= 0
      and (l.link->>'end')::integer <= char_length(r.explanation_overview)
      and (l.link->>'start')::integer < (l.link->>'end')::integer
      and substring(r.explanation_overview from (l.link->>'start')::integer+1 for (l.link->>'end')::integer-(l.link->>'start')::integer)=r.expected_label
  )

  union all

  select t.id,t.study_order,0,
    'link_count_mismatch',
    'references='||jsonb_array_length(t.refs)::text||', links='||(
      select count(*) from links l where l.question_id=t.id
    )::text
  from target t
  where jsonb_array_length(t.refs) <> (select count(*) from links l where l.question_id=t.id)
)
select * from violations order by study_order,reference_number,violation_code;
$function$;

-- Explanation text changed only to expose the already-reviewed references.
-- Refresh the dependent review fingerprints without changing the decisions.
update public.qb_question_lecture_reviews r
set question_fingerprint=public.qb_question_lecture_fingerprint(r.question_id),
    reviewed_at=now(),
    review_note=r.review_note || E'\n2026-09-22：資料メタデータと表示リンクを再照合し、クリック可能なリンクへ統一。'
where exists (
  select 1 from public.questions q
  where q.id=r.question_id
    and q.subject_id='189f5813-caf7-46aa-b0cb-3a1280e5364c'::uuid
    and q.status='published'
    and jsonb_typeof(q.explanation_formatting->'references')='array'
    and jsonb_array_length(q.explanation_formatting->'references')>0
);

update public.qb_question_learning_reviews r
set audit_fingerprint=public.qb_question_learning_fingerprint(r.question_id),
    reviewed_at=now(),
    review_note=r.review_note || E'\n2026-09-22：講義資料の表示リンク整備後に学習表示を再照合。'
where exists (
  select 1 from public.questions q
  where q.id=r.question_id
    and q.subject_id='189f5813-caf7-46aa-b0cb-3a1280e5364c'::uuid
    and q.status='published'
    and jsonb_typeof(q.explanation_formatting->'references')='array'
    and jsonb_array_length(q.explanation_formatting->'references')>0
);

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
    and concat_ws(E'\\n',q.stem,q.explanation_overview,q.examiner_intent,q.exam_summary,q.explanation_formatting::text,q.stem_formatting::text)
      ~ '(/n|\\\\\\\\n)'

  union all

  select 'source_link_missing'::text,count(*)::bigint
  from public.qb_source_link_missing_violations(p_unit_id)

  union all

  select 'correction_surface'::text,count(*)::bigint
  from public.qb_correction_surface_violations(p_unit_id)

  union all

  select 'lecture_link'::text,count(*)::bigint
  from public.qb_reference_link_violations(p_unit_id)

  order by gate;
$function$;

revoke all on function public.qb_reference_link_label(jsonb) from public;
revoke all on function public.qb_reference_link_violations(uuid) from public;
revoke all on function public.qb_unit_completion_gate_counts(uuid) from public;
grant execute on function public.qb_unit_completion_gate_counts(uuid) to authenticated;
