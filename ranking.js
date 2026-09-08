(()=>{
'use strict';
const SUPABASE_URL='https://qebvqcubtyfgaakrzbzh.supabase.co';
const SUPABASE_KEY='sb_publishable_XdCnuTSA6bDh6vB04MlnPw_HDxJgVtZ';
const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY),root=document.getElementById('app');
let mode='daily',timer=null,last=null,viewerId=null,viewerAvatarPath=null,viewerName='あなた';
const OTHER='#9aa4b2';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const avatarUrl=p=>p?sb.storage.from('user-avatars').getPublicUrl(p).data.publicUrl:'';
const isMe=x=>!!x&&(!!x.is_me||(viewerId&&String(x.user_id||'')===String(viewerId)));
const viewerHasAvatar=()=>!!viewerAvatarPath;
function visual(x){
  const me=isMe(x),name=x?.display_name||'U',initial=[...name][0]||'U';
  if(me){const u=viewerHasAvatar()?avatarUrl(viewerAvatarPath):'';return {url:u,fill:'var(--accent)',initial,me:true}}
  if(viewerHasAvatar()){
    const u=avatarUrl(x?.avatar_path);return {url:u,fill:'var(--accent)',initial,me:false}
  }
  return {url:'',fill:OTHER,initial,me:false}
}
function avatarHtml(x,extra=''){
  const v=visual(x),style=v.url?`background-image:url('${esc(v.url)}');background-color:transparent;color:transparent`:`background:${v.fill}`;
  return `<span class="avatar ${v.me?'qbRankMeAvatar':''} ${extra}" style="${style}">${esc(v.initial)}</span>`
}
function rankRow(x,forcedMe=false){
  const me=forcedMe||isMe(x),y=forcedMe&&!x?.is_me?{...x,is_me:true}:x;
  return `<div class="rankRow ${me?'meRow':''}"><div class="rankNo">${esc(x?.rank||'-')}</div>${avatarHtml(y)}<div><b>${esc(x?.display_name||'ユーザー')}</b>${me?'<div class="sub">あなた</div>':''}</div><div class="attempts">${Number(x?.attempts||0)}回</div></div>`
}
function leaderboard(d){
  const top=(d.top5||[]).map(x=>rankRow(x)).join('')||'<div class="muted">まだ演習記録がありません。</div>';
  const me=d.me?rankRow({...d.me,is_me:true},true):'';
  return `<div class="card"><div class="sectionTitle">① 演習数ランキング</div><div class="tabs"><button class="tab ${mode==='hourly'?'on':''}" data-mode="hourly">今の1時間</button><button class="tab ${mode==='daily'?'on':''}" data-mode="daily">今日</button></div>${top}${me}</div>`
}
function jitter(id){let h=0;for(const ch of String(id||''))h=((h*31)+ch.charCodeAt(0))>>>0;return (h%17)-8}
function svgUser(u,x,y,r,id){
  const v=visual(u);let s=`<defs><clipPath id="${id}"><circle cx="${x}" cy="${y}" r="${r}"/></clipPath></defs>`;
  if(v.url)s+=`<image href="${esc(v.url)}" x="${x-r}" y="${y-r}" width="${r*2}" height="${r*2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>`;
  else{s+=`<circle cx="${x}" cy="${y}" r="${r}" style="fill:${v.fill}"/>`;s+=`<text x="${x}" y="${y+3.5}" text-anchor="middle" font-size="${v.me?9:7}" font-weight="800" fill="#fff">${esc(v.initial)}</text>`}
  s+=`<circle cx="${x}" cy="${y}" r="${r}" fill="none" ${v.me?'style="stroke:var(--accent)"':'stroke="#fff"'} stroke-width="${v.me?3:1.5}"/>`;
  return s
}
function pointPlotSvg(buckets,kind){
  const W=700,H=190,L=16,R=18,T=16,B=34,iw=W-L-R,ih=H-T-B,n=Math.max(1,buckets.length),step=n>1?iw/(n-1):iw;let max=1;
  for(const b of buckets)for(const u of (b.users||[]))max=Math.max(max,Number(u.attempts||0));
  const yp=v=>T+ih-(Number(v||0)/max)*ih;let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${kind==='hour'?'時間別':'日別'}のユーザー演習分布"><line x1="${L}" y1="${T+ih}" x2="${W-R}" y2="${T+ih}" stroke="#dce3ec" stroke-width="1.5"/>`;
  for(let i=0;i<n;i++){
    const b=buckets[i]||{},baseX=L+i*step,dt=new Date(b.bucket);let label='';
    if(kind==='hour')label=(i%3===0||i===n-1)?`${dt.getHours()}時`:'';else label=`${dt.getMonth()+1}/${dt.getDate()}`;
    if(label)s+=`<text x="${baseX}" y="${H-8}" text-anchor="middle" font-size="10" fill="#6f7786">${esc(label)}</text>`;
    const users=(b.users||[]).slice().sort((a,b)=>Number(isMe(a))-Number(isMe(b)));
    for(let j=0;j<users.length;j++){
      const u=users[j],me=isMe(u),r=me?12:9,x=Math.max(L+r,Math.min(W-R-r,baseX+(me?0:jitter(u.user_id)))),y=Math.max(T+r,Math.min(T+ih-r,yp(u.attempts))),id=`p${kind}${i}_${j}`;
      s+=svgUser(u,x,y,r,id)+`<title>${esc(u.display_name||'ユーザー')}：${Number(u.attempts||0)}回</title>`
    }
  }
  return s+'</svg>'
}
function legend(){
  const u=viewerHasAvatar()?avatarUrl(viewerAvatarPath):'',initial=[...String(viewerName||'U')][0]||'U';
  const me=u?`<span class="legendAvatar qbLegendMe" style="background-image:url('${esc(u)}')"></span>`:`<span class="legendAvatar qbLegendMe" style="background:var(--accent)">${esc(initial)}</span>`;
  return `<div class="legend"><span>${me}あなた</span><span><span class="legendAvatar qbLegendOther" style="background:${OTHER}"></span>その他のユーザー</span></div>`
}
function activity(d){return `<div class="card"><div class="sectionTitle">② 演習推移</div><div class="sub">各アイコン＝1ユーザー。縦位置＝その時間・日の「解答する」回数。自分のアイコンを最前面に表示します。</div><b style="display:block;margin-top:10px">時間別（直近24時間）</b><div class="barScroll activityScroll">${pointPlotSvg(d.hourly_users||[],'hour')}</div><b style="display:block;margin-top:14px">日別（直近14日）</b><div class="barScroll activityScroll">${pointPlotSvg(d.daily_users||[],'day')}</div>${legend()}</div>`}
function scatterSvg(points){
  const W=700,H=440,L=55,R=24,T=28,B=50,iw=W-L-R,ih=H-T-B,total=Math.max(1,...points.map(p=>Number(p.total||0)));const xp=v=>L+Number(v||0)/total*iw,yp=v=>T+(100-Number(v==null?0:v))/100*ih;
  let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="全体進捗と正解率"><rect x="${L}" y="${T}" width="${iw}" height="${ih}" fill="#fff" stroke="#cfd8e3"/>`;
  for(let y=0;y<=100;y+=20)s+=`<line x1="${L}" y1="${yp(y)}" x2="${W-R}" y2="${yp(y)}" stroke="#e9edf2"/><text x="${L-10}" y="${yp(y)+4}" text-anchor="end" font-size="12" fill="#6f7786">${y}</text>`;
  for(let i=0;i<=4;i++){const v=Math.round(total*i/4);s+=`<line x1="${xp(v)}" y1="${T}" x2="${xp(v)}" y2="${H-B}" stroke="#eef1f5"/><text x="${xp(v)}" y="${H-B+20}" text-anchor="middle" font-size="12" fill="#6f7786">${v}</text>`}
  s+=`<text x="12" y="18" font-size="12" fill="#6f7786">◎○率(%)</text><text x="${W-R}" y="${H-10}" text-anchor="end" font-size="12" fill="#6f7786">演習済み問題数 / 全${total}問</text>`;
  points.slice().sort((a,b)=>Number(isMe(a))-Number(isMe(b))).forEach((p,i)=>{
    if(p.rate==null)return;const x=xp(p.attempted),y=yp(p.rate),r=isMe(p)?18:13,id=`clip${i}`;
    s+=svgUser(p,x,y,r,id)+`<title>${esc(p.display_name||'ユーザー')}：${p.attempted}/${p.total}問・${p.rate}%</title>`
  });
  return s+'</svg>'
}
function scatter(d){return `<div class="card"><div class="sectionTitle">③ 全体進捗 × 正解率</div><div class="sub">横軸＝演習済み問題数、縦軸＝最新自己評価の◎・○率（「-」は除外）</div><div class="chartWrap">${scatterSvg(d.scatter||[])}</div>${legend()}</div>`}
function alignCurrent(){requestAnimationFrame(()=>document.querySelectorAll('.activityScroll').forEach(x=>{x.scrollLeft=x.scrollWidth-x.clientWidth}))}
function setViewer(d){
  const me=d?.me||[...(d?.scatter||[]),...(d?.hourly_users||[]).flatMap(x=>x.users||[]),...(d?.daily_users||[]).flatMap(x=>x.users||[])].find(x=>x?.is_me)||null;
  viewerId=me?.user_id||null;viewerAvatarPath=me?.avatar_path||null;viewerName=me?.display_name||'あなた'
}
function render(d){
  last=d;setViewer(d);root.innerHTML=leaderboard(d)+activity(d)+scatter(d)+`<div class="stamp">最終更新 ${new Date().toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</div>`;
  root.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;load()});alignCurrent()
}
async function load(){
  const {data:{session}}=await sb.auth.getSession();if(!session){location.href='./index.html';return}
  const r=await sb.rpc('get_ranking_dashboard',{p_mode:mode});if(r.error){root.innerHTML=`<div class="card error">ランキングを読み込めませんでした：${esc(r.error.message)}</div>`;return}render(r.data||{})
}
async function init(){
  await load();timer=setInterval(load,5000);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInterval(timer);timer=null}else if(!timer){load();timer=setInterval(load,5000)}});
  window.addEventListener('qb-theme-change',()=>{if(last)render(last)})
}
init();
})();