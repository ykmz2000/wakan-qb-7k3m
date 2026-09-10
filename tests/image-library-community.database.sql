-- Permission and preservation checks. All fixtures are rolled back.
begin;
select set_config('qb.test_admin',(select id::text from public.profiles where role='admin' limit 1),true);
select set_config('qb.test_owner',gen_random_uuid()::text,true);
select set_config('qb.test_image',gen_random_uuid()::text,true);
select set_config('qb.test_set',gen_random_uuid()::text,true);
select set_config('request.jwt.claim.sub',current_setting('qb.test_owner'),true);
set local role authenticated;
do $test$
declare r public.qb_image_library_items; path text=current_setting('qb.test_image')||'/'||gen_random_uuid()||'.png';
begin
 if public.is_admin() then raise exception 'Expected ordinary contributor';end if;
 perform public.qb_library_assert_member();
 insert into storage.objects(bucket_id,name,owner_id) values('qb-image-library',path,auth.uid()::text);
 insert into public.qb_image_library_items(id,object_path,original_path,metadata) values(current_setting('qb.test_image')::uuid,path,path,'{"name":"投稿者のタイトル"}') returning * into r;
 r=public.qb_library_save(r.id,r.revision,'{"name":"手動タイトル"}');
 r=public.qb_library_record_reading(r.id,r.revision,r.image_version,gen_random_uuid(),'{"raw_text":"fixture本文","corrected_text":"fixture本文","visual_summary":"図の意味","repairs":[]}','{"name":"AIタイトル","roles":["語呂合わせ"],"classification_status":"classified"}');
 if r.metadata->>'name'<>'手動タイトル' or r.metadata->>'ocr_text'<>'fixture本文' or r.ai_suggestions->'name'->>'value'<>'AIタイトル' then raise exception 'Manual preservation';end if;
 insert into public.qb_image_library_sets(id,name,image_ids) values(current_setting('qb.test_set')::uuid,'本人のセット',array[r.id]);
 if not exists(select 1 from public.qb_library_search_v2(p_query=>'fixture本文')) then raise exception 'Member search';end if;
 begin update public.qb_image_library_items set created_by=gen_random_uuid() where id=r.id;raise exception 'Owner reassignment accepted';exception when insufficient_privilege then null;end;
 begin update public.qb_image_library_sets set created_by=gen_random_uuid(),revision=revision+1 where id=current_setting('qb.test_set')::uuid;raise exception 'Set reassignment accepted';exception when insufficient_privilege then null;end;
 if (select count(*) from public.qb_image_library_history where image_id=r.id)<>3 then raise exception 'History missing';end if;
end $test$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('qb.test_admin'),true);
set local role authenticated;
do $test$
declare r public.qb_image_library_items; n integer; q uuid; request uuid=gen_random_uuid(); copy_path text; u public.qb_image_library_usages;
begin
 select * into r from public.qb_image_library_items where id=current_setting('qb.test_image')::uuid;
 if not found then raise exception 'Shared read failed';end if;
 if not exists(select 1 from storage.objects where bucket_id='qb-image-library' and name=r.object_path) then raise exception 'Shared original read failed';end if;
 update public.qb_image_library_items set metadata='{}' where id=r.id;get diagnostics n=row_count;if n<>0 then raise exception 'Nonowner admin edit accepted';end if;
 update public.qb_image_library_sets set name='bad',revision=revision+1 where id=current_setting('qb.test_set')::uuid;get diagnostics n=row_count;if n<>0 then raise exception 'Nonowner set edit accepted';end if;
 begin perform public.qb_library_save(r.id,r.revision,'{"name":"bad"}');raise exception 'Nonowner RPC accepted';exception when insufficient_privilege then null;when raise_exception then if sqlerrm<>'画像が見つかりません' then raise;end if;end;
 begin perform public.qb_library_record_reading(r.id,r.revision,r.image_version,gen_random_uuid(),'{"raw_text":"bad","corrected_text":"bad"}');raise exception 'Nonowner reading accepted';exception when insufficient_privilege then null;when raise_exception then if sqlerrm<>'画像が見つかりません' then raise;end if;end;
 begin insert into storage.objects(bucket_id,name,owner_id) values('qb-image-library',r.id||'/'||gen_random_uuid()||'.png',auth.uid()::text);raise exception 'Foreign folder upload accepted';exception when insufficient_privilege then null;end;
 begin insert into public.qb_image_library_items(id,object_path,original_path) values(gen_random_uuid(),r.object_path,r.object_path);raise exception 'Foreign object adopted';exception when raise_exception then if sqlerrm<>'原本の保存先が不正です' then raise;end if;end;
 if exists(select 1 from public.qb_image_library_history where image_id=r.id) then raise exception 'Foreign edit history leaked';end if;
 select id into q from public.questions limit 1;copy_path=q||'/question/question/library-'||request||'.png';
 insert into storage.objects(bucket_id,name,owner_id) values('question-media',copy_path,auth.uid()::text);
 u=public.qb_library_attach(r.id,r.revision,q,'question',null,copy_path,request);
 if not exists(select 1 from public.question_images where id=u.question_image_id and image_path=copy_path) then raise exception 'Shared attach failed';end if;
end $test$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('qb.test_owner'),true);
set local role authenticated;
do $test$
declare r public.qb_image_library_items;
begin
 select * into r from public.qb_image_library_items where id=current_setting('qb.test_image')::uuid;
 r=public.qb_library_save(r.id,r.revision,'{}','manual','fixture archive',true);
 if not exists(select 1 from public.qb_library_search_v2(p_archived=>true) where item->>'id'=r.id::text) then raise exception 'Own archive unavailable';end if;
 begin perform public.qb_library_attach(r.id,r.revision,gen_random_uuid(),'question',null,'bad',gen_random_uuid());raise exception 'Member gained official editing';exception when insufficient_privilege then null;end;
end $test$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('qb.test_admin'),true);
set local role authenticated;
do $test$ begin
 if exists(select 1 from public.qb_image_library_items where id=current_setting('qb.test_image')::uuid) then raise exception 'Foreign archive visible';end if;
 if public.qb_library_can_upload(current_setting('qb.test_image')||'/'||gen_random_uuid()||'.png') then raise exception 'Foreign archived folder upload accepted';end if;
end $test$;
reset role;
set local role anon;
do $test$ begin
 begin perform public.qb_library_search_v2();raise exception 'Anonymous search allowed';exception when insufficient_privilege then null;end;
 begin perform public.qb_library_authors('{}');raise exception 'Anonymous profiles allowed';exception when insufficient_privilege then null;end;
end $test$;
reset role;
rollback;
select 'community permission checks passed; fixtures rolled back' result;
