-- Some older geriatric explanations contained working inline links but lacked
-- the references array used by the current audit. Import those links first so
-- they cannot disappear from the learner-visible reference block.
with target as (
  select q.id,q.explanation_overview,q.explanation_formatting,
    q.explanation_formatting->'explanation_overview'->'ranges' ranges
  from public.questions q
  where q.subject_id='189f5813-caf7-46aa-b0cb-3a1280e5364c'::uuid
    and q.status='published'
    and q.explanation_overview ~ '(講義資料|参考資料)：'
    and not coalesce(
      jsonb_typeof(q.explanation_formatting->'references')='array'
      and jsonb_array_length(q.explanation_formatting->'references')>0,
      false
    )
), raw_links as (
  select t.id,t.explanation_overview,l.ordinality,
    l.value,
    l.value->>'href' old_href,
    substring(l.value->>'href' from '/d/([^/]+)') drive_file_id,
    substring(
      t.explanation_overview
      from (l.value->>'start')::integer+1
      for (l.value->>'end')::integer-(l.value->>'start')::integer
    ) link_text
  from target t
  cross join lateral jsonb_array_elements(coalesce(t.ranges,'[]'::jsonb))
    with ordinality l(value,ordinality)
  where l.value->>'kind'='link'
    and (l.value->>'start') ~ '^[0-9]+$'
    and (l.value->>'end') ~ '^[0-9]+$'
), resolved as (
  select r.*,
    case r.drive_file_id
      when '1_DwChLnvyUW4BUNj5XRgD7SU0NiynONN' then 'M4老化と老年病総論2025_p5_指輪っかテスト・サルコペニア_該当部分.pdf'
      when '1-VoOMlOibW0Rles4euV8_tbTq7g4OCyO' then 'M4老化と老年病総論2026_PDFp07_フレイル・サルコペニア_該当部分.pdf'
      when '1238DJnVyOc3JkKzWZjresUldP8Ylorft' then '高齢者の総合的機能評価と介護2026_PDFp05_福祉用具・住宅改修_該当部分.pdf'
      when '13laS3GGcyZo7x2mUXY6ClBO-IWfHMCfU' then '高齢者の総合的機能評価と介護2026_PDFp06_CGA評価項目_該当部分.pdf'
      when '1BdC1syfvL5nxFGq8sl53h9MjEAu_INNn' then '高齢者の総合的機能評価と介護2026_PDFp03_介護保険申請窓口_該当部分.pdf'
      when '1DSuNlb1Lvk63lXSwo22ZCfSN0iJDQgc_' then '老化と老年病2025_p3_尿失禁_該当部分.pdf'
      when '1dv2Hx_AGXvRUeTqMTUa6pJTHFKVzPIK1' then '高齢者の総合的機能評価と介護2026_PDFp09_認知機能・MMSE_該当部分.pdf'
      when '1HpLHWBGBAdKbp6ddh0zGPFrmTY1AuQF0' then '高齢医学_2022まとめ_p03_CGA_介護保険_チーム医療.pdf'
      when '1Ips6d8wfulA3uK4Oa0lsjpZot_tDlHMI' then '高齢者の総合的機能評価と介護2026_PDFp07_基本的ADL・手段的ADL_該当部分.pdf'
      when '1jT0rGTagc6G6X9NgLEuOzG9E7PhDLFzI' then 'M4老化と老年病総論2026_PDFp06_サルコペニア診断_該当部分.pdf'
      when '1ODAbJ-cKAnVtPVAl86NFDWC7qkBn65JP' then 'M4老化と老年病総論2026_PDFp05_フレイル定義_該当部分.pdf'
      when '1Tc8QiMqH5ZR1B3mTqhFfIVk9QUBPQfvz' then 'M4高齢者の総合的機能評価と介護2026.pdf'
      when '1tGh8acOkoW-iLY4pRu1xoYI-1aq4YNoE' then 'M4老化と老年病総論２０２６.pdf'
      when '1udGkAkYYGXBczFwtHotl9RTLj4GU7Ye-' then '高齢者の総合的機能評価と介護2026_PDFp08_寝たきり度_該当部分.pdf'
      when '1vpLVGF5L8D6wVj1A7Fjp51helyIP6zui' then 'M4老化と老年病総論2026_p4_腎機能の加齢変化_該当部分.pdf'
      when '1yhztkQLB87wv1uQYoAsgLP1Q6xigsgtU' then '高齢者の総合的機能評価と介護2026_PDFp11_退院支援・多職種協働_該当部分.pdf'
      when '1znPVAv8obOBDRURTrfqnbTutmInuc7Q1' then '老化と老年病2025資料.pdf'
      when '1ZQB4cApo3B2QllVPj73xfzdJBx7tJ3qj' then '高齢者の総合的機能評価と介護2026_PDFp04_介護サービス_該当部分.pdf'
      when '1EUi3ASbggbT0rA2-SuhHTraOUIrJ8srk' then '2022_高齢医学_対策まとめ.pdf'
      else null
    end file_name,
    r.drive_file_id in (
      '1_DwChLnvyUW4BUNj5XRgD7SU0NiynONN','1-VoOMlOibW0Rles4euV8_tbTq7g4OCyO',
      '1238DJnVyOc3JkKzWZjresUldP8Ylorft','13laS3GGcyZo7x2mUXY6ClBO-IWfHMCfU',
      '1BdC1syfvL5nxFGq8sl53h9MjEAu_INNn','1DSuNlb1Lvk63lXSwo22ZCfSN0iJDQgc_',
      '1dv2Hx_AGXvRUeTqMTUa6pJTHFKVzPIK1','1HpLHWBGBAdKbp6ddh0zGPFrmTY1AuQF0',
      '1Ips6d8wfulA3uK4Oa0lsjpZot_tDlHMI','1jT0rGTagc6G6X9NgLEuOzG9E7PhDLFzI',
      '1ODAbJ-cKAnVtPVAl86NFDWC7qkBn65JP','1udGkAkYYGXBczFwtHotl9RTLj4GU7Ye-',
      '1vpLVGF5L8D6wVj1A7Fjp51helyIP6zui','1yhztkQLB87wv1uQYoAsgLP1Q6xigsgtU',
      '1ZQB4cApo3B2QllVPj73xfzdJBx7tJ3qj'
    ) is_excerpt,
    coalesce(
      nullif(substring(r.old_href from '#page=([0-9]+)'),'')::integer,
      nullif(substring(r.link_text from '(?:PDF )?p[.]([0-9]+)'),'')::integer,
      1
    ) source_page
  from raw_links r
), built as (
  select id,jsonb_agg(
    jsonb_build_object(
      'href',case when is_excerpt then old_href else regexp_replace(old_href,'#page=[0-9]+$','')||'#page='||source_page::text end,
      'pdf_page',case when is_excerpt then 1 else source_page end,
      'file_name',file_name,
      'drive_file_id',drive_file_id
    ) order by ordinality
  ) refs
  from resolved
  where file_name is not null
  group by id
)
update public.questions q
set explanation_formatting=jsonb_set(coalesce(q.explanation_formatting,'{}'::jsonb),'{references}',b.refs,true)
from built b
where q.id=b.id;

-- Standardize all newly imported reference blocks and regenerate exact link
-- ranges, including expected_text and corrected page fragments.
do $function$
declare
  q record;
  ref record;
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
      and explanation_overview ~ '(講義資料|参考資料)：'
    order by id
  loop
    clean_text := regexp_replace(
      q.explanation_overview,
      E'\\n(?:講義資料|参考資料)：(.|\\n)*$',
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
        'kind','link','start',link_start,'end',char_length(new_text),
        'href',ref.value->>'href','expected_text',label_text
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

update public.qb_question_lecture_reviews r
set question_fingerprint=public.qb_question_lecture_fingerprint(r.question_id),reviewed_at=now(),
    review_note=r.review_note || E'\n2026-09-22：旧形式の資料リンクを参照メタデータへ移行し、表示名・ページ・hrefを再照合。'
where exists (
  select 1 from public.questions q where q.id=r.question_id
  and q.subject_id='189f5813-caf7-46aa-b0cb-3a1280e5364c'::uuid
  and q.status='published'
  and jsonb_typeof(q.explanation_formatting->'references')='array'
  and jsonb_array_length(q.explanation_formatting->'references')>0
);

update public.qb_question_learning_reviews r
set audit_fingerprint=public.qb_question_learning_fingerprint(r.question_id),reviewed_at=now(),
    review_note=r.review_note || E'\n2026-09-22：旧形式の資料リンク移行後に学習表示を再照合。'
where exists (
  select 1 from public.questions q where q.id=r.question_id
  and q.subject_id='189f5813-caf7-46aa-b0cb-3a1280e5364c'::uuid
  and q.status='published'
  and jsonb_typeof(q.explanation_formatting->'references')='array'
  and jsonb_array_length(q.explanation_formatting->'references')>0
);
