/* Shared image library and picker. All AI work is explicitly imported, never scheduled. */
(()=>{
'use strict';
const C=window.QBImageLibraryCore,S=window.QBImageLibraryStore;
const ASPECTS=['構造','正常機能','病態','症状・所見','検査','診断','鑑別','治療','作用機序','副作用'];
const ROLES=['総まとめ','個別解説','比較','疾患との関連','概念図','語呂合わせ'];
const ANALYSIS={unprocessed:'未解析',processed:'解析済み',needs_review:'要確認'};
const CLASSIFICATION={unknown:'不明',partial:'一部分類',classified:'分類済み'};
let active=null,opening=false;
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
  overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label',context?'貼り付ける画像を選択':'画像ライブラリ');overlay.tabIndex=-1;active=overlay;
  const heading=el('strong','',context?'画像ライブラリから選択':'画像ライブラリ');head.append(heading,btn('閉じる',()=>close()));panel.append(head,body,foot);overlay.append(panel);
  const background=[...document.body.children].filter(n=>!['SCRIPT','STYLE','LINK'].includes(n.tagName)).map(n=>[n,n.inert]);background.forEach(([n])=>n.inert=true);document.body.append(overlay);
  const oldOverflow=document.documentElement.style.overflow;document.documentElement.style.overflow='hidden';
  const state={query:'',subjects:[],unit:'',role:'',sort:'logical',view:'all',aspect:'',analysis:'',classification:'',used:'',related:false,archived:false,offset:0};
  const selected=new Map(),jobs=new Map(),added=[];let busy=false,closed=false,generation=0,detailGeneration=0,subjects=[],catalogRows=[],terms=[],saveCurrent=null,dirty=()=>false,searchTimer=0,listScroll=0,hasMore=false;
  const listView=el('div'),detailView=el('div');let detailPaste=null;detailView.hidden=true;body.append(listView,detailView);
  function report(target,e){target.textContent=e?.message||String(e)}
  function close(){if(closed||busy)return;if(dirty()&&!confirm('未保存の変更を破棄して閉じますか？'))return;closed=true;generation++;clearTimeout(searchTimer);window.removeEventListener('qb-library-access-changed',endSession);overlay.remove();background.forEach(([n,inert])=>{if(n.isConnected)n.inert=inert});document.documentElement.style.overflow=oldOverflow;active=null;if(origin?.isConnected)origin.focus({preventScroll:true});try{if(added.length)context?.onSaved?.(added)}catch(e){console.warn('画像は保存済みですが画面の再表示に失敗しました',e)}resolve(added)}
  function endSession(){busy=false;dirty=()=>false;close()}window.addEventListener('qb-library-access-changed',endSession);
  overlay.addEventListener('keydown',e=>{e.stopPropagation();if(e.target.closest('.qbripModal,.qbDrawModal,.qbCropModal'))return;if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'){e.preventDefault();if(!e.repeat&&!e.isComposing&&!busy)saveCurrent?.();return;}if(e.key==='Escape'){e.preventDefault();close()}if(e.key==='Tab'){const nodes=[...overlay.querySelectorAll('button,input,select,textarea,summary,[tabindex="0"]')].filter(n=>!n.disabled&&n.getClientRects().length),first=nodes[0],last=nodes.at(-1);if(!first){e.preventDefault();overlay.focus()}else if(e.shiftKey&&(document.activeElement===first||document.activeElement===overlay)){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}});
  // Isolate shortcuts and paste from the underlying question editor.
  overlay.addEventListener('paste',e=>{
   e.stopPropagation();
   const editor=e.target.closest('input,textarea,[contenteditable="true"]');
   if(e.target.closest('.qbripModal'))return;
   if(listView.hidden){detailPaste?.(e);return;}
   if(editor&&editor!==pasteZone)return;
   const data=e.clipboardData,files=[...(data?.files||[])].filter(f=>f.type.startsWith('image/'));
   if(!files.length)files.push(...[...(data?.items||[])].filter(i=>i.kind==='file'&&i.type.startsWith('image/')).map(i=>i.getAsFile()).filter(Boolean));
   if(!files.length)return;e.preventDefault();if(busy)return;pasteZone.hidden=true;register(files,f=>S.add(sb,f));
  });overlay.addEventListener('click',e=>e.stopPropagation());
  function setBusy(v){busy=v;listView.inert=v;detailView.inert=v;head.querySelector('button').disabled=v;useButton.disabled=v||!selected.size;uploadInput.disabled=v;setButton.disabled=v||!selected.size;}
  const footStatus=el('span','qbLibraryStatus'),useButton=btn('選択した画像を貼る',useSelected,'qbLibraryPrimary');useButton.hidden=!context;useButton.disabled=true;const setButton=btn('選択した画像をセットにする',()=>showSetEditor(null,[...selected.values()]));setButton.hidden=!!context;foot.append(footStatus,setButton,useButton);
  function syncSelection(){footStatus.textContent=selected.size?`${selected.size}枚を選択中`:'画像を開いて確認・選択できます。';setButton.disabled=busy||!selected.size;useButton.disabled=busy||!selected.size;for(const i of listView.querySelectorAll('[data-select-image]')){i.checked=selected.has(i.dataset.selectImage)}for(const i of listView.querySelectorAll('[data-select-set]')){const ids=JSON.parse(i.dataset.selectSet);i.checked=ids.every(id=>selected.has(id));i.indeterminate=!i.checked&&ids.some(id=>selected.has(id))}}
  async function useSelected(){
   if(!context||!selected.size||busy)return;if(dirty()){footStatus.textContent='先に編集中の内容を保存してください。';return}setBusy(true);
   try{
    for(const row of [...selected.values()]){footStatus.textContent='画像をコピーして貼り付け中…';let job=jobs.get(row.id);if(!job){job=S.newJob(row,context);jobs.set(row.id,job)}const usage=await S.attach(sb,row,context,job);added.push(usage);selected.delete(row.id);}
    setBusy(false);dirty=()=>false;close();
   }catch(e){footStatus.textContent=(added.length?`${added.length}枚は貼り付け済みです。残り：`:'')+(e.message||e)+' 同じ画面から再試行できます。';setBusy(false);for(const i of listView.querySelectorAll('[data-select-image]'))i.checked=selected.has(i.dataset.selectImage)}
  }
  const searchForm=el('form','qbLibrarySearch'),searchInput=el('input');searchInput.type='search';searchInput.placeholder='画像名・テーマ・画像内の本文を検索';searchInput.setAttribute('aria-label','画像を検索');const searchButton=btn('検索',()=>load(true));searchForm.append(searchInput,searchButton);searchForm.onsubmit=e=>{e.preventDefault();load(true)};searchInput.oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>load(true),300)};
  const tools=el('div','qbLibraryTools'),uploadInput=el('input');uploadInput.type='file';uploadInput.accept='image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif';uploadInput.multiple=true;uploadInput.hidden=true;
  const uploadStatus=el('div','qbLibraryStatus');uploadStatus.setAttribute('role','status');
  const pasteZone=el('div','qbLibraryPasteZone','ここを長押しして「ペースト」、またはキーボードで画像を貼り付け');pasteZone.contentEditable='true';pasteZone.tabIndex=0;pasteZone.hidden=true;pasteZone.setAttribute('role','textbox');pasteZone.setAttribute('aria-label','ライブラリへの画像貼り付け欄');
  const asSet=check('複数枚を1セットとして追加',false);
  const pasteButton=btn('画像をコピペ',pasteImages),recentButton=btn('最近の画像',chooseRecent);
  tools.append(asSet.host,btn('画像を選択',()=>uploadInput.click()),pasteButton,recentButton,uploadInput);if(access.admin)tools.append(btn('検索語・別名を管理',()=>showTerms(),'qbLibraryTextButton'),btn('科目・単元を管理',()=>showCatalog(),'qbLibraryTextButton'));
  async function register(values,save){
   if(!values.length||busy||closed)return;setBusy(true);let done=0,registered=[];
   try{for(const value of values){uploadStatus.textContent=`画像を登録中… ${done}/${values.length}`;registered.push(await save(value));done++}if(asSet.input.checked&&registered.length>1)await S.setSave(sb,null,registered[0].metadata.name+'のセット',registered.map(r=>r.id));uploadStatus.textContent=`${done}枚を登録しました。`;}
   catch(e){uploadStatus.textContent=`${done}枚を登録済み。`+(e.message||e)}
   finally{uploadInput.value='';if(done)await load(true);setBusy(false)}
  }
  uploadInput.onchange=()=>register([...uploadInput.files],f=>S.add(sb,f));
  async function pasteImages(){
   if(busy)return;setBusy(true);let files=[];
   try{if(navigator.clipboard?.read){const items=await navigator.clipboard.read();for(const item of items){const type=item.types.find(t=>t.startsWith('image/'));if(type){const blob=await item.getType(type);files.push(new File([blob],'貼り付け画像.'+(type.split('/')[1]||'png'),{type}))}}}}catch{/* iPad and denied clipboard reads use an explicit paste target. */}
   finally{setBusy(false)}
   if(files.length){pasteZone.hidden=true;await register(files,f=>S.add(sb,f));return}
   pasteZone.hidden=false;pasteZone.focus();uploadStatus.textContent='画像をコピーして、貼り付け欄にペーストしてください。';
  }
  async function chooseRecent(){
   if(busy)return;const picker=window.qbRecentImagePicker;if(!picker){uploadStatus.textContent='最近の画像を読み込めません。画面を再読み込みしてください。';return}
   setBusy(true);panel.inert=true;let rows=[];
   try{rows=await picker.pick({sb,title:'ライブラリに追加する画像を選択',parent:overlay,context:null})}
   catch(e){report(uploadStatus,e)}
   finally{panel.inert=false;setBusy(false);recentButton.focus({preventScroll:true})}
   await register(rows,row=>S.addRecent(sb,row));
  }
  const filters=el('details','qbLibraryFilters'),filterSummary=el('summary','','絞り込み'),subjectChecks=el('div','qbLibraryChecks'),filterGrid=el('div','qbLibraryFilterGrid');filters.append(filterSummary,el('div','qbLibraryMeta','関連科目（複数選択可）'),subjectChecks,filterGrid);
  const unitFilter=selectField('単元（下位も含む）',[['','すべて']]);filterGrid.append(unitFilter.host);unitFilter.input.onchange=()=>{state.unit=unitFilter.input.value;load(true)};
  const fields=[['role','画像の役割',[['','すべて'],...ROLES.map(x=>[x,x])]],['sort','並び順',[['logical','科目・単元順'],['recent','追加順']]],['view','表示',[['all','画像とセット'],['images','個別画像'],['sets','セット']]],['aspect','内容の観点',[['','すべて'],...ASPECTS.map(x=>[x,x])]],['analysis','解析状況',[['','すべて'],...Object.entries(ANALYSIS)]],['classification','分類状況',[['','すべて'],...Object.entries(CLASSIFICATION)]],['used','使用状況',[['','すべて'],['used','使用履歴あり'],['unused','未使用']]]];
  for(const [key,label,options] of fields){const f=selectField(label,options);filterGrid.append(f.host);f.input.onchange=()=>{state[key]=f.input.value;load(true)}}
  const related=check('関連する内容も検索する',false),archived=check('削除した画像を表示',false);filters.append(related.host,archived.host);related.input.onchange=()=>{state.related=related.input.checked;load(true)};archived.input.onchange=()=>{state.archived=archived.input.checked;selected.clear();load(true)};
  const status=el('div','qbLibraryStatus'),suggest=el('div','qbLibraryTools'),grid=el('div','qbLibraryGrid'),more=btn('さらに表示',()=>load(false));more.hidden=true;status.setAttribute('role','status');listView.append(searchForm,tools,pasteZone,uploadStatus,filters,status,suggest,grid,more);
  const authorCache=new Map();
  async function preloadAuthors(rows){const ids=rows.flatMap(r=>[r.item?.created_by,r.set_data?.created_by,...(r.set_data?.members||[]).map(i=>i.created_by)]).filter(id=>id&&!authorCache.has(id));try{for(const a of await S.authors(sb,ids))authorCache.set(a.id,a)}catch{/* Attribution failure must not hide images. */}}
  function authorLine(row){const a=authorCache.get(row.created_by),line=el('div','qbLibraryAuthor'),name=a?.display_name||'投稿者';const icon=el('span','qbLibraryAuthorIcon',name.slice(0,1));if(a?.avatar_path){const im=el('img');im.alt='';im.src=S.avatarURL(sb,a.avatar_path);im.onerror=()=>im.remove();icon.append(im)}line.append(icon,el('span','',name));return line;}
  async function thumbnail(img,path,version){try{const url=await S.signedURL(sb,path);if(!closed&&version===generation&&img.isConnected)img.src=url}catch{if(img.isConnected)img.alt='画像を読み込めませんでした'}}
  function subjectNames(ids){return (ids||[]).map(id=>subjects.find(s=>s.id===id)?.name||id).join('、')}
  function renderResult(result,version){
   if(result.set_data){renderSet(result,version);return;}const row=result.item,m=row.metadata||{},article=el('article','qbLibraryItem'),imageButton=btn('',()=>showDetail(row),'qbLibraryImageButton'),img=el('img');img.loading='lazy';img.alt=m.name||'名称未設定';imageButton.append(img,el('div','qbLibraryName',m.name||'名称未設定'));article.append(authorLine(row),imageButton);
   if(m.unit_ids?.length)article.append(el('div','qbLibraryMeta','単元：'+m.unit_ids.map(id=>catalogRows.find(c=>c.id===id)?.path||id).join('、')));if(m.roles?.length)article.append(el('div','qbLibraryMeta','役割：'+fieldText(m.roles)));
   article.append(el('div','qbLibraryMeta','科目：'+(subjectNames(m.subject_ids)||'不明')),el('div','qbLibraryMeta','中心：'+(fieldText(m.topics)||'不明')),el('div','qbLibraryMeta','内容：'+(fieldText(m.aspects)||'不明')));
   if(result.match_source){const s=el('div','qbLibrarySnippet');s.append(el('span','qbLibraryMeta',(C.LABELS[result.match_source]||result.match_source)+'に一致：'));for(const part of C.snippet(result.match_text,state.query,terms))s.append(el(part.hit?'mark':'span','',part.text));if(result.match_source==='ocr_text'&&m.analysis_status==='needs_review')s.append(el('div','qbLibraryMeta','読み取りに要確認の箇所があります'));article.append(s)}
   if(!row.archived){const l=el('label','qbLibrarySelect'),i=el('input');i.type='checkbox';i.dataset.selectImage=row.id;i.checked=selected.has(row.id);i.onchange=()=>{if(i.checked)selected.set(row.id,row);else selected.delete(row.id);syncSelection()};l.append(i,el('span','','この画像を選択'));article.append(l)}
   grid.append(article);thumbnail(img,row.object_path,version);
  }
  async function load(reset){
   if(closed)return;clearTimeout(searchTimer);if(reset){state.query=searchInput.value;state.offset=0;generation++;grid.replaceChildren();suggest.replaceChildren();}
   const version=generation,offset=state.offset;status.textContent='検索中…';more.disabled=true;searchButton.disabled=true;
   try{const rows=await S.search(sb,{...state});await preloadAuthors(rows);if(closed||version!==generation)return;if(reset)grid.replaceChildren();for(const row of rows)renderResult(row,version);state.offset=offset+rows.length;hasMore=rows.length===30&&state.offset<Number(rows[0]?.total_count||0);more.hidden=!hasMore;more.textContent='さらに表示';status.textContent=rows.length?`${rows[0].total_count}件 / ${state.offset}件を表示`:(reset?'この条件の画像はありません。':'すべて表示しました。');if(reset&&!rows.length&&state.query){for(const word of C.suggestions(state.query,terms))suggest.append(btn('もしかして：'+word,()=>{searchInput.value=word;load(true)},'qbLibraryTextButton'))}syncSelection();}
   catch(e){if(!closed&&version===generation){report(status,e);more.hidden=false;more.textContent='再読み込み';}}
   finally{if(!closed&&version===generation){more.disabled=false;searchButton.disabled=false}}
  }
  function enterDetail(title){saveCurrent=null;detailPaste=null;detailGeneration++;listScroll=body.scrollTop;listView.hidden=true;detailView.hidden=false;detailView.replaceChildren();heading.textContent=title;body.scrollTop=0;detailView.append(btn('一覧へ戻る',back,'qbLibraryTextButton'))}
  async function back(){if(busy)return;detailGeneration++;if(dirty()&&!confirm('未保存の変更を破棄して一覧に戻りますか？'))return;dirty=()=>false;saveCurrent=null;detailView.hidden=true;listView.hidden=false;heading.textContent=context?'画像ライブラリから選択':'画像ライブラリ';body.scrollTop=listScroll;searchInput.focus({preventScroll:true});}
  async function showDetail(initial){
   if(busy)return;enterDetail('画像の詳細');const detailVersion=detailGeneration;const note=el('div','qbLibraryStatus','読み込み中…');note.setAttribute('role','status');detailView.append(note);let row;
   try{row=await S.get(sb,initial.id);if(closed||detailVersion!==detailGeneration)return;await drawDetail(row,note)}catch(e){report(note,e)}
  }
  async function drawDetail(initial,note){
   let row=initial,m=row.metadata||{};const img=el('img','qbLibraryDetailImage');img.alt=m.name||'ライブラリ画像';detailView.append(authorLine(row),img);S.signedURL(sb,row.object_path).then(url=>{if(img.isConnected)img.src=url}).catch(e=>report(note,e));
   if(!owns(row)){
    dirty=()=>false;saveCurrent=null;note.textContent='投稿者のみ編集できます。';
    detailView.append(btn('画像を拡大',()=>img.classList.toggle('qbLibraryFullImage')));
    if(!row.archived){const c=check('この画像を選択',selected.has(row.id));c.input.onchange=()=>{if(c.input.checked)selected.set(row.id,row);else selected.delete(row.id);syncSelection()};detailView.append(c.host)}
    const info=el('dl','qbLibraryReadOnly');for(const key of C.FIELDS){const value=key==='subject_ids'?subjectNames(m[key]):key==='unit_ids'?(m[key]||[]).map(id=>catalogRows.find(c=>c.id===id)?.path||id).join('、'):key==='analysis_status'?(ANALYSIS[m[key]]||'未解析'):key==='classification_status'?(CLASSIFICATION[m[key]]||'不明'):fieldText(m[key]);info.append(el('dt','',C.LABELS[key]),el('dd','',value||'未登録'))}detailView.append(info);return;
   }
   const top=el('div','qbLibraryTools'),replaceInput=el('input');replaceInput.type='file';replaceInput.accept=uploadInput.accept;replaceInput.hidden=true;
   top.append(btn('トリミング',()=>editImage('crop')),btn('書き込み',()=>editImage('annotation')),btn('元画像に戻す',()=>restore({},row.original_path)),btn('画像を拡大',e=>{img.classList.toggle('qbLibraryFullImage');e.currentTarget.textContent=img.classList.contains('qbLibraryFullImage')?'画像を縮小':'画像を拡大'}),btn('原本を差し替える',()=>replaceInput.click()),replaceInput);
   if(!row.archived)top.append(btn('この画像に追加してセットにする',()=>showSetEditor(null,[row])));
   if(context&&!row.archived)top.append(btn(selected.has(row.id)?'選択を解除':'この画像を選択',e=>{if(selected.has(row.id))selected.delete(row.id);else selected.set(row.id,row);e.currentTarget.textContent=selected.has(row.id)?'選択を解除':'この画像を選択';syncSelection()},'qbLibraryPrimary'));
   detailView.append(top);note.textContent=`解析：${ANALYSIS[m.analysis_status]||'未解析'}　分類：${CLASSIFICATION[m.classification_status]||'不明'}`;
   const form=el('form','qbLibraryForm'),controls={};detailView.append(form);
   for(const key of ['name','topics','keywords','aspects','roles','aliases','related_keywords']){const f=inputField(C.LABELS[key],fieldText(m[key]));controls[key]=()=>C.ARRAY_FIELDS.includes(key)?C.list(f.input.value):f.input.value;if(key==='roles'){f.input.placeholder=ROLES.join('、');const choices=el('div','qbLibraryChecks');for(const role of ROLES){const c=check(role,C.list(f.input.value).includes(role));c.input.onchange=()=>{const values=C.list(f.input.value).filter(x=>x!==role);if(c.input.checked)values.push(role);f.input.value=values.join('、')};f.input.addEventListener('input',()=>c.input.checked=C.list(f.input.value).includes(role));choices.append(c.host)}f.roleChoices=choices}if(key==='aspects')f.input.placeholder=ASPECTS.join('、');form.append(f.host);if(f.roleChoices)form.append(f.roleChoices)}
   const subjectField=el('div','qbLibraryField qbLibraryWide'),checks=el('div','qbLibraryChecks');subjectField.append(el('span','','関連科目'),checks);searchChecks(subjectField,checks,'科目候補を検索');form.append(subjectField);const subjectInputs=[];
   for(const s of subjects){const c=check(s.name,(m.subject_ids||[]).includes(s.id));subjectInputs.push([s.id,c.input]);c.host.dataset.aliases=(s.aliases||[]).join(' ');checks.append(c.host)}controls.subject_ids=()=>subjectInputs.filter(([,i])=>i.checked).map(([id])=>id);
   const unitField=el('div','qbLibraryField qbLibraryWide'),unitChecks=el('div','qbLibraryChecks');unitField.append(el('span','','単元（複数選択可）'),unitChecks);searchChecks(unitField,unitChecks,'単元候補を検索');form.append(unitField);const unitInputs=[];for(const u of catalogRows.filter(c=>c.kind==='unit')){const c=check(u.path,(m.unit_ids||[]).includes(u.id));c.host.dataset.subject=u.subject_id;unitInputs.push([u,c]);unitChecks.append(c.host)}controls.unit_ids=()=>unitInputs.filter(([,c])=>c.input.checked).map(([u])=>u.id);function visibleUnits(){const ids=controls.subject_ids();for(const [u,c] of unitInputs){c.host.hidden=!ids.includes(u.subject_id)&&!c.input.checked;c.host.dataset.excluded=String(c.host.hidden)}}for(const [,i] of subjectInputs)i.addEventListener('change',visibleUnits);visibleUnits();
   for(const key of ['notes','visual_summary','ocr_text']){const f=inputField(C.LABELS[key],m[key]||'',true);f.host.classList.add('qbLibraryWide');if(key==='ocr_text')f.input.classList.add('qbLibraryTranscript');controls[key]=()=>f.input.value;form.append(f.host)}
   for(const [key,label,options] of [['analysis_status','解析状況',Object.entries(ANALYSIS)],['classification_status','分類状況',Object.entries(CLASSIFICATION)]]){const f=selectField(label,options,m[key]||(key==='analysis_status'?'unprocessed':'unknown'));controls[key]=()=>f.input.value;form.append(f.host)}
   const collect=()=>Object.fromEntries(Object.entries(controls).map(([k,get])=>[k,get()]));let baseline=collect();dirty=()=>Object.keys(C.changed(baseline,collect())).length>0;
   const actions=el('div','qbLibraryTools qbLibraryWide'),saveButton=btn('変更を保存',()=>saveForm(),'qbLibraryPrimary'),conflictButton=btn('最新情報を別表示',()=>showLatest());conflictButton.hidden=true;actions.append(saveButton,conflictButton);form.append(actions);form.onsubmit=e=>{e.preventDefault();saveForm()};
   async function showLatest(){try{const latest=await S.get(sb,row.id);const d=detailBlock('現在保存されている情報（入力内容は保持しています）');d.open=true;const p=el('pre');p.textContent=JSON.stringify(latest.metadata,null,2);d.append(p);detailView.append(d);note.textContent='入力内容を確認・控えたうえで詳細を開き直してください。強制上書きは行いません。'}catch(e){report(note,e)}}
   saveCurrent=saveForm;
   async function saveForm(){if(busy)return;const patch=C.changed(baseline,collect());if(!Object.keys(patch).length){note.textContent='変更はありません。';return}const focus=document.activeElement;setBusy(true);saveButton.disabled=true;try{row=await S.save(sb,row,patch);baseline=collect();if(selected.has(row.id))selected.set(row.id,row);jobs.delete(row.id);note.textContent='保存しました。';await load(true)}catch(e){report(note,e);if(e.code==='40001')conflictButton.hidden=false;}finally{setBusy(false);saveButton.disabled=false;if(focus?.isConnected)focus.focus({preventScroll:true})}}
   async function editImage(kind){
    if(busy)return;if(dirty()){note.textContent='先に情報の変更を保存してください。';return;}setBusy(true);panel.inert=true;let url,changed=false;
    try{const blob=await S.download(sb,row);
     if(kind==='crop'){if(!window.QBImageCrop)throw Error('画像編集を読み込めません。再読み込みしてください。');url=URL.createObjectURL(blob);const output=await QBImageCrop.open(url,{title:'ライブラリ画像をトリミング'});if(output){row=await S.replace(sb,row,output);changed=true}}
     else{if(!window.QBImageEditor)throw Error('画像編集を読み込めません。再読み込みしてください。');await QBImageEditor.open(blob,{title:'ライブラリ画像に書き込む',onSave:async output=>{row=await S.replace(sb,row,output);changed=true}})}
     if(changed){selected.delete(row.id);jobs.delete(row.id);dirty=()=>false;await load(true)}
    }catch(e){report(note,e)}finally{if(url)URL.revokeObjectURL(url);panel.inert=false;setBusy(false)}
    if(changed)await showDetail(row);else top.querySelector('button')?.focus();
   }
   replaceInput.onchange=async()=>{const f=replaceInput.files?.[0];if(!f||busy)return;if(dirty()){note.textContent='先に情報の変更を保存してください。';replaceInput.value='';return}if(!confirm('原本を差し替えますか？以前の画像は履歴に残り、読み取り本文は新しい画像用にリセットされます。'))return;setBusy(true);try{row=await S.replace(sb,row,f);dirty=()=>false;selected.delete(row.id);jobs.delete(row.id);await load(true);setBusy(false);await showDetail(row)}catch(e){report(note,e)}finally{setBusy(false)}};
   const suggestions=row.ai_suggestions||{};
   if(Object.keys(suggestions).length){const d=detailBlock('手動編集を保持したAIの変更案');d.open=true;for(const [key,proposal] of Object.entries(suggestions)){const r=el('div','qbLibraryHistoryRow');r.append(el('b','',C.LABELS[key]||key),el('pre','','現在：'+fieldText(m[key])+'\n提案：'+fieldText(proposal.value)),btn('この項目の提案を採用',async()=>{if(dirty()){note.textContent='先に編集中の内容を保存してください。';return}setBusy(true);try{row=await S.save(sb,row,{[key]:proposal.value},{reason:'AIの変更案を確認して採用'});dirty=()=>false;setBusy(false);await showDetail(row)}catch(e){report(note,e)}finally{setBusy(false)}}));d.append(r)}detailView.append(d)}
   const reading=detailBlock('読み取り・補完結果'),readBody=el('div');reading.append(readBody);detailView.append(reading);
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
   importBlock.append(el('div','qbLibraryStatus','依頼文をAIとの会話に貼り付け、返ってきた結果を取り込みます。読み取りと分類は別々に依頼できます。'),btn('読み取りの依頼文をコピー',()=>copyRequest('reading')),btn('分類の依頼文をコピー',()=>copyRequest('classification')),importField.host,btn('結果を取り込む',async()=>{if(busy)return;if(dirty()){note.textContent='先に編集中の内容を保存してください。';return}setBusy(true);try{const parsed=JSON.parse(importField.input.value);if(parsed.reading&&parsed.classification&&Object.keys(parsed.classification).length&&!confirm('この結果には読み取りと分類の両方が含まれます。両方を反映しますか？'))return;row=await S.recordReading(sb,row,parsed);dirty=()=>false;await load(true);setBusy(false);await showDetail(row)}catch(e){report(note,e)}finally{setBusy(false)}}));detailView.append(importBlock);
   const hist=detailBlock('変更履歴・元に戻す'),histBody=el('div');hist.append(histBody);detailView.append(hist);let historyOffset=0;
   async function loadHistory(){const rs=await S.history(sb,row.id,historyOffset);historyOffset+=rs.length;for(const h of rs){const d=detailBlock(`版 ${h.revision} / ${h.origin==='ai'?'AI':'手動'} / ${h.created_at.slice(0,16).replace('T',' ')} / ${h.reason}`);const before=h.before_value?.metadata||{},after=h.after_value?.metadata||{};for(const key of C.FIELDS){if(JSON.stringify(before[key])===JSON.stringify(after[key]))continue;const r=el('div','qbLibraryHistoryRow');r.append(el('b','',C.LABELS[key]),el('pre','','変更前：'+fieldText(before[key])+'\n変更後：'+fieldText(after[key])));if(h.before_value)r.append(btn('この項目を変更前に戻す',()=>restore({[key]:before[key]??(C.ARRAY_FIELDS.includes(key)?[]:key==='analysis_status'?'unprocessed':key==='classification_status'?'unknown':'')},null)));d.append(r)}if(h.before_value?.object_path&&h.before_value.object_path!==h.after_value.object_path)d.append(btn('画像を変更前の版に戻す',()=>restore({},h.before_value.object_path)));histBody.append(d)}if(rs.length===50){const b=btn('さらに履歴を表示',async()=>{b.disabled=true;try{await loadHistory();b.remove()}catch(e){report(note,e);b.disabled=false}});histBody.append(b)}}
   hist.ontoggle=async()=>{if(!hist.open||hist.dataset.loaded)return;hist.dataset.loaded='1';try{await loadHistory()}catch(e){report(note,e);delete hist.dataset.loaded}};
   async function restore(patch,path){if(busy)return;if(dirty()){note.textContent='先に編集中の内容を保存してください。';return}if(!confirm('選んだ項目を以前の内容に戻しますか？この操作も履歴に残ります。'))return;setBusy(true);try{row=await S.save(sb,row,patch,{objectPath:path,reason:'履歴から復元'});dirty=()=>false;await load(true);setBusy(false);await showDetail(row)}catch(e){report(note,e)}finally{setBusy(false)}}
   const uses=detailBlock('使用履歴'),usesBody=el('div');uses.append(usesBody);detailView.append(uses);let usageOffset=0;
   async function loadUses(){const rs=await S.usages(sb,row.id,usageOffset);usageOffset+=rs.length;if(!rs.length&&!usageOffset)usesBody.append(el('div','qbLibraryStatus','まだ使用されていません。'));for(const u of rs){const r=el('div','qbLibraryHistoryRow');r.append(el('div','',`${u.created_at.slice(0,10)} / ${placementName(u.placement)}`),el('div','qbLibraryMeta',`問題ID：${u.question_id}`),el('div','qbLibraryMeta',`使用時の画像版：${u.image_version}`));usesBody.append(r)}if(rs.length===50){const b=btn('さらに使用履歴を表示',async()=>{b.disabled=true;try{await loadUses();b.remove()}catch(e){report(note,e);b.disabled=false}});usesBody.append(b)}}
   uses.ontoggle=async()=>{if(!uses.open||uses.dataset.loaded)return;uses.dataset.loaded='1';try{await loadUses()}catch(e){report(note,e);delete uses.dataset.loaded}};
   const archiveButton=btn(row.archived?'ライブラリへ戻す':'ライブラリから削除',async()=>{if(busy)return;if(dirty()){note.textContent='先に編集中の内容を保存してください。';return}if(!confirm(row.archived?'ライブラリへ戻しますか？':'ライブラリから削除しますか？削除した画像の一覧から元に戻せます。'))return;setBusy(true);try{row=await S.save(sb,row,{}, {archived:!row.archived,reason:row.archived?'削除した画像を復元':'ライブラリから削除'});selected.delete(row.id);dirty=()=>false;await load(true);setBusy(false);await back()}catch(e){report(note,e)}finally{setBusy(false)}});const archiveActions=el('div','qbLibraryTools');archiveActions.append(archiveButton);detailView.append(archiveActions);
  }
  function searchChecks(host,checks,label){const f=inputField(label);host.insertBefore(f.host,checks);f.input.addEventListener('input',()=>{const q=C.normalize(f.input.value);for(const c of checks.children)c.hidden=c.dataset.excluded==='true'||!C.normalize(c.textContent+' '+(c.dataset.aliases||'')).includes(q)});}
  function refreshCatalogFilters(){
   subjects=catalogRows.filter(c=>c.kind==='subject');subjectChecks.replaceChildren();
   if(!filters.querySelector('[data-catalog-search]')){const f=inputField('絞り込む科目を検索');f.host.dataset.catalogSearch='1';filters.insertBefore(f.host,subjectChecks);f.input.oninput=()=>{const q=C.normalize(f.input.value);for(const c of subjectChecks.children)c.hidden=!C.normalize(c.textContent+' '+c.dataset.aliases).includes(q)}}
   for(const s of subjects){const c=check(s.name,state.subjects.includes(s.id));c.host.dataset.aliases=(s.aliases||[]).join(' ');c.input.value=s.id;c.input.onchange=()=>{state.subjects=[...subjectChecks.querySelectorAll('input:checked')].map(i=>i.value);refreshUnitFilter();load(true)};subjectChecks.append(c.host)}refreshUnitFilter();
  }
  function refreshUnitFilter(){const eligible=catalogRows.filter(c=>c.kind==='unit'&&(!state.subjects.length||state.subjects.includes(c.subject_id)));if(state.unit&&!eligible.some(c=>c.id===state.unit))state.unit='';unitFilter.input.replaceChildren(new Option('すべて',''));for(const u of eligible)unitFilter.input.add(new Option(u.path,u.id));unitFilter.input.value=state.unit;}
  function carousel(members,onOpen,version){
   const host=el('div','qbLibraryCarousel'),track=el('div','qbLibrarySlides'),nav=el('div','qbLibrarySlideNav'),counter=el('span','',`1 / ${members.length}`);let current=0;
   for(const row of members){const b=btn('',()=>onOpen(row),'qbLibrarySlide'),im=el('img');im.loading='lazy';im.alt=row.metadata?.name||'画像';b.append(im);track.append(b);S.signedURL(sb,row.object_path).then(url=>{if(im.isConnected&&!closed)im.src=url}).catch(()=>im.alt='画像を読み込めませんでした')}
   const move=delta=>{const next=Math.max(0,Math.min(members.length-1,current+delta));track.scrollTo({left:next*track.clientWidth,behavior:'smooth'})};
   nav.append(btn('前',()=>move(-1)),counter,btn('次',()=>move(1)));track.onscroll=()=>{current=Math.max(0,Math.min(members.length-1,Math.round(track.scrollLeft/(track.clientWidth||1))));counter.textContent=`${current+1} / ${members.length}`};host.append(track,nav);return host;
  }
  function renderSet(result,version){
   const set=result.set_data,members=(set.members||[]).filter(r=>!r.archived);if(!members.length)return;
   const article=el('article','qbLibraryItem qbLibrarySet');article.append(authorLine(set),carousel(members,()=>showSetEditor(set),version),btn(set.name,()=>showSetEditor(set),'qbLibraryTextButton'),el('div','qbLibraryMeta',`${members.length}枚のセット`));
   if(result.match_source)article.append(el('div','qbLibraryMeta',`${C.LABELS[result.match_source]||result.match_source}に一致：${result.match_text.slice(0,150)}`));
   const c=check('全部を選択',members.every(r=>selected.has(r.id)));c.input.dataset.selectSet=JSON.stringify(members.map(r=>r.id));c.input.onchange=()=>{for(const r of members){selected.delete(r.id);if(c.input.checked)selected.set(r.id,r)}syncSelection()};article.append(c.host,btn(owns(set)?'一部を選ぶ・セットを編集':'一部を選ぶ',()=>showSetEditor(set),'qbLibraryTextButton'));grid.append(article);
  }
  async function showSetEditor(initial,initialMembers=[]){
   if(busy)return;if(dirty()&&!confirm('未保存の変更を破棄しますか？'))return;enterDetail(initial?'画像セット':'画像セットを作成');dirty=()=>false;
   const gen=detailGeneration,note=el('div','qbLibraryStatus','読み込み中…');note.setAttribute('role','status');detailView.append(note);let row=initial,members=initialMembers.slice();
   try{if(row){row=await S.setGet(sb,row.id);members=row.members}if(closed||gen!==detailGeneration)return}catch(e){report(note,e);return}
   if(row&&!owns(row)){
    note.textContent=row.name;detailView.append(authorLine(row));for(const r of members.filter(r=>!r.archived)){const line=el('div','qbLibrarySetMember'),im=el('img');im.alt=r.metadata.name||'画像';S.signedURL(sb,r.object_path).then(url=>{if(im.isConnected)im.src=url}).catch(()=>{});const c=check(r.metadata.name||'画像',selected.has(r.id));c.input.onchange=()=>{if(c.input.checked)selected.set(r.id,r);else selected.delete(r.id);syncSelection()};line.append(im,c.host,btn('詳細を見る',()=>showDetail(r)));detailView.append(line)}return;
   }
   const name=inputField('セット名',row?.name||((members[0]?.metadata.name||'画像')+'のセット'));detailView.append(name.host);const host=el('div','qbLibrarySetMembers');detailView.append(host);
   let baseline=JSON.stringify([name.input.value,members.map(r=>r.id)]);dirty=()=>baseline!==JSON.stringify([name.input.value,members.map(r=>r.id)]);
   function drawMembers(){host.replaceChildren();members.forEach((r,index)=>{
    const line=el('div','qbLibrarySetMember'),im=el('img');im.alt=r.metadata.name||'画像';im.loading='lazy';S.signedURL(sb,r.object_path).then(url=>{if(im.isConnected)im.src=url}).catch(()=>{});line.append(im,el('div','',`${index+1}. ${r.metadata.name}${r.archived?'（削除済み）':''}`));
    const pick=check('この画像を選択',selected.has(r.id));pick.input.disabled=r.archived;pick.input.onchange=()=>{if(pick.input.checked)selected.set(r.id,r);else selected.delete(r.id);const chosen=members.filter(x=>selected.has(x.id));members.forEach(x=>selected.delete(x.id));chosen.forEach(x=>selected.set(x.id,x));syncSelection()};line.append(pick.host);
    line.append(btn('詳細・画像編集',()=>{if(dirty()){note.textContent='先にセットを保存してください。';return}showDetail(r)}),btn('前へ',()=>{if(index){[members[index-1],members[index]]=[members[index],members[index-1]];drawMembers()}}),btn('後ろへ',()=>{if(index<members.length-1){[members[index+1],members[index]]=[members[index],members[index+1]];drawMembers()}}),btn('セットから外す',()=>{members.splice(index,1);selected.delete(r.id);drawMembers();syncSelection()}));host.append(line);
   })}
   drawMembers();note.textContent='各画像を確認して選択できます。セットから外しても画像はライブラリに残ります。';
   const addTools=el('div','qbLibraryTools'),addInput=el('input'),addPaste=el('div','qbLibraryPasteZone','ここを長押しして「ペースト」、またはキーボードで画像を貼り付け');
   addInput.type='file';addInput.accept=uploadInput.accept;addInput.multiple=true;addInput.hidden=true;addInput.setAttribute('aria-label','セットに追加する画像');
   addPaste.contentEditable='true';addPaste.tabIndex=0;addPaste.hidden=true;addPaste.setAttribute('role','textbox');addPaste.setAttribute('aria-label','セットへの画像貼り付け欄');
   const alive=()=>!closed&&gen===detailGeneration;
   async function appendImages(values,save){
    if(busy||!alive()||!values.length)return;setBusy(true);let count=0;
    try{for(const value of values){if(!alive())return;note.textContent=`画像を追加中… ${count}/${values.length}`;const image=await save(value);if(!alive())return;if(!members.some(r=>r.id===image.id))members.push(image);count++;drawMembers();}note.textContent=`${count}枚を追加しました。「セットを保存」で確定してください。`;}
    catch(e){note.textContent=`${count}枚を追加済み。`+(e.message||e)+' 追加できた画像は保持しています。';}
    finally{addInput.value='';setBusy(false);if(alive()&&count)try{await load(true)}catch(e){report(note,e)}}
   }
   addInput.onchange=()=>appendImages([...addInput.files],f=>S.add(sb,f));
   async function pasteIntoSet(){
    if(busy)return;setBusy(true);let files=[];
    try{if(navigator.clipboard?.read){for(const item of await navigator.clipboard.read()){const type=item.types.find(t=>t.startsWith('image/'));if(type){const blob=await item.getType(type);files.push(new File([blob],'貼り付け画像.'+(type.split('/')[1]||'png'),{type}))}}}}catch{/* Use the explicit paste field when clipboard access is unavailable. */}finally{setBusy(false)}
    if(!alive())return;if(files.length){addPaste.hidden=true;await appendImages(files,f=>S.add(sb,f));return}addPaste.hidden=false;addPaste.focus();note.textContent='画像をコピーして、貼り付け欄にペーストしてください。';
   }
   detailPaste=e=>{
    const editor=e.target.closest('input,textarea,[contenteditable="true"]');if(!alive()||(editor&&editor!==addPaste))return;
    const data=e.clipboardData,files=[...(data?.files||[])].filter(f=>f.type.startsWith('image/'));
    if(!files.length)files.push(...[...(data?.items||[])].filter(i=>i.kind==='file'&&i.type.startsWith('image/')).map(i=>i.getAsFile()).filter(Boolean));
    if(!files.length)return;e.preventDefault();if(busy)return;addPaste.hidden=true;appendImages(files,f=>S.add(sb,f));
   };
   const recentAdd=btn('最近の画像から追加',async()=>{
    if(busy)return;const picker=window.qbRecentImagePicker;if(!picker){note.textContent='最近の画像を読み込めません。画面を再読み込みしてください。';return}setBusy(true);panel.inert=true;let picked=[];
    try{picked=await picker.pick({sb,title:'セットに追加する画像を選択',parent:overlay,context:null})}catch(e){report(note,e)}finally{panel.inert=false;setBusy(false);if(alive())recentAdd.focus({preventScroll:true})}
    if(alive())await appendImages(picked,r=>S.addRecent(sb,r));
   });
   addTools.append(btn('画像をアップロードして追加',()=>addInput.click()),btn('画像をコピペして追加',pasteIntoSet),recentAdd);detailView.append(addTools,addInput,addPaste,el('div','qbLibraryStatus','追加した画像はすぐにライブラリへ登録されます。セットの構成は「セットを保存」で確定します。'));
   const actions=el('div','qbLibraryTools');actions.append(btn('全部を選択',()=>{members.forEach(r=>selected.delete(r.id));members.filter(r=>!r.archived).forEach(r=>selected.set(r.id,r));drawMembers();syncSelection()}),btn('選択を解除',()=>{members.forEach(r=>selected.delete(r.id));drawMembers();syncSelection()}),btn('セットを保存',saveSet,'qbLibraryPrimary'));detailView.append(actions);saveCurrent=saveSet;
   async function saveSet(){if(busy)return;if(!name.input.value.trim()||!members.length){note.textContent='セット名と1枚以上の画像が必要です。';return}setBusy(true);try{row=await S.setSave(sb,row,name.input.value,members.map(r=>r.id));baseline=JSON.stringify([name.input.value,members.map(r=>r.id)]);const picked=members.filter(r=>selected.has(r.id));members.forEach(r=>selected.delete(r.id));picked.forEach(r=>selected.set(r.id,r));syncSelection();note.textContent='セットを保存しました。';await load(true)}catch(e){report(note,e)}finally{setBusy(false)}}
   if(row)actions.append(btn('セットを解除',async()=>{if(busy||!confirm('セットを解除しますか？各画像はライブラリに残ります。'))return;setBusy(true);try{await S.setSave(sb,row,row.name,row.image_ids,true);dirty=()=>false;await load(true);setBusy(false);await back()}catch(e){report(note,e)}finally{setBusy(false)}}));
   if(!initial){try{const existing=(await S.sets(sb)).filter(r=>!r.archived&&owns(r));if(closed||gen!==detailGeneration)return;const f=selectField('既存のセットに追加',[['','セットを選択'],...existing.map(r=>[r.id,r.name])]);detailView.append(f.host,btn('このセットに追加',async()=>{if(busy||!f.input.value)return;setBusy(true);try{const target=await S.setGet(sb,f.input.value);const ids=[...new Set([...target.image_ids,...members.map(r=>r.id)])];await S.setSave(sb,target,target.name,ids);dirty=()=>false;selected.clear();await load(true);setBusy(false);await back()}catch(e){report(note,e)}finally{setBusy(false)}}))}catch(e){report(note,e)}}
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
   detailView.append(btn('検索語を保存',async()=>{if(busy)return;setBusy(true);try{await S.termSave(sb,row,canonical.input.value,aliases.input.value);terms=await S.catalog(sb,'qb_image_library_terms');dirty=()=>false;await showTerms();note.textContent='保存しました。'}catch(e){report(note,e)}finally{setBusy(false)}},'qbLibraryPrimary'));
  }
  overlay.focus();(async()=>{try{[catalogRows,terms]=await Promise.all([S.taxonomy(sb),S.catalog(sb,'qb_image_library_terms')]);if(closed)return;refreshCatalogFilters();await load(true);searchInput.focus()}catch(e){report(status,e)}})();
 });
}
function placementName(p){return {question:'問題文',choice:'選択肢',explanation_overview:'問題文のポイント',choice_explanation:'選択肢解説',examiner_intent:'出題者の意図',exam_summary:'試験用まとめ',medical_verification:'医学的検証'}[p]||p}
window.QBImageLibrary={open,placementName};
})();
