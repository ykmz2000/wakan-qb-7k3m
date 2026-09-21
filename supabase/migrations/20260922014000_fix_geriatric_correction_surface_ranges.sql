begin;

with payload as (
  select * from jsonb_to_recordset($qb$[
    {"id":"61e8b14a-341a-5ad8-9f69-d2f29ab9f8f0","correction_text":"本人と家族・主介護者に対して行うことが原則である。","marks":["と家族・主介護者"]},
    {"id":"6097581c-a9f5-5ed8-856f-d27b7c55508e","correction_text":"骨粗鬆症の治療薬として、骨折リスクと病態に応じた薬剤を選択する","marks":["骨折リスクと病態に応じた薬剤を選択する"]},
    {"id":"60548f4e-13f1-59b3-89c0-e5d868bf5683","correction_text":"80 歳を超えると, 女性の骨粗鬆症罹患率は高くなる","marks":["女性の骨粗鬆症罹患率は高くなる"]},
    {"id":"d828cc24-a6ba-5533-806f-839a846484d9","correction_text":"成年後見制度は、判断能力に応じて補助、保佐、後見の 3 種類に分類される","marks":["補助、","3"]},
    {"id":"99de7cee-07f4-53f1-b086-c2dcdeaa16b9","correction_text":"骨粗鬆症は女性で健康寿命を縮める大きな要因である","marks":["女性で","大きな要因である"]},
    {"id":"e1d0a36c-1f94-590e-9857-183c211fe89b","correction_text":"YAM の基準は 20〜44 歳である","marks":["20〜44 歳"]},
    {"id":"3165c5ab-f6e1-58d8-a499-fad0cd9a2599","correction_text":"骨強度の7割は骨密度によって、残りの3割が骨質によって規定される","marks":["7割","3割"]},
    {"id":"8692acf5-15e4-5581-a0bb-b278703c7f12","correction_text":"いわゆる「健康寿命」は2016年では男性72.14年、女性74.79年である","marks":["2016年では男性72.14年、女性74.79年"]},
    {"id":"3d000451-2df9-5240-b045-61f411451493","correction_text":"PTHrP (副甲状腺ホルモン関連ペプチド) により悪性腫瘍に伴う高カルシウム血症が引き起こ される","marks":["悪性腫瘍に伴う高カルシウム血症"]},
    {"id":"a1cd583f-66ec-5547-9dd0-5a737941f780","correction_text":"副甲状腺は甲状腺の裏側に左右上下2個ずつ、計4個存在する米粒半分くらいの臓器である","marks":["左右上下2個ずつ、計4個"]},
    {"id":"dd664966-b0a0-5abc-9e1d-0a164eac5619","correction_text":"本症例は、続発性骨粗鬆症の高リスク例である","marks":["続発性骨粗鬆症の高リスク例である"]},
    {"id":"e5a6ecc8-2deb-573a-8807-8574fd201c7d","correction_text":"副腎皮質ホルモンは原疾患を踏まえて調整する","marks":["は原疾患を踏まえて調整する"]},
    {"id":"052c67cd-cbb7-5cc9-b7eb-b08910486062","correction_text":"抗RANKL抗体薬は破骨細胞の形成を抑え、骨吸収を抑制する","marks":["破骨細胞の形成を抑え、骨吸収を抑制する"]},
    {"id":"48b4723e-d317-53fe-9149-711d458ca60a","correction_text":"カルシウム薬の経口投与による骨密度改善効果は限定的である","marks":["による骨密度改善効果は限定的である"]},
    {"id":"ee0f19bc-8509-5ce2-b34b-310d1d4096eb","correction_text":"侵襲的歯科治療を行う場合は, 休薬を個別に判断する","marks":["休薬を個別に判断する"]},
    {"id":"3e10c4dd-8906-5ce7-aafc-0fffef25841e","correction_text":"転倒の危険因子の内的要因として、視力障害 (白内障、近視) がある","marks":["内的"]}
  ]$qb$::jsonb)
  as x(id uuid,correction_text text,marks jsonb)
)
update public.choices c
set correction_text=p.correction_text
from payload p
where c.id=p.id;

with payload as (
  select * from jsonb_to_recordset($qb$[
    {"id":"61e8b14a-341a-5ad8-9f69-d2f29ab9f8f0","correction_text":"本人と家族・主介護者に対して行うことが原則である。","marks":["と家族・主介護者"]},
    {"id":"6097581c-a9f5-5ed8-856f-d27b7c55508e","correction_text":"骨粗鬆症の治療薬として、骨折リスクと病態に応じた薬剤を選択する","marks":["骨折リスクと病態に応じた薬剤を選択する"]},
    {"id":"60548f4e-13f1-59b3-89c0-e5d868bf5683","correction_text":"80 歳を超えると, 女性の骨粗鬆症罹患率は高くなる","marks":["女性の骨粗鬆症罹患率は高くなる"]},
    {"id":"d828cc24-a6ba-5533-806f-839a846484d9","correction_text":"成年後見制度は、判断能力に応じて補助、保佐、後見の 3 種類に分類される","marks":["補助、","3"]},
    {"id":"99de7cee-07f4-53f1-b086-c2dcdeaa16b9","correction_text":"骨粗鬆症は女性で健康寿命を縮める大きな要因である","marks":["女性で","大きな要因である"]},
    {"id":"e1d0a36c-1f94-590e-9857-183c211fe89b","correction_text":"YAM の基準は 20〜44 歳である","marks":["20〜44 歳"]},
    {"id":"3165c5ab-f6e1-58d8-a499-fad0cd9a2599","correction_text":"骨強度の7割は骨密度によって、残りの3割が骨質によって規定される","marks":["7割","3割"]},
    {"id":"8692acf5-15e4-5581-a0bb-b278703c7f12","correction_text":"いわゆる「健康寿命」は2016年では男性72.14年、女性74.79年である","marks":["2016年では男性72.14年、女性74.79年"]},
    {"id":"3d000451-2df9-5240-b045-61f411451493","correction_text":"PTHrP (副甲状腺ホルモン関連ペプチド) により悪性腫瘍に伴う高カルシウム血症が引き起こ される","marks":["悪性腫瘍に伴う高カルシウム血症"]},
    {"id":"a1cd583f-66ec-5547-9dd0-5a737941f780","correction_text":"副甲状腺は甲状腺の裏側に左右上下2個ずつ、計4個存在する米粒半分くらいの臓器である","marks":["左右上下2個ずつ、計4個"]},
    {"id":"dd664966-b0a0-5abc-9e1d-0a164eac5619","correction_text":"本症例は、続発性骨粗鬆症の高リスク例である","marks":["続発性骨粗鬆症の高リスク例である"]},
    {"id":"e5a6ecc8-2deb-573a-8807-8574fd201c7d","correction_text":"副腎皮質ホルモンは原疾患を踏まえて調整する","marks":["は原疾患を踏まえて調整する"]},
    {"id":"052c67cd-cbb7-5cc9-b7eb-b08910486062","correction_text":"抗RANKL抗体薬は破骨細胞の形成を抑え、骨吸収を抑制する","marks":["破骨細胞の形成を抑え、骨吸収を抑制する"]},
    {"id":"48b4723e-d317-53fe-9149-711d458ca60a","correction_text":"カルシウム薬の経口投与による骨密度改善効果は限定的である","marks":["による骨密度改善効果は限定的である"]},
    {"id":"ee0f19bc-8509-5ce2-b34b-310d1d4096eb","correction_text":"侵襲的歯科治療を行う場合は, 休薬を個別に判断する","marks":["休薬を個別に判断する"]},
    {"id":"3e10c4dd-8906-5ce7-aafc-0fffef25841e","correction_text":"転倒の危険因子の内的要因として、視力障害 (白内障、近視) がある","marks":["内的"]}
  ]$qb$::jsonb)
  as x(id uuid,correction_text text,marks jsonb)
), ranges as (
  select
    p.id,
    p.correction_text,
    jsonb_agg(
      jsonb_build_object(
        'kind',k.kind,
        'start',strpos(p.correction_text,m.mark)-1,
        'end',strpos(p.correction_text,m.mark)-1+char_length(m.mark),
        'expected_text',m.mark
      ) order by strpos(p.correction_text,m.mark),k.kind_order
    ) as ranges
  from payload p
  cross join lateral jsonb_array_elements_text(p.marks) m(mark)
  cross join (values ('bold',1),('underline',2),('accent',3)) k(kind,kind_order)
  where strpos(p.correction_text,m.mark)>0
  group by p.id,p.correction_text
)
update public.choices c
set explanation_formatting=jsonb_set(
  coalesce(c.explanation_formatting,'{}'::jsonb),
  '{correction_text}',
  jsonb_build_object('version',1,'source_text',r.correction_text,'ranges',r.ranges),
  true
)
from ranges r
where c.id=r.id;

commit;
