(()=>{
'use strict';
const V=document.getElementById('view');
let raf=0;
const esc=(s='')=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clean=s=>String(s??'').trim();
function currentQuestion(){
  const resolved=window.qbResolveCurrentQuestion?.();
  if(resolved)return resolved;
  const qs=window.QB_QUESTIONS||[];
  if(!qs.length)return null;
  const stem=[...document.querySelectorAll('#view .qtext')].map(x=>(x.textContent||'').trim()).find(Boolean);
  if(!stem)return null;
  const cand=qs.filter(q=>(q.stem||q.q||'').trim()===stem);
  return cand.length===1?cand[0]:null;
}
window.pq=currentQuestion;
function css(){
  if(document.getElementById('qbSharedRatingCss'))return;
  const s=document.createElement('style');s.id='qbSharedRatingCss';s.textContent=`
.qbSharedRating{margin-top:12px;padding-top:10px;border-top:1px solid var(--line,#dce3ec)}
.qbSharedRatingLabel{font-size:12px;font-weight:900;color:var(--text,#172033)}
.qbSharedRating .ratings{margin-top:7px}.qbSharedRating .rate.on{color:#fff!important;border-color:var(--accent)!important;background:var(--accent)!important}
.qbSharedRating .rate[data-qb-rate].on{background:var(--accent)!important}
.qbChoiceDetail{margin-top:6px;padding:4px 0 4px 10px;border-left:2px solid var(--accent-border,var(--accent));border-radius:0;background:transparent;font-size:13px;line-height:1.6;white-space:pre-wrap}
.qbChoiceDetail b{font-size:12px;margin-right:5px;color:var(--accent)}
.qbExplanationCard> b{display:block;margin-bottom:4px}.qbExplanationCard .exp{padding:12px 0}
.qbExplanationCard.qbExamPoints{border-left:3px solid var(--accent);padding-left:13px}.qbExplanationCard.qbVerification{border-color:var(--bad,#d04444)}
.qbMark{background:var(--accent-soft,rgba(18,111,179,.12));border-radius:3px;padding:0 .08em}.qbAccentText{color:var(--accent);font-weight:800}.qbAccentUnderline{text-decoration:underline;text-decoration-color:var(--accent);text-decoration-thickness:2px;text-underline-offset:3px}
@media(max-width:520px){.qbSharedRating{margin-top:10px;padding-top:9px}}
`;document.head.appendChild(s)
}
function heading(card){return [...card.children].find(x=>x.tagName==='B')?.textContent?.trim()||''}
function normalized(card){return heading(card).replace(/^■\s*/,'').trim()}
function cardBy(root,...titles){const wanted=new Set(titles);return [...root.querySelectorAll(':scope > .card')].find(c=>wanted.has(normalized(c)))||null}
function setHeading(card,title){const h=[...card.children].find(x=>x.tagName==='B');if(h)h.textContent=`■ ${title}`}
function hasMeaningfulBody(card){if(!card)return false;const body=[...card.children].filter(x=>x.tagName!=='B'&&!x.classList?.contains('adeEditBtnV2')).map(x=>clean(x.textContent)).join(' ');return !!body&&body!=='未登録'}
function removeEmptyLegacy(root){for(const c of [...root.querySelectorAll(':scope > .card')]){const t=normalized(c);if(['出題者の意図','出題意図','医学的検証メモ','医学的検証','試験用まとめ','問題文のポイント'].includes(t)&&!hasMeaningfulBody(c))c.remove()}}
function dedupeByTitle(root,title){const cards=[...root.querySelectorAll(':scope > .card')].filter(c=>normalized(c)===title);if(cards.length<2)return;const first=cards[0],text=clean(first.textContent);for(const c of cards.slice(1)){if(clean(c.textContent)===text||!hasMeaningfulBody(c))c.remove()}}
function normalizeExisting(root){
  const overview=cardBy(root,'問題文のポイント');if(overview)setHeading(overview,'解説');
  const choices=cardBy(root,'各選択肢');if(choices)setHeading(choices,'選択肢解説');
  const summary=cardBy(root,'試験用まとめ');if(summary){setHeading(summary,'試験ポイント');summary.classList.add('qbExamPoints')}
  const verify=cardBy(root,'医学的検証メモ','医学的検証');if(verify){setHeading(verify,'公式解答についての注意');verify.classList.add('qbVerification')}
  const intent=cardBy(root,'出題者の意図','出題意図');if(intent)intent.classList.add('qbExaminerIntent');
  dedupeByTitle(root,'解説');removeEmptyLegacy(root)
}
function addCard(root,title,body,cls='line',extra=''){
  if(!clean(body)||clean(body)==='未登録'||cardBy(root,title))return null;
  const d=document.createElement('div');d.className=`card qbSharedExplanationCard ${extra}`.trim();
  d.innerHTML=`<b>■ ${esc(title)}</b><div class="${cls}">${esc(body)}</div>`;
  root.appendChild(d);return d
}
function detailRows(c){
  const rows=[];
  if(clean(c.correction_text))rows.push(['正しく直すと',c.correction_text,'qbChoiceCorrection']);
  if(clean(c.correct_for_other_context))rows.push(['別の文脈では',c.correct_for_other_context,'qbChoiceOtherContext']);
  if(clean(c.examiner_distinction))rows.push(['区別ポイント',c.examiner_distinction,'qbChoiceDistinction']);
  return rows
}
function choiceDetailHtml(c){return detailRows(c).map(([label,text,cls])=>`<div class="qbChoiceDetail ${cls}"><b>${esc(label)}：</b>${esc(text)}</div>`).join('')}
function choiceBody(q){
  const choices=q.choices||[];if(!choices.length)return null;
  const ans=q.ans||choices.map((c,i)=>c.is_correct?i:null).filter(i=>i!==null);
  return choices.map((c,i)=>{const key=c.choice_key||String.fromCharCode(97+i),text=c.choice_text||String(c),ok=ans.includes(i),ex=clean(c.explanation);return `<div class="exp"><b>${esc(key)}. ${ok?'○':'×'} ${esc(text)}</b>${ex?`<div class="line">${esc(ex)}</div>`:''}${choiceDetailHtml(c)}</div>`}).join('')
}
function enhanceExistingChoiceCard(root,q){
  const card=cardBy(root,'選択肢解説','各選択肢');if(!card)return;setHeading(card,'選択肢解説');
  const exps=[...card.querySelectorAll(':scope > .exp')];
  (q.choices||[]).forEach((c,i)=>{const exp=exps[i];if(!exp)return;detailRows(c).forEach(([label,text,cls])=>{if(exp.querySelector(`.${cls}`))return;const d=document.createElement('div');d.className=`qbChoiceDetail ${cls}`;d.innerHTML=`<b>${esc(label)}：</b>${esc(text)}`;exp.appendChild(d)})})
}
function automaticRating(root){const r=root.querySelector('.resultcard');if(!r)return null;if(r.classList.contains('review'))return '-';if(r.classList.contains('ok'))return '○';if(r.classList.contains('bad'))return '×';return null}
function placeRatingInsideResult(root,d){const result=root.querySelector(':scope > .resultcard')||root.querySelector('.resultcard');if(!result||!d)return;if(d.parentElement!==result)result.appendChild(d)}
async function addRating(root,q){
  let d=root.querySelector('.qbSharedRating');
  if(d){placeRatingInsideResult(root,d);return}
  d=document.createElement('div');d.className='qbSharedRating';
  d.innerHTML=`<div class="qbSharedRatingLabel">自己評価</div><div class="ratings">${['◎','○','△','×','-'].map(v=>`<button class="rate" data-qb-rate="${v}">${v}</button>`).join('')}</div><div class="meta qbRateMsg">◎=完璧 / ○=理解 / △=あやふや / ×=要復習 / -=解説のみ</div>`;
  placeRatingInsideResult(root,d);
  const sb=window.qbSupabase;if(!sb)return;const {data:{user}}=await sb.auth.getUser();if(!user)return;const id=q.id||q.dbId;if(!id)return;
  const setOn=v=>d.querySelectorAll('[data-qb-rate]').forEach(b=>b.classList.toggle('on',b.dataset.qbRate===v));const msg=d.querySelector('.qbRateMsg');const auto=automaticRating(root);
  if(auto){setOn(auto);if(msg)msg.textContent=`自動設定：${auto}　（必要なら変更できます）`;const x=await sb.from('question_ratings').upsert({user_id:user.id,question_id:id,rating:auto,updated_at:new Date().toISOString()},{onConflict:'user_id,question_id'});if(x.error&&msg)msg.textContent='自己評価の自動保存に失敗しました'}
  else{const r=await sb.from('question_ratings').select('rating').eq('user_id',user.id).eq('question_id',id).maybeSingle();if(r.data?.rating)setOn(r.data.rating)}
  d.querySelectorAll('[data-qb-rate]').forEach(b=>b.onclick=async()=>{const v=b.dataset.qbRate;setOn(v);if(msg)msg.textContent='保存中…';const x=await sb.from('question_ratings').upsert({user_id:user.id,question_id:id,rating:v,updated_at:new Date().toISOString()},{onConflict:'user_id,question_id'});if(msg)msg.textContent=x.error?'保存できませんでした':'保存しました'})
}
function emitReadyOnce(ans,q){const id=String(q?.id||q?.dbId||'');if(!id||ans.dataset.qbExplanationReady===id)return;ans.dataset.qbExplanationReady=id;window.dispatchEvent(new CustomEvent('qb-explanation-ready',{detail:{questionId:id}}))}
function ensure(){
  css();const ans=document.getElementById('ans');if(!ans||!ans.children.length)return;const q=currentQuestion();if(!q)return;
  normalizeExisting(ans);addRating(ans,q);
  if(!cardBy(ans,'解説'))addCard(ans,'解説',q.explanation_overview||q.note||'');
  const cb=choiceBody(q);if(cb&&!cardBy(ans,'選択肢解説','各選択肢')){const d=document.createElement('div');d.className='card qbSharedExplanationCard';d.innerHTML=`<b>■ 選択肢解説</b>${cb}`;ans.appendChild(d)}
  enhanceExistingChoiceCard(ans,q);
  if(!cardBy(ans,'試験ポイント','試験用まとめ'))addCard(ans,'試験ポイント',q.exam_summary||q.examSummary||'','summary','qbExamPoints');
  if(!cardBy(ans,'公式解答についての注意','医学的検証メモ','医学的検証'))addCard(ans,'公式解答についての注意',q.medical_verification_note||q.medicalVerificationNote||'','line','qbVerification');
  const rating=ans.querySelector('.qbSharedRating');if(rating)placeRatingInsideResult(ans,rating);
  normalizeExisting(ans);emitReadyOnce(ans,q)
}
function schedule(){if(raf)return;raf=requestAnimationFrame(()=>{raf=0;ensure()})}
window.addEventListener('qb-screen-change',schedule);window.addEventListener('qb-app-ready',schedule);window.addEventListener('qb-answer-shown',schedule);window.addEventListener('qb-content-updated',schedule);
if(V)new MutationObserver(schedule).observe(V,{childList:true,subtree:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
})();