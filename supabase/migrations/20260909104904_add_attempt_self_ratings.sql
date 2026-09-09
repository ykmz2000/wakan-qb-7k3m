-- Additive: historical attempts are not backfilled or modified.
create table public.attempt_self_ratings (
  attempt_id bigint primary key references public.attempts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating text check (rating in ('◎','○','△','×','-')),
  rating_source text check (rating_source in ('auto','manual')),
  rated_at timestamptz,
  created_at timestamptz not null default now(),
  constraint attempt_rating_complete check (
    (rating is null and rating_source is null and rated_at is null) or
    (rating is not null and rating_source is not null and rated_at is not null)
  )
);
create index attempt_self_ratings_user_idx on public.attempt_self_ratings(user_id);
create index attempts_user_question_id_desc_idx on public.attempts(user_id,question_id,id desc);
alter table public.attempt_self_ratings enable row level security;
revoke all on public.attempt_self_ratings from anon,authenticated;
grant select,insert on public.attempt_self_ratings to authenticated;
grant update (rating,rating_source,rated_at) on public.attempt_self_ratings to authenticated;
create policy attempt_ratings_self_select on public.attempt_self_ratings for select to authenticated using(user_id=(select auth.uid()));
create policy attempt_ratings_self_insert on public.attempt_self_ratings for insert to authenticated with check(
  user_id=(select auth.uid()) and exists(select 1 from public.attempts a where a.id=attempt_id and a.user_id=(select auth.uid()))
);
create policy attempt_ratings_self_update on public.attempt_self_ratings for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

-- Invoker rights: both reads and writes remain subject to the caller's RLS.
-- Update the per-attempt snapshot and the existing latest rating atomically.
create function public.save_attempt_self_rating(p_attempt_id bigint,p_rating text,p_source text default 'manual')
returns void language plpgsql security invoker set search_path='' as $$
declare
  actor uuid := auth.uid();
  q uuid;
  latest_id bigint;
  written bigint;
begin
  if actor is null then raise exception 'ログインが必要です'; end if;
  if p_source is null or p_source not in ('auto','manual') or (p_rating is not null and p_rating not in ('◎','○','△','×','-')) or (p_source='manual' and p_rating is null) then
    raise exception '自己評価の値が不正です';
  end if;
  select a.question_id into q from public.attempts a where a.id=p_attempt_id and a.user_id=actor;
  if q is null then raise exception '回答履歴を確認できません'; end if;
  select a.id into latest_id from public.attempts a where a.question_id=q and a.user_id=actor order by a.id desc limit 1;
  if p_source='manual' and latest_id<>p_attempt_id then raise exception '別の回答が保存されています。過去の自己評価は変更できません'; end if;
  if p_source='auto' then
    insert into public.attempt_self_ratings(attempt_id,user_id,rating,rating_source,rated_at)
    values(p_attempt_id,actor,p_rating,case when p_rating is not null then 'auto' end,case when p_rating is not null then now() end)
    on conflict(attempt_id) do nothing returning attempt_id into written;
  else
    insert into public.attempt_self_ratings(attempt_id,user_id,rating,rating_source,rated_at)
    values(p_attempt_id,actor,p_rating,'manual',now())
    on conflict(attempt_id) do update set rating=excluded.rating,rating_source=excluded.rating_source,rated_at=excluded.rated_at
    returning attempt_id into written;
  end if;
  if written is not null and p_rating is not null and latest_id=p_attempt_id then
    insert into public.question_ratings(user_id,question_id,rating,updated_at)
    values(actor,q,p_rating::public.rating_label,now())
    on conflict(user_id,question_id) do update set rating=excluded.rating,updated_at=excluded.updated_at;
  end if;
end;
$$;
revoke all on function public.save_attempt_self_rating(bigint,text,text) from public,anon;
grant execute on function public.save_attempt_self_rating(bigint,text,text) to authenticated;
