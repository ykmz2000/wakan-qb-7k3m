(()=>{
'use strict';
const CORE_URL='https://cdn.jsdelivr.net/gh/ykmz2000/wakan-qb-7k3m@a2d2bc55423e35c25e5e16db3173183a32d93851/qb-app.js';
const raw=(new URLSearchParams(location.search).get('subject')||'wakan').trim();
const subjectSlug=/^[a-z0-9][a-z0-9-]*$/i.test(raw)?raw:'wakan';
fetch(CORE_URL,{cache:'no-store'})
  .then(r=>{if(!r.ok)throw new Error(`QB core load failed: ${r.status}`);return r.text()})
  .then(code=>{
    const marker="const SUBJECT_SLUG='wakan';";
    if(!code.includes(marker))throw new Error('QB core subject marker not found');
    code=code.replace(marker,`const SUBJECT_SLUG=${JSON.stringify(subjectSlug)};`);
    (0,eval)(code);
    window.dispatchEvent(new CustomEvent('qb-core-loaded',{detail:{subjectSlug}}));
  })
  .catch(e=>{console.error(e);const v=document.getElementById('view');if(v)v.innerHTML='<div class="card"><div class="title">読み込みエラー</div><div class="sub">アプリ本体を読み込めませんでした。</div></div>'});
})();
