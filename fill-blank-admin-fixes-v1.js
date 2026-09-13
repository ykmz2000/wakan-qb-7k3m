(()=>{
'use strict';
let timer=null;
const sourceLoads=new Map();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const Q=()=>{try{return window.pq?.()||null}catch{return null}};
const qid=q=>q?.id||q?.dbId||null;
const systemKey=k=>/^(?:IMAGE|IMG|IMAGE_REQUIRED|FIGURE|FIG|SOURCE|PAGE)(?:[_-].*)?$/i.test(String(k||'').trim());
const hasOccurrence=q=>!!q?.occ?.[0]?.id;
function keysFor(q,group){
  const seen=new Set(),out=[];
  if(Array.isArray(q?.answer_fields))for(const x of q.answer_fields){const k=String(typeof x==='string'?x:x?.key||'').trim();if(k&&!seen.has(k)&&!systemKey(k)&&!/^(note|order)$/i.test(k)){seen.add(k);out.push(k)}}
  if(out.length)return out;
  for(const m of String(q?.stem||'').matchAll(/\[([^\]]+)\]/g)){const k=String(m[1]||'').trim();if(k&&!seen.has(k)&&!systemKey(k)){seen.add(k);out.push(k)}}
  if(out.length)return out;
  for(const x of group?.querySelectorAll?.('.fbAnswerLine > span')||[]){const k=String(x.textContent||'').replace(/^\[/,'').replace(/\]$/,'').trim();if(k&&!seen.has(k)&&!systemKey(k)){seen.add(k);out.push(k)}}
  return out.length?out:['A'];
}
async function loadSourceAnswer(q){
  const id=qid(q),sb=window.qbSupabase;if(!id||!sb)return null;
  if(Object.prototype.hasOwnProperty.call(q,'source_answer')&&Object.prototype.hasOwnProperty.call(q,'source_answer_formatting'))return q.source_answer;
  if(sourceLoads.has(id))return sourceLoads.get(id);
  const p=(async()=>{const r=await sb.from('questions').select('source_answer,source_answer_formatting').eq('id',id).maybeSingle();q.source_answer=r.error?null:(r.data?.source_answer??null);if(!r.error)q.source_answer_formatting=r.data?.source_answer_formatting??null;return q.source_answer})().finally(()=>sourceLoads.delete(id));
  sourceLoads.set(id,p);return p;
}
function valueOf(a,k,index,keys){
  if(a==null)return '';
  if(Array.isArray(a)){if(keys.length>1&&a.length===keys.length)return a[index]??'';return index===0?a.join('・'):''}
  if(typeof a==='object'){const v=a[k];return Array.isArray(v)?v.join('・'):(v??'')}
  return index===0?String(a):'';
}
function headingText(group){const h=group?.querySelector(':scope > b'),label=h?.querySelector(':scope > .oaiHeadingText');return (label?.textContent||h?.firstChild?.textContent||'').trim()}
function grow(ta){ta.style.height='auto';ta.style.height=Math.max(42,ta.scrollHeight)+'px'}
function refreshGroup(group,q,a){
  if(!group)return;const keys=keysFor(q,group),lines=[...group.querySelectorAll('.fbAnswerLine')];
  lines.forEach((line,i)=>{const strong=line.querySelector('strong'),k=keys[i];if(!strong||!k)return;const v=valueOf(a,k,i,keys),text=v===''?'解答未登録':String(v);line.dataset.answerKey=k;line.dataset.answerText=text;strong.textContent=text});
  group.querySelector('.fbExtra')?.remove();
  if(a&&typeof a==='object'&&!Array.isArray(a)){
    const extras=[];if(a.order)extras.push(`順序：${a.order}`);if(a.note)extras.push(String(a.note));
    if(extras.length){const d=document.createElement('div');d.className='meta fbExtra';d.textContent=extras.join(' / ');group.appendChild(d)}
  }
}
async function openFallback(group,q){
  if(!group||!qid(q))return;await loadSourceAnswer(q);group.querySelector('.oaiEditor')?.remove();
  const old=q.source_answer,keys=keysFor(q,group),obj=old&&typeof old==='object'&&!Array.isArray(old)?old:{};
  const d=document.createElement('div');d.className='oaiEditor';
  d.innerHTML=`<div class="oaiHint">この問題には年度別の question_occurrences がないため、ここでは収録元資料の解答として保存します。改行と文字装飾も保存されます。問題文や年度情報は変更しません。</div>${keys.map((k,i)=>`<div class="oaiField"><span>[${esc(k)}]</span><textarea class="oaiAnswerText" data-k="${esc(k)}" rows="1" autocomplete="off">${esc(valueOf(old,k,i,keys))}</textarea></div>`).join('')}<div class="oaiExtras"><label>順序<input class="oaiOrder" value="${esc(obj.order||'')}" placeholder="例：順不同"></label><label>注記<textarea class="oaiNote" rows="2" placeholder="原資料上の注記がある場合のみ">${esc(obj.note||'')}</textarea></label></div><div class="oaiActions"><span class="oaiStatus"></span><span class="spacer"></span><button type="button" class="oaiCancel">キャンセル</button><button type="button" class="oaiSave">保存</button></div>`;
  group.appendChild(d);const controls=[...d.querySelectorAll('.oaiAnswerText')].map(ta=>{grow(ta);ta.addEventListener('input',()=>grow(ta));return window.QBExplanationFormat?.mountStandalone?.(ta,`source_answer.${ta.dataset.k}`,q.source_answer_formatting?.[ta.dataset.k],`解答 [${ta.dataset.k}]`)||null});d.querySelector('.oaiCancel').onclick=()=>d.remove();
  d.querySelector('.oaiSave').onclick=async()=>{
    const save=d.querySelector('.oaiSave'),status=d.querySelector('.oaiStatus');if(save.disabled)return;save.disabled=true;status.textContent='保存中…';
    const next={};d.querySelectorAll('.oaiAnswerText').forEach(ta=>{const v=ta.value.trim();if(v)next[ta.dataset.k]=v});
    const order=d.querySelector('.oaiOrder').value.trim(),note=d.querySelector('.oaiNote').value.trim();if(order)next.order=order;if(note)next.note=note;
    try{if(controls.some(c=>c?.isComposing?.()))throw new Error('日本語の変換を確定してから保存してください');controls.forEach(c=>c?.setSaving?.(true));const current=await window.qbSupabase.from('questions').select('source_answer,source_answer_formatting,updated_at').eq('id',qid(q)).maybeSingle();if(current.error)throw current.error;if(!current.data)throw new Error('編集対象を取得できません');if(JSON.stringify(current.data.source_answer??null)!==JSON.stringify(old??null))throw new Error('別の更新がありました。入力内容を控えてから開き直してください');const formats={};controls.forEach((c,i)=>{const spec=c?.read?.();if(spec)formats[keys[i]]=spec});const payload={source_answer:Object.keys(next).length?next:null,source_answer_formatting:Object.keys(formats).length?formats:null};const r=await window.qbSupabase.from('questions').update(payload).eq('id',qid(q)).eq('updated_at',current.data.updated_at).select('id').maybeSingle();if(r.error)throw r.error;if(!r.data)throw new Error('保存中に別の更新がありました。開き直してください');q.source_answer=payload.source_answer;q.source_answer_formatting=payload.source_answer_formatting;refreshGroup(group,q,q.source_answer);status.textContent='保存しました';setTimeout(()=>d.remove(),160);window.dispatchEvent(new CustomEvent('qb-official-answer-updated',{detail:{questionId:qid(q),sourceFallback:true}}));window.dispatchEvent(new CustomEvent('qb-content-updated',{detail:{questionId:qid(q),type:'official-answer'}}))}catch(e){console.error(e);controls.forEach(c=>c?.setSaving?.(false));status.textContent='保存失敗: '+(e?.message||'不明なエラー');save.disabled=false}
  };
  d.querySelector('[data-k]')?.focus();
}
function dedupeFieldButtons(){
  document.querySelectorAll('.fbTitleRow').forEach(row=>{const btns=[...row.querySelectorAll(':scope .fbAdminEdit')];btns.slice(1).forEach(b=>b.remove())});
}
async function sync(){
  dedupeFieldButtons();const q=Q();if(!q||q.answer_mode!=='fill_blank'||hasOccurrence(q))return;
  const groups=[...document.querySelectorAll('#ans .fbAnswerGroup')],group=groups.find(g=>headingText(g)==='解答');if(!group)return;
  const a=await loadSourceAnswer(q);if(qid(Q())!==qid(q)||!group.isConnected)return;refreshGroup(group,q,a);const b=group.querySelector('.oaiEditBtn');if(b){b.dataset.oaiFallback='1';b.title='収録元資料の解答を編集'}
}
function schedule(){clearTimeout(timer);timer=setTimeout(sync,25)}
function onClick(e){const b=e.target?.closest?.('.oaiEditBtn');if(!b)return;const q=Q();if(!q||q.answer_mode!=='fill_blank'||hasOccurrence(q))return;const group=b.closest('.fbAnswerGroup');if(!group)return;e.preventDefault();e.stopImmediatePropagation();openFallback(group,q)}
function boot(){document.addEventListener('click',onClick,true);['qb-answer-shown','qb-screen-change','qb-retry-current','qb-content-updated','qb-official-answer-updated'].forEach(ev=>window.addEventListener(ev,schedule));const v=document.getElementById('view');if(v)new MutationObserver(schedule).observe(v,{childList:true,subtree:true});schedule()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
