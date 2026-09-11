/* Add entry points only. No interception/replacement of legacy handlers or prototypes. */
(()=>{
'use strict';
if(window.QB_IMAGE_LIBRARY_ENABLED===false)return;
let scheduled=false,authorized=false,checking=null,subscribed=false;
const current=()=>{try{return window.qbResolveCurrentQuestion?.()||window.pq?.()||null}catch{return null}};
const currentId=()=>String(current()?.id||current()?.dbId||'');
function resolve(box){
 const questionId=String(box.closest('[data-qb-question-id]')?.dataset.qbQuestionId||box.closest('[data-qid]')?.dataset.qid||currentId());
 if(!questionId||questionId!==currentId())return null;
 if(box.matches('.qsiEditor,.qsiInlineEditor'))return {questionId,placement:'question',choiceId:null};
 const ed=box.closest('.adeEditor'),key=ed?.dataset.adeEditor||'';
 if(key.startsWith('choice-'))return {questionId,placement:'choice_explanation',choiceId:key.slice(7)};
 const placement={overview:'explanation_overview',intent:'examiner_intent',summary:'exam_summary',verify:'medical_verification'}[key];return placement?{questionId,placement,choiceId:null}:null;
}
function scan(){
 if(!authorized||!window.QBImageLibrary)return;
 const cluster=document.querySelector('.qbAccountCluster'),account=document.getElementById('acctBtn');
 if(cluster&&account&&!cluster.querySelector('.qbLibraryEntry')){const b=document.createElement('button');b.type='button';b.className='qbLibraryEntry';b.setAttribute('aria-label','ライブラリ');b.title='ライブラリ';b.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>';b.onclick=()=>window.QBImageLibrary.open().catch(e=>alert(e.message||e));cluster.insertBefore(b,account)}
 for(const box of document.querySelectorAll('.qsiEditor,.qsiInlineEditor,.oeiBox')){
  const actions=box.querySelector('.qsiActions,.oeiActions');if(!actions||actions.querySelector('.qbLibraryAction'))continue;
  const create=document.createElement('button');create.type='button';create.className='qbCreatePDF';create.textContent='PDFを新規作成';create.onclick=async()=>{const target=resolve(box),host=box.closest('.adeEditor')||box;if(!target)return;create.disabled=true;const c={...target,sb:window.qbSupabase,bucket:'question-media',host,alive:()=>box.isConnected&&currentId()===target.questionId,onSaved:()=>{host.qbReloadImages?.();QBImageIntegration.notify(target.questionId,target.placement,target.choiceId)}};try{await QBImageStore.authorize(c);await QBPDFEditor.create({onSave:async output=>{await QBImageStore.add(c,output);await c.onSaved()}})}catch(e){alert(e.message)}finally{if(create.isConnected)create.disabled=false}};actions.append(create);const b=document.createElement('button');b.type='button';b.className='qbLibraryAction';b.textContent='ライブラリ';actions.append(b);
  b.onclick=async()=>{const target=resolve(box);if(!target){alert('貼り付け先の編集を開き直してください。');return}b.disabled=true;const context={...target,alive:()=>box.isConnected&&currentId()===target.questionId&&JSON.stringify(resolve(box))===JSON.stringify(target),onSaved:()=>{if(currentId()===target.questionId){box.closest('.adeEditor')?.qbReloadImages?.().catch(()=>{});window.dispatchEvent(new CustomEvent('qb-content-updated',{detail:{questionId:target.questionId,placement:target.placement,choiceId:target.choiceId,type:target.placement==='question'?'question-image-library':'official-image'}}))}}};try{await window.QBImageLibrary.open({context})}catch(e){alert(e.message||e)}finally{if(b.isConnected)b.disabled=false}};
 }
}
async function boot(){
 const sb=window.qbSupabase;if(!sb)return;
 if(!subscribed&&sb.auth.onAuthStateChange){subscribed=true;sb.auth.onAuthStateChange(()=>{authorized=false;window.dispatchEvent(new Event('qb-library-access-changed'));document.querySelectorAll('.qbLibraryEntry,.qbLibraryAction,.qbCreatePDF').forEach(n=>n.remove());setTimeout(schedule,0)})}
 if(!authorized){if(checking)return;checking=window.QBImageLibraryStore.available(sb);try{authorized=await checking}catch{authorized=false}finally{checking=null}}
 scan();
}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;boot().catch(()=>{})})}
for(const event of ['qb-app-ready','qb-screen-change','qb-content-updated','qb-admin-editor-opened','qb-answer-shown'])window.addEventListener(event,schedule);
new MutationObserver(ms=>{if(ms.some(m=>[...m.addedNodes].some(n=>n instanceof Element&&!n.closest('.qbLibraryOverlay')&&(n.matches('.qbAccountCluster,.qsiEditor,.qsiInlineEditor,.oeiBox,.adeEditor')||n.querySelector('.qbAccountCluster,.qsiEditor,.qsiInlineEditor,.oeiBox,.adeEditor')))))schedule()}).observe(document.body,{childList:true,subtree:true});
window.QBImageLibraryIntegration={resolve};schedule();
})();

