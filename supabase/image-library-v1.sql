-- Additive deployment script: no existing table, policy, image, or question is rewritten.
-- Apply once as migration qb_image_library_v1. Disable config.enabled to roll UI back.
create table public.qb_image_library_config (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default true
);
insert into public.qb_image_library_config values(true,true);

create table public.qb_image_library_items (
  id uuid primary key default gen_random_uuid(),
  object_path text not null unique,
  original_path text not null,
  image_version integer not null default 1,
  metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),
  manual_fields text[] not null default '{}',
  ai_suggestions jsonb not null default '{}'::jsonb,
  revision integer not null default 1,
  archived boolean not null default false,
  change_origin text not null default 'manual' check(change_origin in ('manual','ai')),
  change_reason text not null default '画像を追加',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.qb_image_library_history (
  id bigint generated always as identity primary key,
  image_id uuid not null references public.qb_image_library_items(id),
  revision integer not null,
  before_value jsonb,
  after_value jsonb not null,
  actor_id uuid default auth.uid(),
  origin text not null,
  reason text not null,
  created_at timestamptz not null default now(),
  unique(image_id,revision)
);
create table public.qb_image_library_readings (
  id uuid primary key,
  image_id uuid not null references public.qb_image_library_items(id),
  image_version integer not null,
  raw_text text not null default '',
  corrected_text text not null default '',
  visual_summary text not null default '',
  repairs jsonb not null default '[]' check(jsonb_typeof(repairs)='array'),
  actor_id uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create table public.qb_image_library_usages (
  id uuid primary key,
  image_id uuid not null references public.qb_image_library_items(id),
  image_version integer not null,
  source_revision integer not null,
  source_name text not null,
  question_image_id uuid not null unique,
  question_id uuid not null,
  placement text not null,
  choice_id uuid,
  initial_copy_path text not null unique,
  actor_id uuid default auth.uid(),
  created_at timestamptz not null default now()
);
-- Trace IDs deliberately have no cascade FK to questions/images: deleting a use
-- must not delete its provenance or any original, and vice versa.
create table public.qb_image_library_terms (
  id uuid primary key default gen_random_uuid(),
  canonical text not null unique check(length(canonical) between 1 and 200),
  aliases text[] not null default '{}',
  revision integer not null default 1,
  updated_at timestamptz not null default now()
);
insert into public.qb_image_library_terms(canonical,aliases) values
 ('動眼神経',array['どうがんしんけい']),
 ('眼球運動',array['がんきゅううんどう']),
 ('眼窩底骨折',array['がんかていこっせつ']),
 ('総まとめ',array['まとめ','総覧']);

alter table public.qb_image_library_config enable row level security;
alter table public.qb_image_library_items enable row level security;
alter table public.qb_image_library_history enable row level security;
alter table public.qb_image_library_readings enable row level security;
alter table public.qb_image_library_usages enable row level security;
alter table public.qb_image_library_terms enable row level security;
create policy qb_library_config_admin on public.qb_image_library_config for all to authenticated using((select public.is_admin())) with check((select public.is_admin()));
create policy qb_library_items_admin on public.qb_image_library_items for all to authenticated using((select public.is_admin())) with check((select public.is_admin()));
create policy qb_library_history_read on public.qb_image_library_history for select to authenticated using((select public.is_admin()));
create policy qb_library_history_append on public.qb_image_library_history for insert to authenticated with check((select public.is_admin()));
create policy qb_library_readings_read on public.qb_image_library_readings for select to authenticated using((select public.is_admin()));
create policy qb_library_readings_append on public.qb_image_library_readings for insert to authenticated with check((select public.is_admin()));
create policy qb_library_usages_read on public.qb_image_library_usages for select to authenticated using((select public.is_admin()));
create policy qb_library_usages_append on public.qb_image_library_usages for insert to authenticated with check((select public.is_admin()));
create policy qb_library_terms_admin on public.qb_image_library_terms for all to authenticated using((select public.is_admin())) with check((select public.is_admin()));
revoke all on public.qb_image_library_config,public.qb_image_library_items,public.qb_image_library_history,public.qb_image_library_readings,public.qb_image_library_usages,public.qb_image_library_terms from anon,authenticated;
grant select,update on public.qb_image_library_config to authenticated;
grant select,insert,update on public.qb_image_library_items,public.qb_image_library_terms to authenticated;
grant select,insert on public.qb_image_library_history,public.qb_image_library_readings,public.qb_image_library_usages to authenticated;
grant usage,select on sequence public.qb_image_library_history_id_seq to authenticated;
grant all on public.qb_image_library_config,public.qb_image_library_items,public.qb_image_library_history,public.qb_image_library_readings,public.qb_image_library_usages,public.qb_image_library_terms to service_role;
grant usage,select on sequence public.qb_image_library_history_id_seq to service_role;
create index qb_library_items_recent on public.qb_image_library_items(archived,created_at desc,id);
create index qb_library_items_metadata on public.qb_image_library_items using gin(metadata);
create index qb_library_usages_image on public.qb_image_library_usages(image_id,created_at desc);
create index qb_library_readings_image on public.qb_image_library_readings(image_id,created_at desc);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('qb-image-library','qb-image-library',false,20971520,array['image/png','image/jpeg','image/webp','image/gif','image/heic','image/heif']);
create policy qb_library_original_read on storage.objects for select to authenticated using(bucket_id='qb-image-library' and (select public.is_admin()));
create policy qb_library_original_insert on storage.objects for insert to authenticated with check(bucket_id='qb-image-library' and (select public.is_admin()));
-- No UPDATE/DELETE policy: editing uploads a new path; removal is reversible archive.

create function public.qb_library_assert_admin() returns void language plpgsql security invoker set search_path='' as $$
begin
 if not (current_user in ('postgres','service_role') or public.is_admin()) then raise exception '管理者権限が必要です' using errcode='42501'; end if;
 if not exists(select 1 from public.qb_image_library_config where enabled) then raise exception '画像ライブラリは現在停止しています'; end if;
end $$;

create function public.qb_library_validate_metadata(m jsonb) returns void language plpgsql immutable security invoker set search_path='' as $$
declare k text; v jsonb;
begin
 if jsonb_typeof(m) is distinct from 'object' then raise exception '項目の形式が不正です'; end if;
 for k,v in select * from jsonb_each(m) loop
  if k=any(array['subject_ids','topics','keywords','aspects','roles','aliases','related_keywords']) then
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

create function public.qb_library_before_write() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 perform public.qb_library_assert_admin();
 perform public.qb_library_validate_metadata(new.metadata);
 if exists(select 1 from jsonb_array_elements_text(coalesce(new.metadata->'subject_ids','[]')) s where not exists(select 1 from public.subjects where id::text=s)) then raise exception '存在しない科目が含まれています'; end if;
 if new.object_path not like new.id::text||'/%' or new.original_path not like new.id::text||'/%' then raise exception '原本の保存先が不正です'; end if;
 if tg_op='UPDATE' then
  if new.id<>old.id or new.original_path<>old.original_path or new.created_by is distinct from old.created_by or new.created_at<>old.created_at then raise exception '原本の識別情報は変更できません'; end if;
  new.revision=old.revision+1;
  new.image_version=old.image_version+case when new.object_path<>old.object_path then 1 else 0 end;
 else new.revision=1;new.image_version=1;
 end if;
 new.updated_at=clock_timestamp();return new;
end $$;
create function public.qb_library_after_write() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 insert into public.qb_image_library_history(image_id,revision,before_value,after_value,origin,reason)
 values(new.id,new.revision,case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new),new.change_origin,new.change_reason);
 return new;
end $$;
create trigger qb_library_before_write before insert or update on public.qb_image_library_items for each row execute function public.qb_library_before_write();
create trigger qb_library_after_write after insert or update on public.qb_image_library_items for each row execute function public.qb_library_after_write();

create function public.qb_library_save(p_id uuid,p_revision integer,p_patch jsonb,p_origin text default 'manual',p_reason text default '情報を編集',p_archived boolean default null,p_object_path text default null)
returns public.qb_image_library_items language plpgsql security invoker set search_path='' as $$
declare r public.qb_image_library_items; m jsonb; proposals jsonb; locked text[]; k text; v jsonb;
begin
 perform public.qb_library_assert_admin();perform public.qb_library_validate_metadata(p_patch);
 if p_origin not in ('manual','ai') then raise exception '変更元が不正です'; end if;
 select * into r from public.qb_image_library_items where id=p_id for update;
 if not found then raise exception '画像が見つかりません'; end if;
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

create function public.qb_library_record_reading(p_id uuid,p_revision integer,p_image_version integer,p_request_id uuid,p_reading jsonb,p_classification jsonb default '{}')
returns public.qb_image_library_items language plpgsql security invoker set search_path='' as $$
declare r public.qb_image_library_items; patch jsonb; repair jsonb; repairs jsonb;
begin
 perform public.qb_library_assert_admin();
 select * into r from public.qb_image_library_items where id=p_id for update;
 if not found then raise exception '画像が見つかりません'; end if;
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

create function public.qb_library_attach(p_id uuid,p_revision integer,p_question_id uuid,p_placement text,p_choice_id uuid,p_copy_path text,p_request_id uuid)
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
 select * into r from public.qb_image_library_items where id=p_id and not archived for share;
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

create function public.qb_library_normalize(t text) returns text language sql immutable parallel safe security invoker set search_path='' as $$
 select trim(regexp_replace(translate(lower(normalize(coalesce(t,''),NFKC)),
 'ァアィイゥウェエォオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂッツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモャヤュユョヨラリルレロヮワヰヱヲンヴヵヶ',
 'ぁあぃいぅうぇえぉおかがきぎくぐけげこごさざしじすずせぜそぞただちぢっつづてでとどなにぬねのはばぱひびぴふぶぷへべぺほぼぽまみむめもゃやゅゆょよらりるれろゎわゐゑをんゔゕゖ'),'[[:space:]]+',' ','g'));
$$;
create function public.qb_library_search(p_query text default '',p_subjects uuid[] default '{}',p_aspect text default '',p_analysis text default '',p_classification text default '',p_used text default '',p_related boolean default false,p_archived boolean default false,p_offset integer default 0,p_limit integer default 30)
returns table(item jsonb,score integer,match_source text,match_text text,total_count bigint,use_count bigint)
language sql stable security invoker set search_path='' as $$
 with normalized as (select public.qb_library_normalize(left(p_query,500)) q),
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
  and (p_aspect='' or i.metadata->'aspects' ? p_aspect)
  and (p_analysis='' or coalesce(i.metadata->>'analysis_status','unprocessed')=p_analysis)
  and (p_classification='' or coalesce(i.metadata->>'classification_status','unknown')=p_classification)
 ), matches as (
  select i.*,coalesce(s.points,0)::integer points,coalesce(s.source,'') source,coalesce(s.excerpt,'') excerpt,s.matched
  from candidates i left join lateral (
   select sum(best.weight) points,count(*) matched,(array_agg(best.field order by best.weight desc))[1] source,(array_agg(best.body order by best.weight desc))[1] excerpt
   from (select distinct token from forms) tok cross join lateral (
    select f.field,f.body,f.weight from (values
     ('name',coalesce(i.metadata->>'name',''),110),('topics',coalesce(i.metadata->>'topics',''),100),
     ('aliases',coalesce(i.metadata->>'aliases',''),90),('keywords',coalesce(i.metadata->>'keywords',''),85),
     ('subject_ids',coalesce((select string_agg(s.name,'、') from public.subjects s where i.metadata->'subject_ids' ? s.id::text),''),80),('roles',coalesce(i.metadata->>'roles',''),75),('aspects',coalesce(i.metadata->>'aspects',''),70),
     ('ocr_text',coalesce(i.metadata->>'ocr_text',''),45),('notes',coalesce(i.metadata->>'notes',''),40),
     ('visual_summary',coalesce(i.metadata->>'visual_summary',''),40),
     ('related_keywords',case when p_related then coalesce(i.metadata->>'related_keywords','') else '' end,10)
    ) f(field,body,weight)
    where exists(select 1 from forms where forms.token=tok.token and position(forms.form in public.qb_library_normalize(f.body))>0)
    order by f.weight desc limit 1
   ) best
  ) s on true
 )
 select to_jsonb(m)-'uses'-'points'-'source'-'excerpt'-'matched',m.points,m.source,m.excerpt,count(*) over(),m.uses
 from matches m where coalesce(m.matched,0)=(select count(distinct token) from forms)
 and (p_used='' or (p_used='used' and m.uses>0) or (p_used='unused' and m.uses=0))
 order by m.points desc,m.created_at desc,m.id limit greatest(1,least(p_limit,60)) offset greatest(0,p_offset);
$$;
-- Restrict all newly added API functions explicitly (including default PUBLIC execute).
revoke all on function public.qb_library_assert_admin(),public.qb_library_validate_metadata(jsonb),public.qb_library_before_write(),public.qb_library_after_write(),public.qb_library_save(uuid,integer,jsonb,text,text,boolean,text),public.qb_library_record_reading(uuid,integer,integer,uuid,jsonb,jsonb),public.qb_library_attach(uuid,integer,uuid,text,uuid,text,uuid),public.qb_library_normalize(text),public.qb_library_search(text,uuid[],text,text,text,text,boolean,boolean,integer,integer) from public,anon;
grant execute on function public.qb_library_assert_admin(),public.qb_library_validate_metadata(jsonb),public.qb_library_before_write(),public.qb_library_after_write(),public.qb_library_save(uuid,integer,jsonb,text,text,boolean,text),public.qb_library_record_reading(uuid,integer,integer,uuid,jsonb,jsonb),public.qb_library_attach(uuid,integer,uuid,text,uuid,text,uuid),public.qb_library_normalize(text),public.qb_library_search(text,uuid[],text,text,text,text,boolean,boolean,integer,integer) to authenticated,service_role;

-- Search vocabulary edits also keep an append-only audit record.
create table public.qb_image_library_term_history (
 id bigint generated always as identity primary key,
 term_id uuid not null references public.qb_image_library_terms(id),
 before_value jsonb, after_value jsonb not null,
 actor_id uuid default auth.uid(), created_at timestamptz not null default now()
);
alter table public.qb_image_library_term_history enable row level security;
create policy qb_library_term_history_read on public.qb_image_library_term_history for select to authenticated using((select public.is_admin()));
create policy qb_library_term_history_append on public.qb_image_library_term_history for insert to authenticated with check((select public.is_admin()));
revoke all on public.qb_image_library_term_history from anon,authenticated;
grant select,insert on public.qb_image_library_term_history to authenticated;
grant usage,select on sequence public.qb_image_library_term_history_id_seq to authenticated,service_role;
grant all on public.qb_image_library_term_history to service_role;
create index qb_library_term_history_term on public.qb_image_library_term_history(term_id,created_at desc);
create function public.qb_library_term_write() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 perform public.qb_library_assert_admin();
 if cardinality(new.aliases)>100 or exists(select 1 from unnest(new.aliases) a where a is null or length(a)>200) then raise exception '別名を確認してください';end if;
 if tg_op='UPDATE' then
  if new.id<>old.id then raise exception '検索語IDは変更できません';end if;
  new.revision=old.revision+1;
 end if;
 new.updated_at=clock_timestamp();return new;
end $$;
create function public.qb_library_term_audit() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 insert into public.qb_image_library_term_history(term_id,before_value,after_value)
 values(new.id,case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));return new;
end $$;
create trigger qb_library_term_write before insert or update on public.qb_image_library_terms for each row execute function public.qb_library_term_write();
create trigger qb_library_term_audit after insert or update on public.qb_image_library_terms for each row execute function public.qb_library_term_audit();
revoke all on function public.qb_library_term_write(),public.qb_library_term_audit() from public,anon;
grant execute on function public.qb_library_term_write(),public.qb_library_term_audit() to authenticated,service_role;
