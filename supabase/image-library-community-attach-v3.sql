create or replace function public.qb_library_attach(p_id uuid,p_revision integer,p_question_id uuid,p_placement text,p_choice_id uuid,p_copy_path text,p_request_id uuid)
returns public.qb_image_library_usages language plpgsql security invoker set search_path='' as $$
declare r public.qb_image_library_items; u public.qb_image_library_usages; tail integer; new_id uuid;
begin
 perform public.qb_library_assert_admin();
 -- Serializes retries for one request, including a lost success response.
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select * into u from public.qb_image_library_usages where id=p_request_id;
 if found then
  if u.image_id<>p_id or u.question_id<>p_question_id or u.placement<>p_placement or u.choice_id is distinct from p_choice_id or u.initial_copy_path<>p_copy_path then raise exception '再試行の保存先が一致しません';end if;return u;
 end if;
 select * into r from public.qb_image_library_items where id=p_id and not archived;
 -- Immutable source paths let readers copy this checked version without taking
 -- an UPDATE row lock (which would require ownership of the shared image).
 if not found or r.revision<>p_revision then raise exception '原本が更新されています。最新画像を確認してください' using errcode='40001';end if;
 perform 1 from public.questions where id=p_question_id for update;
 if not found then raise exception '貼り付け先の問題が見つかりません';end if;
 if p_placement is null or p_placement not in ('question','choice','explanation_overview','choice_explanation','examiner_intent','exam_summary','medical_verification') then raise exception '貼り付け先が不正です';end if;
 if (p_placement in ('choice','choice_explanation'))<>(p_choice_id is not null) then raise exception '選択肢の指定が一致しません';end if;
 if p_choice_id is not null and not exists(select 1 from public.choices where id=p_choice_id and question_id=p_question_id) then raise exception '選択肢が問題と一致しません';end if;
 if p_copy_path is null or p_copy_path !~ '\.(png|jpg|webp|gif|heic|heif)$' or p_copy_path not like p_question_id::text||'/'||p_placement||'/'||coalesce(p_choice_id::text,'question')||'/library-'||p_request_id::text||'.%' then raise exception '独立コピーの保存先が不正です';end if;
 if p_copy_path=r.object_path or not exists(select 1 from storage.objects where bucket_id='question-media' and name=p_copy_path) then raise exception '独立コピーの保存を確認できません';end if;
 select coalesce(max(sort_order),0)+10 into tail from public.question_images where question_id=p_question_id and placement=p_placement and choice_id is not distinct from p_choice_id;
 insert into public.question_images(question_id,placement,choice_id,image_path,sort_order)
 values(p_question_id,p_placement,p_choice_id,p_copy_path,tail) returning id into new_id;
 insert into public.qb_image_library_usages(id,image_id,image_version,source_revision,source_name,question_image_id,question_id,placement,choice_id,initial_copy_path)
 values(p_request_id,p_id,r.image_version,r.revision,coalesce(r.metadata->>'name','画像'),new_id,p_question_id,p_placement,p_choice_id,p_copy_path) returning * into u;
 return u;
end $$;
