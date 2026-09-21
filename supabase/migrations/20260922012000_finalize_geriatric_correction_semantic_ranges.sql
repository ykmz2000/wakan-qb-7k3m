begin;

with payload as (
  select * from jsonb_to_recordset($qb$[
    {"id":"d582dea8-ae88-5817-855e-e8b3f1f320e7","marks":["必ずしも","とは限らない"]},
    {"id":"8692acf5-15e4-5581-a0bb-b278703c7f12","marks":["2016年","男性72.14年","女性74.79年"]},
    {"id":"68001089-83e8-5213-942e-51931e3dfe3a","marks":["安全に","範囲で続けてもらう"]},
    {"id":"40643ff5-5741-523c-8796-6f18ba6d8011","marks":["歩行能力を評価して適切な歩行補助具"]},
    {"id":"0ee7a866-cabc-5ffa-babb-3eddcd50572b","marks":["2kg以上","意図しない"]},
    {"id":"e9bd7a67-3e36-5346-a19a-e838076ba6f0","marks":["2kg以上","意図しない"]},
    {"id":"8f8847f1-7a56-51ce-91e9-658c411b448e","marks":["医師を含む多職種","共同して"]},
    {"id":"61e8b14a-341a-5ad8-9f69-d2f29ab9f8f0","marks":["家族・主介護者"]},
    {"id":"02c0fec7-2184-5efb-a300-7a0aac7610d9","marks":["IADL","BADL"]},
    {"id":"d828cc24-a6ba-5533-806f-839a846484d9","marks":["補助","3"]},
    {"id":"229f5252-6583-5cc2-803d-8349751ab6bd","correction_text":"骨粗鬆症診断にはX線による椎体骨折評価および骨密度測定が必須とは限らない","marks":["必須とは限らない"]},
    {"id":"6097581c-a9f5-5ed8-856f-d27b7c55508e","correction_text":"骨粗鬆症の治療薬として、骨折リスクと病態に応じた薬剤を選択する","marks":["骨折リスクと病態に応じた薬剤"]},
    {"id":"6d49a440-96d9-50ad-824d-6fa3ae8439c7","marks":["70％","30％"]},
    {"id":"60548f4e-13f1-59b3-89c0-e5d868bf5683","correction_text":"80 歳を超えると, 女性の骨粗鬆症罹患率は高くなる","marks":["罹患率は高くなる"]},
    {"id":"244c9813-dfa4-5d4b-91ac-e488e8eb5d38","marks":["1,280万人","約10％"]},
    {"id":"99de7cee-07f4-53f1-b086-c2dcdeaa16b9","marks":["女性","大きな要因"]},
    {"id":"1721d306-dfdd-51ca-840e-74591f9fc4ca","marks":["1,280万人","約10％"]},
    {"id":"e1d0a36c-1f94-590e-9857-183c211fe89b","marks":["20〜44歳"]},
    {"id":"3165c5ab-f6e1-58d8-a499-fad0cd9a2599","marks":["7割","3割"]},
    {"id":"4b37a76a-3140-5a73-8229-01a16ead2c9f","marks":["皮質骨","海綿骨"]},
    {"id":"3d000451-2df9-5240-b045-61f411451493","marks":["悪性腫瘍に伴う高カルシウム血症"]},
    {"id":"00cc3dd2-1684-53c3-bbef-3e3760750792","marks":["低リン血症"]},
    {"id":"a1cd583f-66ec-5547-9dd0-5a737941f780","marks":["左右上下2個ずつ","計4個"]},
    {"id":"093e8502-d082-50bf-a8a0-c8ee6da8de5f","marks":["破骨細胞"]},
    {"id":"2084c2f3-8423-59f4-8ab6-83895b653a0d","correction_text":"一般女性 65 歳の骨密度測定は二次予防である","marks":["二次予防"]},
    {"id":"dd664966-b0a0-5abc-9e1d-0a164eac5619","marks":["続発性骨粗鬆症","高リスク例"]},
    {"id":"e5a6ecc8-2deb-573a-8807-8574fd201c7d","marks":["原疾患を踏まえて調整する"]},
    {"id":"eca7b42d-fc07-5cf1-8434-c0b89aa39346","marks":["骨芽細胞","促す"]},
    {"id":"052c67cd-cbb7-5cc9-b7eb-b08910486062","marks":["破骨細胞","形成を抑え","骨吸収を抑制する"]},
    {"id":"48b4723e-d317-53fe-9149-711d458ca60a","marks":["限定的である"]},
    {"id":"880f7eb8-465f-5677-8f7d-a9397e914333","correction_text":"破骨細胞に取り込まれることで, 骨代謝回転を抑制する","marks":["破骨細胞"]},
    {"id":"7b29fdc1-11a3-5c1e-9c5d-622c60d9c03b","correction_text":"破骨細胞に取り込まれることで, 骨代謝回転を抑制する","marks":["破骨細胞"]},
    {"id":"ee0f19bc-8509-5ce2-b34b-310d1d4096eb","marks":["休薬は個別に判断する"]},
    {"id":"3e10c4dd-8906-5ce7-aafc-0fffef25841e","correction_text":"転倒の危険因子の内的要因として、視力障害 (白内障、近視) がある","marks":["内的"]},
    {"id":"40182c6a-c02f-5a0e-9f1d-8db8069186ba","correction_text":"骨強度の7 割を骨密度が、3 割を骨質が決めている","marks":["骨密度","骨質"]},
    {"id":"55349119-b264-59f8-bf9d-618d512662cd","correction_text":"活性型ビタミンD には血中リン濃度を上げる作用がある","marks":["活性型","上げる"]},
    {"id":"2ce27671-2bc9-53b2-997f-0b32f19de139","marks":["サービス","現物"]},
    {"id":"13375845-ee10-5730-93b4-0596b9816626","marks":["抑制"]},
    {"id":"e50e9b02-a8a8-5d58-9b51-1481f11a1304","marks":["抑制"]},
    {"id":"9c5e3004-6a1d-53fd-9d40-e0052eea5cf0","marks":["やすい"]},
    {"id":"3d20baf6-be7a-530e-b817-271e075f32d4","marks":["やすい"]},
    {"id":"5c7bbd4b-00ed-5b12-a703-44a35b9751ec","marks":["やすい"]},
    {"id":"59270e51-3c10-5ccc-b23e-3610eebe39cd","marks":["改善"]},
    {"id":"d9d7dfdc-118f-5f4b-958a-95cc46d37af1","marks":["多く","感染歴を有する"]},
    {"id":"64a19f9f-0478-5d19-b8fb-f28fc13c9388","marks":["0-IIa型","隆起型"]},
    {"id":"44b6a223-a536-58de-aa9b-3e630b61c65f","marks":["比較的若年女性"]}
  ]$qb$::jsonb)
  as x(id uuid,correction_text text,marks jsonb)
), ranges as (
  select
    p.id,
    c.correction_text,
    jsonb_agg(
      jsonb_build_object(
        'kind',k.kind,
        'start',strpos(c.correction_text,m.mark)-1,
        'end',strpos(c.correction_text,m.mark)-1+char_length(m.mark),
        'expected_text',m.mark
      ) order by strpos(c.correction_text,m.mark),k.kind_order
    ) as ranges
  from payload p
  join public.choices c on c.id=p.id
  cross join lateral jsonb_array_elements_text(p.marks) m(mark)
  cross join (values ('bold',1),('underline',2),('accent',3)) k(kind,kind_order)
  where strpos(c.correction_text,m.mark)>0
  group by p.id,c.correction_text
), applied as (
  update public.choices c
  set explanation_formatting=jsonb_set(
    coalesce(c.explanation_formatting,'{}'::jsonb),
    '{correction_text}',
    jsonb_build_object('version',1,'source_text',r.correction_text,'ranges',r.ranges),
    true
  )
  from ranges r
  where c.id=r.id
  returning c.id
)
update public.qb_choice_correction_reviews review
set audit_fingerprint=public.qb_choice_correction_fingerprint(review.choice_id),
    reviewed_at=now()
from applied a
where review.choice_id=a.id;

commit;
