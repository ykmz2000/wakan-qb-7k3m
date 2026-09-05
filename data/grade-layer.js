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
    const originalHome=home.onclick;
    home.textContent='学年一覧';
    home.onclick=()=>renderGrades();
  }
});
