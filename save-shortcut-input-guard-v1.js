/* A consumed Save or image-text Undo shortcut must not become text on iPad/external keyboards.
   Existing editors still own the actions; no polling, blur, or global text cleanup. */
(()=>{
'use strict';
let pending=null;
const editable=n=>n instanceof Element?(n.closest('input:not([type=checkbox]):not([type=radio]),textarea,[contenteditable="true"]')):null;
const keyOf=e=>e.code==='KeyS'?'s':e.code==='KeyZ'?'z':String(e.key||'').toLowerCase();
const isShortcut=e=>keyOf(e)==='s'||(keyOf(e)==='z'&&!!e.target.closest?.('.qbDrawModal'));
const clear=()=>{pending=null};
window.addEventListener('keydown',e=>{
 if((e.metaKey||e.ctrlKey)&&!e.altKey&&(!e.shiftKey||keyOf(e)==='z')&&!e.isComposing&&isShortcut(e)){
  const target=editable(e.target);pending=target?{event:e,target,key:keyOf(e),at:performance.now(),restore:null}:null;
 }else if(!['Meta','Control','Shift','Alt'].includes(e.key))clear();
},true);
function matches(e){return pending&&pending.event.defaultPrevented&&performance.now()-pending.at<800&&editable(e.target)===pending.target&&!e.isComposing&&String(e.data||'').toLowerCase()===pending.key}
window.addEventListener('beforeinput',e=>{
 if(!matches(e)||e.inputType!=='insertText')return;
 if(e.cancelable){e.preventDefault();e.stopImmediatePropagation();return}
 // Native inputs can report a non-cancellable insertion. Restore only this exact
 // one-character replacement; never remove an arbitrary trailing s or IME text.
 const t=pending.target;if(t instanceof HTMLInputElement||t instanceof HTMLTextAreaElement){
  const start=t.selectionStart,end=t.selectionEnd;if(start!==null&&end!==null)pending.restore={value:t.value,start,end,direction:t.selectionDirection,data:e.data};
 }
},true);
window.addEventListener('input',e=>{
 if(!matches(e)||e.inputType!=='insertText'||!pending.restore)return;
 const r=pending.restore,t=pending.target;
 if(t.value===r.value.slice(0,r.start)+r.data+r.value.slice(r.end)){
  t.value=r.value;t.setSelectionRange(r.start,r.end,r.direction);e.stopImmediatePropagation();
 }pending.restore=null;
},true);
window.addEventListener('textInput',e=>{if(matches(e)&&e.cancelable){e.preventDefault();e.stopImmediatePropagation()}},true);
window.addEventListener('keypress',e=>{if(pending&&pending.event.defaultPrevented&&editable(e.target)===pending.target&&(e.metaKey||e.ctrlKey)&&keyOf(e)===pending.key&&!e.isComposing){e.preventDefault();e.stopImmediatePropagation()}},true);
window.addEventListener('pointerdown',clear,true);
window.addEventListener('compositionstart',clear,true);
window.addEventListener('blur',clear);
window.addEventListener('focusin',e=>{if(pending&&editable(e.target)!==pending.target)clear()},true);
})();
