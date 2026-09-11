/* Pure image-library search helpers. No network, OCR, or mutation on load. */
(function(root){
'use strict';
const ARRAY_FIELDS=['subject_ids','unit_ids','topics','keywords','aspects','roles','aliases','related_keywords'];
const TEXT_FIELDS=['name','notes','ocr_text','visual_summary'];
const FIELDS=[...TEXT_FIELDS,...ARRAY_FIELDS,'analysis_status','classification_status'];
const LABELS={name:'ファイル名',subject_ids:'科目',unit_ids:'単元',set_name:'セット名',topics:'テーマ',keywords:'キーワード',aspects:'内容の観点',roles:'画像の役割',aliases:'検索用の別名',related_keywords:'関連する内容',notes:'補足・学習意図',ocr_text:'読み取り本文',visual_summary:'図・写真の説明',analysis_status:'解析状況',classification_status:'分類状況'};
function normalize(value){return String(value??'').normalize('NFKC').toLowerCase().replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60)).replace(/\s+/g,' ').trim()}
function list(value){return [...new Set((Array.isArray(value)?value:String(value||'').split(/[\n、,]/)).map(x=>String(x).trim()).filter(Boolean))]}
function changed(before,after){const patch={};for(const key of FIELDS)if(Object.hasOwn(after,key)&&JSON.stringify(before?.[key]??(ARRAY_FIELDS.includes(key)?[]:''))!==JSON.stringify(after[key]))patch[key]=after[key];return patch}
function validate(patch){
  for(const [k,v] of Object.entries(patch)){
    if(!FIELDS.includes(k))throw Error('未対応の項目: '+k);
    if(ARRAY_FIELDS.includes(k)){if(!Array.isArray(v)||v.length>100||v.some(x=>typeof x!=='string'||x.length>500))throw Error(LABELS[k]+'を確認してください。')}
    else if(typeof v!=='string'||v.length>150000)throw Error(LABELS[k]+'を確認してください。');
  }
  return patch;
}
function editDistance(a,b){a=normalize(a);b=normalize(b);let prev=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const row=[i];for(let j=1;j<=b.length;j++)row[j]=Math.min(row[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]!==b[j-1]?1:0));prev=row}return prev[b.length]}
function suggestions(query,terms){const q=normalize(query);if(q.length<3)return[];return terms.map(t=>({label:t.canonical,distance:Math.min(...[t.canonical,...(t.aliases||[])].map(a=>editDistance(q,a)))})).filter(t=>t.distance>0&&t.distance<=(q.length>6?2:1)).sort((a,b)=>a.distance-b.distance||a.label.localeCompare(b.label)).slice(0,4).map(t=>t.label)}
function searchForms(query,terms){const q=normalize(query);const whole=terms.find(t=>[t.canonical,...(t.aliases||[])].some(a=>normalize(a)===q));const tokens=whole?[q]:[...q.matchAll(/"([^"]+)"|(\S+)/g)].map(m=>m[1]||m[2]);return tokens.map(token=>{const matching=terms.filter(t=>[t.canonical,...(t.aliases||[])].some(a=>normalize(a)===token));return [...new Set([token,...matching.flatMap(t=>[t.canonical,...(t.aliases||[])].map(normalize))])]})}
function snippet(text,query,terms=[]){
  text=String(text||'');const forms=searchForms(query,terms).flat();if(!forms.length)return[{text:text.slice(0,150),hit:false}];
  // Map every normalized character back to its complete source character.
  let flat='',map=[];let position=0;for(const c of text){const n=normalize(c);flat+=n;for(let i=0;i<n.length;i++)map.push([position,position+c.length]);position+=c.length}
  const hits=[];for(const f of forms){const n=f.replace(/\s/g,'');if(!n)continue;let at=flat.indexOf(n);while(at>=0){hits.push([map[at][0],map[at+n.length-1][1]]);at=flat.indexOf(n,at+n.length)}}
  hits.sort((a,b)=>a[0]-b[0]);const start=hits.length?Math.max(0,hits[0][0]-35):0,end=Math.min(text.length,start+170),merged=[];
  for(const [a,b] of hits){if(a>=end||b<=start)continue;const prev=merged.at(-1);if(prev&&a<=prev[1])prev[1]=Math.max(prev[1],b);else merged.push([Math.max(a,start),Math.min(b,end)])}
  const out=[];if(start)out.push({text:'…',hit:false});let at=start;for(const [a,b] of merged){if(a>at)out.push({text:text.slice(at,a),hit:false});out.push({text:text.slice(a,b),hit:true});at=b}if(at<end)out.push({text:text.slice(at,end),hit:false});if(end<text.length)out.push({text:'…',hit:false});return out;
}
const api={ARRAY_FIELDS,TEXT_FIELDS,FIELDS,LABELS,normalize,list,changed,validate,editDistance,suggestions,searchForms,snippet};
root.QBImageLibraryCore=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

