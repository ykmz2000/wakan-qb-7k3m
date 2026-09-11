/* Shared file library and picker. Text reading is explicitly requested. */
(()=>{
'use strict';
const C=window.QBImageLibraryCore,S=window.QBImageLibraryStore;
const pdf=row=>window.QBFiles?.isPDF(row?.object_path);
function media(img,url){return window.QBFiles?QBFiles.present(img,url,img.classList.contains('qbLibraryDetailImage')||img.classList.contains('qbLibraryZoomImage')):(img.src=url)}
const ASPECTS=['構造','正常機能','病態','症状・所見','検査','診断','鑑別','治療','作用機序','副作用'];
const ROLES=['総まとめ','個別解説','比較','疾患との関連','概念図','語呂合わせ'];
const ANALYSIS={unprocessed:'未解析',processed:'解析済み',needs_review:'要確認'};
const CLASSIFICATION={unknown:'不明',partial:'一部分類',classified:'分類済み'};
let active=null,opening=false,ocrScript=null;
function loadUploadOCR(){
 if(window.Tesseract?.createWorker)return Promise.resolve(window.Tesseract);
 if(!ocrScript)ocrScript=new Promise((resolve,reject)=>{
  const script=document.createElement('script');let settled=false;
  const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);script.onload=script.onerror=null;if(error){script.remove();ocrScript=null;reject(error)}else resolve(window.Tesseract)};
  const timer=setTimeout(()=>finish(Error('OCRの準備に時間がかかっています。')),15000);
  script.src='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';script.onload=()=>finish(window.Tesseract?.createWorker?null:Error('OCRを準備できませんでした。'));script.onerror=()=>finish(Error('OCRを読み込めませんでした。'));document.head.append(script);
 });return ocrScript;
}
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=String(text);return n}
function btn(text,fn,cls=''){const b=el('button',cls,text);b.type='button';if(fn)b.onclick=fn;return b}
function inputField(label,value='',multiline=false){const l=el('label','qbLibraryField'),span=el('span','',label),i=el(multiline?'textarea':'input');i.value=value;l.append(span,i);return {host:l,input:i}}
function selectField(label,options,value=''){const l=el('label','qbLibraryField'),span=el('span','',label),s=el('select');s.setAttribute('aria-label',label);for(const [v,t] of options)s.add(new Option(t,v));s.value=value;l.append(span,s);return{host:l,input:s}}
function check(text,value){const l=el('label','qbLibraryCheck'),i=el('input');i.type='checkbox';i.checked=!!value;l.append(i,el('span','',text));return{host:l,input:i}}
function detailBlock(label){const d=el('details','qbLibraryDetails');d.append(el('summary','',label));return d}
function fieldText(value){return Array.isArray(value)?value.join('、'):String(value??'')}
async function open({context=null}={}){
 if(active){active.focus();return [];}if(opening)return [];const sb=window.qbSupabase;if(!sb)throw Error('接続を確認してください。');opening=true;let access;try{access=await S.access(sb)}finally{opening=false}
 const owns=row=>!!row.created_by&&row.created_by===access.userId;
 return new Promise(resolve=>{
  const origin=document.activeElement,overlay=el('div','qbLibraryOverlay'),panel=el('section','qbLibraryPanel'),head=el('div','qbLibraryHeader'),body=el('div','qbLibraryBody'),foot=el('div','qbLibraryFooter');
  overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label',context?'貼り付ける画像を選択':'ライブラリ');overlay.tabIndex=-1;active=overlay;
  const heading=el('strong','',context?'ライブラリから選択':'ライブラリ'),navigationButton=btn('閉じる',()=>listView.hidden?back():close());head.append(heading,navigationButton);panel.append(head,body,foot);overlay.append(panel);
  const background=[...document.body.children].filter(n=>!['SCRIPT','STYLE','LINK'].includes(n.tagName)).map(n=>[n,n.inert]);background.forEach(([n])=>n.inert=true);document.body.append(overlay);
  const oldOverflow=document.documentElement.style.overflow;document.documentElement.style.overflow='hidden';
  const state={query:'',subjects:[],unit:'',role:'',sort:'recent',view:'all',aspect:'',analysis:'',classification:'',used:'',related:false,archived:false,offset:0};
  const selected=new Map(),jobs=new Map(),added=[];let busy=false,closed=false,generation=0,detailGeneration=0,subjects=[],catalogRows=[],terms=[],saveCurrent=null,dirty=()=>false,searchTimer=0,listScroll=0,hasMore=false,loading=false,autoPaused=false,selectionMode=!!context;
  const listView=el('div'),detailView=el('div');let detailPaste=null;detailView.hidden=true;body.append(listView,detailView);
  const composingFields=new WeakSet(),compositionEnded=new WeakMap();
  const imeActive=(target,e)=>!!(e?.isComposing||e?.keyCode===229||composingFields.has(target)||performance.now()-(compositionEnded.get(target)??-Infinity)<50);
  overlay.addEventListener('compositionstart',e=>{if(!e.target.matches?.('input,textarea'))return;composingFields.add(e.target);clearTimeout(searchTimer)},true);
  overlay.addEventListener('compositionend',e=>{if(!e.target.matches?.('input,textarea'))return;composingFields.delete(e.target);compositionEnded.set(e.target,performance.now());setTimeout(()=>{if(e.target.classList.contains('qbLibraryAutoGrow'))growField(e.target)},60);if(e.target===searchInput)scheduleSearch()},true);
  const fieldWidths=new WeakMap(),fieldResize=new ResizeObserver(entries=>{for(const {target,contentRect} of entries){if(fieldWidths.get(target)!==contentRect.width){fieldWidths.set(target,contentRect.width);requestAnimationFrame(()=>growField(target))}}});
  function growField(field){if(!field.isConnected||!field.getClientRects().length||imeActive(field))return;field.style.height='auto';field.style.height=Math.max(44,field.scrollHeight+2)+'px';}
  function autoGrow(field){field.classList.add('qbLibraryAutoGrow');field.rows=1;field.addEventListener('input',()=>growField(field));fieldResize.observe(field);requestAnimationFrame(()=>growField(field))}
  function report(target,e){target.textContent=e?.message||String(e)}
  function close(){if(closed||busy)return;if(dirty()&&!confirm('未保存の変更を破棄して閉じますか？'))return;closed=true;fieldResize.disconnect();generation++;clearTimeout(searchTimer);window.removeEventListener('qb-library-access-changed',endSession);overlay.remove();background.forEach(([n,inert])=>{if(n.isConnected)n.inert=inert});document.documentElement.style.overflow=oldOverflow;active=null;if(origin?.isConnected)origin.focus({preventScroll:true});try{if(added.length)context?.onSaved?.(added)}catch(e){console.warn('画像は保存済みですが画面の再表示に失敗しました',e)}resolve(added)}
  function endSession(){busy=false;dirty=()=>false;close()}window.addEventListener('qb-library-access-changed',endSession);
  overlay.addEventListener('keydown',e=>{e.stopPropagation();if(e.target.closest('.qbripModal,.qbDrawModal,.qbCropModal')||imeActive(e.target,e))return;if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'){e.preventDefault();if(!e.repeat&&!e.isComposing&&!busy)saveCurrent?.();return;}if(e.key==='Escape'){e.preventDefault();listView.hidden?back():close()}if(e.key==='Tab'){const nodes=[...overlay.querySelectorAll('button,input,select,textarea,summary,[tabindex="0"]')].filter(n=>!n.disabled&&n.getClientRects().length),first=nodes[0],last=nodes.at(-1);if(!first){e.preventDefault();overlay.focus()}else if(e.shiftKey&&(document.activeElement===first||document.activeElement===overlay)){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}});
  // Isolate shortcuts and paste from the underlying question editor.
  overlay.addEventListener('paste',e=>{
   e.stopPropagation();
   const editor=e.target.closest('input,textarea,[contenteditable="true"]');
   if(e.target.closest('.qbripModal'))return;
   if(listView.hidden){detailPaste?.(e);return;}
   if(editor&&editor!==pasteZone)return;
   const data=e.clipboardData,files=window.QBFiles?.filesFromPaste(e)||[];
   if(!files.length)files.push(...[...(data?.items||[])].filter(i=>i.kind==='file'&&(i.type.startsWith('image/')||i.type==='application/pdf')).map(i=>i.getAsFile()).filter(Boolean));
   if(!files.length){if(e.target===pasteZone)uploadStatus.textContent='PDF・画像のファイルを受け取れませんでした。「ファイルを選択」から追加してください。';return}e.preventDefault();if(busy)return;pasteZone.hidden=true;register(files,f=>S.add(sb,f));
  });overlay.addEventListener('click',e=>e.stopPropagation());
  function setBusy(v){busy=v;listView.inert=v;detailView.inert=v;head.querySelector('button').disabled=v;useButton.disabled=v||!selected.size;uploadInput.disabled=v;setButton.disabled=v||!selected.size;}
  const footStatus=el('span','qbLibraryStatus'),useButton=btn('選択した画像を貼る',useSelected,'qbLibraryPrimary');useButton.hidden=!context;useButton.disabled=true;const setButton=btn('',()=>{});setButton.hidden=true;const selectModeButton=btn('✓',()=>{selectionMode=!selectionMode;syncSelection()},'qbLibrarySelectionMode');selectModeButton.setAttribute('aria-label','選択モード');selectModeButton.hidden=true;foot.append(footStatus,selectModeButton,setButton,useButton);
  function syncSelection(){
   footStatus.textContent=selected.size?`${selected.size}枚を選択中`:selectionMode?'タップで選択・長押しで詳細':'サムネイルをタップして読む';
   selectModeButton.setAttribute('aria-pressed',String(selectionMode));setButton.disabled=busy||!selected.size;useButton.disabled=busy||!selected.size;
   for(const n of overlay.querySelectorAll('[data-pick-ids]')){const ids=JSON.parse(n.dataset.pickIds),all=ids.length>0&&ids.every(id=>selected.has(id)),some=ids.some(id=>selected.has(id));n.classList.toggle('is-selected',all);n.classList.toggle('is-partial',some&&!all);n.setAttribute('aria-pressed',String(all));}
  }
  function toggleImages(rows){const all=rows.every(r=>selected.has(r.id));rows.forEach(r=>selected.delete(r.id));if(!all)rows.filter(r=>!r.archived).forEach(r=>selected.set(r.id,r));syncSelection()}
  // Do not capture the pointer: the browser must retain native scrolling and swipe gestures.
  function bindThumbnail(node,rows,read,peek){
   node.dataset.pickIds=JSON.stringify(rows.map(r=>r.id));let timer=null,start=null,suppress=false;
   const clear=()=>{clearTimeout(timer);timer=null};
   node.addEventListener('pointerdown',e=>{clear();suppress=false;start={x:e.clientX,y:e.clientY};if(!selectionMode||e.button>0)return;timer=setTimeout(()=>{clear();if(!node.isConnected||closed||!selectionMode)return;suppress=true;peek()},450)});
   node.addEventListener('pointermove',e=>{if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>9){clear();suppress=true}});
   for(const event of ['pointerup','pointercancel','pointerleave'])node.addEventListener(event,clear);
   node.addEventListener('contextmenu',e=>{if(selectionMode)e.preventDefault()});
   node.onclick=e=>{clear();if(suppress&&e.detail!==0){suppress=false;e.preventDefault();return}if(selectionMode&&rows.length)toggleImages(rows);else read()};
   node.addEventListener('keydown',e=>{if(e.key===' '){e.preventDefault();node.click()}if(e.key==='F2'){e.preventDefault();peek()}});
  }
  function readMetadata(host,row){
   const m=row.metadata||{},basic=el('dl','qbLibraryReadOnly'),extra=detailBlock('細かい情報'),info=el('dl','qbLibraryReadOnly');
   for(const key of ['name','topics','keywords','subject_ids',...C.FIELDS.filter(k=>!['name','topics','keywords','subject_ids'].includes(k))]){
    const value=key==='subject_ids'?subjectNames(m[key]):key==='unit_ids'?(m[key]||[]).map(id=>catalogRows.find(c=>c.id===id)?.path||id).join('、'):key==='analysis_status'?ANALYSIS[m[key]]:key==='classification_status'?CLASSIFICATION[m[key]]:fieldText(m[key]);
    if(!value)continue;const target=['name','topics','keywords','subject_ids'].includes(key)?basic:info;const content=el('dd','',key==='keywords'?'':value);if(key==='keywords'){content.className='qbLibraryTags';(m.keywords||[]).forEach(tag=>content.append(el('span','qbLibraryTag qbLibraryReadTag',tag)))}target.append(el('dt','',C.LABELS[key]),content);
   }host.append(basic);if(info.childElementCount){extra.append(info);host.append(extra)}
  }
  function memberChoices(host,members){
   const actions=el('div','qbLibraryTools');actions.append(btn('全部を選択',()=>{members.forEach(r=>selected.delete(r.id));members.forEach(r=>selected.set(r.id,r));syncSelection()}),btn('選択を解除',()=>{members.forEach(r=>selected.delete(r.id));syncSelection()}));host.append(actions);
   const items=el('div','qbLibraryMemberChoices');host.append(items);
   members.forEach(row=>{const b=btn('',()=>toggleImages([row]),'qbLibraryMemberChoice'),im=el('img');b.dataset.pickIds=JSON.stringify([row.id]);im.alt=row.metadata?.name||'画像';b.append(im,el('span','',im.alt));items.append(b);S.signedURL(sb,row.object_path).then(url=>{if(im.isConnected)media(im,url)}).catch(()=>{});});syncSelection();
  }
  function preview(initial,isSet=false){
   const prior=document.activeElement,modal=el('div','qbLibraryOverlay qbLibraryPreview'),box=el('section','qbLibraryPanel'),header=el('div','qbLibraryHeader'),content=el('div','qbLibraryBody'),title=el('strong','',isSet?initial.name:initial.metadata?.name||'ファイルの詳細');
   modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','画像のプレビュー');modal.tabIndex=-1;header.append(title,btn('一覧に戻る',finish));box.append(header,content);modal.append(box);overlay.append(modal);panel.inert=true;
   function finish(){modal.remove();panel.inert=false;if(prior?.isConnected)prior.focus({preventScroll:true})}
   modal.addEventListener('click',e=>{e.stopPropagation();if(e.target===modal)finish()});modal.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();finish()}if((e.metaKey||e.ctrlKey)&&['s','z'].includes(e.key.toLowerCase()))e.preventDefault();if(e.key==='Tab'){const all=[...box.querySelectorAll('button,summary')].filter(n=>n.getClientRects().length),first=all[0],last=all.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===modal)){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}});
   const note=el('div','qbLibraryStatus','読み込み中…');content.append(note);header.querySelector('button').focus({preventScroll:true});
   (async()=>{try{const row=isSet?await S.setGet(sb,initial.id):await S.get(sb,initial.id);if(!modal.isConnected)return;note.remove();content.append(authorLine(row));if(isSet){memberChoices(content,row.members.filter(r=>!r.archived))}else{const im=el('img','qbLibraryDetailImage');im.alt=row.metadata.name||'画像';content.append(im);const url=await S.signedURL(sb,row.object_path);if(!modal.isConnected)return;media(im,url);readMetadata(content,row)}content.append(btn('詳細を開く',()=>{finish();isSet?showSetEditor(row):showDetail(row)}));}catch(e){report(note,e)}})();
  }
  async function useSelected(){
   if(!context||!selected.size||busy)return;if(dirty()){footStatus.textContent='先に編集中の内容を保存してください。';return}setBusy(true);
   try{
    for(const row of [...selected.values()]){footStatus.textContent='ファイルをコピーして貼り付け中…';let job=jobs.get(row.id);if(!job){job=S.newJob(row,context);jobs.set(row.id,job)}const usage=await S.attach(sb,row,context,job);added.push(usage);selected.delete(row.id);}
    setBusy(false);dirty=()=>false;close();
   }catch(e){footStatus.textContent=(added.length?`${added.length}枚は貼り付け済みです。残り：`:'')+(e.message||e)+' 同じ画面から再試行できます。';setBusy(false);syncSelection()}
  }
  const searchForm=el('form','qbLibrarySearch'),searchInput=el('input');searchInput.type='search';searchInput.placeholder='ファイル名・テーマ・読み取り本文を検索';searchInput.setAttribute('aria-label','ファイルを検索');const searchButton=btn('検索',()=>load(true));searchForm.append(searchInput,searchButton);searchForm.onsubmit=e=>{e.preventDefault();if(!imeActive(searchInput))load(true)};function scheduleSearch(){clearTimeout(searchTimer);searchTimer=setTimeout(()=>{if(!composingFields.has(searchInput))load(true)},300)}searchInput.oninput=e=>{clearTimeout(searchTimer);if(!composingFields.has(searchInput)&&!e.isComposing)scheduleSearch()};
  const tools=el('div','qbLibraryTools'),uploadInput=el('input');uploadInput.type='file';uploadInput.accept='image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif,application/pdf';uploadInput.multiple=true;uploadInput.hidden=true;
  const uploadStatus=el('div','qbLibraryStatus');uploadStatus.setAttribute('role','status');
  const pasteZone=el('div','qbLibraryPasteZone','ここを長押しして「ペースト」、またはキーボードでファイルを貼り付け');pasteZone.contentEditable='true';pasteZone.tabIndex=0;pasteZone.hidden=true;pasteZone.setAttribute('role','textbox');pasteZone.setAttribute('aria-label','ライブラリへのファイル貼り付け欄');

  const pasteButton=btn('ファイルをペースト',pasteImages),recentButton=btn('最近のファイル',chooseRecent);
  tools.append(btn('ファイルを追加',()=>uploadInput.click()),pasteButton,recentButton,btn('PDFを新規作成',async()=>{let row;try{await QBPDFEditor.create({onSave:async output=>{row=await S.add(sb,new File([output],'新しい資料.pdf',{type:'application/pdf'}))}});if(row){await load(true);await reviewUploads([row])}}catch(e){report(uploadStatus,e)}}),uploadInput);if(access.admin)tools.append(btn('検索語・別名を管理',()=>showTerms(),'qbLibraryTextButton'),btn('科目・単元を管理',()=>showCatalog(),'qbLibraryTextButton'));
  function uploadMode(values){
   const count=values.length;
   if(count<2)return Promise.resolve('separate');
   return new Promise(resolve=>{
    const origin=document.activeElement,modal=el('div','qbLibraryOverlay qbLibraryUploadMode'),box=el('section','qbLibraryPanel'),head=el('div','qbLibraryHeader'),body=el('div','qbLibraryBody');
    modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','ファイルの追加方法');modal.tabIndex=-1;
    head.append(el('strong','',`${count}ファイルの追加方法`));body.append(el('p','','追加するカードの分け方を選んでください。PDFはページ数にかかわらず1ファイルです。'));
    const urls=[];const finish=value=>{urls.forEach(u=>URL.revokeObjectURL(u));modal.remove();panel.inert=false;if(origin?.isConnected)origin.focus({preventScroll:true});resolve(value)};
    const previews=el('div','qbLibraryUploadPreviews');body.append(previews);
    function drawOrder(){previews.replaceChildren();values.forEach((value,index)=>{const row=el('div','qbLibraryUploadPreview'),name=value.name||value.metadata?.name||`ファイル ${index+1}`,im=el('img');im.alt=name;row.append(im,el('span','',`${index+1}. ${name}`));if(value instanceof Blob){const url=URL.createObjectURL(value);urls.push(url);if(window.QBFiles?.isPDF(value)){const card=el('span','qbLibraryMeta','PDF');im.replaceWith(card)}else im.src=url}else if(value.object_path)S.signedURL(sb,value.object_path).then(url=>{if(im.isConnected)media(im,url)}).catch(()=>im.remove());else if(value.image_path)im.src=value.image_url||value.url||'';const move=delta=>{const next=index+delta;if(next<0||next>=values.length)return;[values[index],values[next]]=[values[next],values[index]];drawOrder()};const up=btn('↑',()=>move(-1)),down=btn('↓',()=>move(1));up.setAttribute('aria-label',`${name}を前へ`);down.setAttribute('aria-label',`${name}を後ろへ`);up.disabled=index===0;down.disabled=index===values.length-1;row.append(up,down);previews.append(row)})}drawOrder();
    const separate=btn(`別々のカードに追加（${count}枚）`,()=>finish('separate'),'qbLibraryUploadChoice'),together=btn(`1つのカードにまとめる（${count}ファイル）`,()=>finish('together'),'qbLibraryUploadChoice');
    body.append(separate,el('p','qbLibraryMeta','1ファイルにつき1枚のカード。タイトルや情報を個別に管理します。'),together,el('p','qbLibraryMeta','選んだ順に1枚のカードへ。カードを開いて各ファイルを見られます。'));
    const cancel=btn('キャンセル',()=>finish(null));head.append(cancel);box.append(head,body);modal.append(box);overlay.append(modal);panel.inert=true;separate.focus();
    modal.addEventListener('click',e=>e.stopPropagation());modal.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();finish(null)}if(e.key==='Tab'){if(e.shiftKey&&document.activeElement===cancel){e.preventDefault();together.focus()}else if(!e.shiftKey&&document.activeElement===together){e.preventDefault();cancel.focus()}}});
   });
  }
  async function register(values,save){
   if(!values.length||busy||closed)return;setBusy(true);const mode=await uploadMode(values);if(!mode){uploadInput.value='';setBusy(false);return}let done=0,registered=[];
   try{for(const value of values){uploadStatus.textContent=(value?.size>50*1024*1024?'大きなファイルを保存中… 通信に時間がかかる場合があります。 ':'ファイルを登録中… ')+`${done}/${values.length}`;registered.push(await save(value));done++}if(mode==='together'&&registered.length>1)await S.setSave(sb,null,registered[0].metadata.name+'のカード',registered.map(r=>r.id));uploadStatus.textContent=`${done}ファイルを登録しました。`;}
   catch(e){uploadStatus.textContent=`${done}ファイルを登録済み。`+(e.message||e)}
   finally{uploadInput.value='';if(done)await load(true);setBusy(false)}
   if(registered.length)await reviewUploads(registered);
  }
  function keywordField(values){
   const host=el('div','qbLibraryField qbLibraryWide'),label=el('span','','キーワード'),wrap=el('div','qbLibraryTagEditor'),list=el('div','qbLibraryTags'),input=el('textarea');
   label.id='qb-keywords-'+crypto.randomUUID();input.setAttribute('aria-labelledby',label.id);input.placeholder='入力してEnterで追加';input.setAttribute('enterkeyhint','done');host.append(label,wrap);wrap.append(list,input);autoGrow(input);
   let tags=C.list(values),editing=null;
   const parts=()=>input.value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
   function value(){const next=tags.filter((_,i)=>i!==editing);if(editing===null)next.push(...parts());else next.splice(Math.min(editing,next.length),0,...parts());const seen=new Set();return next.filter(t=>{const n=C.normalize(t);if(seen.has(n))return false;seen.add(n);return true})}
   function commit(){if(composingFields.has(input))return;tags=value();editing=null;input.value='';draw();growField(input)}
   function draw(){list.replaceChildren();tags.forEach((tag,index)=>{const chip=el('span','qbLibraryTag'+(editing===index?' is-editing':'')),edit=btn(tag,()=>{commit();editing=tags.indexOf(tag);if(editing<0)editing=null;input.value=tag;draw();growField(input);input.focus();input.select()},'qbLibraryTagText'),remove=btn('×',()=>{tags.splice(index,1);if(editing===index){editing=null;input.value=''}else if(editing!==null&&editing>index)editing--;draw();growField(input);input.focus()},'qbLibraryTagRemove');edit.setAttribute('aria-label',tag+'を編集');remove.setAttribute('aria-label',tag+'を削除');chip.append(edit,remove);list.append(chip)})}
   input.addEventListener('keydown',e=>{if(e.key==='Enter'){if(imeActive(input,e))return;e.preventDefault();e.stopPropagation();commit()}});
   input.addEventListener('beforeinput',e=>{if(e.inputType==='insertParagraph'&&!imeActive(input,e)){e.preventDefault();commit()}});
   draw();return{host,input,value,commit};
  }
  function metadataForm(form,m){
   let keyword;const controls={},inputs={},advanced=detailBlock('細かい設定'),advancedGrid=el('div','qbLibraryForm');advanced.classList.add('qbLibraryWide');advanced.append(advancedGrid);
   function field(key,parent){const f=inputField(C.LABELS[key],fieldText(m[key]),['name','topics','keywords','notes','visual_summary','ocr_text'].includes(key));if(['name','topics','keywords'].includes(key))autoGrow(f.input);f.host.classList.add('qbLibraryWide');if(key==='roles')f.input.placeholder=ROLES.join('、');if(key==='aspects')f.input.placeholder=ASPECTS.join('、');if(key==='ocr_text')f.input.classList.add('qbLibraryTranscript');inputs[key]=f.input;controls[key]=()=>C.ARRAY_FIELDS.includes(key)?C.list(f.input.value):f.input.value;parent.append(f.host)}
   for(const key of ['name','topics'])field(key,form);keyword=keywordField(m.keywords);form.append(keyword.host);controls.keywords=keyword.value;inputs.keywords=keyword.input;
   function choices(key,label,options,parent){const group=el('div','qbLibraryField qbLibraryWide'),checks=el('div','qbLibraryChecks'),values=[];group.append(el('span','',label),checks);searchChecks(group,checks,label+'候補を検索');for(const option of options){const c=check(option.path||option.name,(m[key]||[]).includes(option.id));c.host.dataset.aliases=(option.aliases||[]).join(' ');values.push([option,c]);checks.append(c.host)}controls[key]=()=>values.filter(([,c])=>c.input.checked).map(([o])=>o.id);parent.append(group);return values;}
   const subjectInputs=choices('subject_ids','科目',subjects,form);form.append(advanced);
   const units=choices('unit_ids','単元',catalogRows.filter(c=>c.kind==='unit'),advancedGrid);
   const visibleUnits=()=>{const ids=controls.subject_ids();for(const [u,c] of units){c.host.hidden=!ids.includes(u.subject_id)&&!c.input.checked;c.host.dataset.excluded=String(c.host.hidden)}};subjectInputs.forEach(([,c])=>c.input.addEventListener('change',visibleUnits));visibleUnits();
   for(const key of ['aspects','roles','aliases','related_keywords','notes','visual_summary','ocr_text'])field(key,advancedGrid);
   for(const [key,label,options] of [['analysis_status','解析状況',Object.entries(ANALYSIS)],['classification_status','分類状況',Object.entries(CLASSIFICATION)]]){const f=selectField(label,options,m[key]||(key==='analysis_status'?'unprocessed':'unknown'));inputs[key]=f.input;controls[key]=()=>f.input.value;advancedGrid.append(f.host)}
   return {controls,inputs,advanced,commit:()=>keyword.commit()};
  }
  async function reviewUploads(rows){
   if(closed||!rows.length)return;
   const modal=el('div','qbLibraryOverlay qbLibraryUploadReview'),box=el('section','qbLibraryPanel'),header=el('div','qbLibraryHeader'),content=el('div','qbLibraryBody'),footer=el('div','qbLibraryFooter');
   modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','追加したファイルを確認');modal.tabIndex=-1;
   header.append(el('strong','','追加したファイルを確認'));box.append(header,content,footer);modal.append(box);overlay.append(modal);panel.inert=true;
   const intro=el('div','qbLibraryStatus','画像は登録済みです。必要な情報だけ編集し、そのままでも「確定」できます。');content.append(intro);
   const navigation=el('div','qbLibraryTools'),position=el('span'),host=el('div');content.append(navigation,host);
   const drafts=rows.map(row=>({row,fields:{},view:el('div')}));let index=0,saving=false,finished=false,worker=null,ocrTimer=null,ocrStopped=false;
   function stopOCR(){ocrStopped=true;clearTimeout(ocrTimer);if(worker){worker.terminate().catch(()=>{});worker=null}}
   for(const draft of drafts){
    const m=draft.row.metadata||{},im=el('img','qbLibraryDetailImage'),initialPath=draft.row.object_path;im.alt=m.name||'追加した画像';draft.view.append(im);S.signedURL(sb,initialPath).then(url=>{if(im.isConnected&&draft.row.object_path===initialPath)media(im,url)}).catch(()=>{if(draft.row.object_path===initialPath)im.alt='画像を読み込めませんでした'});
    const imageActions=el('div','qbLibraryTools');if(owns(draft.row))imageActions.append(btn(pdf(draft.row)?'PDF編集':'画像編集',()=>editUploaded(draft,im,'annotation')));
    const form=el('div','qbLibraryForm');draft.ocrStatus=el('div','qbLibraryStatus');draft.ocrStatus.setAttribute('role','status');draft.view.append(imageActions,form,draft.ocrStatus);host.append(draft.view);
    const fields=metadataForm(form,m);draft.fields=fields.controls;draft.commit=fields.commit;draft.ocrInput=fields.inputs.ocr_text;draft.analysisInput=fields.inputs.analysis_status;
    draft.ocrTouched=!!m.ocr_text||(Array.isArray(draft.row.manual_fields)?draft.row.manual_fields.includes('ocr_text'):!!draft.row.manual_fields?.ocr_text);
    draft.ocrInput.addEventListener('input',()=>draft.ocrTouched=true);draft.analysisInput.addEventListener('change',()=>draft.analysisTouched=true);
    draft.collect=()=>Object.fromEntries(Object.entries(draft.fields).map(([k,get])=>[k,get()]));draft.baseline=draft.collect();
   }
   async function editUploaded(draft,img,kind){
    if(saving||finished||!owns(draft.row))return;
    saving=true;stopOCR();modal.inert=true;let url;
    note.textContent='画像編集を準備中…';
    const replace=async output=>{
     draft.row=await S.replace(sb,draft.row,output);
     if(selected.has(draft.row.id))selected.set(draft.row.id,draft.row);jobs.delete(draft.row.id);
     // Keep metadata inputs and manually entered OCR; discard only stale automatic readings.
     if(!draft.ocrTouched){draft.ocrInput.value='';draft.ocrApplied=false;if(!draft.analysisTouched)draft.analysisInput.value='unprocessed'}
     draft.ocrStatus.textContent='画像を編集しました。入力中の情報は保持しています。';
     try{media(img,await S.signedURL(sb,draft.row.object_path))}catch{img.removeAttribute('src');img.alt='編集済み画像を再表示できませんでした。画像は保存されています。'}
     note.textContent='画像を保存しました。情報を確認して確定してください。';
    };
    try{
     const blob=await S.download(sb,draft.row);
     if(kind==='crop'){
      if(!window.QBImageCrop)throw Error('画像編集を読み込めません。再読み込みしてください。');
      url=URL.createObjectURL(blob);const output=await QBImageCrop.open(url,{title:'追加した画像をトリミング'});if(output)await replace(output);else note.textContent='画像の編集をキャンセルしました。';
     }else{
      if(!window.QBImageEditor)throw Error('画像編集を読み込めません。再読み込みしてください。');
      const output=await (pdf(draft.row)?QBPDFEditor:QBImageEditor).open(blob,{title:'追加したファイルを編集',onSave:replace});if(!output)note.textContent='画像の編集をキャンセルしました。';
     }
    }catch(e){report(note,e)}finally{if(url)URL.revokeObjectURL(url);saving=false;modal.inert=false;if(!finished)draft.view.querySelector('.qbLibraryTools button')?.focus({preventScroll:true})}
   }
   function display(){drafts.forEach((d,i)=>d.view.hidden=i!==index);position.textContent=`${index+1} / ${drafts.length}枚`;previous.disabled=saving||index===0;next.disabled=saving||index===drafts.length-1;content.scrollTop=0;}
   const previous=btn('前の画像',()=>{if(index>0){index--;display()}}),next=btn('次の画像',()=>{if(index<drafts.length-1){index++;display()}});navigation.append(previous,position,next);navigation.hidden=drafts.length===1;
   let touchX=null;host.addEventListener('touchstart',e=>{touchX=e.target.tagName==='IMG'?e.touches[0]?.clientX:null},{passive:true});host.addEventListener('touchend',e=>{if(saving||touchX==null)return;const dx=e.changedTouches[0].clientX-touchX;touchX=null;if(Math.abs(dx)>60){index=Math.max(0,Math.min(drafts.length-1,index+(dx<0?1:-1)));display()}},{passive:true});
   const note=el('div','qbLibraryStatus');note.setAttribute('role','status');footer.append(note);
   return new Promise(resolveReview=>{
    function finish(){if(finished)return;finished=true;stopOCR();window.removeEventListener('qb-library-access-changed',finish);modal.querySelectorAll('.qbLibraryAutoGrow').forEach(n=>fieldResize.unobserve(n));modal.remove();panel.inert=false;resolveReview(drafts.map(d=>d.row));}
    window.addEventListener('qb-library-access-changed',finish);
    const confirmButton=btn('確定',confirmReview,'qbLibraryPrimary');footer.append(confirmButton);const reviewBack=btn('一覧に戻る',confirmReview);header.append(reviewBack);
    async function confirmReview(){
     if(saving||finished)return;saving=true;stopOCR();content.inert=true;confirmButton.disabled=true;confirmButton.textContent='保存中…';confirmButton.setAttribute('aria-busy','true');reviewBack.disabled=true;note.textContent='変更内容を保存しています…';
     try{for(const d of drafts){d.commit();const patch=C.changed(d.baseline,d.collect());if(Object.keys(patch).length){d.row=await S.save(sb,d.row,patch,{reason:d.ocrApplied?'アップロード後の内容確認（ブラウザOCRの仮読み取りを含む）':'アップロード後の内容確認'});d.baseline=d.collect();if(selected.has(d.row.id))selected.set(d.row.id,d.row)}}finish();void load(true)}
     catch(e){note.textContent=(e.message||e)+' 入力内容は保持しています。';}
     finally{saving=false;if(!finished){content.inert=false;confirmButton.disabled=false;confirmButton.textContent='確定';confirmButton.removeAttribute('aria-busy');reviewBack.disabled=false;confirmButton.focus({preventScroll:true})}}
    }
    modal.addEventListener('keydown',e=>{
     e.stopPropagation();if(imeActive(e.target,e))return;if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'){e.preventDefault();if(!e.repeat&&!e.isComposing)confirmReview();return}
     if(e.key==='Escape'){e.preventDefault();if(!saving&&(!drafts.some(d=>Object.keys(C.changed(d.baseline,d.collect())).length)||confirm('編集内容を破棄して閉じますか？アップロードした画像は残ります。')))finish();return}
     if(e.key==='Tab'){const nodes=[...box.querySelectorAll('button,input,select,textarea,summary')].filter(n=>!n.disabled&&n.getClientRects().length),first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===modal)){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}
    });modal.addEventListener('paste',e=>e.stopPropagation());display();confirmButton.focus();
    // Local OCR never blocks confirmation or overwrites a field the user has touched.
    async function readDrafts(){
     const targets=drafts.filter(d=>!d.ocrTouched);if(!targets.length)return;
     targets.forEach(d=>d.ocrStatus.textContent='簡易OCRを準備中… 待たずに確定できます。');
     let stopped=false;
     ocrTimer=setTimeout(()=>{stopped=true;stopOCR();targets.filter(d=>!d.ocrApplied).forEach(d=>d.ocrStatus.textContent='OCRを終了しました。未入力でも確定できます。')},60000);
     const alive=()=>!finished&&!saving&&!stopped&&!closed&&!ocrStopped;
     try{
      const engine=await loadUploadOCR();if(!alive())return;
      const created=await engine.createWorker(['jpn','eng'],1,{workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1',errorHandler:()=>{}});
      if(!alive()){await created.terminate();return}worker=created;
      for(const d of targets){
       if(!alive())return;if(d.ocrTouched){d.ocrStatus.textContent='入力した本文を保持しています。';continue}
       d.ocrStatus.textContent='簡易OCRで読み取り中… 待たずに確定できます。';
       const blob=await S.download(sb,d.row);if(!alive())return;
       const result=await created.recognize(blob,{}, {text:true,blocks:false,hocr:false,tsv:false});if(!alive())return;
       const text=(result.data?.text||'').trim();
       if(d.ocrTouched){d.ocrStatus.textContent='入力した本文を保持しています。';continue}
       if(text){d.ocrInput.value=text;d.ocrApplied=true;if(!d.analysisTouched)d.analysisInput.value='needs_review';d.ocrStatus.textContent='簡易OCRの仮読み取りです。必要なら修正して確定してください。文脈による補完・分類は行っていません。'}else d.ocrStatus.textContent='文字を読み取れませんでした。未入力でも確定できます。';
      }
     }catch{if(alive())targets.filter(d=>!d.ocrApplied).forEach(d=>d.ocrStatus.textContent='OCRを利用できませんでした。未入力でも確定できます。')}
     finally{stopOCR()}
    }
    if(rows.every(r=>!pdf(r)))footer.append(btn('画像の文字を読み取る',()=>{ocrStopped=false;void readDrafts()}));
   });
  }
  uploadInput.onchange=()=>register([...uploadInput.files],f=>S.add(sb,f));
  async function pasteImages(){
   if(busy)return;setBusy(true);let files=[];
   try{files=await QBFiles.clipboardFiles()}catch{/* iPad and denied clipboard reads use an explicit paste target. */}
   finally{setBusy(false)}
   if(files.length){pasteZone.hidden=true;await register(files,f=>S.add(sb,f));return}
   pasteZone.hidden=false;pasteZone.focus();uploadStatus.textContent='貼り付け欄にペーストしてください。PDFが渡されない場合は「ファイルを選択」から追加できます。';
  }
  async function chooseRecent(){
   if(busy)return;const picker=window.qbRecentImagePicker;if(!picker){uploadStatus.textContent='最近のファイルを読み込めません。画面を再読み込みしてください。';return}
   setBusy(true);panel.inert=true;let rows=[];
   try{rows=await picker.pick({sb,title:'ライブラリに追加するファイルを選択',parent:overlay,context:null})}
   catch(e){report(uploadStatus,e)}
   finally{panel.inert=false;setBusy(false);recentButton.focus({preventScroll:true})}
   await register(rows,row=>S.addRecent(sb,row));
  }
  const filters=el('details','qbLibraryFilters'),filterSummary=el('summary','','絞り込み'),subjectChecks=el('div','qbLibraryChecks'),filterGrid=el('div','qbLibraryFilterGrid');filters.append(filterSummary,el('div','qbLibraryMeta','関連科目（複数選択可）'),subjectChecks,filterGrid);
  const unitFilter=selectField('単元（下位も含む）',[['','すべて']]);filterGrid.append(unitFilter.host);unitFilter.input.onchange=()=>{state.unit=unitFilter.input.value;load(true)};
  const fields=[['role','画像の役割',[['','すべて'],...ROLES.map(x=>[x,x])]],['sort','並び順',[['recent','アップロード順（新しい順）'],['logical','科目・単元順']]],['view','表示',[['all','すべてのカード'],['images','個別ファイル'],['sets','カード']]],['aspect','内容の観点',[['','すべて'],...ASPECTS.map(x=>[x,x])]],['analysis','解析状況',[['','すべて'],...Object.entries(ANALYSIS)]],['classification','分類状況',[['','すべて'],...Object.entries(CLASSIFICATION)]],['used','使用状況',[['','すべて'],['used','使用履歴あり'],['unused','未使用']]]];
  for(const [key,label,options] of fields){const f=selectField(label,options,state[key]);filterGrid.append(f.host);f.input.onchange=()=>{state[key]=f.input.value;load(true)}}
  const related=check('関連する内容も検索する',false),archived=check('削除した画像を表示',false);filters.append(related.host,archived.host);related.input.onchange=()=>{state.related=related.input.checked;load(true)};archived.input.onchange=()=>{state.archived=archived.input.checked;selected.clear();load(true)};
  const status=el('div','qbLibraryStatus'),suggest=el('div','qbLibraryTools'),grid=el('div','qbLibraryGrid'),more=btn('再読み込み',()=>load(state.offset===0));more.hidden=true;status.setAttribute('role','status');listView.append(searchForm,tools,pasteZone,uploadStatus,filters,status,suggest,grid,more);
  const authorCache=new Map();
  async function preloadAuthors(rows){const ids=rows.flatMap(r=>[r.item?.created_by,r.set_data?.created_by,...(r.set_data?.members||[]).map(i=>i.created_by)]).filter(id=>id&&!authorCache.has(id));try{for(const a of await S.authors(sb,ids))authorCache.set(a.id,a)}catch{/* Attribution failure must not hide images. */}}
  function updatedLine(row){const time=el('time','qbLibraryUpdated');const date=row.updated_at?new Date(row.updated_at):null;if(date&&Number.isFinite(date.getTime())){time.dateTime=date.toISOString();time.textContent='最終更新：'+new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date)+'（日本時間）'}else time.textContent='最終更新：記録なし';return time;}
  function authorLine(row){const a=authorCache.get(row.created_by),line=el('div','qbLibraryAuthor'),name=a?.display_name||'投稿者';const icon=el('span','qbLibraryAuthorIcon',name.slice(0,1));if(a?.avatar_path){const im=el('img');im.alt='';im.src=S.avatarURL(sb,a.avatar_path);im.onerror=()=>im.remove();icon.append(im)}line.append(icon,el('span','',name));return line;}
  async function thumbnail(img,path,version){try{const url=await S.signedURL(sb,path);if(!closed&&version===generation&&img.isConnected)media(img,url)}catch{if(img.isConnected)img.alt='画像を読み込めませんでした'}}
  function subjectNames(ids){return (ids||[]).map(id=>subjects.find(s=>s.id===id)?.name||id).join('、')}
  function renderResult(result,version){
   if(result.set_data){renderSet(result,version);return;}const row=result.item,m=row.metadata||{},article=el('article','qbLibraryItem'),imageButton=btn('',null,'qbLibraryImageButton'),img=el('img');img.loading='lazy';img.alt=m.name||'名称未設定';imageButton.append(img,el('div','qbLibraryName',m.name||'名称未設定'));article.append(authorLine(row),imageButton);grid.append(article);
   bindThumbnail(imageButton,row.archived?[]:[row],()=>showDetail(row),()=>preview(row));thumbnail(img,row.object_path,version);
  }
  function maybeLoadMore(){
   if(closed||busy||loading||autoPaused||!hasMore||listView.hidden||panel.inert||searchInput.value!==state.query)return;
   if(body.scrollHeight-body.scrollTop-body.clientHeight<400)load(false);
  }
  body.addEventListener('scroll',maybeLoadMore,{passive:true});
  async function load(reset){
   if(closed||(!reset&&loading))return;const retain=reset&&listView.hidden?state.offset:0;loading=true;autoPaused=false;clearTimeout(searchTimer);if(reset){state.query=searchInput.value;state.offset=0;generation++;grid.replaceChildren();suggest.replaceChildren();}
   const version=generation,offset=state.offset;status.textContent=reset?'検索中…':'続きを読み込み中…';more.hidden=true;more.disabled=true;searchButton.disabled=true;
   try{const rows=await S.search(sb,{...state});await preloadAuthors(rows);if(closed||version!==generation)return;if(reset)grid.replaceChildren();for(const row of rows)renderResult(row,version);state.offset=offset+rows.length;hasMore=rows.length===30&&state.offset<Number(rows[0]?.total_count||0);more.hidden=true;status.textContent=rows.length?`${rows[0].total_count}件 / ${state.offset}件を表示`:(reset?'この条件のファイルはありません。':'すべて表示しました。');if(reset&&!rows.length&&state.query){for(const word of C.suggestions(state.query,terms))suggest.append(btn('もしかして：'+word,()=>{searchInput.value=word;load(true)},'qbLibraryTextButton'))}syncSelection();}
   catch(e){if(!closed&&version===generation){report(status,e);autoPaused=true;more.hidden=false;more.textContent='再読み込み';}}
   finally{if(!closed&&version===generation){loading=false;more.disabled=false;searchButton.disabled=false;requestAnimationFrame(maybeLoadMore)}}
   while(!closed&&version===generation&&!autoPaused&&hasMore&&state.offset<retain)await load(false);
  }
  function enterDetail(title){saveCurrent=null;detailPaste=null;detailGeneration++;if(!listView.hidden)listScroll=body.scrollTop;listView.hidden=true;navigationButton.textContent='一覧に戻る';selectModeButton.hidden=true;setButton.hidden=true;detailView.hidden=false;detailView.querySelectorAll('.qbLibraryAutoGrow').forEach(n=>fieldResize.unobserve(n));detailView.replaceChildren();heading.textContent=title;body.scrollTop=0}
  async function back(){if(busy)return;if(dirty()){if(!saveCurrent)return;await saveCurrent();if(dirty())return;}detailGeneration++;dirty=()=>false;saveCurrent=null;detailPaste=null;detailView.hidden=true;listView.hidden=false;navigationButton.textContent='閉じる';selectModeButton.hidden=true;setButton.hidden=true;syncSelection();heading.textContent=context?'ライブラリから選択':'ライブラリ';body.scrollTop=listScroll;navigationButton.focus({preventScroll:true});}
  async function showDetail(initial,editing=false){
   if(busy)return;enterDetail('ファイルの詳細');const detailVersion=detailGeneration;const note=el('div','qbLibraryStatus','読み込み中…');note.setAttribute('role','status');detailView.append(note);let row;
   try{row=await S.get(sb,initial.id);if(closed||detailVersion!==detailGeneration)return;await drawDetail(row,note,editing)}catch(e){report(note,e)}
  }
  async function drawDetail(initial,note,editing){
   let row=initial,m=row.metadata||{};const img=el('img','qbLibraryDetailImage');img.alt=m.name||'ライブラリ画像';zoomable(img);if(owns(row))img.qbEditMedia=async()=>{if(dirty()){note.textContent='先に情報の変更を保存してください。';return}setBusy(true);try{const blob=await S.download(sb,row);await (pdf(row)?QBPDFEditor:QBImageEditor).open(blob,{resetSource:row.original_path&&row.original_path!==row.object_path?()=>S.download(sb,{...row,object_path:row.original_path}):null,onSave:async output=>{row=await S.replace(sb,row,output)}});await load(true)}finally{setBusy(false)}await showDetail(row,editing)};const updated=updatedLine(row);detailView.append(authorLine(row),updated,img);S.signedURL(sb,row.object_path).then(url=>{if(img.isConnected)media(img,url)}).catch(e=>report(note,e));
   if(!editing||!owns(row)){
    dirty=()=>false;saveCurrent=null;note.textContent='';
    const actions=el('div','qbLibraryTools');if(owns(row))actions.append(btn('編集',()=>showDetail(row,true),'qbLibraryEditButton'));
    if(selectionMode&&!row.archived){const pick=btn('このファイルを選択',()=>toggleImages([row]));pick.dataset.pickIds=JSON.stringify([row.id]);actions.append(pick)}detailView.append(actions);readMetadata(detailView,row);syncSelection();return;
   }
   const top=el('div','qbLibraryTools'),replaceInput=el('input');replaceInput.type='file';replaceInput.accept=uploadInput.accept;replaceInput.hidden=true;
   top.append(btn(pdf(row)?'PDF編集':'画像編集',()=>editImage('annotation')),btn('原本を差し替える',()=>replaceInput.click()),replaceInput);
   if(!row.archived)top.append(btn('このカードにファイルを追加',()=>showSetEditor(null,[row])));
   if(context&&!row.archived)top.append(btn(selected.has(row.id)?'選択を解除':'このファイルを選択',e=>{if(selected.has(row.id))selected.delete(row.id);else selected.set(row.id,row);e.currentTarget.textContent=selected.has(row.id)?'選択を解除':'このファイルを選択';syncSelection()},'qbLibraryPrimary'));
   detailView.append(top);note.textContent=`解析：${ANALYSIS[m.analysis_status]||'未解析'}　分類：${CLASSIFICATION[m.classification_status]||'不明'}`;
   const form=el('form','qbLibraryForm'),controls={};detailView.append(form);
   const fields=metadataForm(form,m);Object.assign(controls,fields.controls);const advanced=fields.advanced;
   const collect=()=>Object.fromEntries(Object.entries(controls).map(([k,get])=>[k,get()]));let baseline=collect();dirty=()=>Object.keys(C.changed(baseline,collect())).length>0;
   const actions=el('div','qbLibraryTools qbLibraryWide'),saveButton=btn('変更を保存',()=>saveForm(),'qbLibraryPrimary'),conflictButton=btn('最新情報を別表示',()=>showLatest());conflictButton.hidden=true;actions.append(saveButton,conflictButton);form.append(actions);form.onsubmit=e=>{e.preventDefault();if(!imeActive(document.activeElement))saveForm()};
   async function showLatest(){try{const latest=await S.get(sb,row.id);const d=detailBlock('現在保存されている情報（入力内容は保持しています）');d.open=true;const p=el('pre');p.textContent=JSON.stringify(latest.metadata,null,2);d.append(p);detailView.append(d);note.textContent='入力内容を確認・控えたうえで詳細を開き直してください。強制上書きは行いません。'}catch(e){report(note,e)}}
   saveCurrent=saveForm;
   async function saveForm(){if(busy)return;fields.commit();const patch=C.changed(baseline,collect());if(!Object.keys(patch).length){note.textContent='変更はありません。';return}const focus=document.activeElement;setBusy(true);saveButton.disabled=true;saveButton.textContent='保存中…';note.textContent='保存中…';try{row=await S.save(sb,row,patch);const latestTime=updatedLine(row);updated.textContent=latestTime.textContent;updated.dateTime=latestTime.dateTime;baseline=collect();if(selected.has(row.id))selected.set(row.id,row);jobs.delete(row.id);note.textContent='保存しました。';void load(true)}catch(e){report(note,e);if(e.code==='40001')conflictButton.hidden=false;}finally{setBusy(false);saveButton.disabled=false;saveButton.textContent='変更を保存';if(focus?.isConnected)focus.focus({preventScroll:true})}}
   async function editImage(kind){
    if(busy)return;if(dirty()){note.textContent='先に情報の変更を保存してください。';return;}setBusy(true);panel.inert=true;let url,changed=false;
    try{const blob=await S.download(sb,row);
     if(kind==='crop'){if(!window.QBImageCrop)throw Error('画像編集を読み込めません。再読み込みしてください。');url=URL.createObjectURL(blob);const output=await QBImageCrop.open(url,{title:'ライブラリ画像をトリミング'});if(output){row=await S.replace(sb,row,output);changed=true}}
     else{if(!window.QBImageEditor)throw Error('画像編集を読み込めません。再読み込みしてください。');await (pdf(row)?QBPDFEditor:QBImageEditor).open(blob,{title:'ライブラリ画像を画像編集',resetSource:row.original_path&&row.original_path!==row.object_path?()=>S.download(sb,{...row,object_path:row.original_path}):null,onSave:async output=>{row=await S.replace(sb,row,output);changed=true}})}
     if(changed){selected.delete(row.id);jobs.delete(row.id);dirty=()=>false;await load(true)}
    }catch(e){report(note,e)}finally{if(url)URL.revokeObjectURL(url);panel.inert=false;setBusy(false)}
    if(changed)await showDetail(row,true);else top.querySelector('button')?.focus();
   }
   replaceInput.onchange=async()=>{const f=replaceInput.files?.[0];if(!f||busy)return;if(dirty()){note.textContent='先に情報の変更を保存してください。';replaceInput.value='';return}if(!confirm('原本を差し替えますか？以前の画像は履歴に残り、読み取り本文は新しい画像用にリセットされます。'))return;setBusy(true);try{row=await S.replace(sb,row,f);dirty=()=>false;selected.delete(row.id);jobs.delete(row.id);await load(true);setBusy(false);await showDetail(row,true)}catch(e){report(note,e)}finally{setBusy(false)}};
   const suggestions=row.ai_suggestions||{};
   if(Object.keys(suggestions).length){const d=detailBlock('手動編集を保持したAIの変更案');d.open=true;for(const [key,proposal] of Object.entries(suggestions)){const r=el('div','qbLibraryHistoryRow');r.append(el('b','',C.LABELS[key]||key),el('pre','','現在：'+fieldText(m[key])+'\n提案：'+fieldText(proposal.value)),btn('この項目の提案を採用',async()=>{if(dirty()){note.textContent='先に編集中の内容を保存してください。';return}setBusy(true);try{row=await S.save(sb,row,{[key]:proposal.value},{reason:'AIの変更案を確認して採用'});dirty=()=>false;setBusy(false);await showDetail(row,true)}catch(e){report(note,e)}finally{setBusy(false)}}));d.append(r)}advanced.append(d)}
   const reading=detailBlock('読み取り・補完結果'),readBody=el('div');reading.append(readBody);advanced.append(reading);
   reading.ontoggle=async()=>{if(!reading.open||reading.dataset.loaded)return;reading.dataset.loaded='1';readBody.textContent='読み込み中…';try{const rs=await S.readings(sb,row.id);readBody.replaceChildren();if(!rs.length)readBody.append(el('div','qbLibraryStatus','読み取り結果はまだありません。'));for(const r of rs){const d=detailBlock(`${r.created_at.slice(0,10)} / 画像版 ${r.image_version}`);d.append(el('pre','','OCR原文\n'+r.raw_text),el('pre','','補完後の本文\n'+r.corrected_text));for(const repair of r.repairs||[])d.append(el('div','qbLibraryHistoryRow',`${repair.before||'判読不明'} → ${repair.after||'判読不明'}\n根拠：${repair.reason}\n確実性：${({high:'高い',uncertain:'推定',unreadable:'判読不明'})[repair.confidence]||repair.confidence}`));readBody.append(d)}}catch(e){report(readBody,e);delete reading.dataset.loaded}};
   const importBlock=detailBlock('AIに依頼する・結果を取り込む'),importField=inputField('AIから受け取った結果','',true);
   async function copyRequest(kind){
    if(busy)return;if(dirty()){note.textContent='先に編集中の内容を保存してください。';return}
    try{
     const info={image_id:row.id,image_version:row.image_version,revision:row.revision,request_id:crypto.randomUUID()};
     const url=await S.signedURL(sb,row.object_path);
     const task=kind==='reading'?'画像の文字・図・写真・表と前後の文脈を確認し、文字を全文読み取ってください。読めない箇所は根拠がある場合に補完し、不確かな箇所を本文中にも明記してください。数値・単位・否定・左右は推測で断定しないでください。raw_textには直接読めた原文、corrected_textには補完後の全文、visual_summaryには図の意味、repairsにはbefore・after・reason・confidence（high / uncertain / unreadable）を記録してください。分類と問題への貼り付けは依頼していません。':'画像そのものが説明する内容を確認して分類してください。中心テーマtopicsと含まれる内容keywordsを区別し、subject_idsは下記科目から複数選択できます。aspectsは構造・正常機能・病態・所見・検査・鑑別・治療・作用機序・副作用等、rolesは総まとめ・個別解説・比較・疾患との関連・概念図・語呂合わせ等。疾患名は必須ではありません。aliasesには同義の別名、related_keywordsには関連だけする語を入れてください。画像に根拠のない関連語を増やさないでください。OCR本文の変更と問題への貼り付けは依頼していません。';
     const schema=kind==='reading'?{...info,reading:{raw_text:'',corrected_text:'',visual_summary:'',repairs:[]}}:{...info,classification:{name:row.metadata.name||'',subject_ids:[],topics:[],keywords:[],aspects:[],roles:[],aliases:[],related_keywords:[],notes:'',classification_status:'classified'}};
     const text=task+'\n画像（30分で期限切れ）：'+url+'\n現在の情報：'+JSON.stringify(row.metadata)+(kind==='classification'?'\n科目一覧：'+JSON.stringify(subjects.map(s=>({id:s.id,name:s.name}))):'')+'\n次の形式のJSONで返してください。識別情報は変更しないでください。\n'+JSON.stringify(schema,null,2);
     try{await navigator.clipboard.writeText(text);note.textContent='画像へのリンクを含む依頼文をコピーしました。AIとの会話に貼り付けて依頼してください。'}catch{importField.input.value=text;note.textContent='依頼文を表示しました。コピーしてAIとの会話に貼り付けてください。'}
    }catch(e){report(note,e)}
   }
   importBlock.append(el('div','qbLibraryStatus','依頼文をAIとの会話に貼り付け、返ってきた結果を取り込みます。読み取りと分類は別々に依頼できます。'),btn('読み取りの依頼文をコピー',()=>copyRequest('reading')),btn('分類の依頼文をコピー',()=>copyRequest('classification')),importField.host,btn('結果を取り込む',async()=>{if(busy)return;if(dirty()){note.textContent='先に編集中の内容を保存してください。';return}setBusy(true);try{const parsed=JSON.parse(importField.input.value);if(parsed.reading&&parsed.classification&&Object.keys(parsed.classification).length&&!confirm('この結果には読み取りと分類の両方が含まれます。両方を反映しますか？'))return;row=await S.recordReading(sb,row,parsed);dirty=()=>false;await load(true);setBusy(false);await showDetail(row,true)}catch(e){report(note,e)}finally{setBusy(false)}}));advanced.append(importBlock);
   const hist=detailBlock('変更履歴・元に戻す'),histBody=el('div');hist.append(histBody);advanced.append(hist);let historyOffset=0;
   async function loadHistory(){const rs=await S.history(sb,row.id,historyOffset);historyOffset+=rs.length;for(const h of rs){const d=detailBlock(`版 ${h.revision} / ${h.origin==='ai'?'AI':'手動'} / ${h.created_at.slice(0,16).replace('T',' ')} / ${h.reason}`);const before=h.before_value?.metadata||{},after=h.after_value?.metadata||{};for(const key of C.FIELDS){if(JSON.stringify(before[key])===JSON.stringify(after[key]))continue;const r=el('div','qbLibraryHistoryRow');r.append(el('b','',C.LABELS[key]),el('pre','','変更前：'+fieldText(before[key])+'\n変更後：'+fieldText(after[key])));if(h.before_value)r.append(btn('この項目を変更前に戻す',()=>restore({[key]:before[key]??(C.ARRAY_FIELDS.includes(key)?[]:key==='analysis_status'?'unprocessed':key==='classification_status'?'unknown':'')},null)));d.append(r)}if(h.before_value?.object_path&&h.before_value.object_path!==h.after_value.object_path)d.append(btn('画像を変更前の版に戻す',()=>restore({},h.before_value.object_path)));histBody.append(d)}if(rs.length===50){const b=btn('さらに履歴を表示',async()=>{b.disabled=true;try{await loadHistory();b.remove()}catch(e){report(note,e);b.disabled=false}});histBody.append(b)}}
   hist.ontoggle=async()=>{if(!hist.open||hist.dataset.loaded)return;hist.dataset.loaded='1';try{await loadHistory()}catch(e){report(note,e);delete hist.dataset.loaded}};
   async function restore(patch,path){if(busy)return;if(dirty()){note.textContent='先に編集中の内容を保存してください。';return}if(!confirm('選んだ項目を以前の内容に戻しますか？この操作も履歴に残ります。'))return;setBusy(true);try{row=await S.save(sb,row,patch,{objectPath:path,reason:'履歴から復元'});dirty=()=>false;await load(true);setBusy(false);await showDetail(row,true)}catch(e){report(note,e)}finally{setBusy(false)}}
   const uses=detailBlock('使用履歴'),usesBody=el('div');uses.append(usesBody);advanced.append(uses);let usageOffset=0;
   async function loadUses(){const rs=await S.usages(sb,row.id,usageOffset);usageOffset+=rs.length;if(!rs.length&&!usageOffset)usesBody.append(el('div','qbLibraryStatus','まだ使用されていません。'));for(const u of rs){const r=el('div','qbLibraryHistoryRow');r.append(el('div','',`${u.created_at.slice(0,10)} / ${placementName(u.placement)}`),el('div','qbLibraryMeta',`問題ID：${u.question_id}`),el('div','qbLibraryMeta',`使用時の画像版：${u.image_version}`));usesBody.append(r)}if(rs.length===50){const b=btn('さらに使用履歴を表示',async()=>{b.disabled=true;try{await loadUses();b.remove()}catch(e){report(note,e);b.disabled=false}});usesBody.append(b)}}
   uses.ontoggle=async()=>{if(!uses.open||uses.dataset.loaded)return;uses.dataset.loaded='1';try{await loadUses()}catch(e){report(note,e);delete uses.dataset.loaded}};
   const archiveButton=btn(row.archived?'ライブラリへ戻す':'ライブラリから削除',async()=>{if(busy)return;if(dirty()){note.textContent='先に編集中の内容を保存してください。';return}if(!confirm(row.archived?'ライブラリへ戻しますか？':'ライブラリから削除しますか？削除した画像の一覧から元に戻せます。'))return;setBusy(true);try{row=await S.save(sb,row,{}, {archived:!row.archived,reason:row.archived?'削除した画像を復元':'ライブラリから削除'});selected.delete(row.id);dirty=()=>false;await load(true);setBusy(false);await back()}catch(e){report(note,e)}finally{setBusy(false)}});const archiveActions=el('div','qbLibraryTools');archiveActions.append(archiveButton);advanced.append(archiveActions);
  }
  function searchChecks(host,checks,label){const f=inputField(label);host.insertBefore(f.host,checks);f.input.addEventListener('input',()=>{const q=C.normalize(f.input.value);for(const c of checks.children)c.hidden=c.dataset.excluded==='true'||!C.normalize(c.textContent+' '+(c.dataset.aliases||'')).includes(q)});}
  function refreshCatalogFilters(){
   subjects=catalogRows.filter(c=>c.kind==='subject');subjectChecks.replaceChildren();
   if(!filters.querySelector('[data-catalog-search]')){const f=inputField('絞り込む科目を検索');f.host.dataset.catalogSearch='1';filters.insertBefore(f.host,subjectChecks);f.input.oninput=()=>{const q=C.normalize(f.input.value);for(const c of subjectChecks.children)c.hidden=!C.normalize(c.textContent+' '+c.dataset.aliases).includes(q)}}
   for(const s of subjects){const c=check(s.name,state.subjects.includes(s.id));c.host.dataset.aliases=(s.aliases||[]).join(' ');c.input.value=s.id;c.input.onchange=()=>{state.subjects=[...subjectChecks.querySelectorAll('input:checked')].map(i=>i.value);refreshUnitFilter();load(true)};subjectChecks.append(c.host)}refreshUnitFilter();
  }
  function refreshUnitFilter(){const eligible=catalogRows.filter(c=>c.kind==='unit'&&(!state.subjects.length||state.subjects.includes(c.subject_id)));if(state.unit&&!eligible.some(c=>c.id===state.unit))state.unit='';unitFilter.input.replaceChildren(new Option('すべて',''));for(const u of eligible)unitFilter.input.add(new Option(u.path,u.id));unitFilter.input.value=state.unit;}
  function zoomable(img){img.classList.add('qbLibraryZoomImage');img.tabIndex=0;img.setAttribute('role','button');img.setAttribute('aria-label',(img.alt||'画像')+'を拡大表示');img.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();img.click()}})}
  function carousel(members,onOpen,version,zoom=false){
   const host=el('div','qbLibraryCarousel'),track=el('div','qbLibrarySlides'),nav=el('div','qbLibrarySlideNav'),counter=el('span','',`1 / ${members.length}`);let current=0;
   for(const row of members){const b=btn('',()=>onOpen(row),'qbLibrarySlide'),im=el('img');im.loading='lazy';im.alt=row.metadata?.name||'画像';if(zoom){zoomable(im);b.tabIndex=-1;}b.append(im);track.append(b);S.signedURL(sb,row.object_path).then(url=>{if(im.isConnected&&!closed)media(im,url)}).catch(()=>im.alt='画像を読み込めませんでした')}
   const move=delta=>{const next=Math.max(0,Math.min(members.length-1,current+delta));track.scrollTo({left:next*track.clientWidth,behavior:'smooth'})};
   nav.append(btn('前',()=>move(-1)),counter,btn('次',()=>move(1)));track.onscroll=()=>{current=Math.max(0,Math.min(members.length-1,Math.round(track.scrollLeft/(track.clientWidth||1))));counter.textContent=`${current+1} / ${members.length}`};host.append(track,nav);return host;
  }
  function renderSet(result,version){
   const set=result.set_data,members=(set.members||[]).filter(r=>!r.archived);if(!members.length)return;
   const article=el('article','qbLibraryItem qbLibrarySet'),cover=btn('',null,'qbLibraryImageButton'),img=el('img');img.alt=set.name;img.loading='lazy';cover.append(img,el('div','qbLibraryName',set.name),el('span','qbLibraryMeta',`${members.length}ファイル`));article.append(authorLine(set),cover);grid.append(article);
   bindThumbnail(cover,members,()=>showSetEditor(set),()=>preview(set,true));thumbnail(img,members[0].object_path,version);
  }
  async function showSetEditor(initial,initialMembers=[],editing=!initial){
   if(busy)return;if(dirty()&&!confirm('未保存の変更を破棄しますか？'))return;enterDetail(initial?'資料カード':'資料カードを作成');dirty=()=>false;
   const gen=detailGeneration,note=el('div','qbLibraryStatus','読み込み中…');note.setAttribute('role','status');detailView.append(note);let row=initial,members=initialMembers.slice();
   try{if(row){row=await S.setGet(sb,row.id);members=row.members}if(closed||gen!==detailGeneration)return}catch(e){report(note,e);return}
   if(row&&(!editing||!owns(row))){
    note.textContent='';detailView.append(authorLine(row),updatedLine(row),el('h2','',row.name),carousel(members,()=>{},generation,true));if(owns(row))detailView.append(btn('編集',()=>showSetEditor(row,[],true),'qbLibraryEditButton'));if(selectionMode)memberChoices(detailView,members.filter(r=>!r.archived));return;
   }
   const name=inputField('カード名',row?.name||((members[0]?.metadata.name||'画像')+'のカード'));detailView.append(name.host);const host=el('div','qbLibrarySetMembers');detailView.append(host);
   let baseline=row?JSON.stringify([name.input.value,members.map(r=>r.id)]):null;dirty=()=>baseline!==JSON.stringify([name.input.value,members.map(r=>r.id)]);
   function drawMembers(){host.replaceChildren();members.forEach((r,index)=>{
    const line=el('div','qbLibrarySetMember'),im=el('img');im.alt=r.metadata.name||'画像';im.loading='lazy';S.signedURL(sb,r.object_path).then(url=>{if(im.isConnected)media(im,url)}).catch(()=>{});line.append(im,el('div','',`${index+1}. ${r.metadata.name}${r.archived?'（削除済み）':''}`));
    line.append(btn('詳細・画像編集',()=>{if(dirty()){note.textContent='先にカードを保存してください。';return}showDetail(r)}),btn('前へ',()=>{if(index){[members[index-1],members[index]]=[members[index],members[index-1]];drawMembers()}}),btn('後ろへ',()=>{if(index<members.length-1){[members[index+1],members[index]]=[members[index],members[index+1]];drawMembers()}}),btn('カードから外す',()=>{members.splice(index,1);selected.delete(r.id);drawMembers();syncSelection()}));host.append(line);
   })}
   drawMembers();note.textContent='各画像を確認して選択できます。カードから外しても画像はライブラリに残ります。';
   const addTools=el('div','qbLibraryTools'),addInput=el('input'),addPaste=el('div','qbLibraryPasteZone','ここを長押しして「ペースト」、またはキーボードでファイルを貼り付け');
   addInput.type='file';addInput.accept=uploadInput.accept;addInput.multiple=true;addInput.hidden=true;addInput.setAttribute('aria-label','カードに追加するファイル');
   addPaste.contentEditable='true';addPaste.tabIndex=0;addPaste.hidden=true;addPaste.setAttribute('role','textbox');addPaste.setAttribute('aria-label','カードへのファイル貼り付け欄');
   const alive=()=>!closed&&gen===detailGeneration;
   async function appendImages(values,save){
    if(busy||!alive()||!values.length)return;setBusy(true);let count=0,registered=[];
    try{for(const value of values){if(!alive())return;note.textContent=`ファイルを追加中… ${count}/${values.length}`;const image=await save(value);if(!alive())return;if(!members.some(r=>r.id===image.id))members.push(image);registered.push(image);count++;drawMembers();}note.textContent=`${count}枚を追加しました。「カードを保存」で確定してください。`;}
    catch(e){note.textContent=`${count}枚を追加済み。`+(e.message||e)+' 追加できたファイルは保持しています。';}
    finally{addInput.value='';setBusy(false);if(alive()&&count)try{await load(true)}catch(e){report(note,e)}}
    if(alive()&&registered.length){const updated=await reviewUploads(registered);if(alive()&&updated){const byId=new Map(updated.map(r=>[r.id,r]));members=members.map(r=>byId.get(r.id)||r);drawMembers()}}
   }
   addInput.onchange=()=>appendImages([...addInput.files],f=>S.add(sb,f));
   async function pasteIntoSet(){
    if(busy)return;setBusy(true);let files=[];
    try{files=await QBFiles.clipboardFiles()}catch{/* Use the explicit paste field when clipboard access is unavailable. */}finally{setBusy(false)}
    if(!alive())return;if(files.length){addPaste.hidden=true;await appendImages(files,f=>S.add(sb,f));return}addPaste.hidden=false;addPaste.focus();note.textContent='貼り付け欄にペーストしてください。PDFが渡されない場合は「ファイルを選択」から追加できます。';
   }
   detailPaste=e=>{
    const editor=e.target.closest('input,textarea,[contenteditable="true"]');if(!alive()||(editor&&editor!==addPaste))return;
    const data=e.clipboardData,files=window.QBFiles?.filesFromPaste(e)||[];
    if(!files.length)files.push(...[...(data?.items||[])].filter(i=>i.kind==='file'&&(i.type.startsWith('image/')||i.type==='application/pdf')).map(i=>i.getAsFile()).filter(Boolean));
    if(!files.length){if(e.target===addPaste)note.textContent='PDF・画像のファイルを受け取れませんでした。「ファイルを選択」から追加してください。';return}e.preventDefault();if(busy)return;addPaste.hidden=true;appendImages(files,f=>S.add(sb,f));
   };
   const recentAdd=btn('最近のファイルから追加',async()=>{
    if(busy)return;const picker=window.qbRecentImagePicker;if(!picker){note.textContent='最近のファイルを読み込めません。画面を再読み込みしてください。';return}setBusy(true);panel.inert=true;let picked=[];
    try{picked=await picker.pick({sb,title:'カードに追加するファイルを選択',parent:overlay,context:null})}catch(e){report(note,e)}finally{panel.inert=false;setBusy(false);if(alive())recentAdd.focus({preventScroll:true})}
    if(alive())await appendImages(picked,r=>S.addRecent(sb,r));
   });
   addTools.append(btn('このカードにファイルを追加',()=>addInput.click()),btn('ファイルをペースト',pasteIntoSet),recentAdd);detailView.append(addTools,addInput,addPaste,el('div','qbLibraryStatus','追加したファイルはすぐにライブラリへ登録されます。カードの構成は「カードを保存」で確定します。'));
   const actions=el('div','qbLibraryTools');actions.append(btn('全部を選択',()=>{members.forEach(r=>selected.delete(r.id));members.filter(r=>!r.archived).forEach(r=>selected.set(r.id,r));drawMembers();syncSelection()}),btn('選択を解除',()=>{members.forEach(r=>selected.delete(r.id));drawMembers();syncSelection()}),btn('カードを保存',saveSet,'qbLibraryPrimary'));detailView.append(actions);saveCurrent=saveSet;
   async function saveSet(){if(busy)return;if(!name.input.value.trim()||!members.length){note.textContent='カード名と1つ以上のファイルが必要です。';return}setBusy(true);try{row=await S.setSave(sb,row,name.input.value,members.map(r=>r.id));baseline=JSON.stringify([name.input.value,members.map(r=>r.id)]);const picked=members.filter(r=>selected.has(r.id));members.forEach(r=>selected.delete(r.id));picked.forEach(r=>selected.set(r.id,r));syncSelection();note.textContent='カードを保存しました。';void load(true)}catch(e){report(note,e)}finally{setBusy(false)}}
   if(row)actions.append(btn('カードを解除',async()=>{if(busy||!confirm('カードを解除しますか？各ファイルはライブラリに残ります。'))return;setBusy(true);try{await S.setSave(sb,row,row.name,row.image_ids,true);dirty=()=>false;await load(true);setBusy(false);await back()}catch(e){report(note,e)}finally{setBusy(false)}}));
   if(!initial){try{const existing=(await S.sets(sb)).filter(r=>!r.archived&&owns(r));if(closed||gen!==detailGeneration)return;const f=selectField('既存のカードに追加',[['','カードを選択'],...existing.map(r=>[r.id,r.name])]);detailView.append(f.host,btn('このカードに追加',async()=>{if(busy||!f.input.value)return;setBusy(true);try{const target=await S.setGet(sb,f.input.value);const ids=[...new Set([...target.image_ids,...members.map(r=>r.id)])];await S.setSave(sb,target,target.name,ids);dirty=()=>false;selected.clear();await load(true);setBusy(false);await back()}catch(e){report(note,e)}finally{setBusy(false)}}))}catch(e){report(note,e)}}
  }
  async function showCatalog(){
   if(busy)return;enterDetail('科目・単元の管理');dirty=()=>false;
   const note=el('div','qbLibraryStatus','単元は「科目 → 分野・臓器 → 単元」の順に整理できます。同じ親の中では並び順の小さいものを先に表示します。'),form=el('div','qbLibraryForm');detailView.append(note,form);
   const choice=selectField('編集対象',[['','新しい科目'],['new-unit','新しい単元'],...catalogRows.map(c=>[c.id,c.path])]),name=inputField('名称'),aliases=inputField('別名・読み'),parent=selectField('所属する科目・上位単元',[['','科目は選択不要'],...catalogRows.map(c=>[c.id,c.path])]),order=inputField('並び順','1000');order.input.type='number';order.input.step='10';for(const f of [choice,name,aliases,parent,order])form.append(f.host);let row=null,initial=JSON.stringify(['','', '', '1000']);
   const values=()=>JSON.stringify([name.input.value,aliases.input.value,parent.input.value,order.input.value]);dirty=()=>values()!==initial;
   choice.input.onchange=()=>{if(dirty()&&!confirm('未保存の変更を破棄しますか？')){choice.input.value=row?.id||'';return}row=catalogRows.find(c=>c.id===choice.input.value)||null;name.input.value=row?.name||'';aliases.input.value=(row?.aliases||[]).join('、');parent.input.value=row?.parent_id||'';parent.input.disabled=(row?.kind|| (choice.input.value==='new-unit'?'unit':'subject'))==='subject';order.input.value=String(row?.sort_order||1000);initial=values()};parent.input.disabled=true;
   async function saveCatalog(){if(busy)return;const kind=row?.kind||(choice.input.value==='new-unit'?'unit':'subject');if(!name.input.value.trim()||(kind==='unit'&&!parent.input.value)){note.textContent='名称と、単元の場合は上位項目を指定してください。';return}setBusy(true);try{const saved=await S.catalogSave(sb,row,{name:name.input.value.trim(),kind,parent_id:kind==='subject'?null:parent.input.value,aliases:C.list(aliases.input.value),sort_order:Number(order.input.value)});row=saved;initial=values();catalogRows=await S.taxonomy(sb);refreshCatalogFilters();note.textContent='保存しました。';await load(true)}catch(e){report(note,e)}finally{setBusy(false)}}
   saveCurrent=saveCatalog;detailView.append(btn('科目・単元を保存',saveCatalog,'qbLibraryPrimary'));
  }
  async function showTerms(){
   if(busy)return;enterDetail('検索語・別名の管理');dirty=()=>false;const note=el('div','qbLibraryStatus','同じ意味の呼び名を登録します。関連するだけの語は画像の「関連する内容」に登録してください。'),form=el('div','qbLibraryForm'),select=selectField('編集する検索語',[['','新しく追加'],...terms.map(t=>[t.id,t.canonical])]),canonical=inputField('正式な検索語'),aliases=inputField('別名・読み・略語（改行または読点区切り）','',true);detailView.append(note,select.host,form);form.append(canonical.host,aliases.host);let row=null,initial=['',''];
   select.input.onchange=()=>{if(dirty()&&!confirm('未保存の変更を破棄しますか？')){select.input.value=row?.id||'';return}row=terms.find(t=>t.id===select.input.value)||null;canonical.input.value=row?.canonical||'';aliases.input.value=(row?.aliases||[]).join('\n');initial=[canonical.input.value,aliases.input.value]};dirty=()=>canonical.input.value!==initial[0]||aliases.input.value!==initial[1];
   const termSaveButton=btn('検索語を保存',async()=>{if(busy)return;setBusy(true);try{await S.termSave(sb,row,canonical.input.value,aliases.input.value);terms=await S.catalog(sb,'qb_image_library_terms');dirty=()=>false;await showTerms();note.textContent='保存しました。'}catch(e){report(note,e)}finally{setBusy(false)}},'qbLibraryPrimary');detailView.append(termSaveButton);saveCurrent=termSaveButton.onclick;
  }
  overlay.focus();(async()=>{try{[catalogRows,terms]=await Promise.all([S.taxonomy(sb),S.catalog(sb,'qb_image_library_terms')]);if(closed)return;refreshCatalogFilters();await load(true)}catch(e){report(status,e)}})();
 });
}
function placementName(p){return {question:'問題文',choice:'選択肢',explanation_overview:'問題文のポイント',choice_explanation:'選択肢解説',examiner_intent:'出題者の意図',exam_summary:'試験用まとめ',medical_verification:'医学的検証'}[p]||p}
window.QBImageLibrary={open,placementName};
})();
