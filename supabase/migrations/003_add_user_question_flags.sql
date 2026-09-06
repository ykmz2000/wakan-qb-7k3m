create table if not exists public.user_question_flags (
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  flag_type text not null check (length(btrim(flag_type)) > 0),
  created_at timestamptz not null default now(),
  primary key (user_id, question_id, flag_type)
);

create index if not exists user_question_flags_question_type_idx
  on public.user_question_flags (question_id, flag_type);

alter table public.user_question_flags enable row level security;

drop policy if exists "users_select_own_question_flags" on public.user_question_flags;
create policy "users_select_own_question_flags"
  on public.user_question_flags for select
  using (auth.uid() = user_id);

drop policy if exists "users_insert_own_question_flags" on public.user_question_flags;
create policy "users_insert_own_question_flags"
  on public.user_question_flags for insert
  with check (auth.uid() = user_id);

drop policy if exists "users_delete_own_question_flags" on public.user_question_flags;
create policy "users_delete_own_question_flags"
  on public.user_question_flags for delete
  using (auth.uid() = user_id);
