-- Run after image-library-v1.sql. Every fixture is rolled back, including Storage
-- metadata rows used only to exercise the atomic registration boundary.
begin;
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where role='admin' limit 1),true);
set local role authenticated;
do $test$
declare r public.qb_image_library_items; other public.qb_image_library_items;
 u public.qb_image_library_usages; u2 public.qb_image_library_usages;
 q uuid; request uuid=gen_random_uuid(); reading_request uuid=gen_random_uuid(); subject_ids_json jsonb;
 copy_path text; old_path text; n integer; v_term_id uuid;
begin
 if not public.is_admin() then raise exception 'Fixture admin unavailable';end if;
 select jsonb_agg(id) into subject_ids_json from (select id from public.subjects order by id limit 2) x;
 r.id=gen_random_uuid();old_path=r.id||'/original.png';
 insert into public.qb_image_library_items(id,object_path,original_path,metadata)
 values(r.id,old_path,old_path,jsonb_build_object('name','総まとめ fixture','subject_ids',subject_ids_json,'topics',array['眼球運動'],'ocr_text','動眼神経を本文で説明','analysis_status','unprocessed','classification_status','classified')) returning * into r;
 if r.revision<>1 or r.image_version<>1 then raise exception 'Initial versions';end if;
 if not exists(select 1 from public.qb_library_search('どうがんしんけい') where item->>'id'=r.id::text and match_source='ocr_text') then raise exception 'Body alias search';end if;
 if not exists(select 1 from public.qb_library_search('眼球運動',array[(subject_ids_json->>1)::uuid]) where item->>'id'=r.id::text) then raise exception 'Multiple subjects';end if;
 if not exists(select 1 from public.qb_library_search((select name from public.subjects where id=(subject_ids_json->>1)::uuid)) where item->>'id'=r.id::text) then raise exception 'Subject text search';end if;
 if exists(select 1 from public.qb_library_search('動眼神経 無関係検索語') where item->>'id'=r.id::text) then raise exception 'AND query';end if;
 r=public.qb_library_save(r.id,r.revision,'{"name":"手動で修正","notes":"利用者の補足","related_keywords":["関連専用語"]}');
 if not ('name'=any(r.manual_fields)) then raise exception 'Manual lock';end if;
 r=public.qb_library_save(r.id,r.revision,'{"name":"AI変更案","keywords":["含まれる語"]}','ai','分類のみ');
 if r.metadata->>'name'<>'手動で修正' or r.ai_suggestions->'name'->>'value'<>'AI変更案' or r.metadata->>'analysis_status'<>'unprocessed' then raise exception 'AI protection/classification isolation';end if;
 if exists(select 1 from public.qb_library_search('関連専用語') where item->>'id'=r.id::text) then raise exception 'Related expansion default';end if;
 if not exists(select 1 from public.qb_library_search(p_query=>'関連専用語',p_related=>true) where item->>'id'=r.id::text) then raise exception 'Explicit related expansion';end if;
 begin perform public.qb_library_save(r.id,1,'{"name":"stale"}');raise exception 'Stale write accepted';exception when serialization_failure then null;end;
 r=public.qb_library_record_reading(r.id,r.revision,r.image_version,reading_request,'{"raw_text":"動□神経","corrected_text":"動眼神経（文脈から推定）","visual_summary":"図の配置も確認","repairs":[{"before":"動□神経","after":"動眼神経","reason":"前後と図の対応","confidence":"uncertain"}]}');
 if r.metadata->>'analysis_status'<>'needs_review' then raise exception 'Uncertain repair';end if;
 other=public.qb_library_record_reading(r.id,1,r.image_version,reading_request,'{}');
 if other.revision<>r.revision then raise exception 'Reading retry duplicated';end if;
 r=public.qb_library_save(r.id,r.revision,'{"ocr_text":"利用者による本文の修正"}');
 r=public.qb_library_record_reading(r.id,r.revision,r.image_version,gen_random_uuid(),'{"raw_text":"raw","corrected_text":"AI本文","repairs":[]}');
 if r.metadata->>'ocr_text'<>'利用者による本文の修正' or r.ai_suggestions->'ocr_text'->>'value'<>'AI本文' then raise exception 'Manual OCR protection';end if;
 select id into q from public.questions order by id limit 1;
 copy_path=q||'/question/question/library-'||request||'.png';
 insert into storage.objects(bucket_id,name) values('question-media',copy_path),('qb-image-library',r.id||'/replacement.png');
 u=public.qb_library_attach(r.id,r.revision,q,'question',null,copy_path,request);
 u2=public.qb_library_attach(r.id,r.revision,q,'question',null,copy_path,request);
 if u.id<>u2.id or not exists(select 1 from public.question_images where id=u.question_image_id and image_path=copy_path) then raise exception 'Copy registration/retry';end if;
 if (select count(*) from public.qb_image_library_usages where id=request)<>1 then raise exception 'Duplicate use';end if;
 if not exists(select 1 from public.qb_library_search(p_used=>'used',p_analysis=>'needs_review') where item->>'id'=r.id::text) then
 -- Analysis can become processed in the last import. Usage remains independent.
 if not exists(select 1 from public.qb_library_search(p_used=>'used') where item->>'id'=r.id::text) then raise exception 'Independent use status';end if;
 end if;
 r=public.qb_library_save(r.id,r.revision,'{}','manual','新しい原本',null,r.id||'/replacement.png');
 if r.image_version<>2 or r.original_path<>old_path or r.metadata?'ocr_text' or r.metadata->>'analysis_status'<>'unprocessed' then raise exception 'New original version';end if;
 if not exists(select 1 from public.question_images where id=u.question_image_id and image_path=copy_path) then raise exception 'Original replacement changed copy';end if;
 r=public.qb_library_save(r.id,r.revision,'{}','manual','削除',true);
 if exists(select 1 from public.qb_library_search() where item->>'id'=r.id::text) or not exists(select 1 from public.qb_library_search(p_archived=>true) where item->>'id'=r.id::text) then raise exception 'Reversible archive';end if;
 delete from public.question_images where id=u.question_image_id;
 if not exists(select 1 from public.qb_image_library_items where id=r.id) or not exists(select 1 from public.qb_image_library_usages where id=request) then raise exception 'Deleted copy affected source/provenance';end if;
 if (select count(*) from public.qb_image_library_history where image_id=r.id)<>r.revision then raise exception 'Complete history';end if;
 begin delete from public.qb_image_library_history where image_id=r.id;raise exception 'History deletion permitted';exception when insufficient_privilege then null;end;
 insert into public.qb_image_library_terms(canonical) values('fixture-'||gen_random_uuid()) returning id into v_term_id;
 update public.qb_image_library_terms set aliases=array['fixture別名'] where id=v_term_id;
 if (select count(*) from public.qb_image_library_term_history where qb_image_library_term_history.term_id=v_term_id)<>2 then raise exception 'Term history';end if;
 update public.qb_image_library_config set enabled=false;
 begin perform public.qb_library_save(r.id,r.revision,'{}');raise exception 'Disabled feature wrote';exception when raise_exception then if sqlerrm<>'画像ライブラリは現在停止しています' then raise;end if;end;
 update public.qb_image_library_config set enabled=true;
end $test$;
reset role;
select set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
set local role authenticated;
do $test$ begin
 if exists(select 1 from public.qb_image_library_items) then raise exception 'Non-admin read';end if;
 if exists(select 1 from public.qb_library_search()) then raise exception 'Non-admin search';end if;
 if exists(select 1 from storage.objects where bucket_id='qb-image-library') then raise exception 'Non-admin original read';end if;
 begin perform public.qb_library_assert_admin();raise exception 'Non-admin authorized';exception when insufficient_privilege then null;end;
end $test$;
reset role;
set local role anon;
do $test$ begin
 begin perform public.qb_library_search();raise exception 'Anonymous search authorized';exception when insufficient_privilege then null;end;
end $test$;
reset role;
rollback;
select 'image-library database checks passed; all fixtures rolled back' result;
