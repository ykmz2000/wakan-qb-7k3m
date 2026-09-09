/* Per-user answer history. An explicit attempt ID binds ratings to this answer;
   review-only visits never update an earlier attempt. No question/media writes. */
(()=>{
'use strict';
const values=['◎','○','△','×','-'],bindings=new WeakMap();
let active=null;
const idOf=q=>String(q?.id||q?.dbId||'');
const current=()=>{try{return window.pq?.()||null}catch{return null}};
const dateFormat=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function dateText(value){const d=new Date(value);return value&&!Number.isNaN(+d)?dateFormat.format(d):'日時不明'}
function responseText(row){
  const response=row.response_payload;
  if(response&&typeof response==='object'&&!Array.isArray(response))return Object.entries(response).map(([k,v])=>`${k}：${Array.isArray(v)?v.join('・'):String(v??'')}`).join('\n');
  if(response!=null)return String(response);
  return (row.selected_choice_keys||[]).join('・')||'回答記録なし';
}
function ratingOf(row){const r=row.attempt_self_ratings;return Array.isArray(r)?r[0]||null:r||null}
function node(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el}
function css(){
  if(document.getElementById('qbAnswerHistoryCss'))return;
  const style=node('style');style.id='qbAnswerHistoryCss';style.textContent=`
.qbAttemptCurrent,.qbAttemptPast{font-size:13px;line-height:1.6}.qbAttemptRow{padding:10px 0;border-top:1px solid var(--line);min-width:0}.qbAttemptCurrent>.qbAttemptRow{border-top:0;padding-bottom:0}.qbAttemptHead{display:flex;align-items:baseline;justify-content:space-between;gap:8px;flex-wrap:wrap}.qbAttemptLabel{font-weight:800}.qbAttemptTime{font-size:11px;color:var(--muted)}.qbAttemptAnswer{white-space:pre-wrap;overflow-wrap:anywhere;margin-top:4px}.qbAttemptResult{display:flex;gap:14px;flex-wrap:wrap;margin-top:4px}.qbAttemptCurrent .qbAttemptLabel{color:var(--accent)}.qbAttemptNotice{font-size:12px;color:var(--muted);white-space:pre-wrap;margin-top:6px}.qbAttemptPast{margin-top:10px}.qbAttemptRetry{font:inherit;color:var(--accent);background:var(--card);border:1px solid var(--line);border-radius:8px;min-height:44px;padding:6px 12px;margin-top:6px}.qbSharedRating [data-qb-rate]:disabled{opacity:.5}
`;document.head.append(style);
}
function sessionFor(root,q){return active?.root===root&&active.questionId===idOf(q)?active:null}
function refresh(){const root=document.getElementById('ans'),d=root?.querySelector('.qbSharedRating'),q=current();if(root&&d&&q)bindRating(root,q,d)}
function review(q,userId){active={root:document.getElementById('ans'),questionId:idOf(q),userId,mode:'review'};return active}
function record(q,payload,initialRating=null){
  const sb=window.qbSupabase;
  const s={root:document.getElementById('ans'),questionId:idOf(q),userId:payload.user_id,mode:'answer',row:{...payload},rating:initialRating,source:initialRating?'auto':null,pending:true,error:null,ratingError:null};
  active=s;
  s.ready=(async()=>{
    try{
      const result=await sb.from('attempts').insert(payload).select('id').single();
      if(result.error)throw result.error;if(!result.data?.id)throw new Error('回答履歴のIDを取得できませんでした');
      s.row.id=result.data.id;
      try{const r=await sb.rpc('save_attempt_self_rating',{p_attempt_id:s.row.id,p_rating:initialRating,p_source:'auto'});if(r.error)throw r.error}
      catch(e){s.ratingError=e;}
      return result;
    }catch(e){s.error=e;return{data:null,error:e}}
    finally{s.pending=false;if(active===s)refresh()}
  })();
  return s.ready;
}
function rowElement(row,label,record){
  const el=node('div','qbAttemptRow'),head=node('div','qbAttemptHead');
  head.append(node('span','qbAttemptLabel',label),node('time','qbAttemptTime',dateText(row.answered_at)+'（日本時間）'));
  const time=head.querySelector('time');if(row.answered_at)time.dateTime=row.answered_at;
  el.append(head,node('div','qbAttemptAnswer','自分の回答：'+responseText(row)));
  const line=node('div','qbAttemptResult');
  line.append(node('span','',row.is_correct===true?'判定：正解':row.is_correct===false?'判定：不正解':'判定：自動採点なし'));
  line.append(node('span','qbAttemptRating','自己評価：'+(record?record.rating??'未評価':'記録なし')+(record?.rating&&record.rating_source==='auto'?'（自動設定）':'')));
  el.append(line);return el;
}
function valid(b){return bindings.get(b.d)===b&&b.d.isConnected&&document.getElementById('ans')===b.root&&!b.root.classList.contains('hidden')&&idOf(current())===b.questionId}
function drawCurrent(b){
  const s=b.session;b.current.replaceChildren();
  if(s?.mode==='answer'){
    b.current.append(rowElement(s.row,'今回',{rating:s.rating,rating_source:s.source}));
    if(s.pending)b.current.append(node('div','qbAttemptNotice','回答履歴を保存中…'));
    if(s.error)b.current.append(node('div','qbAttemptNotice','今回の回答履歴を保存できませんでした。'));
    if(s.ratingError)b.current.append(node('div','qbAttemptNotice','自己評価の保存に失敗しました。評価ボタンを押すと再保存できます。'));
  }else b.current.append(node('div','qbAttemptNotice','今回は解説のみ。過去の回答・自己評価は変更しません。'));
}
function setButtons(b,value){for(const btn of b.buttons){btn.classList.toggle('on',btn.dataset.qbRate===value);btn.setAttribute('aria-pressed',String(btn.dataset.qbRate===value))}}
function enable(b,on){for(const btn of b.buttons)btn.disabled=!on}
async function loadPast(b){
  const target=b.past;target.replaceChildren(node('div','qbAttemptNotice','回答履歴を読み込み中…'));
  try{
    let query=b.sb.from('attempts').select('id,selected_choice_keys,is_correct,response_payload,answered_at,attempt_self_ratings(rating,rating_source,rated_at)').eq('user_id',b.userId).eq('question_id',b.questionId);
    if(b.session?.mode==='answer'){
      if(b.session.row.id)query=query.lt('id',b.session.row.id);
      else if(b.session.pending)return;
    }
    const r=await query.order('id',{ascending:false}).limit(2);if(r.error)throw r.error;
    if(!valid(b))return;
    target.replaceChildren();(r.data||[]).forEach((row,i)=>target.append(rowElement(row,i===0?'前回':'前々回',ratingOf(row))));
    if(!r.data?.length)target.append(node('div','qbAttemptNotice','過去の回答はありません。'));
  }catch(e){
    if(!valid(b))return;target.replaceChildren(node('div','qbAttemptNotice','回答履歴を取得できませんでした。'));
    const retry=node('button','qbAttemptRetry','履歴を再読み込み');retry.type='button';retry.onclick=()=>loadPast(b);target.append(retry);
  }
}
async function saveRating(b,value){
  if(!valid(b)||b.busy||!values.includes(value))return;
  b.busy=true;enable(b,false);b.msg.textContent='保存中…';
  try{
    const auth=await b.sb.auth.getUser();if(auth.error||auth.data?.user?.id!==b.userId)throw new Error('ログイン状態が変わりました');
    const s=b.session;
    if(s?.mode==='answer'){
      await s.ready;if(s.error||!s.row.id)throw new Error('回答履歴が保存されていません');
      const r=await b.sb.rpc('save_attempt_self_rating',{p_attempt_id:s.row.id,p_rating:value,p_source:'manual'});if(r.error)throw r.error;
      s.rating=value;s.source='manual';s.ratingError=null;
    }else{
      const r=await b.sb.from('question_ratings').upsert({user_id:b.userId,question_id:b.questionId,rating:value,updated_at:new Date().toISOString()},{onConflict:'user_id,question_id'});if(r.error)throw r.error;
    }
    b.value=value;
    if(valid(b)){setButtons(b,value);drawCurrent(b);b.msg.textContent='保存しました';}
  }catch(e){if(valid(b)){setButtons(b,b.value);b.msg.textContent='保存できませんでした：'+(e.message||e)}}
  finally{b.busy=false;if(valid(b))enable(b,!b.session?.error)}
}
function bindRating(root,q,d){
  if(root.classList.contains('hidden')||!root.querySelector('.resultcard'))return;
  css();const session=sessionFor(root,q),old=bindings.get(d);
  if(old&&old.session===session&&old.questionId===idOf(q)){
    if(old.pending!==!!session?.pending){old.pending=!!session?.pending;drawCurrent(old)}return;
  }
  old?.current.remove();old?.past.remove();
  const b={root,d,questionId:idOf(q),session,pending:!!session?.pending,current:node('div','qbAttemptCurrent'),past:node('div','qbAttemptPast'),buttons:[...d.querySelectorAll('[data-qb-rate]')],msg:d.querySelector('.qbRateMsg'),sb:window.qbSupabase,value:null,busy:false};
  bindings.set(d,b);
  d.querySelector('.ratings').before(b.current);d.append(b.past);
  drawCurrent(b);enable(b,false);setButtons(b,session?.rating??null);
  for(const btn of b.buttons)btn.onclick=()=>saveRating(b,btn.dataset.qbRate);
  (async()=>{
    try{
      const auth=await b.sb.auth.getUser();if(auth.error||!auth.data?.user)throw new Error('ログイン情報を確認できませんでした');b.userId=auth.data.user.id;
      if(session?.userId&&session.userId!==b.userId)throw new Error('ログイン状態が変わりました');
      if(session?.mode==='answer'){
        await session.ready;
        if(!valid(b))return;
        b.value=session.rating;b.pending=false;drawCurrent(b);setButtons(b,b.value);enable(b,!session.error);
        b.msg.textContent=session.error?'回答履歴が保存されていません':session.ratingError?'自己評価を再保存してください':session.rating?'自動設定：'+session.rating+'　（必要なら変更できます）':'今回の自己評価を選んでください';
      }else{
        if(!valid(b))return;
        const r=await b.sb.from('question_ratings').upsert({user_id:b.userId,question_id:b.questionId,rating:'-',updated_at:new Date().toISOString()},{onConflict:'user_id,question_id'});if(r.error)throw r.error;
        if(!valid(b))return;b.value='-';setButtons(b,'-');enable(b,true);b.msg.textContent='解説のみの自己評価です。過去の回答には反映しません。';
      }
      await loadPast(b);
    }catch(e){if(valid(b)){b.msg.textContent='自己評価を準備できませんでした：'+(e.message||e);b.past.replaceChildren(node('div','qbAttemptNotice','回答履歴を取得できませんでした。'))}}
  })();
}
window.QBAnswerHistory={record,review,bindRating};
window.addEventListener('qb-answer-shown',refresh);
window.addEventListener('qb-retry-current',()=>{active=null});
window.addEventListener('qb-screen-change',()=>{if(window.qbGetScreen?.()!=='practice')active=null});
})();
