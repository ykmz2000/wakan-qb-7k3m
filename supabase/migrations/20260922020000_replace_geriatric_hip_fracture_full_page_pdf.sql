do $$
declare
  v_question_id uuid;
  v_image_id uuid;
  v_removed integer;
begin
  select q.id into strict v_question_id
  from public.questions q
  where q.subject_id = '189f5813-caf7-46aa-b0cb-3a1280e5364c'
    and q.study_order = 340
    and q.stem like '%病変は（a）側の（b）骨折である。%';

  select qi.id into strict v_image_id
  from public.question_images qi
  where qi.question_id = v_question_id
    and qi.placement = 'question'
    and qi.choice_id is null
    and qi.image_path !~* '\.pdf$'
  order by qi.created_at desc
  limit 1;

  update public.question_images
  set original_image_path = coalesce(original_image_path, 'geriatric-medicine/exams/2023-main/page-10.pdf'),
      sort_order = 0,
      updated_at = now()
  where id = v_image_id;

  delete from public.question_images
  where question_id = v_question_id
    and placement = 'question'
    and choice_id is null
    and image_path = 'geriatric-medicine/exams/2023-main/page-10.pdf';

  get diagnostics v_removed = row_count;
  if v_removed <> 1 then
    raise exception 'Expected one full-page source PDF relation, removed %', v_removed;
  end if;
end
$$;
