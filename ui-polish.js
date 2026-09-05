(()=>{
'use strict';
let initialGradeShown=false;
function cleanUserFacingText(root=document){
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  const nodes=[];
  while(walker.nextNode())nodes.push(walker.currentNode);
  for(const n of nodes){
    let t=n.nodeValue||'';
    if(t.includes('Supabase収録'))t=t.replace(/Supabase収録\s*/g,'収録 ');
    if(t.includes('Supabaseの正式データを表示しています。'))t=t.replace('Supabaseの正式データを表示しています。','学習する単元を選んでください。');
    if(t.includes('Supabaseから問題と学習履歴を取得しています。'))t=t.replace('Supabaseから問題と学習履歴を取得しています。','問題と学習履歴を読み込んでいます。');
    n.nodeValue=t;
  }
}
function showInitialGradeScreen(){
  if(initialGradeShown||!window.QB_DB_READY||typeof window.showGradeScreen!=='function')return false;
  initialGradeShown=true;
  window.showGradeScreen();
  cleanUserFacingText();
  return true;
}
function tick(){cleanUserFacingText();showInitialGradeScreen()}
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',()=>{
    const mo=new MutationObserver(()=>requestAnimationFrame(tick));
    mo.observe(document.body,{childList:true,subtree:true,characterData:true});
    const timer=setInterval(()=>{tick();if(initialGradeShown)clearInterval(timer)},100);
    setTimeout(()=>clearInterval(timer),15000);
  });
}else{
  const mo=new MutationObserver(()=>requestAnimationFrame(tick));
  mo.observe(document.body,{childList:true,subtree:true,characterData:true});
  const timer=setInterval(()=>{tick();if(initialGradeShown)clearInterval(timer)},100);
  setTimeout(()=>clearInterval(timer),15000);
}
})();
