(()=>{
'use strict';
let timer=null,adminCache=null;
const fieldLoads=new Map();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function screen(){return window.qbGetScreen?.()||''}
function q(){try{return window.pq?.()||null}catch{return null}}
const qid=Q=>Q?.id||Q?.dbId||null;
const systemKey=k=>/^(?:IMAGE|IMG|IMAGE_REQUIRED|FIGURE|FIG|SOURCE|PAGE)(?:[_-].*)?$/i.test(String(k||'').trim());
function official(Q){return Q?.occ?.[0]?.official_answer}
function normalizeFields(raw){
  if(!Array.isArray(raw)||!raw.length)return null;
  const out=[],seen=new Set();
  raw.forEach((x,i)=>{
    const obj=typeof x==='string'?{key:x,label:`[${x}]`}:x&&typeof x==='object'?x:null;
    if(!obj)return;
    const key=String(obj.key??'').trim();if(!key||seen.has(key)||systemKey(key))return;seen.add(key);
    const label=String(obj.label??`[${key}]`).trim()||`[${key}]`;
    out.push({key,label});
  });
  return out.length?out:null;
}
function legacyFields(Q){
  const seen=new Set(),out=[];
  for(const m of String(Q?.stem||'').matchAll(/\[([^\]]+)\]/g)){
    const key=String(m[1]||'').trim();
    if(!key||seen.has(key)||systemKey(key))continue;
    seen.add(key);out.push({key,label:`[${key}]`});
  }
  if(out.length)return out;
  const a=official(Q);
  if(a&&typeof a==='object'&&!Array.isArray(a)){
    Object.keys(a).filter(k=>!/^(note|order)$/i.test(k)&&!systemKey(k)).forEach(key=>{
      if(!seen.has(key)){seen.add(key);out.push({key,label:`[${key}]`})}
    });
  }
  return out.length?out:[{key:'A',label:'[A]'}];
}
function fieldsFor(Q){return normalizeFields(Q?.answer_fields)||legacyFields(Q)}
function keysFor(Q){return fieldsFor(Q).map(x=>x.key)}
async function loadFieldConfig(Q){
  const id=qid(Q),sb=window.qbSupabase;if(!id||!sb)return;
  if(Object.prototype.hasOwnProperty.call(Q,'answer_fields'))return;
  if(fieldLoads.has(id)){await fieldLoads.get(id);return}
  const p=(async()=>{
    const r=await sb.from('questions').select('answer_fields').eq('id',id).maybeSingle();
    if(!r.error)Q.answer_fields=r.data?.answer_fields??null;
    else Q.answer_fields=null;
  })().finally(()=>fieldLoads.delete(id));
  fieldLoads.set(id,p);await p;
}
function answerValue(a,field,index,fields){
  const k=field.key;
  if(a==null)return '解答未登録';
  if(Array.isArray(a)){
    if(fields.length>1&&a.length===fields.length){const v=a[index];return Array.isArray(v)?v.join('・'):v==null?'解答未登録':String(v)}
    return a.join('・');
  }
  if(typeof a==='object'){
    const v=a[k];return Array.isArray(v)?v.join('・'):v==null?'解答未登録':String(v)
  }
  if(fields.length>1&&index>0)return '解答未登録';
  return String(a);
}
function extraOfficial(a){if(!a||typeof a!=='object'||Array.isArray(a))return'';const extras=[];if(a.order)extras.push(`順序：${a.order}`);if(a.note)extras.push(String(a.note));return extras.length?`<div class="meta fbExtra">${extras.map(esc).join(' / ')}</div>`:''}
async function userCtx(){const sb=window.qbSupabase;if(!sb)return null;const r=await sb.auth.getUser();const u=r.data?.user;return u?{sb,u}:null}
async function isAdmin(){if(adminCache!==null)return adminCache;const c=await userCtx();if(!c)return adminCache=false;const {sb,u}=c;const r=await sb.from('profiles').select('role').eq('id',u.id).maybeSingle();return adminCache=r.data?.role==='admin'}
async function saveAnswered(Q,response){const c=await userCtx();if(!c)return;const {sb,u}=c,now=new Date().toISOString(),occ=Q?.occ?.[0]?.id||null;const a=await sb.from('attempts').insert({user_id:u.id,question_id:Q.id,occurrence_id:occ,selected_choice_keys:[],is_correct:null,response_payload:response,answered_at:now});if(a.error)throw a.error;const p={user_id:u.id,question_id:Q.id,has_viewed_explanation:true,explanation_viewed_at:now,has_answered:true,last_answered_at:now,last_is_correct:null,last_selected_choice_keys:[],updated_at:now};const s=await sb.from('user_question_state').upsert(p,{onConflict:'user_id,question_id'});if(s.error)throw s.error}
async function saveReview(Q){const c=await userCtx();if(!c)return;const {sb,u}=c,now=new Date().toISOString();const r=await sb.from('user_question_state').select('has_answered,last_answered_at,last_is_correct,last_selected_choice_keys').eq('user_id',u.id).eq('question_id',Q.id).maybeSingle();if(r.error)throw r.error;const old=r.data||{};const p={user_id:u.id,question_id:Q.id,has_viewed_explanation:true,explanation_viewed_at:now,has_answered:!!old.has_answered,last_answered_at:old.last_answered_at||null,last_is_correct:typeof old.last_is_correct==='boolean'?old.last_is_correct:null,last_selected_choice_keys:old.last_selected_choice_keys||[],updated_at:now};const s=await sb.from('user_question_state').upsert(p,{onConflict:'user_id,question_id'});if(s.error)throw s.error}
function renderResult(Q,response,reviewOnly){
  const ans=document.getElementById('ans');if(!ans)return;
  const fields=fieldsFor(Q),a=official(Q);
  const mine=reviewOnly?'':`<div class="fbAnswerGroup"><b>あなたの解答</b>${fields.map(f=>`<div class="fbAnswerLine"><span>${esc(f.label)}</span><strong>${esc(response[f.key]||'')}</strong></div>`).join('')}</div>`;
  const off=`<div class="fbAnswerGroup"><b>公式解答</b>${fields.map((f,i)=>`<div class="fbAnswerLine"><span>${esc(f.label)}</span><strong>${esc(answerValue(a,f,i,fields))}</strong></div>`).join('')}${extraOfficial(a)}</div>`;
  const exp=Q?.explanation_overview?`<div class="card"><b>■ 解説</b><div class="line">${esc(Q.explanation_overview)}</div></div>`:'';
  const intent=Q?.examiner_intent?`<div class="card"><b>■ 出題意図</b><div class="line">${esc(Q.examiner_intent)}</div></div>`:'';
  const verify=Q?.medical_verification_note?`<div class="card"><b>■ 医学的検証メモ</b><div class="line">${esc(Q.medical_verification_note)}</div></div>`:'';
  ans.innerHTML=`<div class="card resultcard ${reviewOnly?'review':'fillblank'}"><div class="result">${reviewOnly?'解説モード（未解答）':'解答確認'}</div>${mine}${off}<div class="meta" style="margin-top:8px">${reviewOnly?'解答済みには含めません。':'自動採点はしません。自己評価で理解度を記録してください。'}</div></div>${exp}${intent}${verify}`;
  window.dispatchEvent(new CustomEvent('qb-answer-shown'));setTimeout(()=>ans.scrollIntoView({behavior:'smooth',block:'start'}),80)
}
function syncButton(box){const fields=[...box.querySelectorAll('.fbInput')],b=box.querySelector('#answer');if(b)b.disabled=!fields.length||fields.some(x=>!x.value.trim())}
async function doReview(Q,button){if(button)button.disabled=true;try{await saveReview(Q);renderResult(Q,{},true)}catch(e){console.error(e);if(button)button.disabled=false;alert('学習履歴の保存に失敗しました')}}
function fieldsHtml(Q,values={}){return fieldsFor(Q).map(f=>`<label class="fbField"><span>${esc(f.label)}</span><input class="fbInput" data-k="${esc(f.key)}" value="${esc(values[f.key]||'')}" autocomplete="off" inputmode="text"></label>`).join('')}
function bindPracticeBox(wrap,Q){
  wrap.querySelectorAll('.fbInput').forEach(x=>x.addEventListener('input',()=>syncButton(wrap)));
  wrap.querySelector('#answer').onclick=async()=>{const response={};wrap.querySelectorAll('.fbInput').forEach(x=>response[x.dataset.k]=x.value.trim());const b=wrap.querySelector('#answer');b.disabled=true;try{await saveAnswered(Q,response);renderResult(Q,response,false)}catch(e){console.error(e);b.disabled=false;alert('解答履歴の保存に失敗しました')}};
  wrap.querySelector('#review').onclick=()=>doReview(Q,wrap.querySelector('#review'));
}
function refreshPracticeFields(wrap,Q){
  if(!wrap)return;const values={};wrap.querySelectorAll('.fbInput').forEach(x=>values[x.dataset.k]=x.value);
  const host=wrap.querySelector('.fbFields');if(host)host.innerHTML=fieldsHtml(Q,values);
  bindPracticeBox(wrap,Q);syncButton(wrap)
}
function nextKey(rows){const used=new Set(rows.map(r=>String(r.key||'').trim().toUpperCase()));for(let i=0;i<26;i++){const k=String.fromCharCode(65+i);if(!used.has(k))return k}return `F${rows.length+1}`}
function adminRowsHtml(rows){return rows.map((r,i)=>`<div class="fbAdminRow" data-i="${i}"><input class="fbAdminKey" value="${esc(r.key)}" aria-label="解答キー"><input class="fbAdminLabel" value="${esc(r.label)}" aria-label="表示名"><button type="button" class="fbAdminRemove" title="削除">削除</button></div>`).join('')}
function openAdminEditor(box,Q){
  box.querySelector('.fbAdminPanel')?.remove();
  let rows=fieldsFor(Q).map(x=>({...x}));
  const panel=document.createElement('div');panel.className='fbAdminPanel';
  const draw=()=>{
    panel.innerHTML=`<div class="fbAdminHead"><b>解答欄の設定</b><span class="meta">問題原文は変更しません</span></div><div class="fbAdminCols"><span>キー</span><span>表示名</span><span></span></div><div class="fbAdminRows">${adminRowsHtml(rows)}</div><div class="fbAdminActions"><button type="button" class="fbAdminAdd">＋ 解答欄を追加</button><button type="button" class="fbAdminAuto">自動判定に戻す</button><span class="fbAdminStatus"></span><button type="button" class="fbAdminCancel">キャンセル</button><button type="button" class="fbAdminSave">保存</button></div>`;
    panel.querySelectorAll('.fbAdminRemove').forEach(b=>b.onclick=()=>{if(rows.length<=1){alert('解答欄は1つ以上必要です');return}rows.splice(Number(b.closest('.fbAdminRow').dataset.i),1);draw()});
    panel.querySelectorAll('.fbAdminKey').forEach(inp=>inp.oninput=()=>{const i=Number(inp.closest('.fbAdminRow').dataset.i),old=rows[i].key;rows[i].key=inp.value;const l=panel.querySelector(`.fbAdminRow[data-i="${i}"] .fbAdminLabel`);if(l&&rows[i].label===`[${old}]`){rows[i].label=`[${inp.value}]`;l.value=rows[i].label}});
    panel.querySelectorAll('.fbAdminLabel').forEach(inp=>inp.oninput=()=>{rows[Number(inp.closest('.fbAdminRow').dataset.i)].label=inp.value});
    panel.querySelector('.fbAdminAdd').onclick=()=>{const key=nextKey(rows);rows.push({key,label:`[${key}]`});draw()};
    panel.querySelector('.fbAdminCancel').onclick=()=>panel.remove();
    panel.querySelector('.fbAdminAuto').onclick=async()=>{
      if(!confirm('手動設定を解除して、問題文中の [A] [B] などから自動判定に戻しますか？'))return;
      const st=panel.querySelector('.fbAdminStatus');st.textContent='保存中…';
      const r=await window.qbSupabase.from('questions').update({answer_fields:null}).eq('id',qid(Q));
      if(r.error){st.textContent='保存失敗: '+r.error.message;return}
      Q.answer_fields=null;refreshPracticeFields(box,Q);panel.remove();window.dispatchEvent(new CustomEvent('qb-content-updated',{detail:{questionId:qid(Q),type:'fill-blank-fields'}}));
    };
    panel.querySelector('.fbAdminSave').onclick=async()=>{
      const clean=rows.map(r=>({key:String(r.key||'').trim(),label:String(r.label||'').trim()}));
      if(clean.some(r=>!r.key||!r.label)){alert('キーと表示名を入力してください');return}
      if(clean.some(r=>/^(note|order)$/i.test(r.key)||systemKey(r.key))){alert('そのキー名は解答欄には使用できません');return}
      if(new Set(clean.map(r=>r.key)).size!==clean.length){alert('解答キーが重複しています');return}
      const st=panel.querySelector('.fbAdminStatus'),sv=panel.querySelector('.fbAdminSave');sv.disabled=true;st.textContent='保存中…';
      const r=await window.qbSupabase.from('questions').update({answer_fields:clean}).eq('id',qid(Q));
      if(r.error){st.textContent='保存失敗: '+r.error.message;sv.disabled=false;return}
      Q.answer_fields=clean;refreshPracticeFields(box,Q);panel.remove();window.dispatchEvent(new CustomEvent('qb-content-updated',{detail:{questionId:qid(Q),type:'fill-blank-fields',fields:clean}}));
    };
  };
  draw();box.appendChild(panel)
}
async function ensureAdminButton(box,Q){
  if(!box||box.querySelector('.fbAdminEdit'))return;if(!(await isAdmin()))return;if(!box.isConnected||qid(q())!==qid(Q))return;
  const b=document.createElement('button');b.type='button';b.className='fbAdminEdit';b.textContent='✎ 解答欄を編集';b.onclick=()=>openAdminEditor(box,Q);box.querySelector('.fbTitleRow')?.appendChild(b)
}
async function enhancePractice(){
  if(screen()!=='practice')return;const Q=q();if(!Q||Q.answer_mode!=='fill_blank')return;await loadFieldConfig(Q);
  let wrap=document.querySelector('.fbBox');
  if(wrap){await ensureAdminButton(wrap,Q);return}
  const old=document.getElementById('showTextAnswer');if(!old)return;wrap=old.closest('.card')||old.parentElement;if(!wrap)return;
  wrap.className='card fbBox';wrap.innerHTML=`<div class="fbTitleRow"><div><div class="fbTitle">穴埋め・短答</div><div class="meta">自分の答えを入力してから答え合わせしてください。自動採点はしません。</div></div></div><div class="fbFields">${fieldsHtml(Q)}</div><button id="answer" class="primary" disabled>答え合わせ</button><button id="review" class="secondary" style="margin-top:8px">解答せずに解説を見る</button>`;
  bindPracticeBox(wrap,Q);await ensureAdminButton(wrap,Q)
}
async function patchProblemStatuses(){if(screen()!=='problems')return;const qs=window.QB_QUESTIONS||[],fills=qs.filter(x=>x.answer_mode==='fill_blank');if(!fills.length)return;const c=await userCtx();if(!c)return;const r=await c.sb.from('user_question_state').select('question_id,has_answered,last_is_correct').eq('user_id',c.u.id).in('question_id',fills.map(x=>x.id));if(r.error)return;const map=new Map((r.data||[]).map(x=>[x.question_id,x])),rows=[...document.querySelectorAll('#view .problem')];qs.forEach((Q,i)=>{if(Q.answer_mode!=='fill_blank')return;const st=map.get(Q.id);if(!st?.has_answered||st.last_is_correct!==null)return;const m=rows[i]?.querySelector('.meta');if(!m)return;m.textContent=m.textContent.replace(/｜[^｜]*$/,'｜解答済み')})}
function dockCompat(e){const Q=q();if(screen()!=='practice'||Q?.answer_mode!=='fill_blank')return;const btn=e.target?.closest?.('.qbDockBtn,[data-a]');if(!btn)return;const a=btn.dataset?.a;if(a==='review'){e.preventDefault();e.stopPropagation();const r=document.getElementById('review');if(r&&!r.disabled)r.click()}else if(a==='submit'){const aBtn=document.getElementById('answer');if(aBtn&&!aBtn.disabled){e.preventDefault();e.stopPropagation();aBtn.click()}}}
function schedule(){clearTimeout(timer);timer=setTimeout(()=>{enhancePractice().catch(console.error);patchProblemStatuses().catch(console.error)},20)}
function css(){if(document.getElementById('fbCssV2'))return;const s=document.createElement('style');s.id='fbCssV2';s.textContent=`.fbBox{margin-top:12px}.fbTitleRow{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}.fbTitle{font-weight:900;font-size:15px;margin-bottom:4px}.fbAdminEdit{flex:0 0 auto;border:1px solid #cfe1ef;background:#fff;color:#126fb3;border-radius:8px;padding:6px 9px;font-size:11px;font-weight:900}.fbFields{display:grid;gap:8px;margin:12px 0}.fbField{display:grid;grid-template-columns:minmax(44px,auto) 1fr;align-items:center;gap:8px;font-weight:900}.fbInput{width:100%;min-height:46px;border:1.5px solid #cfd8e3;border-radius:11px;padding:9px 11px;font:inherit;background:#fff;outline:none}.fbInput:focus{border-color:#126fb3;box-shadow:0 0 0 2px #126fb322}.fbAnswerGroup{margin-top:12px;padding-top:10px;border-top:1px solid #dce3ec}.fbAnswerLine{display:grid;grid-template-columns:minmax(44px,auto) 1fr;gap:8px;margin-top:6px;line-height:1.5}.fbExtra{margin-top:8px}.resultcard.fillblank{border:2px solid #126fb3;background:#f0f7fc}.fbAdminPanel{margin-top:12px;padding:12px;border:1px solid #cfe1ef;background:#f8fbff;border-radius:12px}.fbAdminHead{display:flex;justify-content:space-between;gap:8px;align-items:center}.fbAdminCols,.fbAdminRow{display:grid;grid-template-columns:80px 1fr 56px;gap:7px;align-items:center}.fbAdminCols{font-size:10px;color:#6f7786;margin-top:10px}.fbAdminRow{margin-top:7px}.fbAdminKey,.fbAdminLabel{width:100%;border:1px solid #cfd8e3;border-radius:8px;padding:8px;font:inherit;background:#fff}.fbAdminRemove{border:1px solid #e1b7b7;background:#fff;color:#b22;border-radius:8px;padding:8px 5px;font-size:11px;font-weight:900}.fbAdminActions{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-top:10px}.fbAdminAdd,.fbAdminAuto,.fbAdminCancel,.fbAdminSave{border-radius:8px;padding:8px 10px;font-weight:900;font-size:11px}.fbAdminAdd,.fbAdminAuto,.fbAdminCancel{border:1px solid #dce3ec;background:#fff;color:#126fb3}.fbAdminSave{border:0;background:#126fb3;color:#fff}.fbAdminStatus{font-size:11px;color:#6f7786;flex:1;min-width:70px}@media(max-width:520px){.fbAdminCols,.fbAdminRow{grid-template-columns:64px 1fr 52px}.fbTitleRow{align-items:center}}`;document.head.appendChild(s)}
function boot(){css();schedule();['qb-screen-change','qb-retry-current','qb-app-ready','qb-content-updated'].forEach(ev=>window.addEventListener(ev,schedule));document.addEventListener('click',dockCompat,true);const v=document.getElementById('view');if(v)new MutationObserver(schedule).observe(v,{childList:true,subtree:true})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
