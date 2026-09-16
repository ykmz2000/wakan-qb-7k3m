-- Search published questions in Postgres instead of downloading the entire QB.
-- Superseded by the paginated signature in the following migration.
create or replace function public.qb_search_questions(
  p_tokens text[],
  p_subject_id uuid default null,
  p_allowed_subject_ids uuid[] default '{}'::uuid[],
  p_limit integer default 100
)
returns table (
  id uuid, subject_id uuid, unit_id uuid, stem text, instruction text,
  study_order integer, explanation_overview text, examiner_intent text,
  exam_summary text, medical_verification_note text, choices jsonb,
  question_occurrences jsonb
)
language sql stable security invoker set search_path = ''
as $$
  with choice_documents as (
    select c.question_id,
      jsonb_agg(jsonb_build_object(
        'choice_key',c.choice_key,'choice_text',c.choice_text,'is_correct',c.is_correct,
        'explanation',c.explanation,'correction_text',c.correction_text,
        'correct_for_other_context',c.correct_for_other_context,
        'examiner_distinction',c.examiner_distinction
      ) order by c.sort_order,c.choice_key) rows,
      concat_ws(' ',
        string_agg(concat_ws(' ',c.choice_key,c.choice_text),' '),
        string_agg(case when c.is_correct then concat_ws(' ',c.choice_key,c.choice_text) end,' '),
        string_agg(concat_ws(' ',c.explanation,c.correction_text,c.correct_for_other_context,c.examiner_distinction),' ')
      ) search_text
    from public.choices c group by c.question_id
  ), occurrence_documents as (
    select o.question_id,
      jsonb_agg(jsonb_build_object(
        'academic_year',o.academic_year,'exam_type',o.exam_type,
        'original_question_number',o.original_question_number,'official_answer',o.official_answer
      ) order by o.academic_year desc nulls last,o.exam_type,o.original_question_number) rows,
      string_agg(o.official_answer::text,' ') search_text
    from public.question_occurrences o group by o.question_id
  ), searchable as (
    select q.id,q.subject_id,q.unit_id,q.stem,q.instruction,q.study_order,
      q.explanation_overview,q.examiner_intent,q.exam_summary,q.medical_verification_note,
      coalesce(c.rows,'[]'::jsonb) choices,coalesce(o.rows,'[]'::jsonb) question_occurrences,
      lower(concat_ws(' ',q.stem,q.instruction,q.explanation_overview,q.examiner_intent,
        q.exam_summary,q.medical_verification_note,coalesce(c.search_text,''),coalesce(o.search_text,''))) search_text
    from public.questions q
    left join choice_documents c on c.question_id=q.id
    left join occurrence_documents o on o.question_id=q.id
    where q.status='published' and (
      (p_subject_id is not null and q.subject_id=p_subject_id) or
      (p_subject_id is null and (coalesce(cardinality(p_allowed_subject_ids),0)=0 or q.subject_id=any(p_allowed_subject_ids)))
    )
  )
  select s.id,s.subject_id,s.unit_id,s.stem,s.instruction,s.study_order,
    s.explanation_overview,s.examiner_intent,s.exam_summary,s.medical_verification_note,
    s.choices,s.question_occurrences
  from searchable s
  where coalesce(cardinality(p_tokens),0)>0
    and not exists(select 1 from unnest(p_tokens) token where token='' or strpos(s.search_text,lower(token))=0)
  order by s.study_order nulls last,s.id
  limit least(greatest(coalesce(p_limit,100),1),100);
$$;
revoke all on function public.qb_search_questions(text[],uuid,uuid[],integer) from public,anon;
grant execute on function public.qb_search_questions(text[],uuid,uuid[],integer) to authenticated,service_role;
