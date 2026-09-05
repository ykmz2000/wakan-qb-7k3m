(()=>{
const qs=window.QB_QUESTIONS;if(!Array.isArray(qs))return;
const unitOrder={history:0,thought:1,assessment:2,principles:3,shoyaku:4,shoyaku_detail:5,prescription:6,exam:7,practice:8,research:9,uncategorized:99};
const subOrder={
  history:{
    '中国古典と人物':0,
    '黄帝内経・素問・霊枢':1,
    '傷寒論・金匱要略':2,
    '本草学・神農本草経':3,
    '日本医学史・周辺伝統医学':4,
    '日本医学史':4,
    '日本漢方の流派':5,
    '漢方と保険診療':6,
    '鍼灸':7
  },
  thought:{
    '陰陽五行':0,
    '五行':0,
    '五臓六腑':1,
    '気・血・津液':2,
    '気血水':2,
    '精・腎':3,
    '精':3,
    '外邪':4,
    '八綱弁証':5,
    '八綱':5,
    '寒熱・表裏・虚実':5,
    '六病位':6
  },
  assessment:{'四診':0,'望診':1,'聞診':2,'問診':3,'切診':4,'舌診':5,'脈診':6,'腹診':7},
  shoyaku:{'生薬の定義':0,'薬用部位':1,'四気五味・薬性':2},
  shoyaku_detail:{'生薬の品質評価':0,'附子・アコニチン':1,'麻黄・エフェドリン':2},
  exam:{'四診':0,'舌診・瘀血':1,'脈診・表裏':2,'腹診':3,'瘀血の治療':4,'虚実・発汗':5,'六病位':6},
  research:{'漢方薬の副作用・相互作用':0,'甘草・偽アルドステロン症':1,'漢方薬の長期副作用':2,'漢方薬による肝障害':3}
};
function y(q){const m=String(q.year||'').match(/20\d{2}/g);return m?Math.min(...m.map(Number)):9999}
function n(q){const m=String(q.qnum||'').match(/\d+/);return m?Number(m[0]):9999}
const original=new Map(qs.map((q,i)=>[q,i]));
qs.sort((a,b)=>{
  const ua=unitOrder[a.unit]??50,ub=unitOrder[b.unit]??50;if(ua!==ub)return ua-ub;
  const map=subOrder[a.unit]||{};const sa=map[a.subtopic]??50,sb=map[b.subtopic]??50;if(sa!==sb)return sa-sb;
  if(a.subtopic!==b.subtopic)return String(a.subtopic||'').localeCompare(String(b.subtopic||''),'ja');
  const ya=y(a),yb=y(b);if(ya!==yb)return ya-yb;
  const na=n(a),nb=n(b);if(na!==nb)return na-nb;
  return (original.get(a)||0)-(original.get(b)||0);
});
})();
