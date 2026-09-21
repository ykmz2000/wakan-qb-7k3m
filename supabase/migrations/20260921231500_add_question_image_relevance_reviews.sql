create table if not exists public.qb_question_image_relevance_reviews (
  association_id uuid primary key,
  question_id uuid not null references public.questions(id) on delete cascade,
  image_path text not null,
  placement text not null,
  decision text not null check (decision in ('keep', 'remove')),
  reason text not null,
  association_snapshot jsonb not null,
  audit_batch text not null,
  reviewed_at timestamptz not null default now()
);

create index if not exists qb_question_image_relevance_reviews_question_id_idx
  on public.qb_question_image_relevance_reviews(question_id);

create index if not exists qb_question_image_relevance_reviews_audit_batch_idx
  on public.qb_question_image_relevance_reviews(audit_batch);

alter table public.qb_question_image_relevance_reviews enable row level security;

revoke all on table public.qb_question_image_relevance_reviews from public, anon, authenticated;
grant select, insert, update, delete on table public.qb_question_image_relevance_reviews to service_role;
