create extension if not exists pgcrypto;

create type public.app_role as enum ('user','admin');
create type public.question_status as enum ('draft','published','archived');
create type public.rating_label as enum ('◎','○','△','×','-');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role public.app_role not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.units (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  slug text not null,
  name text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(subject_id, slug)
);

create table public.subtopics (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete cascade,
  slug text not null,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(unit_id, slug)
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  subtopic_id uuid references public.subtopics(id) on delete set null,
  canonical_key text unique,
  stem text not null,
  instruction text,
  answer_mode text not null default 'multiple' check (answer_mode in ('single','multiple')),
  status public.question_status not null default 'draft',
  source_note text,
  explanation_overview text,
  examiner_intent text,
  exam_summary text,
  medical_verification_note text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.choices (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  choice_key text not null,
  choice_text text not null,
  is_correct boolean not null default false,
  sort_order int not null default 0,
  explanation text,
  correction_text text,
  correct_for_other_context text,
  examiner_distinction text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(question_id, choice_key)
);

create table public.question_occurrences (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  academic_year int not null,
  exam_type text not null check (exam_type in ('本試','再試','その他')),
  original_question_number text not null,
  source_page int,
  source_file text,
  exact_stem text,
  exact_choices jsonb,
  official_answer jsonb,
  answer_source text,
  occurrence_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(question_id, academic_year, exam_type, original_question_number)
);

create table public.question_images (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  image_path text not null,
  caption text,
  alt_text text,
  placement text not null default 'explanation' check (placement in ('question','explanation','choice')),
  choice_id uuid references public.choices(id) on delete cascade,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  occurrence_id uuid references public.question_occurrences(id) on delete set null,
  selected_choice_keys text[] not null default '{}',
  is_correct boolean not null,
  answered_at timestamptz not null default now()
);
create index attempts_user_question_time_idx on public.attempts(user_id, question_id, answered_at desc);

create table public.question_ratings (
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  rating public.rating_label not null,
  updated_at timestamptz not null default now(),
  primary key(user_id, question_id)
);

create table public.user_notes (
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  note_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(user_id, question_id)
);

create table public.question_revisions (
  id bigint generated always as identity primary key,
  question_id uuid not null references public.questions(id) on delete cascade,
  changed_by uuid references public.profiles(id) on delete set null,
  change_summary text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger trg_subjects_updated before update on public.subjects for each row execute function public.set_updated_at();
create trigger trg_units_updated before update on public.units for each row execute function public.set_updated_at();
create trigger trg_subtopics_updated before update on public.subtopics for each row execute function public.set_updated_at();
create trigger trg_questions_updated before update on public.questions for each row execute function public.set_updated_at();
create trigger trg_choices_updated before update on public.choices for each row execute function public.set_updated_at();
create trigger trg_occurrences_updated before update on public.question_occurrences for each row execute function public.set_updated_at();
create trigger trg_images_updated before update on public.question_images for each row execute function public.set_updated_at();
create trigger trg_ratings_updated before update on public.question_ratings for each row execute function public.set_updated_at();
create trigger trg_notes_updated before update on public.user_notes for each row execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin');
$$;

alter table public.profiles enable row level security;
alter table public.subjects enable row level security;
alter table public.units enable row level security;
alter table public.subtopics enable row level security;
alter table public.questions enable row level security;
alter table public.choices enable row level security;
alter table public.question_occurrences enable row level security;
alter table public.question_images enable row level security;
alter table public.attempts enable row level security;
alter table public.question_ratings enable row level security;
alter table public.user_notes enable row level security;
alter table public.question_revisions enable row level security;

create policy profiles_read_self on public.profiles for select using (id=auth.uid() or public.is_admin());
create policy profiles_update_self on public.profiles for update using (id=auth.uid() or public.is_admin()) with check (id=auth.uid() or public.is_admin());

create policy subjects_read on public.subjects for select using (is_active or public.is_admin());
create policy units_read on public.units for select using (is_active or public.is_admin());
create policy subtopics_read on public.subtopics for select using (true);
create policy questions_read on public.questions for select using (status='published' or public.is_admin());
create policy choices_read on public.choices for select using (exists(select 1 from public.questions q where q.id=question_id and (q.status='published' or public.is_admin())));
create policy occurrences_read on public.question_occurrences for select using (exists(select 1 from public.questions q where q.id=question_id and (q.status='published' or public.is_admin())));
create policy images_read on public.question_images for select using (exists(select 1 from public.questions q where q.id=question_id and (q.status='published' or public.is_admin())));

create policy admin_subjects_all on public.subjects for all using (public.is_admin()) with check (public.is_admin());
create policy admin_units_all on public.units for all using (public.is_admin()) with check (public.is_admin());
create policy admin_subtopics_all on public.subtopics for all using (public.is_admin()) with check (public.is_admin());
create policy admin_questions_all on public.questions for all using (public.is_admin()) with check (public.is_admin());
create policy admin_choices_all on public.choices for all using (public.is_admin()) with check (public.is_admin());
create policy admin_occurrences_all on public.question_occurrences for all using (public.is_admin()) with check (public.is_admin());
create policy admin_images_all on public.question_images for all using (public.is_admin()) with check (public.is_admin());
create policy admin_revisions_all on public.question_revisions for all using (public.is_admin()) with check (public.is_admin());

create policy attempts_self_select on public.attempts for select using (user_id=auth.uid());
create policy attempts_self_insert on public.attempts for insert with check (user_id=auth.uid());
create policy attempts_self_delete on public.attempts for delete using (user_id=auth.uid());
create policy ratings_self_all on public.question_ratings for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy notes_self_all on public.user_notes for all using (user_id=auth.uid()) with check (user_id=auth.uid());

insert into storage.buckets (id,name,public)
values ('question-images','question-images',true)
on conflict (id) do nothing;

create policy question_images_public_read on storage.objects for select using (bucket_id='question-images');
create policy question_images_admin_write on storage.objects for insert with check (bucket_id='question-images' and public.is_admin());
create policy question_images_admin_update on storage.objects for update using (bucket_id='question-images' and public.is_admin()) with check (bucket_id='question-images' and public.is_admin());
create policy question_images_admin_delete on storage.objects for delete using (bucket_id='question-images' and public.is_admin());
