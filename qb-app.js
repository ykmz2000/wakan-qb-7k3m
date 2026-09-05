(()=>{
'use strict';
const CORE_URL='https://cdn.jsdelivr.net/gh/ykmz2000/wakan-qb-7k3m@a2d2bc55423e35c25e5e16db3173183a32d93851/qb-app.js';
const CORE_CACHE_KEY='qb_core_a2d2bc55423e';
const raw=(new URLSearchParams(location.search).get('subject')||'wakan').trim();
const subjectSlug=/^[a-z0-9][a-z0-9-]*$/i.test(raw)?raw:'wakan';
function run(code){
  const marker="const SUBJECT_SLUG='wakan';";
  if(!code.includes(marker))throw new Error('QB core subject marker not found');
  code=code.replace(marker,`const SUBJECT_SLUG=${JSON.stringify(subjectSlug)};`);
  (0,eval)(code);
  window.dispatchEvent(new CustomEvent('qb-core-loaded',{detail:{subjectSlug}}));
}
try{
  const cached=localStorage.getItem(CORE_CACHE_KEY);
  if(cached){run(cached);return}
}catch(e){}
fetch(CORE_URL)
  .then(r=>{if(!r.ok)throw new Error(`QB core load failed: ${r.status}`);return r.text()})
  .then(code=>{try{localStorage.setItem(CORE_CACHE_KEY,code)}catch(e){};run(code)})
  .catch(e=>{console.error(e);const v=document.getElementById('view');if(v)v.innerHTML='<div class="card"><div class="title">読み込みエラー</div><div class="sub">アプリ本体を読み込めませんでした。</div></div>'});
})();
