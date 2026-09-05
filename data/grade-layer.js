window.addEventListener('DOMContentLoaded',()=>{
  document.title='定期テスト対策QB';
  const brand=document.querySelector('.brand');
  if(brand) brand.textContent='定期テスト対策QB';
  const view=document.getElementById('view');
  const crumb=document.getElementById('crumb');
  const home=document.getElementById('home');
  if(!view||!crumb) return;

  function renderGrades(){
    if(home) home.classList.add('hidden');
    crumb.textContent='学年を選択';
    view.innerHTML=`<div class="card"><div class="title">学年一覧</div><div class="sub">学年を選んでください。現在はM4のみ公開中です。</div></div>
      <button id="gradeM4" class="list"><div style="flex:1"><div class="lt">M4</div><div class="meta">和漢医学概論ほか、M4定期試験対策</div></div><div>›</div></button>
      <button class="list" disabled style="opacity:.45"><div><div class="lt">M1〜M3 / M5〜M6</div><div class="meta">将来追加予定</div></div></button>`;
    document.getElementById('gradeM4').onclick=()=>{
      if(typeof subjects==='function'){
        if(home) home.classList.remove('hidden');
        subjects();
      }
    };
  }

  renderGrades();
  if(home){
    home.textContent='学年一覧';
    home.onclick=()=>renderGrades();
  }

  if(brand){
    brand.style.cursor='pointer';
    brand.onclick=()=>renderGrades();
  }
});

(()=>{
const PROJECT='wakan';
let sb=null,subjectId=null,isAdmin=false;
function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function addCss(){if(document.getElementById('syllabusCss'))return;const s=document.createElement('style');s.id='syllabusCss';s.textContent=`
.sylEntry{width:100%;margin:10px 0;border:1px solid #dce3ec;background:#fff;border-radius:15px;padding:14px;text-align:left;font-weight:900}.sylOverlay{position:fixed;inset:0;background:#0008;z-index:1300;display:flex;align-items:flex-end;justify-content:center;padding:12px}.sylPanel{width:min(820px,100%);max-height:94vh;overflow:auto;background:#f7f9fc;border-radius:22px;padding:16px}.sylHead{display:flex;justify-content:space-between;align-items:center;gap:8px}.sylTitle{font-size:20px;font-weight:900}.sylClose{border:1px solid #dce3ec;background:#fff;border-radius:12px;padding:9px 12px;font-weight:900}.sylDoc{background:#fff;border:1px solid #dce3ec;border-radius:14px;padding:12px;margin:10px 0}.sylMeta{font-size:12px;color:#6f7786}.sylActions{display:flex;gap:8px;margin-top:8px}.sylBtn{border:1px solid #dce3ec;background:#fff;border-radius:10px;padding:9px 11px;font-weight:800}.sylPrimary{background:#126fb3;color:#fff;border-color:#126fb3}.sylAdmin{background:#fff;border:1px solid #dce3ec;border-radius:14px;padding:12px;margin-top:14px}.sylInput{width:100%;box-sizing:border-box;border:1px solid #dce3ec;border-radius:10px;padding:10px;margin:5px 0;font:inherit}.sylPreview{background:#fff;border:1px solid #dce3ec;border-radius:14px;overflow:hidden;margin-top:10px}.sylPreview iframe{width:100%;height:70vh;border:0}.sylPreview img{display:block;max-width:100%;margin:auto}.sylEmpty{color:#6f7786;font-size:13px;padding:16px;text-align:center}
`;document.head.appendChild(s)}
async function waitSb(){for(let i=0;i<80;i++){if(window.qbSupabase)return window.qbSupabase;await new Promise(r=>setTimeout(r,100))}return null}
async function initMeta(){sb=await waitSb();if(!sb)return;const {data:{user}}=await sb.auth.getUser();if(!user)return;const p=await sb.from('profiles').select('role').eq('id',user.id).maybeSingle();isAdmin=p.data?.role==='admin';const q=await sb.from('subjects').select('id').eq('slug',PROJECT).maybeSingle();subjectId=q.data?.id||null;}
function shouldShow(){const c=(document.getElementById('crumb')?.textContent||'');return /和漢医学概論|単元/.test(c)&&!/演習|問題\s*\d|問\s*\d/.test(c)}
function inject(){if(!subjectId||!shouldShow())return;const v=document.getElementById('view');if(!v||document.getElementById('sylEntry'))return;const b=document.createElement('button');b.id='sylEntry';b.className='sylEntry';b.innerHTML='📘 シラバスを見る <span style="float:right">›</span>';b.onclick=openLibrary;v.prepend(b)}
function urlFor(d){if(d.external_url)return d.external_url;if(!d.storage_path)return '';return sb.storage.from('syllabi').getPublicUrl(d.storage_path).data.publicUrl}
async function loadDocs(){const {data,error}=await sb.from('subject_syllabi').select('*').eq('subject_id',subjectId).order('academic_year',{ascending:false}).order('sort_order');if(error)throw error;return data||[]}
async function openLibrary(){let docs=[];try{docs=await loadDocs()}catch(e){return alert(e.message)}document.getElementById('sylOverlay')?.remove();const o=document.createElement('div');o.id='sylOverlay';o.className='sylOverlay';o.innerHTML=`<div class="sylPanel"><div class="sylHead"><div><div class="sylTitle">和漢医学概論 シラバス</div><div class="sylMeta">年度別にPDF・画像を保存できます。</div></div><button class="sylClose">閉じる</button></div><div id="sylDocs"></div><div id="sylPreview" class="sylPreview" style="display:none"></div>${isAdmin?`<div class="sylAdmin"><b>管理者：シラバスを追加</b><input id="sylYear" class="sylInput" type="number" min="2000" max="2100" value="${new Date().getFullYear()}" placeholder="年度"><input id="sylTitleInput" class="sylInput" value="シラバス" placeholder="タイトル"><input id="sylFile" class="sylInput" type="file" accept="application/pdf,image/png,image/jpeg,image/webp"><button id="sylUpload" class="sylBtn sylPrimary">アップロード</button><div id="sylMsg" class="sylMeta" style="margin-top:6px"></div></div>`:''}</div>`;document.body.appendChild(o);o.querySelector('.sylClose').onclick=()=>o.remove();renderDocs(docs,o);if(isAdmin)o.querySelector('#sylUpload').onclick=()=>upload(o)}
function renderDocs(docs,o){const box=o.querySelector('#sylDocs');if(!docs.length){box.innerHTML='<div class="sylEmpty">まだシラバスが登録されていません。</div>';return}box.innerHTML=docs.map(d=>`<div class="sylDoc" data-id="${d.id}"><b>${d.academic_year}年度 ${esc(d.title)}</b><div class="sylMeta">${esc(d.original_filename||'')} ${d.mime_type==='application/pdf'?'PDF':'画像'}</div><div class="sylActions"><button class="sylBtn sylPrimary viewDoc">表示</button><button class="sylBtn openDoc">別タブで開く</button>${isAdmin?'<button class="sylBtn delDoc" style="color:#d04444">削除</button>':''}</div></div>`).join('');[...box.querySelectorAll('.sylDoc')].forEach((row,i)=>{const d=docs[i],u=urlFor(d);row.querySelector('.viewDoc').onclick=()=>preview(d,u,o);row.querySelector('.openDoc').onclick=()=>window.open(u,'_blank','noopener');if(isAdmin)row.querySelector('.delDoc').onclick=()=>removeDoc(d,o)})}
function preview(d,u,o){const p=o.querySelector('#sylPreview');p.style.display='block';p.innerHTML=d.mime_type==='application/pdf'?`<iframe src="${esc(u)}#view=FitH"></iframe>`:`<img src="${esc(u)}" alt="${esc(d.title)}">`;p.scrollIntoView({behavior:'smooth',block:'start'})}
async function upload(o){const year=Number(o.querySelector('#sylYear').value),title=o.querySelector('#sylTitleInput').value.trim()||'シラバス',file=o.querySelector('#sylFile').files?.[0],msg=o.querySelector('#sylMsg');if(!file)return alert('PDFまたは画像を選択してください。');if(!['application/pdf','image/png','image/jpeg','image/webp'].includes(file.type))return alert('PDF、PNG、JPEG、WebPのみ対応です。');msg.textContent='アップロード中…';const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');const path=`${PROJECT}/${year}/${crypto.randomUUID()}-${safe}`;const up=await sb.storage.from('syllabi').upload(path,file,{contentType:file.type,upsert:false});if(up.error){msg.textContent=up.error.message;return}const {data:{user}}=await sb.auth.getUser();const ins=await sb.from('subject_syllabi').insert({subject_id:subjectId,academic_year:year,title,original_filename:file.name,mime_type:file.type,storage_path:path,file_size_bytes:file.size,uploaded_by:user.id,is_published:true}).select().single();if(ins.error){await sb.storage.from('syllabi').remove([path]);msg.textContent=ins.error.message;return}msg.textContent='登録しました。';renderDocs(await loadDocs(),o);o.querySelector('#sylFile').value=''}
async function removeDoc(d,o){if(!confirm(`${d.academic_year}年度 ${d.title} を削除しますか？`))return;const del=await sb.from('subject_syllabi').delete().eq('id',d.id);if(del.error)return alert(del.error.message);if(d.storage_path)await sb.storage.from('syllabi').remove([d.storage_path]);renderDocs(await loadDocs(),o)}
async function start(){addCss();await initMeta();const obs=new MutationObserver(()=>inject());obs.observe(document.body,{childList:true,subtree:true});inject()}
document.addEventListener('DOMContentLoaded',start);
})();
