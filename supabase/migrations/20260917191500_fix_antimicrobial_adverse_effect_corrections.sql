begin;

with fixes(choice_id, correction_text, ranges) as (
  values
    (
      '2543777c-ebce-4ee3-99a5-71dc716154ed'::uuid,
      'ST合剤－高カリウム血症・腎障害',
      '[{"start":5,"end":16,"kind":"bold"},{"start":5,"end":16,"kind":"accent"}]'::jsonb
    ),
    (
      'dfd4720e-3905-4d02-bb8f-a941463a6113'::uuid,
      'エタンブトール－視神経炎',
      '[{"start":1,"end":2,"kind":"bold"},{"start":1,"end":2,"kind":"accent"},{"start":1,"end":2,"kind":"underline"},{"start":8,"end":12,"kind":"bold"},{"start":8,"end":12,"kind":"accent"}]'::jsonb
    ),
    (
      '323149e6-1260-49b0-a88f-df071923c11f'::uuid,
      'バンコマイシン－レッドマン症候群',
      '[{"start":8,"end":16,"kind":"bold"},{"start":8,"end":16,"kind":"accent"}]'::jsonb
    ),
    (
      '5a0e6ab9-b6e4-4231-b898-86b189fde116'::uuid,
      'ダプトマイシン－横紋筋融解症',
      '[{"start":8,"end":14,"kind":"bold"},{"start":8,"end":14,"kind":"accent"}]'::jsonb
    )
)
update public.choices as c
set correction_text = f.correction_text,
    explanation_formatting = jsonb_set(
      coalesce(c.explanation_formatting, '{}'::jsonb),
      '{correction_text}',
      jsonb_build_object(
        'version', 1,
        'source_text', f.correction_text,
        'ranges', f.ranges
      ),
      true
    )
from fixes as f
where c.id = f.choice_id;

update public.qb_choice_correction_reviews as r
set audit_fingerprint = public.qb_choice_correction_fingerprint(r.choice_id),
    decision = 'required',
    rationale = '原文の薬剤名―副作用という枠組みを保ち、誤っている薬剤名または副作用だけを最小差分で正文化した。',
    frame_preserved = true,
    axes_enumerated = true,
    all_false_axes_repaired = true,
    uniquely_true = true,
    axis_notes = '薬剤名の表記と副作用の対応を独立に確認。訂正文では原文との差分語だけを強調した。',
    reviewed_at = now()
where r.choice_id in (
  '2543777c-ebce-4ee3-99a5-71dc716154ed'::uuid,
  'dfd4720e-3905-4d02-bb8f-a941463a6113'::uuid,
  '323149e6-1260-49b0-a88f-df071923c11f'::uuid,
  '5a0e6ab9-b6e4-4231-b898-86b189fde116'::uuid
);

commit;
