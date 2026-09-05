(()=>{
  const original=window.qbOpenSubjects;
  if(typeof original!=='function') return;
  window.qbOpenSubjects=()=>{
    if(window.QB_DB_READY) return original();
    const V=document.getElementById('view');
    const C=document.getElementById('crumb');
    if(C) C.textContent='M4 ＞ 科目を選択';
    if(V) V.innerHTML='<div class="card"><div class="title">問題を読み込み中…</div><div class="sub">Supabaseから和漢医学概論の問題データを取得しています。</div></div>';
    let tries=0;
    const timer=setInterval(()=>{
      tries++;
      if(window.QB_DB_READY){
        clearInterval(timer);
        original();
      }else if(tries>=100){
        clearInterval(timer);
        if(V) V.innerHTML='<div class="card"><div class="title">問題データを取得できませんでした</div><div class="sub">ページを再読み込みしてください。改善しない場合は接続状態を確認します。</div></div>';
      }
    },100);
  };
})();