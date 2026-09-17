-- Internal audit helper: keep it callable by privileged database roles and by
-- owner-executed gate functions, but do not expose it through the public API.
revoke execute on function public.qb_question_lecture_review_violations(uuid)
  from public, anon, authenticated;

grant execute on function public.qb_question_lecture_review_violations(uuid)
  to service_role;
