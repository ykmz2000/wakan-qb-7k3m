create table public.grades (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subjects
  add column grade_id uuid references public.grades(id) on delete restrict;

create unique index subjects_grade_slug_uniq
  on public.subjects(grade_id, slug)
  where grade_id is not null;

create trigger trg_grades_updated
before update on public.grades
for each row execute function public.set_updated_at();

alter table public.grades enable row level security;

create policy grades_read on public.grades
for select using (is_active or public.is_admin());

create policy admin_grades_all on public.grades
for all using (public.is_admin()) with check (public.is_admin());

insert into public.grades (code,name,sort_order,is_active)
values ('M4','M4',40,true)
on conflict (code) do nothing;

update public.subjects s
set grade_id = g.id
from public.grades g
where g.code='M4' and s.grade_id is null;
