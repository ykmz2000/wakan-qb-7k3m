/* Standalone admin library and picker. All AI work is explicitly imported, never scheduled. */
(()=>{
'use strict';
const C=window.QBImageLibraryCore,S=window.QBImageLibraryStore;
const ASPECTS=['構造','正常機能','病態','症状・所見','検査','診断','鑑別','治療','作用機序','副作用'];
const ROLES=['総まとめ','個別解説','比較','疾患との関連','概念図'];
const ANALYSIS={unprocessed:'未解析',processed:'解析済み',needs_review:'要確認'};
const CLASSIFICATION={unknown:'不明',partial:'一部分類',classified:'分類済み'};
let active=null,opening=false;
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=String(text);return n}
function btn(text,fn,cls=''){const b=el('button',cls,text);b.type='button';if(fn)b.onclick=fn;return b}
function inputField(label,value='',multiline=false){const l=el('label','qbLibraryField'),span=el('span','',label),i=el(multiline?'textarea':'input');i.value=value;l.append(span,i);return {host:l,input:i}}
function selectField(label,options,value=''){const l=el('label','qbLibraryField'),span=el('span','',label),s=el('select');for(const [v,t] of options)s.add(new Option(t,v));s.value=value;l.append(span,s);return{host:l,input:s}}
function check(text,value){const l=el('label','qbLibraryCheck'),i=el('input');i.type='checkbox';i.checked=!!value;l.append(i,el('span','',text));return{host:l,input:i}}
function detailBlock(label){const d=el('details','qbLibraryDetails');d.append(el('summary','',label));return d}
function fieldText(value){return Array.isArray(value)?value.join('、'):String(value??'')}
async function open({context=null}={}){
 if(active){active.focus();return [];}if(opening)return [];const sb=window.qbSupabase;if(!sb)throw Error('接続を確認してください。');opening=true;try{await S.authorize(sb)}finally{opening=false}
 return new Promise(resolve=>{
  const origin=document.activeElement,overlay=el('div','qbLibraryOverlay'),panel=el('section','qbLibraryPanel'),head=el('div','qbLibraryHeader'),body=el('div','qbLibraryBody'),foot=el('div','qbLibraryFooter');
  overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label',context?'貼り付ける画像を選択':'画像ライブラリ');overlay.tabIndex=-1;active=overlay;
  const heading=el('strong','',context?'画像ライブラリから選択':'画像ライブラリ');head.append(heading,btn('閉じる',()=>close()));panel.append(head,body,foot);overlay.append(panel);
  const background=[...document.body.children].filter(n=>!['SCRIPT','STYLE','LINK'].includes(n.tagName)).map(n=>[n,n.inert]);background.forEach(([n])=>n.inert=true);document.body.append(overlay);
  const oldOverflow=document.documentElement.style.overflow;document.documentElement.style.overflow='hidden';
  const state={query:'',subjects:[],aspect:'',analysis:'',classification:'',used:'',related:false,archived:false,offset:0};
  const selected=new Map(),jobs=new Map(),added=[];let busy=false,closed=false,generation=0,detailGeneration=0,subjects=[],terms=[],dirty=()=>false,searchTimer=0,listScroll=0,hasMore=false;
  const listView=el('div'),detailView=el('div');detailView.hidden=true;body.append(listView,detailView);
  function report(target,e){target.textContent=e?.message||String(e)}
  function close(){if(closed||busy)return;if(dirty()&&!confirm('未保存の変更を破棄して閉じますか？'))return;closed=true;generation++;clearTimeout(searchTimer);overlay.remove();background.forEach(([n,inert])=>{if(n.isConnected)n.inert=inert});document.documentElement.style.overflow=oldOverflow;active=null;if(origin?.isConnected)origin.focus({preventScroll:true});try{if(added.length)context?.onSaved?.(added)}catch(e){console.warn('画像は保存済みですが画面の再表示に失敗しました',e)}resolve(added)}
  overlay.addEventListener('keydown',e=>{e.stopPropagation();if(e.target.closest('.qbripModal'))return;if(e.key==='Escape'){e.preventDefault();close()}if(e.key==='Tab'){const nodes=[...overlay.querySelectorAll('button,input,select,textarea,summary,[tabindex="0"]')].filter(n=>!n.disabled&&n.getClientRects().length),first=nodes[0],last=nodes.at(-1);if(!first){e.preventDefault();overlay.focus()}else if(e.shiftKey&&(document.activeElement===first||document.activeElement===overlay)){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}});
  // Isolate shortcuts and paste from the underlying question editor.
  overlay.addEventListener('paste',e=>{
   e.stopPropagation();
   const editor=e.target.closest('input,textarea,[contenteditable="true"]');
   if(e.target.closest('.qbripModal')||listView.hidden||(editor&&editor!==pasteZone))return;
   const data=e.clipboardData,files=[...(data?.files||[])].filter(f=>f.type.startsWith('image/'));
   if(!files.length)files.push(...[...(data?.items||[])].filter(i=>i.kind==='file'&&i.type.startsWith('image/')).map(i=>i.getAsFile()).filter(Boolean));
   if(!files.length)return;e.preventDefault();if(busy)return;pasteZone.hidden=true;register(files,f=>S.add(sb,f));
  });overlay.addEventListener('click',e=>e.stopPropagation());
  function setBusy(v){busy=v;listView.inert=v;detailView.inert=v;head.querySelector('button').disabled=v;useButton.disabled=v||!selected.size;uploadInput.disabled=v;}
  const footStatus=el('span','qbLibraryStatus'),useButton=btn('選択した画像を貼る',useSelected,'qbLibraryPrimary');useButton.hidden=!context;useButton.disabled=true;foot.append(footStatus,useButton);
  function syncSelection(){footStatus.textContent=context?(selected.size?`${selected.size}枚を選択中`:'画像を開いて確認・選択できます。'):'';useButton.disabled=busy||!selected.size;for(const i of listView.querySelectorAll('[data-select-image]')){i.checked=selected.has(i.dataset.selectImage)}}
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
  const pasteButton=btn('画像をコピペ',pasteImages),recentButton=btn('最近の画像',chooseRecent);
  tools.append(btn('画像を選択',()=>uploadInput.click()),pasteButton,recentButton,btn('検索語・別名を管理',()=>showTerms(),'qbLibraryTextButton'),uploadInput);
  async function register(values,save){
   if(!values.length||busy||closed)return;setBusy(true);let done=0;
   try{for(const value of values){uploadStatus.textContent=`画像を登録中… ${done}/${values.length}`;await save(value);done++}uploadStatus.textContent=`${done}枚を登録しました。`;}
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
  const fields=[['aspect','内容の観点',[['','すべて'],...ASPECTS.map(x=>[x,x])]],['analysis','解析状況',[['','すべて'],...Object.entries(ANALYSIS)]],['classification','分類状況',[['','すべて'],...Object.entries(CLASSIFICATION)]],['used','使用状況',[['','すべて'],['used','使用履歴あり'],['unused','未使用']]]];
  for(const [key,label,options] of fields){const f=selectField(label,options);filterGrid.append(f.host);f.input.onchange=()=>{state[key]=f.input.value;load(true)}}
  const related=check('関連する内容も検索する',false),archived=check('削除した画像を表示',false);filters.append(related.host,archived.host);related.input.onchange=()=>{state.related=related.input.checked;load(true)};archived.input.onchange=()=>{state.archived=archived.input.checked;selected.clear();load(true)};
  const status=el('div','qbLibraryStatus'),suggest=el('div','qbLibraryTools'),grid=el('div','qbLibraryGrid'),more=btn('さらに表示',()=>load(false));more.hidden=true;status.setAttribute('role','status');listView.append(searchForm,tools,pasteZone,uploadStatus,filters,status,suggest,grid,more);
  async function thumbnail(img,path,version){try{const url=await S.signedURL(sb,path);if(!closed&&version===generation&&img.isConnected)img.src=url}catch{if(img.isConnected)img.alt='画像を読み込めませんでした'}}
  function subjectNames(ids){return (ids||[]).map(id=>subjects.find(s=>s.id===id)?.name||id).join('、')}
  function renderResult(result,version){
   const row=result.item,m=row.metadata||{},article=el('article','qbLibraryItem'),imageButton=btn('',()=>showDetail(row),'qbLibraryImageButton'),img=el('img');img.loading='lazy';img.alt=m.name||'名称未設定';imageButton.append(img,el('div','qbLibraryName',m.name||'名称未設定'));article.append(imageButton);
   article.append(el('div','qbLibraryMeta','科目：'+(subjectNames(m.subject_ids)||'不明')),el('div','qbLibraryMeta','中心：'+(fieldText(m.topics)||'不明')),el('div','qbLibraryMeta','内容：'+(fieldText(m.aspects)||'不明')));
   if(result.match_source){const s=el('div','qbLibrarySnippet');s.append(el('span','qbLibraryMeta',(C.LABELS[result.match_source]||result.match_source)+'に一致：'));for(const part of C.snippet(result.match_text,state.query,terms))s.append(el(part.hit?'mark':'span','',part.text));if(result.match_source==='ocr_text'&&m.analysis_status==='needs_review')s.append(el('div','qbLibraryMeta','読み取りに要確認の箇所があります'));article.append(s)}
   if(context&&!row.archived){const l=el('label','qbLibrarySelect'),i=el('input');i.type='checkbox';i.dataset.selectImage=row.id;i.checked=selected.has(row.id);i.onchange=()=>{if(i.checked)selected.set(row.id,row);else selected.delete(row.id);syncSelection()};l.append(i,el('span','','この画像を選択'));article.append(l)}
   grid.append(article);thumbnail(img,row.object_path,version);
  }
  async function load(reset){
   if(closed)return;clearTimeout(searchTimer);if(reset){state.query=searchInput.value;state.offset=0;generation++;grid.replaceChildren();suggest.replaceChildren();}
   const version=generation,offset=state.offset;status.textContent='検索中…';more.disabled=true;searchButton.disabled=true;
   try{const rows=await S.search(sb,{...state});if(closed||version!==generation)return;if(reset)grid.replaceChildren();for(const row of rows)renderResult(row,version);state.offset=offset+rows.length;hasMore=rows.length===30&&state.offset<Number(rows[0]?.total_count||0);more.hidden=!hasMore;more.textContent='さらに表示';status.textContent=rows.length?`${rows[0].total_count}枚 / ${state.offset}枚を表示`:(reset?'この条件の画像はありません。':'すべて表示しました。');if(reset&&!rows.length&&state.query){for(const word of C.suggestions(state.query,terms))suggest.append(btn('もしかして：'+word,()=>{searchInput.value=word;load(true)},'qbLibraryTextButton'))}syncSelection();}
   catch(e){if(!closed&&version===generation){report(status,e);more.hidden=false;more.textContent='再読み込み';}}
   finally{if(!closed&&version===generation){more.disabled=false;searchButton.disabled=false}}
  }
  function enterDetail(title){detailGeneration++;listScroll=body.scrollTop;listView.hidden=true;detailView.hidden=false;detailView.replaceChildren();heading.textContent=title;body.scrollTop=0;detailView.append(btn('一覧へ戻る',back,'qbLibraryTextButton'))}
  async function back(){if(busy)return;detailGeneration++;if(dirty()&&!confirm('未保存の変更を破棄して一覧に戻りますか？'))return;dirty=()=>false;detailView.hidden=true;listView.hidden=false;heading.textContent=context?'画像ライブラリから選択':'画像ライブラリ';body.scrollTop=listScroll;searchInput.focus({preventScroll:true});}
  async function showDetail(initial){
   if(busy)return;enterDetail('画像の詳細');const detailVersion=detailGeneration;const note=el('div','qbLibraryStatus','読み込み中…');note.setAttribute('role','status');detailView.append(note);let row;
   try{row=await S.get(sb,initial.id);if(closed||detailVersion!==detailGeneration)return;await drawDetail(row,note)}catch(e){report(note,e)}
  }
  async function drawDetail(initial,note){
   let row=initial,m=row.metadata||{};const img=el('img','qbLibraryDetailImage');img.alt=m.name||'ライブラリ画像';detailView.append(img);S.signedURL(sb,row.object_path).then(url=>{if(img.isConnected)img.src=url}).catch(e=>report(note,e));
   const top=el('div','qbLibraryTools'),replaceInput=el('input');replaceInput.type='file';replaceInput.accept=uploadInput.accept;replaceInput.hidden=true;
   top.append(btn('画像を拡大',e=>{img.classList.toggle('qbLibraryFullImage');e.currentTarget.textContent=img.classList.contains('qbLibraryFullImage')?'画像を縮小':'画像を拡大'}),btn('原本を差し替える',()=>replaceInput.click()),replaceInput);
   if(context&&!row.archived)top.append(btn(selected.has(row.id)?'選択を解除':'この画像を選択',e=>{if(selected.has(row.id))selected.delete(row.id);else selected.set(row.id,row);e.currentTarget.textContent=selected.has(row.id)?'選択を解除':'この画像を選択';syncSelection()},'qbLibraryPrimary'));
   detailView.append(top);note.textContent=`解析：${ANALYSIS[m.analysis_status]||'未解析'}　分類：${CLASSIFICATION[m.classification_status]||'不明'}`;
   const form=el('form','qbLibraryForm'),controls={};detailView.append(form);
   for(const key of ['name','topics','keywords','aspects','roles','aliases','related_keywords']){const f=inputField(C.LABELS[key],fieldText(m[key]));controls[key]=()=>C.ARRAY_FIELDS.includes(key)?C.list(f.input.value):f.input.value;if(key==='roles')f.input.placeholder=ROLES.join('、');if(key==='aspects')f.input.placeholder=ASPECTS.join('、');form.append(f.host)}
   const subjectField=el('div','qbLibraryField qbLibraryWide'),checks=el('div','qbLibraryChecks');subjectField.append(el('span','','関連科目'),checks);form.append(subjectField);const subjectInputs=[];
   for(const s of subjects){const c=check(s.name,(m.subject_ids||[]).includes(s.id));subjectInputs.push([s.id,c.input]);checks.append(c.host)}controls.subject_ids=()=>subjectInputs.filter(([,i])=>i.checked).map(([id])=>id);
   for(const key of ['notes','visual_summary','ocr_text']){const f=inputField(C.LABELS[key],m[key]||'',true);f.host.classList.add('qbLibraryWide');if(key==='ocr_text')f.input.classList.add('qbLibraryTranscript');controls[key]=()=>f.input.value;form.append(f.host)}
   for(const [key,label,options] of [['analysis_status','解析状況',Object.entries(ANALYSIS)],['classification_status','分類状況',Object.entries(CLASSIFICATION)]]){const f=selectField(label,options,m[key]||(key==='analysis_status'?'unprocessed':'unknown'));controls[key]=()=>f.input.value;form.append(f.host)}
   const collect=()=>Object.fromEntries(Object.entries(controls).map(([k,get])=>[k,get()]));const baseline=collect();dirty=()=>Object.keys(C.changed(baseline,collect())).length>0;
   const actions=el('div','qbLibraryTools qbLibraryWide'),saveButton=btn('変更を保存',()=>saveForm(),'qbLibraryPrimary'),conflictButton=btn('最新情報を別表示',()=>showLatest());conflictButton.hidden=true;actions.append(saveButton,conflictButton);form.append(actions);form.onsubmit=e=>{e.preventDefault();saveForm()};
   async function showLatest(){try{const latest=await S.get(sb,row.id);const d=detailBlock('現在保存されている情報（入力内容は保持しています）');d.open=true;const p=el('pre');p.textContent=JSON.stringify(latest.metadata,null,2);d.append(p);detailView.append(d);note.textContent='入力内容を確認・控えたうえで詳細を開き直してください。強制上書きは行いません。'}catch(e){report(note,e)}}
   async function saveForm(){if(busy)return;const patch=C.changed(baseline,collect());if(!Object.keys(patch).length){note.textContent='変更はありません。';return}setBusy(true);saveButton.disabled=true;try{row=await S.save(sb,row,patch);dirty=()=>false;if(selected.has(row.id))selected.set(row.id,row);jobs.delete(row.id);await load(true);setBusy(false);await showDetail(row)}catch(e){report(note,e);if(e.code==='40001')conflictButton.hidden=false;}finally{setBusy(false);saveButton.disabled=false}}
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
     const task=kind==='reading'?'画像の文字・図・写真・表と前後の文脈を確認し、文字を全文読み取ってください。読めない箇所は根拠がある場合に補完し、不確かな箇所を本文中にも明記してください。数値・単位・否定・左右は推測で断定しないでください。raw_textには直接読めた原文、corrected_textには補完後の全文、visual_summaryには図の意味、repairsにはbefore・after・reason・confidence（high / uncertain / unreadable）を記録してください。分類と問題への貼り付けは依頼していません。':'画像そのものが説明する内容を確認して分類してください。中心テーマtopicsと含まれる内容keywordsを区別し、subject_idsは下記科目から複数選択できます。aspectsは構造・正常機能・病態・所見・検査・鑑別・治療・作用機序・副作用等、rolesは総まとめ・個別解説・比較・疾患との関連・概念図等。疾患名は必須ではありません。aliasesには同義の別名、related_keywordsには関連だけする語を入れてください。画像に根拠のない関連語を増やさないでください。OCR本文の変更と問題への貼り付けは依頼していません。';
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
  async function showTerms(){
   if(busy)return;enterDetail('検索語・別名の管理');dirty=()=>false;const note=el('div','qbLibraryStatus','同じ意味の呼び名を登録します。関連するだけの語は画像の「関連する内容」に登録してください。'),form=el('div','qbLibraryForm'),select=selectField('編集する検索語',[['','新しく追加'],...terms.map(t=>[t.id,t.canonical])]),canonical=inputField('正式な検索語'),aliases=inputField('別名・読み・略語（改行または読点区切り）','',true);detailView.append(note,select.host,form);form.append(canonical.host,aliases.host);let row=null,initial=['',''];
   select.input.onchange=()=>{if(dirty()&&!confirm('未保存の変更を破棄しますか？')){select.input.value=row?.id||'';return}row=terms.find(t=>t.id===select.input.value)||null;canonical.input.value=row?.canonical||'';aliases.input.value=(row?.aliases||[]).join('\n');initial=[canonical.input.value,aliases.input.value]};dirty=()=>canonical.input.value!==initial[0]||aliases.input.value!==initial[1];
   detailView.append(btn('検索語を保存',async()=>{if(busy)return;setBusy(true);try{await S.termSave(sb,row,canonical.input.value,aliases.input.value);terms=await S.catalog(sb,'qb_image_library_terms');dirty=()=>false;await showTerms();note.textContent='保存しました。'}catch(e){report(note,e)}finally{setBusy(false)}},'qbLibraryPrimary'));
  }
  overlay.focus();(async()=>{try{[subjects,terms]=await Promise.all([S.catalog(sb,'subjects'),S.catalog(sb,'qb_image_library_terms')]);if(closed)return;for(const s of subjects){const c=check(s.name,false);c.input.onchange=()=>{state.subjects=[...subjectChecks.querySelectorAll('input:checked')].map(i=>i.value);load(true)};c.input.value=s.id;subjectChecks.append(c.host)}await load(true);searchInput.focus()}catch(e){report(status,e)}})();
 });
}
function placementName(p){return {question:'問題文',choice:'選択肢',explanation_overview:'問題文のポイント',choice_explanation:'選択肢解説',examiner_intent:'出題者の意図',exam_summary:'試験用まとめ',medical_verification:'医学的検証'}[p]||p}
window.QBImageLibrary={open,placementName};
})();
