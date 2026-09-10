-- Additive image sets and library-only teaching catalog. Existing images/questions remain untouched.
create table public.qb_image_library_catalog (
 id uuid primary key default gen_random_uuid(), kind text not null check(kind in ('subject','unit')),
 parent_id uuid references public.qb_image_library_catalog(id), name text not null check(length(trim(name)) between 1 and 200),
 aliases text[] not null default '{}', sort_order integer not null default 1000, revision integer not null default 1,
 check((kind='subject' and parent_id is null) or (kind='unit' and parent_id is not null))
);
create index qb_library_catalog_parent on public.qb_image_library_catalog(parent_id,sort_order,id);
create unique index qb_library_catalog_name on public.qb_image_library_catalog(coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),name);
insert into public.qb_image_library_catalog(id,kind,name,sort_order) select id,'subject',name,sort_order+500 from public.subjects;
create table public.qb_image_library_sets (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 200),
 image_ids uuid[] not null, revision integer not null default 1, archived boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(cardinality(image_ids) between 1 and 100)
);
create index qb_library_sets_images on public.qb_image_library_sets using gin(image_ids);
create table public.qb_image_library_structure_history (
 id bigint generated always as identity primary key, kind text not null, target_id uuid not null,
 before_value jsonb, after_value jsonb not null, actor_id uuid default auth.uid(), created_at timestamptz not null default now()
);
create index qb_library_structure_target on public.qb_image_library_structure_history(kind,target_id,id desc);
alter table public.qb_image_library_catalog enable row level security;
revoke all on public.qb_image_library_catalog from anon,authenticated;
grant select,insert,update on public.qb_image_library_catalog to authenticated;
grant all on public.qb_image_library_catalog to service_role;
create policy qb_library_catalog_read on public.qb_image_library_catalog for select to authenticated using((select public.is_admin()));
create policy qb_library_catalog_insert on public.qb_image_library_catalog for insert to authenticated with check((select public.is_admin()));
create policy qb_library_catalog_update on public.qb_image_library_catalog for update to authenticated using((select public.is_admin())) with check((select public.is_admin()));
alter table public.qb_image_library_sets enable row level security;
revoke all on public.qb_image_library_sets from anon,authenticated;
grant select,insert,update on public.qb_image_library_sets to authenticated;
grant all on public.qb_image_library_sets to service_role;
create policy qb_library_sets_read on public.qb_image_library_sets for select to authenticated using((select public.is_admin()));
create policy qb_library_sets_insert on public.qb_image_library_sets for insert to authenticated with check((select public.is_admin()));
create policy qb_library_sets_update on public.qb_image_library_sets for update to authenticated using((select public.is_admin())) with check((select public.is_admin()));
alter table public.qb_image_library_structure_history enable row level security;
revoke all on public.qb_image_library_structure_history from anon,authenticated;
grant select,insert on public.qb_image_library_structure_history to authenticated;
grant all on public.qb_image_library_structure_history to service_role;
create policy qb_library_structure_history_read on public.qb_image_library_structure_history for select to authenticated using((select public.is_admin()));
create policy qb_library_structure_history_insert on public.qb_image_library_structure_history for insert to authenticated with check((select public.is_admin()));
grant usage,select on sequence public.qb_image_library_structure_history_id_seq to authenticated,service_role;
create function public.qb_library_structure_before() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 perform public.qb_library_assert_admin();
 if tg_op='UPDATE' then
  if new.id<>old.id then raise exception 'IDは変更できません';end if;
  if new.revision<>old.revision+1 then raise exception '別の更新があります。最新情報を確認してください' using errcode='40001';end if;
 else new.revision=1;end if;
 if tg_table_name='qb_image_library_sets' then
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
create function public.qb_library_structure_after() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 insert into public.qb_image_library_structure_history(kind,target_id,before_value,after_value) values(tg_table_name,new.id,case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));return new;
end $$;
create trigger qb_library_sets_before before insert or update on public.qb_image_library_sets for each row execute function public.qb_library_structure_before();
create trigger qb_library_sets_after after insert or update on public.qb_image_library_sets for each row execute function public.qb_library_structure_after();
create trigger qb_library_catalog_before before insert or update on public.qb_image_library_catalog for each row execute function public.qb_library_structure_before();
create trigger qb_library_catalog_after after insert or update on public.qb_image_library_catalog for each row execute function public.qb_library_structure_after();
create function public.qb_library_catalog_tree() returns table(id uuid,kind text,parent_id uuid,name text,aliases text[],sort_order integer,revision integer,subject_id uuid,path text,sort_path integer[])
language sql stable security invoker set search_path='' as $$
 with recursive tree as (
 select c.*,c.id subject_id,c.name path,array[c.sort_order] sort_path from public.qb_image_library_catalog c where parent_id is null
 union all select c.*,t.subject_id,t.path||' / '||c.name,t.sort_path||c.sort_order from public.qb_image_library_catalog c join tree t on c.parent_id=t.id
 ) select * from tree order by sort_path,path,id;
$$;
create or replace function public.qb_library_validate_metadata(m jsonb) returns void language plpgsql immutable security invoker set search_path='' as $$
declare k text; v jsonb;
begin
 if jsonb_typeof(m) is distinct from 'object' then raise exception '項目の形式が不正です'; end if;
 for k,v in select * from jsonb_each(m) loop
  if k=any(array['subject_ids','unit_ids','topics','keywords','aspects','roles','aliases','related_keywords']) then
   if jsonb_typeof(v)<>'array' then raise exception '配列が必要です: %',k; end if;
   if jsonb_array_length(v)>100 or exists(select 1 from jsonb_array_elements(v) x where jsonb_typeof(x)<>'string' or length(x#>>'{}')>500) then raise exception '項目が長すぎるか形式が不正です: %',k; end if;
  elsif k=any(array['name','notes','ocr_text','visual_summary','analysis_status','classification_status']) then
   if jsonb_typeof(v)<>'string' or length(v#>>'{}')>150000 then raise exception '文字列が必要です: %',k; end if;
  else raise exception '未対応の項目です: %',k;
  end if;
 end loop;
 if m?'analysis_status' and m->>'analysis_status' not in ('unprocessed','processed','needs_review') then raise exception '解析状況が不正です'; end if;
 if m?'classification_status' and m->>'classification_status' not in ('unknown','partial','classified') then raise exception '分類状況が不正です'; end if;
end $$;

create or replace function public.qb_library_before_write() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 perform public.qb_library_assert_admin();
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
 new.updated_at=clock_timestamp();return new;
end $$;
create function public.qb_library_search_v2(p_query text default '',p_subjects uuid[] default '{}',p_aspect text default '',p_analysis text default '',p_classification text default '',p_used text default '',p_related boolean default false,p_archived boolean default false,p_offset integer default 0,p_limit integer default 30,p_role text default '',p_unit uuid default null,p_sort text default 'logical',p_view text default 'all')
returns table(item jsonb,score integer,match_source text,match_text text,total_count bigint,use_count bigint,set_data jsonb)
language sql stable security invoker set search_path='' as $$
 with recursive catalog as (select * from public.qb_library_catalog_tree()), unit_scope as (select id from catalog where id=p_unit union all select c.id from catalog c join unit_scope u on c.parent_id=u.id), normalized as (select public.qb_library_normalize(left(p_query,500)) q),
 tokens as (
  select q token from normalized where q<>'' and exists(select 1 from public.qb_image_library_terms d where public.qb_library_normalize(d.canonical)=q or exists(select 1 from unnest(d.aliases) a where public.qb_library_normalize(a)=q))
  union all
  select coalesce(m[1],m[2]) from normalized, lateral regexp_matches(q,'"([^"]+)"|(\S+)','g') m where q<>'' and not exists(select 1 from public.qb_image_library_terms d where public.qb_library_normalize(d.canonical)=q or exists(select 1 from unnest(d.aliases) a where public.qb_library_normalize(a)=q))
 ), forms as (
  select token,token form from tokens union
  select token,public.qb_library_normalize(a) from tokens join public.qb_image_library_terms d on public.qb_library_normalize(d.canonical)=token or exists(select 1 from unnest(d.aliases) x where public.qb_library_normalize(x)=token),lateral unnest(array[d.canonical]||d.aliases) a
 ), candidates as (
  select i.*, (select count(*) from public.qb_image_library_usages u where u.image_id=i.id) uses from public.qb_image_library_items i
  where i.archived=p_archived and exists(select 1 from public.qb_image_library_config where enabled)
  and (cardinality(p_subjects)=0 or exists(select 1 from unnest(p_subjects) sid where i.metadata->'subject_ids' ? sid::text))
  and (p_role='' or i.metadata->'roles' ? p_role)
  and (p_unit is null or exists(select 1 from unit_scope u where i.metadata->'unit_ids' ? u.id::text))
  and (p_aspect='' or i.metadata->'aspects' ? p_aspect)
  and (p_analysis='' or coalesce(i.metadata->>'analysis_status','unprocessed')=p_analysis)
  and (p_classification='' or coalesce(i.metadata->>'classification_status','unknown')=p_classification)
 ), matches as (
  select i.*,coalesce(s.points,0)::integer points,coalesce(s.source,'') source,coalesce(s.excerpt,'') excerpt,s.matched
  from candidates i left join lateral (
   select sum(best.weight) points,count(*) matched,(array_agg(best.field order by best.weight desc))[1] source,(array_agg(best.body order by best.weight desc))[1] excerpt
   from (select distinct token from forms) tok cross join lateral (
    select f.field,f.body,f.weight from (values
     ('set_name',coalesce((select string_agg(z.name,'、') from public.qb_image_library_sets z where not z.archived and i.id=any(z.image_ids)),''),105),
     ('unit_ids',coalesce((select string_agg(c.path||' '||array_to_string(c.aliases,' '),'、') from catalog c where i.metadata->'unit_ids' ? c.id::text),''),80),
     ('name',coalesce(i.metadata->>'name',''),110),('topics',coalesce(i.metadata->>'topics',''),100),
     ('aliases',coalesce(i.metadata->>'aliases',''),90),('keywords',coalesce(i.metadata->>'keywords',''),85),
     ('subject_ids',coalesce((select string_agg(s.name||' '||array_to_string(s.aliases,' '),'、') from catalog s where i.metadata->'subject_ids' ? s.id::text),''),80),('roles',coalesce(i.metadata->>'roles',''),75),('aspects',coalesce(i.metadata->>'aspects',''),70),
     ('ocr_text',coalesce(i.metadata->>'ocr_text',''),45),('notes',coalesce(i.metadata->>'notes',''),40),
     ('visual_summary',coalesce(i.metadata->>'visual_summary',''),40),
     ('related_keywords',case when p_related then coalesce(i.metadata->>'related_keywords','') else '' end,10)
    ) f(field,body,weight)
    where exists(select 1 from forms where forms.token=tok.token and position(forms.form in public.qb_library_normalize(f.body))>0)
    order by f.weight desc limit 1
   ) best
  ) s on true
 )
 , eligible as (
 select m.*,coalesce((select c.sort_path from catalog c where (m.metadata->'unit_ids' ? c.id::text or (m.metadata->'subject_ids' ? c.id::text and not exists(select 1 from catalog u where u.subject_id=c.id and m.metadata->'unit_ids' ? u.id::text))) and (cardinality(p_subjects)=0 or c.subject_id=any(p_subjects)) order by c.sort_path limit 1),array[2147483647]) logical_path
 from matches m where coalesce(m.matched,0)=(select count(distinct token) from forms)
 and (p_used='' or (p_used='used' and m.uses>0) or (p_used='unused' and m.uses=0))
 ), cards as (
 select 'image:'||e.id card_id,to_jsonb(e)-'uses'-'points'-'source'-'excerpt'-'matched'-'logical_path' item,e.points score,e.source match_source,e.excerpt match_text,e.uses use_count,null::jsonb set_data,e.created_at,e.logical_path,e.metadata->>'name' title
 from eligible e where p_view='images' or (p_view='all' and (p_archived or not exists(select 1 from public.qb_image_library_sets z where not z.archived and e.id=any(z.image_ids))))
 union all
 select 'set:'||z.id,to_jsonb(best)-'uses'-'points'-'source'-'excerpt'-'matched'-'logical_path',best.points,best.source,best.excerpt,best.uses,
 to_jsonb(z)||jsonb_build_object('members',(select jsonb_agg(to_jsonb(i) order by ids.n) from unnest(z.image_ids) with ordinality ids(id,n) join public.qb_image_library_items i on i.id=ids.id where not i.archived)),z.created_at,best.logical_path,z.name
 from public.qb_image_library_sets z cross join lateral (select e.* from eligible e where e.id=any(z.image_ids) order by e.points desc,e.logical_path,e.id limit 1) best
 where not z.archived and not p_archived and p_view in ('all','sets')
 ) select item,score,match_source,match_text,count(*) over(),use_count,set_data from cards
 order by score desc,case when p_sort='logical' then logical_path end,case when p_sort='logical' then title end,created_at desc,card_id
 limit greatest(1,least(p_limit,60)) offset greatest(0,p_offset);
$$;
revoke all on function public.qb_library_structure_before() from public,anon;
grant execute on function public.qb_library_structure_before() to authenticated,service_role;
revoke all on function public.qb_library_structure_after() from public,anon;
grant execute on function public.qb_library_structure_after() to authenticated,service_role;
revoke all on function public.qb_library_catalog_tree() from public,anon;
grant execute on function public.qb_library_catalog_tree() to authenticated,service_role;
revoke all on function public.qb_library_search_v2(text,uuid[],text,text,text,text,boolean,boolean,integer,integer,text,uuid,text,text) from public,anon;
grant execute on function public.qb_library_search_v2(text,uuid[],text,text,text,text,boolean,boolean,integer,integer,text,uuid,text,text) to authenticated,service_role;
insert into public.qb_image_library_terms(canonical,aliases) values('語呂合わせ',array['ごろ','ゴロ','ごろあわせ','語呂','mnemonic']) on conflict(canonical) do nothing;

-- Library subject order: foundations, organ systems, clinical practice, social medicine.
insert into public.qb_image_library_catalog(kind,name,aliases,sort_order) values('subject','解剖学',array['解剖']::text[],10) on conflict(coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),name) do update set sort_order=excluded.sort_order,aliases=excluded.aliases,revision=qb_image_library_catalog.revision+1;
insert into public.qb_image_library_catalog(kind,name,aliases,sort_order) values('subject','組織学',array[]::text[],20) on conflict(coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),name) do update set sort_order=excluded.sort_order,aliases=excluded.aliases,revision=qb_image_library_catalog.revision+1;
insert into public.qb_image_library_catalog(kind,name,aliases,sort_order) values('subject','発生学',array[]::text[],30) on conflict(coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),name) do update set sort_order=excluded.sort_order,aliases=excluded.aliases,revision=qb_image_library_catalog.revision+1;
insert into public.qb_image_library_catalog(kind,name,aliases,sort_order) values('subject','生理学',array['生理']::text[],40) on conflict(coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),name) do update set sort_order=excluded.sort_order,aliases=excluded.aliases,revision=qb_image_library_catalog.revision+1;
insert into public.qb_image_library_catalog(kind,name,aliases,sort_order) values('subject','生化学',array[]::text[],50) on conflict(coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),name) do update set sort_order=excluded.sort_order,aliases=excluded.aliases,revision=qb_image_library_catalog.revision+1;
insert into public.qb_image_library_catalog(kind,name,aliases,sort_order) values('subject','遺伝学',array[]::text[],60) on conflict(coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),name) do update set sort_order=excluded.sort_order,aliases=excluded.aliases,revision=qb_image_library_catalog.revision+1;
insert into public.qb_image_library_catalog(kind,name,aliases,sort_order) values('subject','病理学',array[]::text[],70) on conflict(coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),name) do update set sort_order=excluded.sort_order,aliases=excluded.aliases,revision=qb_image_library_catalog.revision+1;
insert into public.qb_image_library_catalog(kind,name,aliases,sort_order) values('subject','薬理学',array['薬理']::text[],80) on conflict(coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),name) do update set sort_order=excluded.sort_order,aliases=excluded.aliases,revision=qb_image_library_catalog.revision+1;
insert into public.qb_image_library_catalog(kind,name,aliases,sort_order) values('subject','免疫学',array[]::text[],90) on conflict(coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),name) do update set sort_order=excluded.sort_order,aliases=excluded.aliases,revision=qb_image_library_catalog.revision+1;
insert into public.qb_image_library_catalog(kind,name,aliases,sort_order) values('subject','微生物学',array[]::text[],100) on conflict(coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),name) do update set sort_order=excluded.sort_order,aliases=excluded.aliases,revision=qb_image_library_catalog.revision+1;
insert into public.qb_image_library_catalog(kind,name,aliases,sort_order) values('subject','消化器学',array['消化器','消化器内科','消化器外科','肝胆膵']::text[],110) on conflict(coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),name) do update set sort_order=excluded.sort_order,aliases=excluded.aliases,revision=qb_image_library_catalog.revision+1;
insert into public.qb_image_library_catalog(kind,name,aliases,sort_order) values('subject','循環器学',array['循環器']::text[],120) on conflict(coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),name) do update set sort_order=excluded.sort_order,aliases=excluded.aliases,revision=qb_image_library_catalog.revision+1;
insert into public.qb_image_library_catalog(kind,name,aliases,sort_order) values('subject','呼吸器学',array['呼吸器']::text[],130) on conflict(coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),name) do update set sort_order=excluded.sort_order,aliases=excluded.aliases,revision=qb_image_library_catalog.revision+1;
insert into public.qb_image_library_catalog(kind,name,aliases,sort_order) values('subject','腎臓内科学',array['腎臓','腎']::text[],140) on conflict(coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),name) do update set sort_order=excluded.sort_order,aliases=excluded.aliases,revision=qb_image_library_catalog.revision+1;
insert into public.qb_image_library_catalog(kind,name,aliases,sort_order) values('subject','内分泌・代謝学',array['内分泌','代謝']::text[],150) on conflict(coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),name) do update set sort_order=excluded.sort_order,aliases=excluded.aliases,revision=qb_image_library_catalog.revision+1;
insert into public.qb_image_library_catalog(kind,name,aliases,sort_order) values('subject','血液学',array['血液']::text[],160) on conflict(coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),name) do update set sort_order=excluded.sort_order,aliases=excluded.aliases,revision=qb_image_library_catalog.revision+1;
insert into public.qb_image_library_catalog(kind,name,aliases,sort_order) values('subject','脳神経内科学',array['神経内科','神経学']::text[],170) on conflict(coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),name) do update set sort_order=excluded.sort_order,aliases=excluded.aliases,revision=qb_image_library_catalog.revision+1;
insert into public.qb_image_library_catalog(kind,name,aliases,sort_order) values('subject','脳神経外科学・脳卒中医学',array[]::text[],180) on conflict(coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),name) do update set sort_order=excluded.sort_order,aliases=excluded.aliases,revision=qb_image_library_catalog.revision+1;
insert into public.qb_image_library_catalog(kind,name,aliases,sort_order) values('subject','眼科学',array['眼科']::text[],190) on conflict(coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),name) do update set sort_order=excluded.sort_order,aliases=excluded.aliases,revision=qb_image_library_catalog.revision+1;
insert into public.qb_image_library_catalog(kind,name,aliases,sort_order) values('subject','耳鼻咽喉科学',array['耳鼻科']::text[],200) on conflict(coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),name) do update set sort_order=excluded.sort_order,aliases=excluded.aliases,revision=qb_image_library_catalog.revision+1;
insert into public.qb_image_library_catalog(kind,name,aliases,sort_order) values('subject','整形外科・リハビリテーション医学',array['整形','整形外科','リハビリ']::text[],210) on conflict(coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),name) do update set sort_order=excluded.sort_order,aliases=excluded.aliases,revision=qb_image_library_catalog.revision+1;
insert into public.qb_image_library_catalog(kind,name,aliases,sort_order) values('subject','皮膚科学',array['皮膚科']::text[],220) on conflict(coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),name) do update set sort_order=excluded.sort_order,aliases=excluded.aliases,revision=qb_image_library_catalog.revision+1;
insert into public.qb_image_library_catalog(kind,name,aliases,sort_order) values('subject','泌尿器科学',array['泌尿器科']::text[],230) on conflict(coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),name) do update set sort_order=excluded.sort_order,aliases=excluded.aliases,revision=qb_image_library_catalog.revision+1;
insert into public.qb_image_library_catalog(kind,name,aliases,sort_order) values('subject','産科学',array['産科']::text[],240) on conflict(coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),name) do update set sort_order=excluded.sort_order,aliases=excluded.aliases,revision=qb_image_library_catalog.revision+1;
insert into public.qb_image_library_catalog(kind,name,aliases,sort_order) values('subject','婦人科学',array['婦人科']::text[],250) on conflict(coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),name) do update set sort_order=excluded.sort_order,aliases=excluded.aliases,revision=qb_image_library_catalog.revision+1;
insert into public.qb_image_library_catalog(kind,name,aliases,sort_order) values('subject','小児科学',array['小児科']::text[],260) on conflict(coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),name) do update set sort_order=excluded.sort_order,aliases=excluded.aliases,revision=qb_image_library_catalog.revision+1;
insert into public.qb_image_library_catalog(kind,name,aliases,sort_order) values('subject','小児外科学',array[]::text[],270) on conflict(coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),name) do update set sort_order=excluded.sort_order,aliases=excluded.aliases,revision=qb_image_library_catalog.revision+1;
insert into public.qb_image_library_catalog(kind,name,aliases,sort_order) values('subject','精神医学',array['精神科']::text[],280) on conflict(coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),name) do update set sort_order=excluded.sort_order,aliases=excluded.aliases,revision=qb_image_library_catalog.revision+1;
insert into public.qb_image_library_catalog(kind,name,aliases,sort_order) values('subject','臨床感染症学',array['感染症']::text[],290) on conflict(coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),name) do update set sort_order=excluded.sort_order,aliases=excluded.aliases,revision=qb_image_library_catalog.revision+1;
insert into public.qb_image_library_catalog(kind,name,aliases,sort_order) values('subject','リウマチ膠原病学',array['リウマチ','膠原病']::text[],300) on conflict(coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),name) do update set sort_order=excluded.sort_order,aliases=excluded.aliases,revision=qb_image_library_catalog.revision+1;
insert into public.qb_image_library_catalog(kind,name,aliases,sort_order) values('subject','腫瘍学',array[]::text[],310) on conflict(coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),name) do update set sort_order=excluded.sort_order,aliases=excluded.aliases,revision=qb_image_library_catalog.revision+1;
insert into public.qb_image_library_catalog(kind,name,aliases,sort_order) values('subject','救急医学',array['救急']::text[],320) on conflict(coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),name) do update set sort_order=excluded.sort_order,aliases=excluded.aliases,revision=qb_image_library_catalog.revision+1;
insert into public.qb_image_library_catalog(kind,name,aliases,sort_order) values('subject','麻酔科学',array['麻酔']::text[],330) on conflict(coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),name) do update set sort_order=excluded.sort_order,aliases=excluded.aliases,revision=qb_image_library_catalog.revision+1;
insert into public.qb_image_library_catalog(kind,name,aliases,sort_order) values('subject','放射線医学・放射線腫瘍学',array['放射線']::text[],340) on conflict(coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),name) do update set sort_order=excluded.sort_order,aliases=excluded.aliases,revision=qb_image_library_catalog.revision+1;
insert into public.qb_image_library_catalog(kind,name,aliases,sort_order) values('subject','臨床診断学',array[]::text[],350) on conflict(coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),name) do update set sort_order=excluded.sort_order,aliases=excluded.aliases,revision=qb_image_library_catalog.revision+1;
insert into public.qb_image_library_catalog(kind,name,aliases,sort_order) values('subject','生活習慣病学',array[]::text[],360) on conflict(coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),name) do update set sort_order=excluded.sort_order,aliases=excluded.aliases,revision=qb_image_library_catalog.revision+1;
insert into public.qb_image_library_catalog(kind,name,aliases,sort_order) values('subject','高齢医学',array[]::text[],370) on conflict(coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),name) do update set sort_order=excluded.sort_order,aliases=excluded.aliases,revision=qb_image_library_catalog.revision+1;
insert into public.qb_image_library_catalog(kind,name,aliases,sort_order) values('subject','和漢医学概論',array['和漢','漢方']::text[],380) on conflict(coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),name) do update set sort_order=excluded.sort_order,aliases=excluded.aliases,revision=qb_image_library_catalog.revision+1;
insert into public.qb_image_library_catalog(kind,name,aliases,sort_order) values('subject','公衆衛生学',array['公衆衛生']::text[],390) on conflict(coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),name) do update set sort_order=excluded.sort_order,aliases=excluded.aliases,revision=qb_image_library_catalog.revision+1;
insert into public.qb_image_library_catalog(kind,name,aliases,sort_order) values('subject','法医学',array[]::text[],400) on conflict(coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),name) do update set sort_order=excluded.sort_order,aliases=excluded.aliases,revision=qb_image_library_catalog.revision+1;
insert into public.qb_image_library_catalog(kind,name,aliases,sort_order) values('subject','医療倫理学',array[]::text[],410) on conflict(coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),name) do update set sort_order=excluded.sort_order,aliases=excluded.aliases,revision=qb_image_library_catalog.revision+1;
insert into public.qb_image_library_catalog(kind,name,aliases,sort_order) values('subject','英語・医学英語Ⅳ',array[]::text[],420) on conflict(coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),name) do update set sort_order=excluded.sort_order,aliases=excluded.aliases,revision=qb_image_library_catalog.revision+1;
do $$
declare subject uuid;
begin
 select id into subject from public.qb_image_library_catalog where kind='subject' and name='消化器学';
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',subject,'消化管',10);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=subject and name='消化管'),'消化管総論',10);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='消化管') and name='消化管総論'),'解剖・発生',10);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='消化管') and name='消化管総論'),'生理',20);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='消化管') and name='消化管総論'),'腹痛',30);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='消化管') and name='消化管総論'),'悪心・嘔吐',40);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='消化管') and name='消化管総論'),'便通異常',50);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='消化管') and name='消化管総論'),'消化管出血',60);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='消化管') and name='消化管総論'),'検査',70);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='消化管') and name='消化管総論'),'消化器内視鏡',80);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=subject and name='消化管'),'口腔・咽頭',20);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='消化管') and name='口腔・咽頭'),'解剖・総論',10);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='消化管') and name='口腔・咽頭'),'口腔・咽頭の癌',20);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=subject and name='消化管'),'食道',30);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='消化管') and name='食道'),'解剖・生理・総論',10);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='消化管') and name='食道'),'食道アカラシア',20);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='消化管') and name='食道'),'Mallory-Weiss症候群',30);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='消化管') and name='食道'),'食道裂孔ヘルニア',40);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='消化管') and name='食道'),'胃食道逆流症（GERD）',50);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='消化管') and name='食道'),'Barrett食道',60);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='消化管') and name='食道'),'食道癌',70);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='消化管') and name='食道'),'食道・胃静脈瘤',80);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=subject and name='消化管'),'胃・十二指腸',40);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='消化管') and name='胃・十二指腸'),'解剖・生理・総論',10);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='消化管') and name='胃・十二指腸'),'機能性ディスペプシア',20);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='消化管') and name='胃・十二指腸'),'H. pylori感染症・胃炎',30);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='消化管') and name='胃・十二指腸'),'急性胃粘膜病変',40);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='消化管') and name='胃・十二指腸'),'胃・十二指腸潰瘍',50);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='消化管') and name='胃・十二指腸'),'消化管穿孔',60);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='消化管') and name='胃・十二指腸'),'胃ポリープ・胃腺腫',70);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='消化管') and name='胃・十二指腸'),'胃粘膜下腫瘍・GIST',80);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='消化管') and name='胃・十二指腸'),'胃癌',90);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='消化管') and name='胃・十二指腸'),'胃切除後症候群',100);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=subject and name='消化管'),'腸・腹膜',50);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='消化管') and name='腸・腹膜'),'解剖・生理・総論',10);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='消化管') and name='腸・腹膜'),'過敏性腸症候群',20);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='消化管') and name='腸・腹膜'),'腸閉塞・イレウス',30);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='消化管') and name='腸・腹膜'),'Crohn病',40);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='消化管') and name='腸・腹膜'),'潰瘍性大腸炎',50);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='消化管') and name='腸・腹膜'),'虚血性腸疾患',60);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='消化管') and name='腸・腹膜'),'薬剤性腸炎',70);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='消化管') and name='腸・腹膜'),'腹膜炎',80);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='消化管') and name='腸・腹膜'),'急性虫垂炎',90);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='消化管') and name='腸・腹膜'),'消化管憩室',100);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='消化管') and name='腸・腹膜'),'消化管神経内分泌腫瘍',110);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='消化管') and name='腸・腹膜'),'大腸癌・大腸ポリープ',120);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='消化管') and name='腸・腹膜'),'消化管ポリポーシス',130);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='消化管') and name='腸・腹膜'),'腹部ヘルニア',140);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='消化管') and name='腸・腹膜'),'直腸・肛門疾患',150);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',subject,'肝臓',20);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=subject and name='肝臓'),'肝臓総論',10);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='肝臓') and name='肝臓総論'),'解剖',10);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='肝臓') and name='肝臓総論'),'生理',20);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='肝臓') and name='肝臓総論'),'黄疸',30);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='肝臓') and name='肝臓総論'),'腹水',40);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='肝臓') and name='肝臓総論'),'門脈圧亢進症',50);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='肝臓') and name='肝臓総論'),'肝性脳症',60);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='肝臓') and name='肝臓総論'),'血液検査',70);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='肝臓') and name='肝臓総論'),'画像検査',80);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='肝臓') and name='肝臓総論'),'肝生検',90);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=subject and name='肝臓'),'肝炎・肝不全・肝硬変',20);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='肝臓') and name='肝炎・肝不全・肝硬変'),'ウイルス性肝炎',10);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='肝臓') and name='肝炎・肝不全・肝硬変'),'急性肝炎',20);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='肝臓') and name='肝炎・肝不全・肝硬変'),'慢性肝炎',30);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='肝臓') and name='肝炎・肝不全・肝硬変'),'急性肝不全',40);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='肝臓') and name='肝炎・肝不全・肝硬変'),'肝硬変',50);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=subject and name='肝臓'),'代謝性・薬物性肝疾患',30);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='肝臓') and name='代謝性・薬物性肝疾患'),'代謝機能障害関連脂肪性肝疾患（MASLD）',10);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='肝臓') and name='代謝性・薬物性肝疾患'),'アルコール関連肝疾患',20);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='肝臓') and name='代謝性・薬物性肝疾患'),'薬物性肝障害',30);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=subject and name='肝臓'),'自己免疫性肝疾患',40);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='肝臓') and name='自己免疫性肝疾患'),'自己免疫性肝炎',10);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='肝臓') and name='自己免疫性肝疾患'),'原発性胆汁性胆管炎',20);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=subject and name='肝臓'),'肝腫瘍・その他',50);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='肝臓') and name='肝腫瘍・その他'),'肝細胞癌',10);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='肝臓') and name='肝腫瘍・その他'),'肝移植',20);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='肝臓') and name='肝腫瘍・その他'),'その他の原発性肝癌',30);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='肝臓') and name='肝腫瘍・その他'),'転移性肝癌',40);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='肝臓') and name='肝腫瘍・その他'),'良性肝腫瘍・肝嚢胞',50);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='肝臓') and name='肝腫瘍・その他'),'肝膿瘍',60);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',subject,'胆道・膵臓',30);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=subject and name='胆道・膵臓'),'胆道・膵臓総論',10);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='胆道・膵臓') and name='胆道・膵臓総論'),'解剖',10);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='胆道・膵臓') and name='胆道・膵臓総論'),'生理',20);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='胆道・膵臓') and name='胆道・膵臓総論'),'検査',30);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=subject and name='胆道・膵臓'),'胆道疾患',20);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='胆道・膵臓') and name='胆道疾患'),'胆石症',10);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='胆道・膵臓') and name='胆道疾患'),'急性胆嚢炎',20);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='胆道・膵臓') and name='胆道疾患'),'急性胆管炎',30);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='胆道・膵臓') and name='胆道疾患'),'原発性硬化性胆管炎',40);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='胆道・膵臓') and name='胆道疾患'),'先天性胆道拡張症・胆道閉鎖症',50);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='胆道・膵臓') and name='胆道疾患'),'胆嚢癌',60);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='胆道・膵臓') and name='胆道疾患'),'肝外胆管癌',70);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='胆道・膵臓') and name='胆道疾患'),'乳頭部癌',80);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=subject and name='胆道・膵臓'),'膵臓疾患',30);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='胆道・膵臓') and name='膵臓疾患'),'急性膵炎',10);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='胆道・膵臓') and name='膵臓疾患'),'慢性膵炎',20);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='胆道・膵臓') and name='膵臓疾患'),'自己免疫性膵炎',30);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='胆道・膵臓') and name='膵臓疾患'),'膵癌',40);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='胆道・膵臓') and name='膵臓疾患'),'膵嚢胞性疾患',50);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='胆道・膵臓') and name='膵臓疾患'),'膵神経内分泌腫瘍',60);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',subject,'ケア・管理・外傷',40);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=subject and name='ケア・管理・外傷'),'周術期管理',10);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='ケア・管理・外傷') and name='周術期管理'),'手術',10);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='ケア・管理・外傷') and name='周術期管理'),'術後管理・合併症',20);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=subject and name='ケア・管理・外傷'),'栄養管理',20);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='ケア・管理・外傷') and name='栄養管理'),'経腸栄養',10);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='ケア・管理・外傷') and name='栄養管理'),'静脈栄養',20);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=(select id from public.qb_image_library_catalog where parent_id=subject and name='ケア・管理・外傷') and name='栄養管理'),'栄養療法の合併症',30);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=subject and name='ケア・管理・外傷'),'ストーマケア',30);
 insert into public.qb_image_library_catalog(kind,parent_id,name,sort_order) values('unit',(select id from public.qb_image_library_catalog where parent_id=subject and name='ケア・管理・外傷'),'腹部外傷',40);
end $$;
