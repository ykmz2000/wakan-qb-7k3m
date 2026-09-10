begin;
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where role='admin' limit 1),true);
set local role authenticated;
do $test$
declare a public.qb_image_library_items;b public.qb_image_library_items;s public.qb_image_library_sets;
 sub uuid;u uuid;parent uuid;hit record;total integer;
begin
 select id into sub from public.qb_image_library_catalog where kind='subject' and name='消化器学';
 select id,parent_id into u,parent from public.qb_library_catalog_tree() where path='消化器学 / 消化管 / 食道 / 食道アカラシア';
 if sub is null or u is null then raise exception 'Missing GI taxonomy';end if;
 if not exists(select 1 from public.qb_library_catalog_tree() where kind='subject' and name='薬理学') then raise exception 'Missing broad subjects';end if;
 a.id=gen_random_uuid();b.id=gen_random_uuid();
 insert into public.qb_image_library_items(id,object_path,original_path,metadata) values(a.id,a.id||'/a.png',a.id||'/a.png',jsonb_build_object('name','fixture-set-a','subject_ids',array[sub],'unit_ids',array[u],'roles',array['語呂合わせ'],'ocr_text','総まとめ本文の隠れた語句')) returning * into a;
 insert into public.qb_image_library_items(id,object_path,original_path,metadata) values(b.id,b.id||'/b.png',b.id||'/b.png',jsonb_build_object('name','fixture-set-b','subject_ids',array[sub])) returning * into b;
 insert into public.qb_image_library_sets(name,image_ids) values('fixture-画像組',array[b.id,a.id]) returning * into s;
 select * into hit from public.qb_library_search_v2(p_query=>'fixture-画像組') where set_data->>'id'=s.id::text;
 if hit.set_data->'members'->0->>'id'<>b.id::text or jsonb_array_length(hit.set_data->'members')<>2 then raise exception 'Set order/name search';end if;
 if not exists(select 1 from public.qb_library_search_v2(p_query=>'隠れた語句') where set_data->>'id'=s.id::text) then raise exception 'Member body set search';end if;
 if not exists(select 1 from public.qb_library_search_v2(p_query=>'ゴロ',p_role=>'語呂合わせ',p_unit=>parent) where set_data->>'id'=s.id::text) then raise exception 'Mnemonic alias or descendant unit';end if;
 if exists(select 1 from public.qb_library_search_v2(p_query=>'fixture-set-a') where item->>'id'=a.id::text and set_data is null) then raise exception 'Duplicate grouped member';end if;
 if not exists(select 1 from public.qb_library_search_v2(p_query=>'fixture-set-a',p_view=>'images') where item->>'id'=a.id::text and set_data is null) then raise exception 'Individual view';end if;
 begin update public.qb_image_library_sets set name='stale' where id=s.id;raise exception 'No optimistic revision';exception when serialization_failure then null;end;
 update public.qb_image_library_sets set image_ids=array[a.id,b.id],revision=revision+1 where id=s.id returning * into s;
 if (select count(*) from public.qb_image_library_structure_history where target_id=s.id)<>2 then raise exception 'Set history missing';end if;
 begin update public.qb_image_library_sets set image_ids=array[a.id,a.id],revision=revision+1 where id=s.id;raise exception 'Duplicate accepted';exception when raise_exception then if sqlerrm='Duplicate accepted' then raise;end if;end;
 begin perform public.qb_library_save(b.id,b.revision,jsonb_build_object('subject_ids','[]'::jsonb,'unit_ids',array[u]));raise exception 'Unrelated unit accepted';exception when raise_exception then if sqlerrm='Unrelated unit accepted' then raise;end if;end;
 begin update public.qb_image_library_catalog set parent_id=u,revision=revision+1 where id=parent;raise exception 'Cycle accepted';exception when raise_exception then if sqlerrm='Cycle accepted' then raise;end if;end;
 update public.qb_image_library_sets set archived=true,revision=revision+1 where id=s.id;
 if not exists(select 1 from public.qb_library_search_v2(p_query=>'fixture-set-a') where item->>'id'=a.id::text and set_data is null) then raise exception 'Ungrouping lost original';end if;
 if (select count(*) from public.qb_image_library_items where id in (a.id,b.id))<>2 then raise exception 'Grouping changed originals';end if;
end $test$;
reset role;
select set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
set local role authenticated;
do $test$ begin
 if exists(select 1 from public.qb_library_search_v2()) or exists(select 1 from public.qb_library_catalog_tree()) or exists(select 1 from public.qb_image_library_sets) then raise exception 'Non-admin visibility';end if;
end $test$;
reset role;
set local role anon;
do $test$ begin
 begin perform public.qb_library_search_v2();raise exception 'Anonymous allowed';exception when insufficient_privilege then null;end;
end $test$;
reset role;
rollback;
select 'Set ordering, body/alias/descendant search, conflicts, history, ungrouping and access tests passed; fixtures rolled back' result;
