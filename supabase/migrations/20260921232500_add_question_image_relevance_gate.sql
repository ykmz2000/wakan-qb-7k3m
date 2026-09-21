create or replace function public.qb_question_image_relevance_violations(p_subject_id uuid)
returns table (
  question_image_id uuid,
  question_id uuid,
  image_path text,
  issue text
)
language sql
stable
security definer
set search_path = public
as $$
  select qi.id,
         qi.question_id,
         qi.image_path,
         case
           when r.association_id is null then 'missing_review'
           when r.decision <> 'keep' then 'active_attachment_not_approved'
           when r.question_id <> qi.question_id
             or r.image_path <> qi.image_path
             or r.placement <> qi.placement then 'stale_review'
           else 'unknown'
         end
  from public.question_images qi
  join public.questions q on q.id = qi.question_id
  join public.units u on u.id = q.unit_id
  left join public.qb_question_image_relevance_reviews r
    on r.association_id = qi.id
  where q.status = 'published'
    and u.subject_id = p_subject_id
    and qi.placement = 'explanation_overview'
    and (
      r.association_id is null
      or r.decision <> 'keep'
      or r.question_id <> qi.question_id
      or r.image_path <> qi.image_path
      or r.placement <> qi.placement
    );
$$;

revoke execute on function public.qb_question_image_relevance_violations(uuid)
  from public, anon, authenticated;
grant execute on function public.qb_question_image_relevance_violations(uuid)
  to service_role;
