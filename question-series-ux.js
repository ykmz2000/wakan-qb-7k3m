(()=>{
const seriesMap={
  '2025-029':['2025-029','2025-030'],
  '2025-030':['2025-029','2025-030'],
  '2025-031':['2025-031','2025-032','2025-033'],
  '2025-032':['2025-031','2025-032','2025-033'],
  '2025-033':['2025-031','2025-032','2025-033'],
  '2025-034':['2025-034','2025-035'],
  '2025-035':['2025-034','2025-035'],
  '2025-038':['2025-038','2025-039'],
  '2025-039':['2025-038','2025-039'],
  '2025-042':['2025-042','2025-043'],
  '2025-043':['2025-042','2025-043'],
  '2025-044':['2025-044','2025-045','2025-046','2025-047'],
  '2025-045':['2025-044','2025-045','2025-046','2025-047'],
  '2025-046':['2025-044','2025-045','2025-046','2025-047'],
  '2025-047':['2025-044','2025-045','2025-046','2025-047']
};
window.QB_SERIES_MAP=seriesMap;

function uniq(a){return [...new Set(a)]}
function expandLinkedSelection(){
  try{
    if(!state||!Array.isArray(state.selected))return;
    const out=[];
    state.selected.forEach(id=>{const block=seriesMap[id]||[id];block.forEach(x=>out.push(x))});
    state.selected=uniq(out);
    if(typeof save==='function')save();
  }catch(e){}
}
function shuffleBlocks(ids){
  const selected=new Set(ids),blocks=[],seen=new Set();
  ids.forEach(id=>{
    if(seen.has(id))return;
    const full=seriesMap[id];
    if(full){
      const block=full.filter(x=>selected.has(x));
      block.forEach(x=>seen.add(x));
      if(block.length)blocks.push(block);
    }else{seen.add(id);blocks.push([id])}
  });
  for(let i=blocks.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[blocks[i],blocks[j]]=[blocks[j],blocks[i]]}
  return blocks.flat();
}

function patchShuffle(){
  try{
    if(typeof shuffle==='function'&&!shuffle.__seriesPatched){
      const f=function(a){return shuffleBlocks(a)};f.__seriesPatched=true;shuffle=f;
    }
  }catch(e){}
}
function patchStart(){
  const b=document.getElementById('start');
  if(!b||b.dataset.seriesPatched)return;
  b.dataset.seriesPatched='1';
  b.addEventListener('click',expandLinkedSelection,true);
}
function patchNavigation(){
  const brand=document.querySelector('.brand');
  if(brand&&!brand.dataset.navPatched){
    brand.dataset.navPatched='1';brand.style.cursor='pointer';brand.title='学年一覧へ戻る';
    brand.addEventListener('click',()=>{try{if(typeof showGradeScreen==='function')return showGradeScreen()}catch(e){}location.href=location.pathname});
  }
  const h=document.getElementById('home');
  if(h){
    const s=(typeof state!=='undefined'&&state.screen)||'';
    if(s==='subjects')h.textContent='学年一覧';
    else if(s==='units')h.textContent='M4 科目一覧';
    else if(s==='problems'||s==='practice')h.textContent='和漢医学概論 単元一覧';
  }
}
function addSeriesBadge(){
  try{
    if(typeof pq!=='function')return;const q=pq();if(!q||!seriesMap[q.id])return;
    const submit=document.getElementById('submit');if(!submit||document.getElementById('seriesBadge'))return;
    const group=seriesMap[q.id],idx=group.indexOf(q.id)+1;
    const d=document.createElement('div');d.id='seriesBadge';d.className='badge gray';d.style.marginTop='8px';d.textContent=`連続問題 ${idx}/${group.length}`;
    submit.insertAdjacentElement('beforebegin',d);
  }catch(e){}
}
function tick(){patchShuffle();patchStart();patchNavigation();addSeriesBadge()}
window.addEventListener('load',tick);
document.addEventListener('DOMContentLoaded',()=>{const mo=new MutationObserver(tick);mo.observe(document.body,{childList:true,subtree:true});tick()});
})();