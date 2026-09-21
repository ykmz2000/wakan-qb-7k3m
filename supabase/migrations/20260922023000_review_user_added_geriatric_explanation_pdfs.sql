do $$
declare
  v_reviewed integer;
begin
  with targets as (
    select
      qi.*,
      q.study_order,
      q.stem,
      u.name as unit_name
    from public.question_images qi
    join public.questions q on q.id = qi.question_id
    join public.units u on u.id = q.unit_id
    join public.subjects s on s.id = q.subject_id
    where s.name = '高齢医学'
      and q.study_order in (50, 400, 430)
      and qi.placement = 'explanation_overview'
      and qi.choice_id is null
      and qi.image_path ~* '\.pdf$'
      and not exists (
        select 1
        from public.qb_question_image_relevance_reviews r
        where r.association_id = qi.id
      )
  ), upserted as (
    insert into public.qb_question_image_relevance_reviews (
      association_id,
      question_id,
      image_path,
      placement,
      decision,
      reason,
      association_snapshot,
      audit_batch,
      reviewed_at
    )
    select
      t.id,
      t.question_id,
      t.image_path,
      t.placement,
      'keep',
      case t.study_order
        when 50 then 'ユーザー追加PDFを実際に描画して確認。指輪っかテストは下腿周囲長を用いた筋肉量・サルコペニアの簡易評価を示し、正答の下腿最大周囲長を直接支える。'
        when 400 then 'ユーザー追加PDFを実際に描画して確認。骨代謝マーカーと骨粗鬆症治療薬の対応を整理しており、各選択肢の判別を直接支える。'
        when 430 then 'ユーザー追加PDFを実際に描画して確認。ビスホスホネートを含む骨粗鬆症治療薬の分類、作用、副作用を示し、設問を直接支える。'
      end,
      to_jsonb(t) - 'id' || jsonb_build_object('id', t.id),
      'geriatric_user_added_pdf_review_2026_09_22',
      now()
    from targets t
    on conflict (association_id) do update
    set question_id = excluded.question_id,
        image_path = excluded.image_path,
        placement = excluded.placement,
        decision = excluded.decision,
        reason = excluded.reason,
        association_snapshot = excluded.association_snapshot,
        audit_batch = excluded.audit_batch,
        reviewed_at = excluded.reviewed_at
    returning 1
  )
  select count(*) into v_reviewed from upserted;

  if v_reviewed <> 3 then
    raise exception 'Expected exactly 3 unreviewed user-added geriatric PDFs, reviewed %', v_reviewed;
  end if;
end
$$;
