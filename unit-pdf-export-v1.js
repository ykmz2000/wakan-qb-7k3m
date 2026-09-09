/* Read-only PDF export. Independent of practice, editor, autosave and image export state. */
(()=>{
'use strict';
const assetBase=new URL('.',document.currentScript?.src||location.href);
const DETAIL='id,unit_id,stem,instruction,answer_mode,answer_fields,source_answer,study_order,stem_formatting,explanation_overview,examiner_intent,exam_summary,medical_verification_note,explanation_formatting,choices(id,choice_key,choice_text,is_correct,sort_order,explanation,correction_text,correct_for_other_context,examiner_distinction,explanation_formatting),question_occurrences(id,academic_year,exam_type,original_question_number,official_answer,source_page,source_file)';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let dialog=null,libraryPromise=null;
const icon='<svg viewBox="0 0 32 36" width="27" height="31" aria-hidden="true"><path d="M7 2h13l7 7v24H7zM20 2v8h7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><rect x="1" y="16" width="30" height="14" rx="3" fill="currentColor"/><text x="16" y="26.3" text-anchor="middle" font-family="Arial,sans-serif" font-size="10" font-weight="700" fill="white">PDF</text></svg>';
function rowHTML(card,subjectId,unitId,name){return `<div class="qbPdfUnitRow"><button type="button" class="qbPdfIcon" data-pdf-subject="${esc(subjectId)}" data-pdf-unit="${esc(unitId)}" aria-label="${esc(name)}をPDF出力" title="${esc(name)}をPDF出力">${icon}</button>${card}</div>`}
function wrapCard(card,questionIds=null){
  const existing=card.closest('.qbPdfUnitRow');if(existing)return existing;
  const sid=window.qbGetPracticeState?.().subjectId;if(!sid)return card;
  const container=document.createElement('div');container.innerHTML=rowHTML('',sid,card.dataset.u,card.querySelector('.lt')?.textContent||'単元');
  const row=container.firstElementChild;row.append(card);
  if(questionIds)row.querySelector('.qbPdfIcon').dataset.pdfQuestions=JSON.stringify(questionIds);
  return row;
}
function css(){
  if(document.getElementById('qbUnitPdfCss'))return;
  const s=document.createElement('style');s.id='qbUnitPdfCss';s.textContent=`
.qbPdfUnitRow{display:grid;grid-template-columns:44px minmax(0,1fr);gap:6px;align-items:center;margin-bottom:10px;min-width:0}
.qbPdfUnitRow>.list{margin-bottom:0;min-width:0;max-width:100%;overflow-wrap:anywhere}
.qbPdfUnitRow>.list>div:first-child{min-width:0}
.qbPdfIcon{display:flex;align-items:center;justify-content:center;min-height:44px;width:44px;border:0;border-radius:9px;background:transparent;color:var(--accent);cursor:pointer;padding:5px}
.qbPdfIcon:hover,.qbPdfIcon:focus-visible{background:var(--accent-soft)}.qbPdfIcon:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.qbPdfDialog{width:min(440px,calc(100% - 28px));max-height:85dvh;overflow:auto;border:1px solid var(--line);border-radius:18px;padding:20px;background:var(--card,#fff);color:var(--text,#172033)}
.qbPdfDialog::backdrop{background:#0007}.qbPdfDialog h2{font-size:20px;margin:0 0 8px}.qbPdfTarget{font-size:14px;line-height:1.6;overflow-wrap:anywhere;margin:0 0 18px}
.qbPdfDialog label{display:grid;gap:8px;font-size:14px}.qbPdfDialog select{width:100%;min-height:44px;font:inherit;border:1px solid var(--line);border-radius:9px;padding:8px;background:var(--card,#fff);color:var(--text)}
.qbPdfStatus{font-size:14px;line-height:1.6;min-height:44px;margin:14px 0;overflow-wrap:anywhere}.qbPdfActions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.qbPdfActions button{min-height:44px;border-radius:10px;padding:9px 14px;font:inherit;font-weight:700;cursor:pointer;background:var(--card,#fff);border:1px solid var(--line);color:var(--text)}
.qbPdfActions .qbPdfCreate,.qbPdfActions .qbPdfSave{background:var(--accent);border-color:var(--accent);color:#fff}.qbPdfActions button:disabled{opacity:.5;cursor:default}
`;document.head.append(s);
}
function aborted(signal){if(signal?.aborted)throw new DOMException('中止しました','AbortError')}
function cancellable(promise,signal,ms=45000){
  aborted(signal);return new Promise((resolve,reject)=>{
    const stop=()=>finish(reject,new DOMException('中止しました','AbortError'));
    const timer=setTimeout(()=>finish(reject,Error('読み込みがタイムアウトしました。通信状態を確認して再試行してください。')),ms);
    function finish(fn,v){clearTimeout(timer);signal?.removeEventListener('abort',stop);fn(v)}
    signal?.addEventListener('abort',stop,{once:true});Promise.resolve(promise).then(v=>finish(resolve,v),e=>finish(reject,e));
  });
}
async function readAll(makeQuery,signal){
  const out=[];let last=null;
  // Keyset pagination; do not assume the server's configured page cap is 1,000.
  for(;;){aborted(signal);let query=makeQuery().order('id').limit(200);if(last!==null)query=query.gt('id',last);if(signal)query=query.abortSignal(signal);
    const r=await cancellable(query,signal);if(r.error)throw r.error;const rows=r.data||[];if(!rows.length)return out;
    const id=String(rows[rows.length-1].id);if(id===last)throw Error('データの続きを取得できませんでした。');out.push(...rows);last=id;
  }
}
function numberRank(v){return v!=null&&Number.isFinite(Number(v))?Number(v):Number.MAX_SAFE_INTEGER}
function orderedUnits(rows){return [...rows].sort((a,b)=>numberRank(a.sort_order)-numberRank(b.sort_order)||String(a.id).localeCompare(String(b.id)))}
async function loadScope(sb,target,signal){
  const auth=await cancellable(sb.auth.getUser(),signal);if(auth.error||!auth.data?.user)throw Error('ログイン情報を確認できません。再ログインしてください。');
  const subjectResult=await cancellable(sb.from('subjects').select('id,name').eq('id',target.subjectId).maybeSingle().abortSignal(signal),signal);
  if(subjectResult.error)throw subjectResult.error;if(!subjectResult.data)throw Error('科目が見つかりません。');
  const units=orderedUnits(await readAll(()=>sb.from('units').select('id,name,sort_order,is_active').eq('subject_id',target.subjectId),signal));
  const all=target.unitId==='__all__',unit=units.find(u=>String(u.id)===String(target.unitId));if(!all&&!unit)throw Error('単元が見つかりません。');
  let index=await readAll(()=>{let query=sb.from('questions').select('id,unit_id,study_order').eq('subject_id',target.subjectId).eq('status','published');if(!all)query=query.eq('unit_id',target.unitId);return query},signal);
  if(target.questionIds){const allowed=new Set(target.questionIds.map(String));index=index.filter(q=>allowed.has(String(q.id)))}
  const ranks=new Map(units.filter(u=>u.is_active!==false).map((u,i)=>[String(u.id),i]));
  index.sort((a,b)=>(ranks.get(String(a.unit_id))??Number.MAX_SAFE_INTEGER)-(ranks.get(String(b.unit_id))??Number.MAX_SAFE_INTEGER)||String(a.unit_id).localeCompare(String(b.unit_id))||numberRank(a.study_order)-numberRank(b.study_order)||String(a.id).localeCompare(String(b.id)));
  if(!index.length)throw Error('出力できる公開済みの問題がありません。');
  return{subject:subjectResult.data,units,index,all,unit};
}
async function loadLibrary(){
  if(window.PDFLib)return window.PDFLib;
  if(!libraryPromise)libraryPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=new URL('vendor/pdf-lib-1.17.1.min.js',assetBase).href;script.onload=()=>resolve(window.PDFLib);script.onerror=()=>{script.remove();libraryPromise=null;reject(Error('PDF出力機能を読み込めませんでした。'))};document.head.append(script)});
  return libraryPromise;
}
async function loadImages(sb,rows,signal){
  const out=[];
  try{
  for(const row of rows){aborted(signal);
    const file=await cancellable(sb.storage.from('question-media').download(row.image_path),signal);if(file.error||!file.data)throw Error('画像を取得できませんでした。画像を省略せず、出力を中止しました。');
    const url=URL.createObjectURL(file.data),img=new Image();
    try{await cancellable(new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('画像を読み込めませんでした。'));img.src=url}),signal);
      const scale=Math.min(1,2100/img.naturalWidth,2700/img.naturalHeight),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
      canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);out.push({...row,image:canvas});
    }finally{URL.revokeObjectURL(url);img.src=''}
  }
  return out;
  }catch(e){out.forEach(r=>{r.image.width=r.image.height=1});throw e}
}
function sourceLines(q){return(q.question_occurrences||[]).map(o=>`${o.academic_year?o.academic_year+'年度':'年度不明'}・${o.exam_type||'試験区分不明'}${o.original_question_number?'・問'+o.original_question_number:''}${o.source_file?'　'+o.source_file:''}${o.source_page?' p.'+o.source_page:''}`).join('\n')}
function filename(scope){return [scope.subject.name,scope.all?'すべて':scope.unit.name].join('-').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').slice(0,150)+'.pdf'}
async function generate(target,{mode='full',signal,onProgress=()=>{},onPage=null}={}){
  const sb=window.qbSupabase,L=window.QBPDFLayout;if(!sb||!L)throw Error('PDF出力の準備ができていません。');
  const scope=await loadScope(sb,target,signal);aborted(signal);
  const lib=await cancellable(loadLibrary(),signal),pdf=await lib.PDFDocument.create();
  pdf.setTitle([scope.subject.name,scope.all?'':scope.unit.name].filter(Boolean).join(' / '));pdf.setCreator('定期テスト対策QB');
  if(document.fonts?.ready)await cancellable(document.fonts.ready,signal);
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');if(!ctx)throw Error('描画機能を利用できません。');
  const accent=getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()||'#c43d79';
  const rgb=/^#[0-9a-f]{6}$/i.test(accent)?[1,3,5].map(n=>parseInt(accent.slice(n,n+2),16)):[196,61,121];
  const theme={accent,marker:`rgb(${rgb.map(v=>Math.round(v*.12+255*.88)).join(',')})`};
  let count=0,currentUnit=null;
  function reset(){canvas.width=L.PAGE.width*3;canvas.height=L.PAGE.height*3;ctx.scale(3,3);ctx.fillStyle='#fff';ctx.fillRect(0,0,L.PAGE.width,L.PAGE.height);ctx.textBaseline='top'}
  function draw(text,x,y,size=14,bold=false,width=690){return L.drawLines(ctx,L.textLines(ctx,text,{size,bold,width}),x,y,theme)}
  async function savePage(meta){
    aborted(signal);count++;draw(String(count),L.PAGE.width-80,1086,12);
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('ページ画像を作成できませんでした。')),'image/jpeg',.94));
    aborted(signal);const image=await pdf.embedJpg(await blob.arrayBuffer()),page=pdf.addPage([595.28,841.89]);page.drawImage(image,{x:0,y:0,width:595.28,height:841.89});
    if(onPage)await onPage({...meta,page:count},canvas);await new Promise(r=>setTimeout(r,0));
  }
  async function cover(title,subtitle,type){reset();ctx.fillStyle=theme.accent;ctx.fillRect(60,310,54,5);let y=draw(title,60,350,30,true,674);if(subtitle)draw(subtitle,60,y+24,24,true,674);draw('定期テスト対策QB',60,1010,14);await savePage({type,title,subtitle})}
  try{
    await cover(scope.subject.name,scope.all?'':scope.unit.name,scope.all?'subject-cover':'unit-cover');
    for(let start=0;start<scope.index.length;start+=20){
      aborted(signal);const batch=scope.index.slice(start,start+20),ids=batch.map(q=>q.id);
      const details=await readAll(()=>sb.from('questions').select(DETAIL).eq('subject_id',target.subjectId).eq('status','published').in('id',ids),signal),map=new Map(details.map(q=>[String(q.id),q]));
      for(let n=0;n<batch.length;n++){
        aborted(signal);const entry=batch[n],q=map.get(String(entry.id));if(!q||String(q.unit_id)!==String(entry.unit_id))throw Error('出力中に問題の公開状態・単元が変更されました。もう一度作成してください。');
        q.choices=[...(q.choices||[])].sort((a,b)=>(a.sort_order??0)-(b.sort_order??0));q.question_occurrences=[...(q.question_occurrences||[])].sort((a,b)=>(b.academic_year??0)-(a.academic_year??0)||String(a.id).localeCompare(String(b.id)));
        const unit=scope.units.find(u=>String(u.id)===String(q.unit_id))||{name:'単元未分類'};
        if(scope.all&&currentUnit!==String(q.unit_id)){await cover(scope.subject.name,unit.name,'unit-cover');currentUnit=String(q.unit_id)}
        onProgress({done:start+n,total:scope.index.length});
        let rows=await readAll(()=>sb.from('question_images').select('id,image_path,caption,alt_text,placement,choice_id,sort_order,created_at').eq('question_id',q.id),signal);
        rows.sort((a,b)=>(a.sort_order??0)-(b.sort_order??0)||String(a.created_at).localeCompare(String(b.created_at))||String(a.id).localeCompare(String(b.id)));
        if(mode!=='full')rows=rows.filter(r=>r.placement==='question');
        const images=await loadImages(sb,rows,signal);
        try{
          const groups=L.buildGroups(ctx,q,images,mode),sources=sourceLines(q);
          if(sources)groups.unshift({id:'source',items:L.textAtoms(ctx,sources,{size:12})});
          const pages=L.paginate(groups);
          for(let part=0;part<pages.length;part++){
            reset();const header=L.textLines(ctx,`${scope.subject.name} / ${unit.name}`,{size:12,width:672});
            L.drawLines(ctx,[header[0]],52,24,theme);if(header.length>1)draw('…',728,24,12);
            draw(`問${start+n+1}${part?'（続き '+(part+1)+'）':''}`,52,51,18,true);
            ctx.strokeStyle='#dce3ec';ctx.beginPath();ctx.moveTo(52,77);ctx.lineTo(742,77);ctx.stroke();
            L.drawItems(ctx,pages[part].items,theme);
            await savePage({type:'question',questionId:q.id,part:part+1,items:pages[part].items.map(({group,type,y,height,imageId})=>({group,type,y,height,imageId}))});
          }
        }finally{images.forEach(r=>{r.image.width=r.image.height=1})}
        onProgress({done:start+n+1,total:scope.index.length});
      }
    }
    aborted(signal);const bytes=await pdf.save();aborted(signal);return{blob:new Blob([bytes],{type:'application/pdf'}),filename:filename(scope),pages:count,questions:scope.index.length};
  }finally{canvas.width=canvas.height=1}
}
function close(){if(!dialog)return;const old=dialog;dialog=null;old.qbAbort?.abort();old.close();old.remove();old.qbReturnFocus?.focus({preventScroll:true})}
function show(button){
  close();const target={subjectId:button.dataset.pdfSubject,unitId:button.dataset.pdfUnit};if(button.dataset.pdfQuestions)try{target.questionIds=JSON.parse(button.dataset.pdfQuestions)}catch{return}
  const d=document.createElement('dialog');d.className='qbPdfDialog';d.setAttribute('aria-labelledby','qbPdfTitle');d.qbReturnFocus=button;
  d.innerHTML='<h2 id="qbPdfTitle">PDF出力</h2><p class="qbPdfTarget"></p><label>出力内容<select aria-label="PDFの出力内容"><option value="full">問題・解答・解説</option><option value="answers">問題・解答</option><option value="questions">問題のみ</option></select></label><p class="qbPdfStatus" role="status" aria-live="polite">A4・表紙付き</p><div class="qbPdfActions"><button type="button" class="qbPdfClose">閉じる</button><button type="button" class="qbPdfCreate">PDFを作成</button><button type="button" class="qbPdfSave" hidden>PDFを保存</button></div>';
  d.querySelector('.qbPdfTarget').textContent=button.getAttribute('aria-label').replace(/をPDF出力$/,'');
  const select=d.querySelector('select'),status=d.querySelector('.qbPdfStatus'),create=d.querySelector('.qbPdfCreate'),save=d.querySelector('.qbPdfSave');let result=null,busy=false;
  const reset=()=>{result=null;save.hidden=true;create.hidden=false;status.textContent='A4・表紙付き'};select.onchange=reset;
  d.querySelector('.qbPdfClose').onclick=close;d.addEventListener('cancel',e=>{e.preventDefault();close()});
  d.addEventListener('click',e=>{e.stopPropagation();if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close()}});
  d.addEventListener('keydown',e=>e.stopPropagation());
  create.onclick=async()=>{
    if(busy)return;busy=true;create.disabled=select.disabled=true;d.qbAbort=new AbortController();status.textContent='問題を読み込み中…';
    try{result=await generate(target,{mode:select.value,signal:d.qbAbort.signal,onProgress:({done,total})=>{if(dialog===d)status.textContent=`PDFを作成中… ${done} / ${total}問`}});if(dialog!==d)return;create.hidden=true;save.hidden=false;status.textContent=`${result.questions}問・${result.pages}ページ`;save.focus()}
    catch(e){if(dialog===d&&e.name!=='AbortError')status.textContent='PDFを作成できませんでした：'+(e.message||e)}
    finally{busy=false;create.disabled=select.disabled=false}
  };
  save.onclick=async()=>{
    if(!result||busy)return;busy=true;save.disabled=true;const file=new File([result.blob],result.filename,{type:'application/pdf'});
    try{if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:result.filename})}
      else{const url=URL.createObjectURL(result.blob),a=document.createElement('a');a.href=url;a.download=result.filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
    }catch(e){if(e.name!=='AbortError')status.textContent='保存を開始できませんでした。もう一度お試しください。'}finally{busy=false;save.disabled=false}
  };
  document.body.append(d);dialog=d;d.showModal();create.focus();
}
function boot(){css();document.getElementById('view')?.addEventListener('click',e=>{const button=e.target.closest?.('.qbPdfIcon');if(!button)return;e.preventDefault();e.stopPropagation();show(button)});window.addEventListener('qb-screen-change',close)}
window.QBUnitPdf={rowHTML,wrapCard,generate,loadScope,readAll,show,close};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
