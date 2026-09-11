/* Plain-text formatting with separate metadata. Occurrence originals and media stay unchanged.
   No MutationObserver, document click interception, card replacement, or rating writes. */
(()=>{
'use strict';
const KINDS=['bold','underline','strike','marker','accent'];
const MAX_RANGES=512;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const boundary=(t,n)=>!(n>0&&n<t.length&&/[\uD800-\uDBFF]/.test(t[n-1])&&/[\uDC00-\uDFFF]/.test(t[n]));
function normalize(text,ranges){
  const out=[];
  for(const kind of KINDS){
    const same=(Array.isArray(ranges)?ranges.slice(0,MAX_RANGES):[]).filter(r=>r&&r.kind===kind&&Number.isInteger(r.start)&&Number.isInteger(r.end)&&r.start>=0&&r.end<=text.length&&r.start<r.end&&boundary(text,r.start)&&boundary(text,r.end)).map(r=>({kind,start:r.start,end:r.end})).sort((a,b)=>a.start-b.start||a.end-b.end);
    for(const r of same){const last=out[out.length-1];if(last&&last.kind===kind&&r.start<=last.end)last.end=Math.max(last.end,r.end);else out.push(r)}
  }
  return out;
}
function rangesFor(text,record){return record?.version===1&&record.source_text===text?normalize(text,record.ranges):[]}
function html(text,record){
  text=String(text??'');const ranges=rangesFor(text,record);if(!ranges.length)return esc(text);
  const points=[...new Set([0,text.length,...ranges.flatMap(r=>[r.start,r.end])])].sort((a,b)=>a-b);
  let result='';
  for(let i=0;i<points.length-1;i++){const a=points[i],b=points[i+1],part=esc(text.slice(a,b)),active=KINDS.filter(k=>ranges.some(r=>r.kind===k&&r.start<=a&&r.end>=b));result+=active.length?`<span class="${active.map(k=>'qbFmt-'+k).join(' ')}">${part}</span>`:part}
  return result;
}
function subtract(ranges,start,end,kind=null){
  return ranges.flatMap(r=>{if((kind&&r.kind!==kind)||r.end<=start||r.start>=end)return[{...r}];const out=[];if(r.start<start)out.push({...r,end:start});if(r.end>end)out.push({...r,start:end});return out});
}
function toggle(text,ranges,start,end,kind){
  if(!KINDS.includes(kind)||start>=end||!boundary(text,start)||!boundary(text,end))return ranges;
  ranges=normalize(text,ranges);const covered=ranges.some(r=>r.kind===kind&&r.start<=start&&r.end>=end);
  const next=covered?subtract(ranges,start,end,kind):[...ranges,{kind,start,end}];
  if(next.length>MAX_RANGES)throw new Error('装飾が多すぎます。不要な書式を解除してください。');return normalize(text,next);
}
function rebase(before,after,ranges){
  if(before===after)return normalize(after,ranges);
  let start=0,oldEnd=before.length,newEnd=after.length;
  while(start<oldEnd&&start<newEnd&&before[start]===after[start])start++;
  while(oldEnd>start&&newEnd>start&&before[oldEnd-1]===after[newEnd-1]){oldEnd--;newEnd--}
  const delta=newEnd-oldEnd,out=[];
  for(const r of ranges){
    if(r.end<=start)out.push({...r});
    else if(r.start>=oldEnd)out.push({...r,start:r.start+delta,end:r.end+delta});
    else if(r.start<start&&r.end>oldEnd)out.push({...r,end:r.end+delta});
    else{if(r.start<start)out.push({...r,end:start});if(r.end>oldEnd)out.push({...r,start:newEnd,end:r.end+delta})}
  }
  return normalize(after,out);
}
function snapshot(raw,ranges,trim=true){
  const text=trim?raw.trim():raw,offset=trim?raw.length-raw.trimStart().length:0;
  const next=normalize(text,ranges.map(r=>({...r,start:Math.max(0,r.start-offset),end:Math.min(text.length,r.end-offset)})));
  return next.length?{version:1,source_text:text,ranges:next}:null;
}
if(typeof module!=='undefined'&&module.exports)module.exports={normalize,rangesFor,html,toggle,subtract,rebase,snapshot};
if(typeof document==='undefined')return;
const cache=new Map(),pending=new Map(),versions=new Map(),editors=new WeakMap();
const META='explanation_formatting',STEM_META='stem_formatting';
const QUESTION_FIELDS={overview:'explanation_overview',intent:'examiner_intent',summary:'exam_summary',verify:'medical_verification_note'};
const CHOICE_FIELDS={cexp:'explanation',ccorr:'correction_text',calt:'correct_for_other_context',cdist:'examiner_distinction'};
const LABELS={stem:'問題文',explanation_overview:'問題文のポイント',examiner_intent:'出題者の意図',exam_summary:'試験用まとめ',medical_verification_note:'医学的検証メモ',explanation:'選択肢の解説',correction_text:'正しくすると',correct_for_other_context:'別の文脈では',examiner_distinction:'区別ポイント'};
const current=()=>{try{return window.pq?.()||null}catch{return null}};
const qid=q=>String(q?.id||q?.dbId||'');
async function load(id,force=false){
  if(force){cache.delete(id);versions.set(id,(versions.get(id)||0)+1);pending.delete(id)}
  if(cache.has(id))return cache.get(id);if(pending.has(id))return pending.get(id);
  const version=versions.get(id)||0;
  const task=(async()=>{const sb=window.qbSupabase;if(!sb)throw new Error('ログイン情報を読み込み中です');const r=await sb.from('questions').select('stem_formatting,explanation_formatting,choices(id,explanation_formatting)').eq('id',id).maybeSingle();if(r.error)throw r.error;if(!r.data)throw new Error('装飾情報を取得できません');if(version!==(versions.get(id)||0))return load(id);cache.set(id,r.data);return r.data})();
  pending.set(id,task);try{return await task}finally{if(pending.get(id)===task)pending.delete(id)}
}
function css(){
  if(document.getElementById('qbExplanationFormatCss'))return;
  const s=document.createElement('style');s.id='qbExplanationFormatCss';s.textContent=`
.qbFmt-bold{font-weight:800}.qbFmt-underline{text-decoration-line:underline;text-underline-offset:.16em}.qbFmt-strike{text-decoration-line:line-through}.qbFmt-underline.qbFmt-strike{text-decoration-line:underline line-through}.qbFmt-marker{background:var(--accent-soft);color:inherit;box-decoration-break:clone;-webkit-box-decoration-break:clone}.qbFmt-accent{color:var(--accent)}
.qbFmtField{margin:8px 0;min-width:0}.qbFmtLabel{display:block;margin-bottom:5px;font-size:12px;font-weight:800;color:var(--text)}.qbFmtTools{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:6px}.qbFmtTools button{min-height:44px;border:1px solid var(--accent-border,var(--line));border-radius:8px;padding:6px 9px;background:var(--card);color:var(--accent);font:inherit;font-size:12px;font-weight:700;cursor:pointer}.qbFmtTools button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.qbFmtHint{color:var(--muted);font-size:11px;line-height:1.5;margin:5px 0}.qbFmtPreview{white-space:pre-wrap;overflow-wrap:anywhere;color:var(--text);border-left:2px solid var(--accent-border,var(--line));padding:5px 0 5px 10px;line-height:1.65;font-size:14px;min-height:28px}.qbFmtPreviewLabel{color:var(--muted);font-size:10px;margin-top:8px}.qbFmtTools button:disabled{opacity:.55;cursor:default}
`;document.head.appendChild(s);
}
function mount(ta,field,record,initial){
  const w=document.createElement('div');w.className='qbFmtField';w.dataset.qbFormatField=field;
  const label=document.createElement('label');label.className='qbFmtLabel';label.textContent=LABELS[field]||field;
  if(!ta.id)ta.id='qbFmt-'+Math.random().toString(36).slice(2);label.htmlFor=ta.id;
  const tools=document.createElement('div');tools.className='qbFmtTools';tools.setAttribute('role','group');tools.setAttribute('aria-label',`${LABELS[field]}の文字装飾`);
  const hint=document.createElement('div');hint.className='qbFmtHint';hint.setAttribute('role','status');hint.textContent='文字を選択して装飾。表示は下のプレビューで確認できます。';
  const pl=document.createElement('div');pl.className='qbFmtPreviewLabel';pl.textContent='表示プレビュー';const preview=document.createElement('div');preview.className='qbFmtPreview';
  ta.before(w);w.append(label,tools,ta,hint,pl,preview);
  let raw=initial,ranges=rangesFor(raw,record),composing=false;
  if(record&&record.source_text!==raw)hint.textContent='本文が変更されているため、以前の装飾は適用していません。';
  const sync=()=>{if(raw!==ta.value){ranges=rebase(raw,ta.value,ranges);raw=ta.value}};
  const draw=()=>{const out=html(raw,{version:1,source_text:raw,ranges});if(preview.innerHTML!==out)preview.innerHTML=out};
  const refresh=()=>{if(composing)return;sync();draw()};
  ta.addEventListener('compositionstart',()=>{composing=true});ta.addEventListener('compositionend',()=>{composing=false;refresh()});ta.addEventListener('input',refresh);
  for(const [kind,text] of [['bold','太字'],['underline','下線'],['strike','取り消し線'],['marker','マーカー'],['accent','強調色'],['clear','書式解除']]){
    const b=document.createElement('button');b.type='button';b.dataset.qbFormat=kind;const sample=document.createElement('span');sample.className='qbFmtToolLabel';sample.textContent=text;b.appendChild(sample);tools.appendChild(b);
    let selected=null;
    b.addEventListener('pointerdown',e=>{selected=[ta.selectionStart,ta.selectionEnd];if(e.pointerType==='mouse')e.preventDefault()});
    b.addEventListener('mousedown',e=>e.preventDefault());
    b.addEventListener('click',()=>{if(composing)return;sync();const [start,end]=selected||[ta.selectionStart,ta.selectionEnd];selected=null;if(start===end){hint.textContent='装飾したい文字を先に選択してください。';return}try{ranges=kind==='clear'?normalize(raw,subtract(ranges,start,end)):toggle(raw,ranges,start,end,kind);draw();hint.textContent='装飾を変更しました。「保存」で本文と一緒に保存します。';ta.focus({preventScroll:true});ta.setSelectionRange(start,end)}catch(e){hint.textContent=e.message}});
  }
  refresh();return{field,textarea:ta,read(){sync();const spec=snapshot(raw,ranges,field!=='stem');return field==='stem'&&spec?{...spec,origin:'admin_display'}:spec}};
}
function prepareEditor(ed,q){
  if(editors.has(ed))return;
  const key=ed.dataset.adeEditor||'',isStem=key==='stem',choice=key.startsWith('choice-')?(q?.choices||[]).find(c=>String(c.id)===key.slice(7)):null;
  const defs=isStem?[{field:'stem',ta:ed.querySelector('textarea')}]:choice?Object.entries(CHOICE_FIELDS).map(([cls,field])=>({field,ta:ed.querySelector('.'+cls)})):QUESTION_FIELDS[key]?[{field:QUESTION_FIELDS[key],ta:ed.querySelector('textarea')}]:[];
  if(!defs.length)return;
  const target=choice||q,id=qid(q),expected={},initial={};
  for(const d of defs){if(!d.ta)return;expected[d.field]=target[d.field]??null;initial[d.field]=d.ta.value}
  if(choice){expected.choice_text=choice.choice_text;expected.is_correct=choice.is_correct;expected.statement_is_true=choice.statement_is_true??null}
  const state={id,table:choice?'choices':'questions',targetId:String(target.id||target.dbId),metaField:isStem?STEM_META:META,expected,fields:[],error:null,ready:null};editors.set(ed,state);
  state.ready=(async()=>{try{const meta=await load(id,true);if(!ed.isConnected)return;const map=isStem?{stem:meta[STEM_META]}:choice?(meta.choices||[]).find(c=>String(c.id)===String(choice.id))?.[META]:meta[META];for(const d of defs)state.fields.push(choice&&window.QBInlineOverview?.mountField&&new URLSearchParams(location.search).get('editor')!=='classic'?window.QBInlineOverview.mountField(d.ta,d.field,map?.[d.field],d.ta.value,LABELS[d.field]):mount(d.ta,d.field,map?.[d.field],initial[d.field]))}catch(e){state.error=e;const m=ed.querySelector('.adeStatus');if(m)m.textContent='装飾情報の取得に失敗しました。編集を開き直してください。'}})();
}
function destroyEditor(ed){const state=editors.get(ed);if(!state)return;for(const f of state.fields)f.destroy?.();editors.delete(ed)}
async function setEditorSaving(ed,saving){
  const state=editors.get(ed);if(!state)return;await state.ready;
  if(saving&&state.fields.some(f=>f.isComposing?.()))throw new Error('日本語の変換を確定してから保存してください');
  for(const f of state.fields)f.setSaving?.(saving);
}
async function saveEditor(ed,q,table,id,payload){
  const state=editors.get(ed);if(!state)throw new Error('編集欄を開き直してください');await state.ready;if(state.error)throw state.error;
  if(!ed.isConnected||state.id!==qid(q)||state.table!==table||state.targetId!==String(id))throw new Error('編集対象が変わりました。開き直してください');
  const keys=Object.keys(payload);if(keys.some(k=>!Object.prototype.hasOwnProperty.call(state.expected,k)))throw new Error('この欄では編集できない項目です');
  const column=state.metaField,sb=window.qbSupabase,r=await sb.from(table).select([...keys,column,'updated_at'].join(',')).eq('id',id).maybeSingle();if(r.error)throw r.error;if(!r.data)throw new Error('編集対象を取得できません');
  for(const k of keys){if((r.data[k]??'')!==(state.expected[k]??''))throw new Error('別の更新がありました。入力内容を控えてから開き直してください')}
  let map;
  if(column===STEM_META){map=state.fields[0].read()}
  else{const formats={...(r.data[META]||{})};for(const f of state.fields){const spec=f.read();if(spec)formats[f.field]=spec;else delete formats[f.field]}map=Object.keys(formats).length?formats:null}
  const saved=await sb.from(table).update({...payload,[column]:map}).eq('id',id).eq('updated_at',r.data.updated_at).select('id').maybeSingle();if(saved.error)throw saved.error;if(!saved.data)throw new Error('保存中に別の更新がありました。開き直してください');
  const meta=cache.get(state.id);if(meta){if(table==='questions')meta[column]=map;else{const c=(meta.choices||[]).find(c=>String(c.id)===String(id));if(c)c[column]=map}}
  return map;
}
function decorate(node,text,record){
  if(!node||node.querySelector('img,button,input,textarea,a,[contenteditable]'))return;
  const active=rangesFor(text,record).length>0;if(!active&&!node.dataset.qbFormatted)return;
  const output=html(text,record);if(node.innerHTML!==output)node.innerHTML=output;
  if(active)node.dataset.qbFormatted='1';else delete node.dataset.qbFormatted;
}
function apply(root,q,meta){
  const cards=[...root.children].filter(c=>c.classList.contains('card'));
  const heading=c=>[...c.children].find(n=>n.tagName==='B')?.textContent.trim().replace(/^■\s*/,'')||'';
  for(const [field,title] of Object.entries(LABELS)){
    if(!Object.values(QUESTION_FIELDS).includes(field))continue;
    const card=cards.find(c=>heading(c)===title);if(!card)continue;
    const body=[...card.children].find(n=>n.classList.contains(field==='exam_summary'?'summary':'line'));
    decorate(body,String(q[field]??''),meta[META]?.[field]);
  }
  const card=cards.find(c=>heading(c)==='各選択肢');if(!card)return;
  [...card.querySelectorAll(':scope > .exp')].forEach((row,i)=>{
    const c=q.choices?.[i];if(!c)return;const formats=(meta.choices||[]).find(x=>String(x.id)===String(c.id))?.[META];
    decorate(row.querySelector(':scope > .line'),String(c.explanation??''),formats?.explanation);
    for(const [field,cls] of [['correction_text','qbChoiceCorrection'],['correct_for_other_context','qbChoiceOtherContext'],['examiner_distinction','qbChoiceDistinction']]){
      const detail=row.querySelector(':scope > .'+cls);if(!detail)continue;let body=detail.querySelector(':scope > .qbFmtDetailText');
      if(!body&&!rangesFor(String(c[field]??''),formats?.[field]).length)continue;
      if(!body){if([...detail.children].some(n=>n.tagName!=='B'))continue;[...detail.childNodes].filter(n=>n.nodeType===3).forEach(n=>n.remove());body=document.createElement('span');body.className='qbFmtDetailText';detail.appendChild(body)}
      decorate(body,String(c[field]??''),formats?.[field]);
    }
  });
}
let timer=0;
async function render(){
  if(window.qbGetScreen?.()!=='practice')return;
  const q=current(),root=document.getElementById('ans'),stem=document.querySelector('#view > .card > .qtext'),id=qid(q);if(!id||!stem)return;
  try{
    const meta=await load(id);
    if(qid(current())!==id||!stem.isConnected||document.querySelector('#view > .card > .qtext')!==stem)return;
    // Display-only spans; never infer emphasis from wording or rewrite a differently rendered stem.
    if(stem.textContent===String(q.stem??''))decorate(stem,String(q.stem??''),meta[STEM_META]);
    if(root&&document.getElementById('ans')===root&&root.isConnected&&!root.classList.contains('hidden')&&root.querySelector('.resultcard'))apply(root,q,meta);
  }catch(e){console.warn('text formatting read',e.message)}
}
function schedule(e){
  if(e?.type==='qb-content-updated'&&!/^(personal-note|personal-note-image|official-image)/.test(e.detail?.type||'')){const id=String(e.detail?.questionId||'');if(id){cache.delete(id);versions.set(id,(versions.get(id)||0)+1);pending.delete(id)}}
  clearTimeout(timer);timer=setTimeout(render,50);
}
window.addEventListener('qb-data-refreshed',e=>{const id=String(e.detail?.questionId||'');if(id){cache.delete(id);versions.set(id,(versions.get(id)||0)+1);pending.delete(id)}});
window.QBExplanationFormat={html,snapshot,prepareEditor,saveEditor,destroyEditor,setEditorSaving};
function boot(){css();['qb-question-ready','qb-screen-change','qb-retry-current','qb-answer-shown','qb-explanation-ready','qb-content-updated'].forEach(ev=>window.addEventListener(ev,schedule));schedule()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

