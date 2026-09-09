/* Shared rich-text editing for overview, canonical display stem and choice explanations.
   Explicit save only. Images, notes, answers and occurrence source are independent.
   ProseMirror is bundled locally; choice fields retain their existing explicit save path. */
import {Schema} from 'prosemirror-model';
import {EditorState} from 'prosemirror-state';
import {EditorView} from 'prosemirror-view';
import {toggleMark} from 'prosemirror-commands';
import {history, undo, redo, closeHistory} from 'prosemirror-history';

const MODES={
  overview:{field:'explanation_overview',meta:'explanation_formatting',label:'問題文のポイント',body:':scope > .line',launch:'[data-ade-v2="overview"]'},
  stem:{field:'stem',meta:'stem_formatting',label:'問題文',body:':scope > .qtext',launch:'.adeStemBtn'}
};
const KINDS=['bold','underline','strike','marker','accent'];
const LIMIT=512;
const clone=x=>x==null?x:JSON.parse(JSON.stringify(x));
const qid=q=>String(q?.id||q?.dbId||'');
const current=()=>{try{return window.pq?.()||null}catch{return null}};
const stable=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.keys(v).sort().reduce((a,k)=>(a[k]=v[k],a),{}):v);
const boundary=(t,n)=>!(n>0&&n<t.length&&/[\uD800-\uDBFF]/.test(t[n-1])&&/[\uDC00-\uDFFF]/.test(t[n]));
const schema=new Schema({
  nodes:{doc:{content:'paragraph'},paragraph:{content:'text*',whitespace:'pre',toDOM:()=>['p',0],parseDOM:[{tag:'p',preserveWhitespace:'full'}]},text:{}},
  marks:Object.fromEntries(KINDS.map(kind=>[kind,{toDOM:()=>['span',{class:'qbFmt-'+kind},0],parseDOM:[{tag:'span.qbFmt-'+kind}]}]))
});
function validRanges(text,record){
  if(!record||record.version!==1||record.source_text!==text)return [];
  if(!Array.isArray(record.ranges)||record.ranges.length>LIMIT)throw new Error('装飾情報を確認できません。従来の編集画面で確認してください。');
  return record.ranges.filter(r=>r&&KINDS.includes(r.kind)&&Number.isInteger(r.start)&&Number.isInteger(r.end)&&r.start>=0&&r.end<=text.length&&r.start<r.end&&boundary(text,r.start)&&boundary(text,r.end));
}
function docFrom(text,record){
  const ranges=validRanges(text,record),points=[...new Set([0,text.length,...ranges.flatMap(r=>[r.start,r.end])])].sort((a,b)=>a-b),nodes=[];
  for(let i=0;i<points.length-1;i++){
    const start=points[i],end=points[i+1];if(start===end)continue;
    const marks=KINDS.filter(k=>ranges.some(r=>r.kind===k&&r.start<=start&&r.end>=end)).map(k=>schema.marks[k].create());
    nodes.push(schema.text(text.slice(start,end),marks));
  }
  return schema.node('doc',null,[schema.node('paragraph',null,nodes)]);
}
function readDoc(doc){
  const text=doc.firstChild.textContent,ranges=[];
  for(const kind of KINDS){
    let previous=null;
    doc.firstChild.forEach((node,start)=>{
      if(!node.marks.some(m=>m.type.name===kind))return;
      const end=start+node.nodeSize;
      if(previous&&previous.end===start)previous.end=end;
      else{previous={kind,start,end};ranges.push(previous)}
    });
  }
  if(ranges.length>LIMIT)throw new Error('装飾が多すぎます。不要な書式を解除してから保存してください。');
  return {text,record:ranges.length?{version:1,source_text:text,ranges}:null};
}
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n}
function button(cls,text){const b=el('button',cls,text);b.type='button';return b}
let active=null,opening=false,choiceGroup=null;
// A draft must not become the question identity. The existing resolver can use
// this verified, node-bound identity only for the exact active stem element.
function editingStem(node){
  const s=active;
  if(!s||s.closed||s.mode!=='stem'||!s.host.isConnected||s.body!==node||document.querySelector('#view > .card > .qtext')!==node)return null;
  const p=window.qbGetPracticeState?.(),ids=p?.questionIds;
  if(Array.isArray(ids)&&ids.length&&String(ids[Number(p.currentIndex)||0])!==s.id)return null;
  return {id:s.id,sourceText:s.initialText};
}
function recordOf(row,mode){const c=MODES[mode];return mode==='stem'?(row[c.meta]??null):(row[c.meta]?.[c.field]??null)}
function css(){
  if(document.getElementById('qbInlineOverviewCss'))return;
  const s=el('style');s.id='qbInlineOverviewCss';s.textContent=`
#ans>.card.qbInlineActive.adeHost{padding-right:15px!important}
#ans>.card.qbInlineActive.adeHost>.qbPersonal,#ans>.card.qbInlineActive.adeHost>.qbMediaHostV2{width:100%!important;max-width:100%!important;margin-right:0!important}
.qbInlineActive>[data-ade-v2="overview"],.qbInlineStemActive>.adeStemToolbar{visibility:hidden}
.qbInlineFieldSource{display:none!important}
.qbInlineChoiceField .qbInlineStatus{margin:5px 0;min-width:0}
.qbInlineChoiceField .qbInlineTools{margin-top:5px}
#ans .exp.qbInlineChoiceActive.adeHost{padding-right:0!important}
#ans .exp.qbInlineChoiceActive.adeHost>.qbPersonal,#ans .exp.qbInlineChoiceActive.adeHost>.qbMediaHostV2{width:100%!important;max-width:100%!important;margin-right:0!important}
.qbInlineChoiceActive>[data-ade-v2]:not(.adeEditor){visibility:hidden}
#ans .exp.qbInlineChoiceActive.adeHost>.adeEditor.qbChoiceInPlace{margin:0!important;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;width:100%!important;max-width:100%!important}
.qbChoiceInPlace>.qbChoiceEditHeading{display:flex;align-items:center;flex-wrap:wrap;gap:7px;font:inherit;margin-bottom:8px}
.qbChoiceEditHeading>.ctext{flex:1;min-width:140px}
.qbChoiceInPlace>.qbChoiceDetail{padding:0;background:transparent;border:0}
.qbChoiceInPlace .oeiBox{display:none!important}
.qbChoiceInPlace.qbChoiceImagesOpen .oeiBox{display:block!important}
.qbInlineTools{display:flex;gap:5px;flex-wrap:wrap;align-items:center;margin:9px 0 7px}
.qbInlineTools button{border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--text);min-width:40px;min-height:44px;padding:5px 8px;font:inherit;display:flex;align-items:center;justify-content:center;gap:6px}
.qbInlineTools button[aria-pressed="true"]{background:var(--accent-soft);border-color:var(--accent)}
.qbInlineTools .qbiSample{pointer-events:none;font-size:16px}.qbiSample.bold{font-weight:800}.qbiSample.underline{text-decoration:underline;text-underline-offset:.18em}.qbiSample.strike{text-decoration:line-through}.qbiSample.marker{background:var(--accent-soft-strong,var(--accent-soft));padding:0 .12em}.qbiSample.accent{color:var(--accent)}
.qbInlineTools kbd,.qbInlineActions kbd{font-size:10px;color:var(--muted);font-family:inherit;pointer-events:none}
.qbInlineRich{position:relative;min-height:88px;padding:9px;border:1px solid var(--accent-border,var(--line));border-radius:7px;background:var(--card);color:var(--text);outline:none;white-space:pre-wrap;overflow-wrap:anywhere;word-wrap:break-word;font:inherit;line-height:1.65;font-weight:400;font-variant-ligatures:none;-webkit-font-variant-ligatures:none}
.qbInlineRich:focus{outline:2px solid var(--accent-border,var(--line));outline-offset:1px}.qbInlineRich p{margin:0;white-space:pre-wrap;min-height:1.65em}.qbInlineRich .ProseMirror-trailingBreak{display:initial}.qbInlineRich .ProseMirror-separator{display:inline!important;border:none!important;margin:0!important;width:0!important;height:0!important}
.qbInlineRich .qbFmt-bold{font-weight:800}.qbInlineRich .qbFmt-underline{text-decoration-line:underline}.qbInlineRich .qbFmt-strike{text-decoration-line:line-through}.qbInlineRich .qbFmt-underline.qbFmt-strike{text-decoration-line:underline line-through}
.qbInlineActions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin:10px 0}
.qbInlineActions button,.qbInlineImageToggle{border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--text);min-height:44px;padding:7px 12px;font:inherit;font-size:13px;font-weight:700}
.qbInlineActions .qbInlineSave{background:var(--accent);color:var(--card);border-color:var(--accent)}.qbInlineActions .qbInlineSave kbd{color:inherit}
.qbInlineStatus{font-size:12px;color:var(--muted);margin-right:auto;flex:1;min-width:120px;white-space:pre-wrap}
.qbInlineMedia{margin:9px 0}.qbInlineImageHint,.qbInlineSourceHint{font-size:11px;line-height:1.5;color:var(--muted);white-space:normal;margin:5px 0}
#ans .qbInlineImageManager.adeEditor{padding:0!important;border:0!important;background:transparent!important;margin:8px 0!important;width:100%!important;max-width:100%!important}
.qbInlineImageManager .oeiBox{padding:0!important;border:0!important;background:transparent!important}.qbInlineImageManager .oeiHead{display:none}.qbInlineImageManager .oeiGrid{margin:0}
.qbInlineStemActive>.qsiHost .qsiEditor{padding:0!important;border:0!important;background:transparent!important}
.qbInlineStemActive>.qsiHost :is(.qsiPick,.qsiPasteBtn,.qsiMoreBtn,.qsiRecentBtn){border-color:var(--accent-border,var(--line))!important;background:var(--card)!important;color:var(--accent)!important}
.qbInlineStemActive>.qsiHost .qsiPasteZone{border-color:var(--accent)!important;background:var(--card)!important;color:var(--text)!important}
.qbInlineTools button:focus-visible,.qbInlineActions button:focus-visible,.qbInlineImageToggle:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.qbInlineTools button:disabled,.qbInlineActions button:disabled{opacity:.55}
@media(max-width:600px){.qbInlineTools kbd,.qbInlineActions kbd{display:none}.qbInlineRich{font-size:16px}}
`;
  document.head.appendChild(s);
}
function beforeUnload(e){if(!active?.dirty&&!active?.saving&&!choiceGroup?.dirty()&&!choiceGroup?.saving())return;e.preventDefault();e.returnValue='';}
function status(s,text){if(s.status.textContent!==text)s.status.textContent=text;}
function updateState(s){
  if(!s.view||s.closed)return;
  s.dirty=!s.view.state.doc.eq(s.initialDoc);
  if(!s.embedded){if(s.dirty||s.saving)window.addEventListener('beforeunload',beforeUnload);else window.removeEventListener('beforeunload',beforeUnload);}
  if(!s.saving)status(s,s.dirty?'未保存の変更があります':'本文・装飾は「保存」まで反映されません');
  const {from,to,empty,$from}=s.view.state.selection;
  for(const [kind,b] of s.formatButtons){
    const on=empty?!!schema.marks[kind].isInSet(s.view.state.storedMarks||$from.marks()):s.view.state.doc.rangeHasMark(from,to,schema.marks[kind]);
    const value=String(on);if(b.getAttribute('aria-pressed')!==value)b.setAttribute('aria-pressed',value);
  }
}
function closeEditor(s,saved=false){
  if(s.closed)return;s.closed=true;
  s.view?.destroy();
  if(saved){
    const record=s.savedRecord,text=s.savedText;
    s.body.innerHTML=text?window.QBExplanationFormat.html(text,record):'未登録';
    if(record)s.body.dataset.qbFormatted='1';else delete s.body.dataset.qbFormatted;
  }else s.body.replaceChildren(...s.originalNodes);
  delete s.body.dataset.qbInlineEditing;
  s.tools.remove();s.actions.remove();s.media.remove();s.sourceHint?.remove();
  if(s.mode==='overview')s.host.querySelector(':scope > .qbMediaHostV2')?.classList.remove('qbInlineMediaHidden','hidden');
  if(s.mode==='stem'&&s.stemImagesWereOpen!==undefined)s.host.querySelector(':scope > .qsiHost .qsiEditor')?.classList.toggle('qsiHidden',!s.stemImagesWereOpen);
  s.host.classList.remove('qbInlineActive','qbInlineStemActive');
  if(active===s)active=null;
  window.removeEventListener('beforeunload',beforeUnload);
  for(const [name,original,wrapper] of s.wrappers||[]){if(window[name]===wrapper)window[name]=original}
}
function mayLeave(){
  if(choiceGroup){
    const g=choiceGroup;
    if(g.saving()){g.message('保存中です。完了してから移動してください。');return false}
    if(g.composing()){g.message('日本語の変換を確定してから操作してください。');return false}
    if(g.dirty()&&!window.confirm('本文・装飾に未保存の変更があります。破棄して移動しますか？\n画像・個人メモの保存済み変更は取り消されません。'))return false;
    g.close();
  }
  const s=active;if(!s)return true;
  if(s.saving){status(s,'保存中です。完了してから移動してください。');return false}
  if(s.view?.composing){status(s,'日本語の変換を確定してから操作してください。');return false}
  if(s.dirty&&!window.confirm('本文・装飾に未保存の変更があります。破棄して移動しますか？\n画像・個人メモの保存済み変更は取り消されません。'))return false;
  closeEditor(s);return true;
}
async function save(s){
  if(s.closed||s.saving)return;
  if(s.view.composing){status(s,'日本語の変換を確定してから保存してください。');return}
  if(!s.dirty){closeEditor(s);return}
  s.saving=true;updateState(s);status(s,'保存中…');
  s.view.setProps({editable:()=>false});s.saveButton.disabled=true;s.cancelButton.disabled=true;
  s.tools.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{
    const draft=readDoc(s.view.state.doc),sb=window.qbSupabase,{field,meta}=s.config;
    if(s.mode==='stem'&&!draft.text.trim())throw new Error('問題文を入力してください。空の問題文は保存できません。');
    if(!s.host.isConnected||qid(current())!==s.id)throw new Error('問題が切り替わりました。入力内容を控えてから開き直してください。');
    const auth=await sb.auth.getUser();if(auth.error||auth.data?.user?.id!==s.userId)throw new Error('ログイン状態が変わりました。入力内容を控えてから再ログインしてください。');
    const r=await sb.from('questions').select(field+','+meta+',updated_at').eq('id',s.id).maybeSingle();
    if(r.error)throw r.error;if(!r.data)throw new Error('編集対象を取得できません。');
    if(String(r.data[field]??'')!==s.initialText||stable(recordOf(r.data,s.mode))!==stable(s.initialRecord??null))throw new Error('別の更新がありました。入力内容を控えてから開き直してください。');
    if(qid(current())!==s.id||!s.host.isConnected)throw new Error('編集対象が変わりました。');
    let formatting=draft.record;
    if(s.mode==='stem'){if(formatting)formatting={...formatting,origin:'admin_display'}}
    else{const formats={...(r.data[meta]||{})};if(formatting)formats[field]=formatting;else delete formats[field];formatting=Object.keys(formats).length?formats:null}
    const payload={[field]:draft.text===''?null:draft.text,[meta]:formatting};
    const result=await sb.from('questions').update(payload).eq('id',s.id).eq('updated_at',r.data.updated_at).select('id').maybeSingle();
    if(result.error)throw result.error;if(!result.data)throw new Error('保存中に別の更新がありました。入力内容は残しています。');
    s.q[field]=draft.text;s.savedText=draft.text;s.savedRecord=draft.record;
    closeEditor(s,true);
    window.dispatchEvent(new CustomEvent('qb-content-updated',{detail:{questionId:s.id,type:'text',field,value:draft.text}}));
  }catch(e){
    if(!s.closed){s.saving=false;s.view.setProps({editable:()=>true});s.saveButton.disabled=false;s.cancelButton.disabled=false;s.tools.querySelectorAll('button').forEach(b=>b.disabled=false);status(s,'保存できませんでした：'+(e.message||e)+'\n入力内容は残っています。');}
  }
}
function format(s,kind){
  if(s.closed||s.saving||s.view.composing)return;
  const {state}=s.view;
  let cmd;
  if(kind==='undo')cmd=undo;else if(kind==='redo')cmd=redo;
  else if(kind==='clear')cmd=(st,dispatch)=>{let tr=st.tr;const {from,to,empty}=st.selection;for(const k of KINDS)tr=empty?tr.removeStoredMark(schema.marks[k]):tr.removeMark(from,to,schema.marks[k]);dispatch(tr);return true};
  else cmd=toggleMark(schema.marks[kind]);
  s.view.dispatch(closeHistory(s.view.state.tr));
  cmd(s.view.state,s.view.dispatch,s.view);s.view.focus();
}
function keyAction(e){
  if(!(e.metaKey||e.ctrlKey)||e.altKey||e.isComposing)return null;
  const key=String(e.key).toLowerCase();
  if(key==='s')return e.shiftKey?'strike':'save';
  if(!e.shiftKey&&key==='b')return 'bold';if(!e.shiftKey&&key==='u')return 'underline';
  if(e.shiftKey&&key==='m')return 'marker';if(e.shiftKey&&key==='a')return 'accent';
  if(key==='z')return e.shiftKey?'redo':'undo';if(key==='y'&&!e.shiftKey)return 'redo';return null;
}
function handleShortcut(e){
  const s=active;if(!s||s.closed)return false;
  if(!s.body.contains(e.target)&&!s.tools.contains(e.target)&&!s.actions.contains(e.target))return false;
  const action=keyAction(e);if(!action)return false;
  e.preventDefault();e.stopImmediatePropagation();if(e.repeat||s.view.composing)return true;
  if(action==='save')save(s);else format(s,action);return true;
}
function toggleImages(s,toggle){
  if(s.mode==='stem'){
    // Reuse already-bound question-stem-images controls in their existing host.
    const box=s.host.querySelector(':scope > .qsiHost .qsiEditor');
    if(!box){status(s,'問題画像を読み込み中です。少し待ってから「画像を編集・追加」を押してください。');return}
    const wasOpen=!box.classList.contains('qsiHidden');
    if(s.stemImagesWereOpen===undefined)s.stemImagesWereOpen=wasOpen;
    box.classList.toggle('qsiHidden',wasOpen);
    toggle.textContent=wasOpen?'画像を編集・追加':'画像編集を閉じる';toggle.setAttribute('aria-expanded',String(!wasOpen));return;
  }
  const old=s.media.querySelector('.qbInlineImageManager'),media=s.host.querySelector(':scope > .qbMediaHostV2');
  if(old){old.remove();media?.classList.remove('hidden');toggle.textContent='画像を編集・追加';toggle.setAttribute('aria-expanded','false');return}
  const manager=el('div','adeEditor qbInlineImageManager');manager.dataset.adeEditor='overview';manager.dataset.qbQuestionId=s.id;s.media.append(manager);
  media?.classList.add('hidden');toggle.textContent='画像編集を閉じる';toggle.setAttribute('aria-expanded','true');
}
function createTools(s){
    s.tools=el('div','qbInlineTools');s.tools.setAttribute('role','toolbar');s.tools.setAttribute('aria-label',s.config.label+'の文字装飾');
    const mac=/Mac|iPhone|iPad|iPod/.test(navigator.platform+' '+navigator.userAgent),mod=mac?'⌘':'Ctrl+',shift=mac?'⇧':'Shift+';
    for(const [kind,sample,label,keys] of [['bold','B','太字',mod+'B'],['underline','U','下線',mod+'U'],['strike','S','取り消し線',mod+shift+'S'],['marker','M','マーカー',mod+shift+'M'],['accent','A','強調色',mod+shift+'A'],['clear','×','選択範囲の書式解除',''],['undo','↶','元に戻す',mod+'Z'],['redo','↷','やり直す',mod+shift+'Z']]){
      const b=button('qbInlineTool');b.dataset.qbInlineFormat=kind;b.title=label+(keys?'（'+keys+'）':'');b.setAttribute('aria-label',label);b.append(el('span','qbiSample '+kind,sample));if(keys)b.append(el('kbd','',keys));
      b.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse')e.preventDefault()});b.addEventListener('mousedown',e=>e.preventDefault());b.onclick=()=>format(s,kind);
      if(KINDS.includes(kind)){b.setAttribute('aria-pressed','false');s.formatButtons.set(kind,b)}s.tools.append(b);
    }
  return mod;
}
function createView(s,rich,changed=updateState){
    s.view=new EditorView({mount:rich},{
      state:EditorState.create({schema,doc:s.initialDoc,plugins:[history()]}),
      attributes:{class:'qbInlineRich',role:'textbox','aria-label':s.config.label+'を直接編集','aria-multiline':'true'},
      dispatchTransaction(tr){if(s.closed)return;this.updateState(this.state.apply(tr));changed(s)},
      handleKeyDown(view,e){if(e.key==='Enter'&&!view.composing&&!e.isComposing){e.preventDefault();view.dispatch(view.state.tr.insertText('\n').scrollIntoView());return true}return false},
      handleDOMEvents:{beforeinput(view,e){
        if(view.composing||e.isComposing||!e.cancelable||!['insertParagraph','insertLineBreak'].includes(e.inputType))return false;
        e.preventDefault();
        // prosemirror-view 1.41.7 defers iOS Enter to a 200ms fallback.
        // We handle the cancellable beforeinput ourselves, so acknowledge it
        // before dispatching: no native DOM change will consume that fallback.
        view.input.lastIOSEnter=0;
        clearTimeout(view.input.lastIOSEnterFallbackTimeout);
        view.input.lastIOSEnterFallbackTimeout=-1;
        view.dispatch(view.state.tr.insertText('\n').scrollIntoView());return true;
      }},
      handlePaste(view,e){e.preventDefault();if(e.clipboardData?.files?.length){status(s,'画像は「画像を編集・追加」から追加してください。');return true}const text=e.clipboardData?.getData('text/plain')||'';if(text)view.dispatch(view.state.tr.insertText(text.replace(/\r\n?/g,'\n')).scrollIntoView());return true},
      handleDrop(view,e){e.preventDefault();status(s,'画像は「画像を編集・追加」、文章はコピー＆ペーストをご利用ください。');return true}
    });
}
const choiceFields=new Set();
function mountField(ta,field,record,initial,label){
  const initialDoc=docFrom(initial,record);
  css();
  const inPlace=ta.parentElement?.dataset.qbChoiceFieldHost==='1',host=inPlace?ta.parentElement:el('div','qbFmtField qbInlineChoiceField');host.classList.add('qbFmtField','qbInlineChoiceField');host.dataset.qbFormatField=field;
  const title=el('label','qbFmtLabel',label),rich=el('div','qbInlineRich');
  if(!ta.id)ta.id='qbInlineField-'+Math.random().toString(36).slice(2);
  rich.id=ta.id+'-rich';title.htmlFor=rich.id;
  const s={host,body:rich,config:{label},initialDoc,formatButtons:new Map(),embedded:true,closed:false,saving:false,status:el('div','qbInlineStatus')};
  s.status.setAttribute('role','status');
  createTools(s);
  const focused=document.activeElement===ta;
  if(!inPlace)ta.before(host);host.replaceChildren(title,s.tools,rich,ta,s.status);ta.classList.add('qbInlineFieldSource');
  createView(s,rich,()=>{ta.value=s.view.state.doc.firstChild.textContent;updateState(s)});
  updateState(s);if(focused)s.view.focus();
  const shortcut=e=>{
    if(s.closed||!host.contains(e.target))return;
    const action=keyAction(e);if(!action)return;
    e.preventDefault();e.stopImmediatePropagation();if(e.repeat||s.saving)return;
    if(s.view.composing){status(s,'日本語の変換を確定してから操作してください。');return}
    if(action==='save')host.closest('.adeEditor')?.querySelector('.adeSave')?.click();else format(s,action);
  };
  window.addEventListener('keydown',shortcut,true);
  const control={field,textarea:ta,
    dirty:()=>s.dirty,
    read(){const draft=readDoc(s.view.state.doc);return window.QBExplanationFormat.snapshot(draft.text,draft.record?.ranges||[],true)},
    isComposing:()=>s.view.composing,
    setSaving(value){s.saving=value;s.view.setProps({editable:()=>!value});s.tools.querySelectorAll('button').forEach(b=>b.disabled=value)},
    destroy(){if(s.closed)return;s.closed=true;s.view.destroy();window.removeEventListener('keydown',shortcut,true);choiceFields.delete(control)},
    connected:()=>host.isConnected
  };
  choiceFields.add(control);return control;
}
function cleanChoiceFields(){for(const field of choiceFields)if(!field.connected())field.destroy();if(choiceGroup&&!choiceGroup.ed.isConnected)releaseChoiceEditor(choiceGroup.ed)}
function releaseChoiceEditor(ed){
  if(choiceGroup?.ed!==ed)return;
  for(const [name,original,wrapper] of choiceGroup.wrappers)if(window[name]===wrapper)window[name]=original;
  choiceGroup=null;if(!active)window.removeEventListener('beforeunload',beforeUnload);
}
function registerChoiceEditor(ed,close){
  const inputs=[...ed.querySelectorAll('input,textarea')].map(node=>({node,value:node.type==='checkbox'?node.checked:node.value}));
  const fields=()=>[...choiceFields].filter(f=>ed.contains(f.textarea));
  choiceGroup={ed,close,wrappers:[],dirty:()=>inputs.some(({node,value})=>(node.type==='checkbox'?node.checked:node.value)!==value)||fields().some(f=>f.dirty()),saving:()=>!!ed.querySelector('.adeSave')?.disabled,composing:()=>fields().some(f=>f.isComposing()),message:text=>{const st=ed.querySelector('.adeStatus');if(st)st.textContent=text}};
  for(const name of ['qbRetryCurrent','qbOpenSubjects','qbOpenProblemList','showGradeScreen','qbResumeSession']){
    const original=window[name];if(typeof original!=='function')continue;
    const wrapper=function(...args){if(!mayLeave())return;return original.apply(this,args)};
    choiceGroup.wrappers.push([name,original,wrapper]);window[name]=wrapper;
  }
  css();window.addEventListener('beforeunload',beforeUnload);
}
for(const event of ['qb-screen-change','qb-retry-current','qb-content-updated','qb-admin-editor-opened'])window.addEventListener(event,()=>queueMicrotask(cleanChoiceFields));
async function open(host,q,mode='overview'){
  const config=MODES[mode];if(!config)return;
  if(active?.host===host&&active.mode===mode){active.view.focus();return}
  if((active||choiceGroup)&&!mayLeave())return;
  if(opening||!host?.isConnected||!q)return;opening=true;
  const launch=host.querySelector(config.launch);if(launch)launch.disabled=true;
  let created=null;
  try{
    const sb=window.qbSupabase,id=qid(q),{field,meta}=config;if(!id||!sb||!window.QBExplanationFormat)throw new Error('編集機能を読み込み中です。再読み込みしてください。');
    const auth=await sb.auth.getUser(),userId=auth.data?.user?.id;if(!userId)throw new Error('ログインを確認してください。');
    const role=await sb.from('profiles').select('role').eq('id',userId).maybeSingle();if(role.error||role.data?.role!=='admin')throw new Error('管理者権限を確認できません。');
    const r=await sb.from('questions').select(field+','+meta+',updated_at').eq('id',id).maybeSingle();if(r.error)throw r.error;if(!r.data)throw new Error('本文を取得できません。');
    if(!host.isConnected||qid(current())!==id)return;
    if(String(q[field]??'')!==String(r.data[field]??''))throw new Error('別の更新があります。再読み込みしてから編集してください。');
    const body=host.querySelector(config.body);if(!body)throw new Error('本文の表示領域が見つかりません。');
    if(body.querySelector('input,textarea,button'))throw new Error('この問題の表示形式では直接編集できません。従来の編集画面をご利用ください。');
    const initialText=String(r.data[field]??''),initialRecord=clone(recordOf(r.data,mode)),initialDoc=docFrom(initialText,initialRecord);
    css();
    const s={host,q,id,userId,mode,config,body,initialText,initialRecord,initialDoc,originalNodes:[...body.childNodes],dirty:false,saving:false,closed:false,formatButtons:new Map(),wrappers:[]};
    const mod=createTools(s);
    s.actions=el('div','qbInlineActions');s.status=el('span','qbInlineStatus');s.status.setAttribute('role','status');
    s.cancelButton=button('qbInlineCancel','キャンセル');s.saveButton=button('qbInlineSave','保存');s.saveButton.append(el('kbd','',mod+'S'));s.actions.append(s.status,s.cancelButton,s.saveButton);
    s.cancelButton.onclick=()=>{if(!s.saving)closeEditor(s)};s.saveButton.onclick=()=>save(s);
    s.media=el('div','qbInlineMedia');const imageToggle=button('qbInlineImageToggle adeEditBtn','画像を編集・追加');imageToggle.setAttribute('aria-expanded','false');
    const imageHint=el('div','qbInlineImageHint','画像操作は即時反映です。本文のキャンセルでは画像の追加・加工・削除・並べ替えは元に戻りません。');s.media.append(imageToggle,imageHint);
    imageToggle.onclick=()=>toggleImages(s,imageToggle);
    created=s;body.dataset.qbInlineEditing=mode;host.classList.add(mode==='stem'?'qbInlineStemActive':'qbInlineActive');body.before(s.tools);body.replaceChildren();
    const rich=el('div','qbInlineRich');body.append(rich);
    if(mode==='stem'){
      s.sourceHint=el('div','qbInlineSourceHint','表示用の問題文と装飾を編集します。年度別原文・公式解答・解答欄は変更しません。');body.after(s.sourceHint);
      const anchor=host.querySelector(':scope > .qsiHost')||host.querySelector(':scope > .adeStemToolbar')||s.sourceHint;
      anchor.after(s.media);s.media.after(s.actions);
    }else{
      const anchor=host.querySelector(':scope > .qbPersonal')||host.querySelector(':scope > [data-ade-v2]');
      host.insertBefore(s.media,anchor||null);host.insertBefore(s.actions,anchor||null);
    }
    active=s;
    createView(s,rich);
    for(const name of ['qbRetryCurrent','qbOpenSubjects','qbOpenProblemList','showGradeScreen','qbResumeSession']){
      const original=window[name];if(typeof original!=='function')continue;
      const wrapper=function(...args){if(!mayLeave())return;return original.apply(this,args)};
      s.wrappers.push([name,original,wrapper]);window[name]=wrapper;
    }
    updateState(s);s.view.focus();
  }catch(e){if(created&&!created.closed)closeEditor(created);window.alert('編集を開始できませんでした：'+(e.message||e));}
  finally{opening=false;if(launch?.isConnected)launch.disabled=false}
}
const NAV='#qbPracticeDockV2 [data-a],#qbCompatDock [data-a],#qbGlobalDock [data-a],#prev,#next,#home,#answer,#review,#showTextAnswer,[data-s],[data-u],#acctLogout';
function captureClick(e){
  if(new URLSearchParams(location.search).get('editor')==='classic')return;
  const launch=e.target?.closest?.('[data-ade-v2="overview"],.adeStemBtn');
  if(launch){e.preventDefault();e.stopImmediatePropagation();const mode=launch.classList.contains('adeStemBtn')?'stem':'overview';open(launch.closest('.card'),current(),mode);return}
  if(!active&&!choiceGroup)return;
  const other=e.target?.closest?.('.adeEditBtnV2,.adeStemBtn,.oaiEditBtn');
  const nav=e.target?.closest?.(NAV);
  if(!nav&&!other)return;if(nav?.disabled)return;
  if(!mayLeave()){e.preventDefault();e.stopImmediatePropagation()}
}
window.addEventListener('click',captureClick,true);
window.addEventListener('keydown',handleShortcut,true);
window.QBInlineOverview={open,mountField,registerChoiceEditor,releaseChoiceEditor,requestLeave:mayLeave,isEditing:()=>!!active||!!choiceGroup,hasUnsavedChanges:()=>!!active?.dirty||!!choiceGroup?.dirty(),editingStem};
if(window.QB_INLINE_TEST)window.QBInlineOverview.codec={docFrom,readDoc};
