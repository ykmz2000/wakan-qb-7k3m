alter table public.qb_choice_correction_reviews
  add column if not exists frame_preserved boolean not null default false,
  add column if not exists axes_enumerated boolean not null default false,
  add column if not exists all_false_axes_repaired boolean not null default false,
  add column if not exists uniquely_true boolean not null default false,
  add column if not exists axis_notes text;

create or replace function public.qb_choice_correction_review_violations(p_unit_id uuid)
returns table(choice_id uuid, question_id uuid, canonical_key text, choice_key text, issue text)
language sql stable security definer set search_path=public,pg_temp
as $$
 select c.id,q.id,q.canonical_key,c.choice_key,
 case when r.choice_id is null then '正文化要否のレビュー記録なし'
      when r.audit_fingerprint is distinct from public.qb_choice_correction_fingerprint(c.id) then '選択肢変更後に正文化要否が再レビューされていない'
      when not r.frame_preserved then '原文の骨格保持が未確認'
      when not r.axes_enumerated then '独立した判定軸が未列挙'
      when not r.all_false_axes_repaired then '全誤軸の修正が未確認'
      when not r.uniquely_true then '修正後の一意な真文が未確認'
      when r.decision='required' and nullif(btrim(c.correction_text),'') is null then '正文化必須だが未作成'
      when r.decision='true_statement' and nullif(btrim(c.correction_text),'') is not null then '正文に不要な正文化がある'
 end
 from public.questions q join public.choices c on c.question_id=q.id
 left join public.qb_choice_correction_reviews r on r.choice_id=c.id
 where q.unit_id=p_unit_id and q.status='published'
 and (r.choice_id is null
   or r.audit_fingerprint is distinct from public.qb_choice_correction_fingerprint(c.id)
   or not r.frame_preserved or not r.axes_enumerated or not r.all_false_axes_repaired or not r.uniquely_true
   or (r.decision='required' and nullif(btrim(c.correction_text),'') is null)
   or (r.decision='true_statement' and nullif(btrim(c.correction_text),'') is not null));
$$;

revoke all on function public.qb_choice_correction_review_violations(uuid) from public,anon,authenticated;
