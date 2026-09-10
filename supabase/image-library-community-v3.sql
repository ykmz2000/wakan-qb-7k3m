-- Community library: additive ownership; no image bytes or question records are changed.
alter table public.qb_image_library_sets add column created_by uuid default auth.uid();
-- Preserve the recorded creator of any pre-existing set. Never guess ownership.
update public.qb_image_library_sets s set created_by=h.actor_id from public.qb_image_library_structure_history h where h.kind='qb_image_library_sets' and h.target_id=s.id and h.before_value is null and s.created_by is null;
create index qb_library_items_creator on public.qb_image_library_items(created_by);
create index qb_library_sets_creator on public.qb_image_library_sets(created_by);
create function public.qb_library_assert_member() returns void language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null and current_user not in ('postgres','service_role') then raise exception 'ログインが必要です' using errcode='42501';end if;
 if not exists(select 1 from public.qb_image_library_config where enabled) then raise exception '画像ライブラリは現在停止しています';end if;
end $$;
create function public.qb_library_assert_owner(owner_id uuid) returns void language plpgsql security invoker set search_path='' as $$
begin
 perform public.qb_library_assert_member();
 if current_user not in ('postgres','service_role') and (owner_id is null or owner_id is distinct from auth.uid()) then raise exception '編集できるのは投稿者本人だけです' using errcode='42501';end if;
end $$;
create policy qb_library_config_members_read on public.qb_image_library_config for select to authenticated using(true);
drop policy qb_library_items_admin on public.qb_image_library_items;
create policy qb_library_items_read on public.qb_image_library_items for select to authenticated using(not archived or created_by=(select auth.uid()));
create policy qb_library_items_insert on public.qb_image_library_items for insert to authenticated with check(created_by=(select auth.uid()));
create policy qb_library_items_update on public.qb_image_library_items for update to authenticated using(created_by=(select auth.uid())) with check(created_by=(select auth.uid()));
drop policy qb_library_history_read on public.qb_image_library_history;
create policy qb_library_history_read on public.qb_image_library_history for select to authenticated using(exists(select 1 from public.qb_image_library_items i where i.id=image_id and i.created_by=(select auth.uid())));
drop policy qb_library_history_append on public.qb_image_library_history;
create policy qb_library_history_append on public.qb_image_library_history for insert to authenticated with check(exists(select 1 from public.qb_image_library_items i where i.id=image_id and i.created_by=(select auth.uid())) and actor_id=(select auth.uid()));
drop policy qb_library_readings_read on public.qb_image_library_readings;
create policy qb_library_readings_read on public.qb_image_library_readings for select to authenticated using(exists(select 1 from public.qb_image_library_items i where i.id=image_id and i.created_by=(select auth.uid())));
drop policy qb_library_readings_append on public.qb_image_library_readings;
create policy qb_library_readings_append on public.qb_image_library_readings for insert to authenticated with check(exists(select 1 from public.qb_image_library_items i where i.id=image_id and i.created_by=(select auth.uid())) and actor_id=(select auth.uid()));
create policy qb_library_terms_members_read on public.qb_image_library_terms for select to authenticated using(true);
alter policy qb_library_catalog_read on public.qb_image_library_catalog using(true);
alter policy qb_library_usages_read on public.qb_image_library_usages using(true);
alter policy qb_library_sets_read on public.qb_image_library_sets using(not archived or created_by=(select auth.uid()));
alter policy qb_library_sets_insert on public.qb_image_library_sets with check(created_by=(select auth.uid()));
alter policy qb_library_sets_update on public.qb_image_library_sets using(created_by=(select auth.uid())) with check(created_by=(select auth.uid()));
alter policy qb_library_structure_history_read on public.qb_image_library_structure_history using((kind='qb_image_library_catalog' and (select public.is_admin())) or (kind='qb_image_library_sets' and exists(select 1 from public.qb_image_library_sets s where s.id=target_id and s.created_by=(select auth.uid()))));
alter policy qb_library_structure_history_insert on public.qb_image_library_structure_history with check(actor_id=(select auth.uid()) and ((kind='qb_image_library_catalog' and (select public.is_admin())) or (kind='qb_image_library_sets' and exists(select 1 from public.qb_image_library_sets s where s.id=target_id and s.created_by=(select auth.uid())))));
-- Narrow definer checks hidden/archived IDs too, so another author cannot upload into them.
create function public.qb_library_can_upload(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.qb_image_library_config where enabled)
 and p_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp|gif|heic|heif)$'
 and not exists(select 1 from public.qb_image_library_items i where i.id::text=split_part(p_path,'/',1) and i.created_by is distinct from auth.uid());
$$;
alter policy qb_library_original_insert on storage.objects with check(bucket_id='qb-image-library' and owner_id=(select auth.uid())::text and public.qb_library_can_upload(name));
alter policy qb_library_original_read on storage.objects using(bucket_id='qb-image-library' and (owner_id=(select auth.uid())::text or exists(select 1 from public.qb_image_library_items i where not i.archived and i.object_path=name)));
-- Only public attribution fields; never expose private profile fields or all profiles.
create function public.qb_library_authors(p_ids uuid[]) returns table(id uuid,display_name text,avatar_path text)
language sql stable security definer set search_path='' as $$
 select p.id,p.display_name,p.avatar_path from public.profiles p
 where auth.uid() is not null and cardinality(p_ids)<=100 and p.id=any(p_ids)
 and exists(select 1 from public.qb_image_library_config where enabled)
 and (exists(select 1 from public.qb_image_library_items i where i.created_by=p.id and (not i.archived or i.created_by=auth.uid()))
 or exists(select 1 from public.qb_image_library_sets s where s.created_by=p.id and (not s.archived or s.created_by=auth.uid())));
$$;
create or replace function public.qb_library_before_write() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 perform public.qb_library_assert_owner(new.created_by);
 perform public.qb_library_validate_metadata(new.metadata);
 if exists(select 1 from jsonb_array_elements_text(coalesce(new.metadata->'subject_ids','[]')) s where not exists(select 1 from public.qb_image_library_catalog where kind='subject' and id::text=s)) then raise exception '存在しない科目が含まれています'; end if;
 if exists(select 1 from jsonb_array_elements_text(coalesce(new.metadata->'unit_ids','[]')) u where not exists(select 1 from public.qb_library_catalog_tree() c where c.kind='unit' and c.id::text=u and new.metadata->'subject_ids' ? c.subject_id::text)) then raise exception '単元に対応する科目を選択してください';end if;
 if new.object_path not like new.id::text||'/%' or new.original_path not like new.id::text||'/%' then raise exception '原本の保存先が不正です'; end if;
 if tg_op='UPDATE' then
  if new.id<>old.id or new.original_path<>old.original_path or new.created_by is distinct from old.created_by or new.created_at<>old.created_at then raise exception '原本の識別情報は変更できません'; end if;
  new.revision=old.revision+1;
  new.image_version=old.image_version+case when new.object_path<>old.object_path then 1 else 0 end;
 else new.revision=1;new.image_version=1;
 end if;
 if tg_op='INSERT' or new.object_path is distinct from old.object_path then
  if not exists(select 1 from storage.objects o where o.bucket_id='qb-image-library' and o.name=new.object_path and o.owner_id=new.created_by::text) then raise exception '投稿者本人がアップロードした画像を指定してください' using errcode='42501';end if;
 end if;
 if tg_op='INSERT' and new.original_path<>new.object_path then raise exception '初回の原本が一致しません';end if;
 new.updated_at=clock_timestamp();return new;
end $$;
create or replace function public.qb_library_save(p_id uuid,p_revision integer,p_patch jsonb,p_origin text default 'manual',p_reason text default '情報を編集',p_archived boolean default null,p_object_path text default null)
returns public.qb_image_library_items language plpgsql security invoker set search_path='' as $$
declare r public.qb_image_library_items; m jsonb; proposals jsonb; locked text[]; k text; v jsonb;
begin
 perform public.qb_library_assert_member();perform public.qb_library_validate_metadata(p_patch);
 if p_origin not in ('manual','ai') then raise exception '変更元が不正です'; end if;
 select * into r from public.qb_image_library_items where id=p_id for update;
 if not found then raise exception '画像が見つかりません'; end if;
 perform public.qb_library_assert_owner(r.created_by);
 if r.revision<>p_revision then raise exception '他の更新があります。入力内容を残して最新情報を確認してください' using errcode='40001'; end if;
 if p_origin='ai' and (p_archived is not null or p_object_path is not null) then raise exception '解析による原本の変更はできません'; end if;
 if p_object_path is not null and not exists(select 1 from storage.objects where bucket_id='qb-image-library' and name=p_object_path) then raise exception '変更後の原本が見つかりません'; end if;
 m=r.metadata;proposals=r.ai_suggestions;locked=r.manual_fields;
 for k,v in select * from jsonb_each(p_patch) loop
  if p_origin='manual' then
   if m->k is distinct from v or proposals?k then locked=array(select distinct unnest(locked||array[k]));end if;
   m=jsonb_set(m,array[k],v);proposals=proposals-k;
  elsif k=any(locked) then
   if m->k is distinct from v then proposals=jsonb_set(proposals,array[k],jsonb_build_object('value',v,'reason',p_reason,'created_at',clock_timestamp()));end if;
  else m=jsonb_set(m,array[k],v);proposals=proposals-k;
  end if;
 end loop;
 if p_object_path is not null and p_object_path<>r.object_path then
  -- Old readings remain in immutable history; never search stale OCR as current.
  m=m-'ocr_text'-'visual_summary';m=jsonb_set(m,'{analysis_status}','"unprocessed"');
  proposals=proposals-'ocr_text'-'visual_summary'-'analysis_status';locked=array(select x from unnest(locked) x where x not in ('ocr_text','visual_summary','analysis_status'));
 end if;
 update public.qb_image_library_items set metadata=m,manual_fields=locked,ai_suggestions=proposals,change_origin=p_origin,change_reason=p_reason,
 archived=coalesce(p_archived,r.archived),object_path=coalesce(p_object_path,r.object_path) where id=p_id returning * into r;
 return r;
end $$;
create or replace function public.qb_library_record_reading(p_id uuid,p_revision integer,p_image_version integer,p_request_id uuid,p_reading jsonb,p_classification jsonb default '{}')
returns public.qb_image_library_items language plpgsql security invoker set search_path='' as $$
declare r public.qb_image_library_items; patch jsonb; repair jsonb; repairs jsonb;
begin
 perform public.qb_library_assert_member();
 select * into r from public.qb_image_library_items where id=p_id for update;
 if not found then raise exception '画像が見つかりません'; end if;
 perform public.qb_library_assert_owner(r.created_by);
 if exists(select 1 from public.qb_image_library_readings where id=p_request_id and image_id=p_id and image_version=p_image_version) then return r;end if;
 if r.revision<>p_revision or r.image_version<>p_image_version then raise exception '画像または情報が更新されています。再照合してください' using errcode='40001'; end if;
 if jsonb_typeof(p_reading)<>'object' or jsonb_typeof(p_reading->'raw_text') is distinct from 'string' or jsonb_typeof(p_reading->'corrected_text') is distinct from 'string' then raise exception 'OCR原文と補完後の本文が必要です';end if;
 if length(p_reading->>'raw_text')>150000 then raise exception 'OCR原文が長すぎます';end if;
 repairs=coalesce(p_reading->'repairs','[]');
 if jsonb_typeof(repairs)<>'array' then raise exception '補完履歴の形式が不正です';end if;
 for repair in select * from jsonb_array_elements(repairs) loop
  if jsonb_typeof(repair) is distinct from 'object' or jsonb_typeof(repair->'before') is distinct from 'string' or jsonb_typeof(repair->'after') is distinct from 'string' or jsonb_typeof(repair->'reason') is distinct from 'string' or coalesce(repair->>'confidence','') not in ('high','uncertain','unreadable') then raise exception '補完箇所・変更前後・根拠・確実性を記録してください';end if;
 end loop;
 patch=p_classification||jsonb_build_object('ocr_text',p_reading->>'corrected_text','visual_summary',coalesce(p_reading->>'visual_summary',''),'analysis_status',case when exists(select 1 from jsonb_array_elements(repairs) x where x->>'confidence'<>'high') then 'needs_review' else 'processed' end);
 insert into public.qb_image_library_readings(id,image_id,image_version,raw_text,corrected_text,visual_summary,repairs)
 values(p_request_id,p_id,p_image_version,p_reading->>'raw_text',p_reading->>'corrected_text',coalesce(p_reading->>'visual_summary',''),repairs);
 return public.qb_library_save(p_id,p_revision,patch,'ai','画像と文脈を確認して読み取り・補完');
end $$;
create or replace function public.qb_library_structure_before() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_table_name='qb_image_library_sets' then perform public.qb_library_assert_owner(new.created_by);else perform public.qb_library_assert_admin();end if;
 if tg_op='UPDATE' then
  if new.id<>old.id then raise exception 'IDは変更できません';end if;
  if new.revision<>old.revision+1 then raise exception '別の更新があります。最新情報を確認してください' using errcode='40001';end if;
 else new.revision=1;end if;
 if tg_table_name='qb_image_library_sets' then
  if tg_op='UPDATE' and (new.created_by is distinct from old.created_by or new.created_at<>old.created_at) then raise exception '投稿者は変更できません';end if;
  if exists(select 1 from unnest(new.image_ids) x where x is null or not exists(select 1 from public.qb_image_library_items i where i.id=x)) or cardinality(new.image_ids)<>(select count(distinct x) from unnest(new.image_ids) x) then raise exception 'セットの画像が存在しないか重複しています';end if;
  new.updated_at=clock_timestamp();
 else
  -- Lock hierarchy edits together so concurrent moves cannot introduce cycles.
  perform pg_advisory_xact_lock(836927104);
  if tg_op='UPDATE' and new.kind<>old.kind then raise exception '科目と単元は相互に変更できません';end if;
  if cardinality(new.aliases)>100 or exists(select 1 from unnest(new.aliases) a where a is null or length(a)>200) then raise exception '別名を確認してください';end if;
  if new.parent_id=new.id or exists(with recursive ancestors as (select id,parent_id from public.qb_image_library_catalog where id=new.parent_id union select c.id,c.parent_id from public.qb_image_library_catalog c join ancestors a on c.id=a.parent_id) select 1 from ancestors where id=new.id) then raise exception '単元が循環する配置にはできません';end if;
  -- Moving an already classified unit across subjects invalidates existing classifications.
  if tg_op='UPDATE' and new.parent_id is distinct from old.parent_id then
   if exists(with recursive descendants as (select old.id id union select c.id from public.qb_image_library_catalog c join descendants d on c.parent_id=d.id) select 1 from public.qb_image_library_items i,descendants d where i.metadata->'unit_ids' ? d.id::text) then raise exception '使用中の単元は親を変更できません。並び順は変更できます';end if;
  end if;
 end if;return new;
end $$;
revoke all on function public.qb_library_assert_member(),public.qb_library_assert_owner(uuid),public.qb_library_can_upload(text),public.qb_library_authors(uuid[]) from public,anon;
grant execute on function public.qb_library_assert_member(),public.qb_library_assert_owner(uuid),public.qb_library_can_upload(text),public.qb_library_authors(uuid[]) to authenticated,service_role;
