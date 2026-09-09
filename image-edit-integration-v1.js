(()=>{
'use strict';
let raf=0,opening=false,lastEditor=null;
const q=()=>{try{return window.pq?.()}catch{return null}},qid=Q=>String(Q?.id||Q?.dbId||'');
const placements={stem:'question',overview:'explanation_overview',intent:'examiner_intent',summary:'exam_summary',verify:'medical_verification'};
function editorContext(ed){
  if(!ed)return null;const key=ed.dataset.adeEditor||'',choiceId=key.startsWith('choice-')?key.slice(7):null,placement=choiceId?'choice_explanation':placements[key];if(!placement)return null;
  return{sb:window.qbSupabase,bucket:'question-media',questionId:ed.dataset.qbQuestionId||qid(q()),placement,choiceId,host:ed,alive:()=>ed.isConnected,onSaved:()=>{ed.qbReloadImages?.().catch(()=>{});notify(ed.dataset.qbQuestionId||qid(q()),placement,choiceId)}};
}
function notify(questionId,placement,choiceId){window.dispatchEvent(new CustomEvent('qb-content-updated',{detail:{questionId,placement,choiceId,type:placement==='question'?'question-image':'official-image'}}))}
function contextFor(target){
  if(target?.closest?.('[role="dialog"],[aria-modal="true"]'))return null;
  const note=target?.closest?.('.qbPersonal');if(note)return note.querySelector('.qbNoteEditor:not(.hidden)')?note.qbImageContext?.()||null:null;
  const ed=target?.closest?.('.adeEditor,.adeStemEditor');if(ed)return editorContext(ed);
  const direct=window.QBInlineOverview?.imageContext?.(target);if(direct)return{...direct,sb:window.qbSupabase,bucket:'question-media',onSaved:async()=>{await direct.host.querySelector('.qbInlineImageManager')?.qbReloadImages?.();notify(direct.questionId,direct.placement,direct.choiceId)}};
  if(target?.closest?.('input,textarea,[contenteditable="true"]'))return null;
  if(lastEditor?.isConnected&&lastEditor.getClientRects().length&&!lastEditor.closest('.hidden')){const note=lastEditor.closest('.qbPersonal');return note?note.qbImageContext?.():editorContext(lastEditor)}return null;
}
async function paste(files,c){if(!files.length||!c||opening||window.QBImageEditor.isOpen())return;opening=true;
  try{await window.QBImageStore.authorize(c);await window.QBImageEditor.open(files[0],{title:'貼り付けた画像を編集',initialImages:files.slice(1),onSave:async blob=>{await window.QBImageStore.add(c,blob,files[0]);await Promise.resolve(c.onSaved?.()).catch(e=>console.warn("image refresh",e))}})}catch(e){alert('画像を開けませんでした：'+(e.message||e))}finally{opening=false}
}
async function edit(c,rowId,restore=false){if(opening||window.QBImageEditor.isOpen())return;opening=true;
  try{await window.QBImageStore.authorize(c);const row=await window.QBImageStore.get(c,rowId);
    if(restore){if(!row.original_image_path||row.original_image_path===row.image_path)return;if(!confirm('書き込み前の元画像に戻しますか？'))return;await window.QBImageStore.restore(c,row);await Promise.resolve(c.onSaved?.()).catch(e=>console.warn("image refresh",e));return}
    const blob=await window.QBImageStore.download(c,row.image_path);await window.QBImageEditor.open(blob,{title:'画像に書き込む',onSave:async output=>{await window.QBImageStore.replace(c,row,output);await Promise.resolve(c.onSaved?.()).catch(e=>console.warn("image refresh",e))}})
  }catch(e){alert('画像編集に失敗しました：'+(e.message||e))}finally{opening=false}
}
function actions(w,c,rowId,original){if(!rowId||!c||w.querySelector(':scope > .qbImageWriteActions'))return;const a=document.createElement('div');a.className='qbImageWriteActions';for(const [label,restore] of [['書き込み',false],['元画像に戻す',true]]){if(restore&&!original)continue;const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=e=>{e.stopPropagation();edit(c,rowId,restore)};a.append(b)}w.append(a)}
function scan(){if(raf)return;raf=requestAnimationFrame(()=>{raf=0;
  document.querySelectorAll('.oeiItem').forEach(w=>{const ed=w.closest('.adeEditor');actions(w,editorContext(ed),w.dataset.id,w.dataset.original==='1')});
  document.querySelectorAll('.qsiImgWrap').forEach(w=>{if(!w.querySelector('.qsiDelete'))return;const questionId=qid(q()),host=w.closest('.qsiHost');actions(w,{sb:window.qbSupabase,bucket:'question-media',questionId,placement:'question',choiceId:null,host,onSaved:()=>notify(questionId,'question',null)},w.dataset.row,w.dataset.original==='1')});
  document.querySelectorAll('.qbNoteImageWrap').forEach(w=>{const note=w.closest('.qbPersonal');actions(w,note?.qbImageContext?.(),w.dataset.row,w.dataset.original==='1')});
})}
function boot(){
  document.addEventListener('focusin',e=>{const ed=e.target.closest?.('.adeEditor,.adeStemEditor,.qbNoteEditor');if(ed)lastEditor=ed});
  window.addEventListener('paste',e=>{if(window.QBImageEditor.isOpen())return;const files=window.QBImageEditor.filesFromPaste(e);if(!files.length)return;const c=contextFor(e.target);if(!c)return;e.preventDefault();e.stopImmediatePropagation();paste(files,c)},true);
  ['qb-screen-change','qb-content-updated','qb-admin-editor-opened','qb-answer-shown'].forEach(name=>window.addEventListener(name,scan));
  const view=document.getElementById('view');if(view)new MutationObserver(ms=>{if(ms.some(m=>[...m.addedNodes].some(n=>n instanceof Element&&(n.matches('.oeiItem,.qsiImgWrap,.qbNoteImageWrap')||n.querySelector('.oeiItem,.qsiImgWrap,.qbNoteImageWrap')))))scan()}).observe(view,{childList:true,subtree:true});scan();
}
window.QBImageIntegration={paste,contextFor,editorContext,notify};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
