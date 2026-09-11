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
  try{await window.QBImageStore.authorize(c);for(const file of files){await window.QBImageStore.add(c,file);await Promise.resolve(c.onSaved?.()).catch(e=>console.warn("image refresh",e))}}catch(e){alert('画像を追加できませんでした：'+(e.message||e))}finally{opening=false}
}
async function edit(c,rowId,restore=false){if(opening||window.QBImageEditor.isOpen())return;opening=true;
  try{await window.QBImageStore.authorize(c);const row=await window.QBImageStore.get(c,rowId);
    if(restore){if(!row.original_image_path||row.original_image_path===row.image_path)return;if(!confirm('編集を取り消して、元のファイルに戻してもよろしいですか？'))return;await window.QBImageStore.restore(c,row);await Promise.resolve(c.onSaved?.()).catch(e=>console.warn("image refresh",e));return}
    const blob=await window.QBImageStore.download(c,row.image_path);return await (window.QBFiles?.isPDF(blob)?window.QBPDFEditor:window.QBImageEditor).open(blob,{title:'画像編集',resetSource:row.original_image_path&&row.original_image_path!==row.image_path?()=>QBImageStore.download(c,row.original_image_path):null,onSave:async output=>{await window.QBImageStore.replace(c,row,output,'annotation');await Promise.resolve(c.onSaved?.()).catch(e=>console.warn("image refresh",e))}})
  }catch(e){alert('画像編集に失敗しました：'+(e.message||e))}finally{opening=false}
}
async function remove(c,rowId){if(opening||window.QBImageEditor.isOpen())return;opening=true;
  try{await window.QBImageStore.authorize(c);const row=await window.QBImageStore.get(c,rowId);if(!confirm('この画像を削除してもよろしいですか？'))return;await window.QBImageStore.remove(c,row);await c.onSaved?.()}catch(e){alert('削除できませんでした：'+(e.message||e))}finally{opening=false}
}
async function actions(w,c,rowId,original){if(!rowId||!c||w.dataset.qbActionPending==='1'||w.querySelector(':scope > .qbImageWriteActions'))return;w.dataset.qbActionPending='1';try{await window.QBImageStore.authorize(c);if(!w.isConnected)return;w.querySelectorAll('.qsiCropTool,.oeiCrop').forEach(b=>b.remove());w.qbEditMedia=()=>edit(c,rowId);const a=document.createElement('div');a.className='qbImageWriteActions';for(const [label,run] of [[w.querySelector('[data-pdf-src]')?'PDF編集':'画像編集',()=>edit(c,rowId)],...(!w.querySelector('.qsiDelete,.oeiDelete')?[['削除',()=>remove(c,rowId)]]:[])]){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=e=>{e.stopPropagation();run()};a.append(b)}w.append(a);const del=w.querySelector('.qsiDelete,.oeiDelete');if(del)del.onclick=e=>{e.stopPropagation();remove(c,rowId)}}catch{}finally{delete w.dataset.qbActionPending}}
function scan(){if(raf)return;raf=requestAnimationFrame(()=>{raf=0;
  document.querySelectorAll('.qbPublicImageWrap').forEach(w=>{const questionId=w.dataset.question,placement=w.dataset.placement,choiceId=w.dataset.choice||null;actions(w,{sb:window.qbSupabase,bucket:'question-media',questionId,placement,choiceId,host:w,onSaved:()=>notify(questionId,placement,choiceId)},w.dataset.row,w.dataset.original==='1')});
  document.querySelectorAll('.oeiItem').forEach(w=>{const ed=w.closest('.adeEditor');actions(w,editorContext(ed),w.dataset.id,w.dataset.original==='1')});
  document.querySelectorAll('.qsiImgWrap').forEach(w=>{if(!w.querySelector('.qsiDelete'))return;const questionId=qid(q()),host=w.closest('.qsiHost');actions(w,{sb:window.qbSupabase,bucket:'question-media',questionId,placement:'question',choiceId:null,host,onSaved:()=>notify(questionId,'question',null)},w.dataset.row,w.dataset.original==='1')});
  document.querySelectorAll('.qbNoteImageWrap').forEach(w=>{const note=w.closest('.qbPersonal');actions(w,note?.qbImageContext?.(),w.dataset.row,w.dataset.original==='1')});
})}
function boot(){
  document.addEventListener('focusin',e=>{const ed=e.target.closest?.('.adeEditor,.adeStemEditor,.qbNoteEditor');if(ed)lastEditor=ed});
  window.addEventListener('paste',e=>{if(window.QBImageEditor.isOpen())return;const files=window.QBFiles?QBFiles.filesFromPaste(e):window.QBImageEditor.filesFromPaste(e);if(!files.length)return;const c=contextFor(e.target);if(!c)return;e.preventDefault();e.stopImmediatePropagation();paste(files,c)},true);
  ['qb-screen-change','qb-content-updated','qb-admin-editor-opened','qb-answer-shown'].forEach(name=>window.addEventListener(name,scan));
  const view=document.getElementById('view');if(view)new MutationObserver(ms=>{if(ms.some(m=>[...m.addedNodes].some(n=>n instanceof Element&&(n.matches('.oeiItem,.qsiImgWrap,.qbNoteImageWrap,.qbPublicImageWrap')||n.querySelector('.oeiItem,.qsiImgWrap,.qbNoteImageWrap,.qbPublicImageWrap')))))scan()}).observe(view,{childList:true,subtree:true});scan();
}
window.QBImageIntegration={paste,contextFor,editorContext,notify};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
