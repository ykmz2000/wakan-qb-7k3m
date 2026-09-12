/* A draft page order: originals and overlays are changed only on Apply. */
(()=>{
'use strict';
async function open({count,render}){
 const modal=document.createElement('div');modal.className='qbPdfModal qbPdfOrganizer';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','ページを並べ替え・削除');
 modal.innerHTML='<section class="qbPdfPanel"><header class="qbPdfHead"><b>ページを並べ替え・削除</b><button data-organize="cancel">キャンセル</button><button data-organize="apply">変更を適用</button></header><p class="qbPdfOrganizeHint">画像をタップして選択。ドラッグ欄を動かして並べ替えます。</p><div class="qbPdfOrganizeActions"><span role="status"></span><button data-organize="all">すべて選択</button><button data-organize="delete">選択したページを削除</button><button data-organize="undo">元に戻す</button></div><div class="qbPdfOrganizeGrid" aria-label="ページ一覧"></div></section>';
 const origin=document.activeElement,back=[...document.body.children].map(n=>[n,n.inert]);back.forEach(([n])=>n.inert=true);document.body.append(modal);
 const grid=modal.querySelector('.qbPdfOrganizeGrid'),status=modal.querySelector('[role=status]'),get=name=>modal.querySelector('[data-organize='+name+']'),cards=new Map(),selected=new Set(),history=[];let order=Array.from({length:count},(_,i)=>i),closed=false,drag=null,resolve;const result=new Promise(r=>resolve=r);
 function finish(value){closed=true;modal.remove();back.forEach(([n,v])=>{if(n.isConnected)n.inert=v});origin?.isConnected&&origin.focus({preventScroll:true});resolve(value)}
 function draw(){for(const id of order){const card=cards.get(id);grid.append(card);card.querySelector('.qbPdfOrganizeSelect').setAttribute('aria-pressed',String(selected.has(id)));card.querySelector('.qbPdfOrganizeNumber').textContent=`${order.indexOf(id)+1}ページ`;card.dataset.selected=String(selected.has(id))}for(const [id,card] of cards)if(!order.includes(id))card.remove();status.textContent=`${order.length}ページ · ${selected.size}ページ選択`;get('delete').disabled=!selected.size||selected.size===order.length;get('undo').disabled=!history.length;get('all').textContent=selected.size===order.length?'選択を解除':'すべて選択'}
 function move(id,target){const from=order.indexOf(id),to=order.indexOf(target);if(from<0||to<0||from===to)return;history.push([...order]);order.splice(from,1);order.splice(to,0,id);draw();cards.get(id).querySelector('.qbPdfOrganizeHandle').focus({preventScroll:true})}
 for(let id=0;id<count;id++){
  const card=document.createElement('div');card.className='qbPdfOrganizeCard';card.dataset.pageId=id;card.innerHTML=`<button class="qbPdfOrganizeSelect" type="button" aria-label="元の${id+1}ページを選択" aria-pressed="false"><span class="qbPdfOrganizeThumb"></span><span class="qbPdfOrganizeNumber"></span><span class="qbPdfOrganizeOriginal">元の${id+1}ページ</span></button><button type="button" class="qbPdfOrganizeHandle" aria-label="元の${id+1}ページを移動">ドラッグして移動</button>`;
  cards.set(id,card);card.querySelector('.qbPdfOrganizeSelect').onclick=()=>{selected.has(id)?selected.delete(id):selected.add(id);draw()};
  const handle=card.querySelector('.qbPdfOrganizeHandle');
  handle.onpointerdown=e=>{if(e.button!==0||drag)return;e.preventDefault();drag={id,pointer:e.pointerId,target:id};handle.setPointerCapture(e.pointerId);card.dataset.dragging='true'};
  handle.onpointermove=e=>{if(!drag||drag.pointer!==e.pointerId)return;e.preventDefault();const hit=document.elementFromPoint(e.clientX,e.clientY)?.closest('.qbPdfOrganizeCard');for(const c of cards.values())delete c.dataset.drop;if(hit&&grid.contains(hit)){drag.target=Number(hit.dataset.pageId);hit.dataset.drop='true'}const r=grid.getBoundingClientRect();if(e.clientY<r.top+48)grid.scrollTop-=20;else if(e.clientY>r.bottom-48)grid.scrollTop+=20};
  const end=(e,cancel)=>{if(!drag||drag.pointer!==e.pointerId)return;const d=drag;drag=null;for(const c of cards.values()){delete c.dataset.dragging;delete c.dataset.drop}if(!cancel)move(d.id,d.target)};
  handle.onpointerup=e=>end(e,false);handle.onpointercancel=e=>end(e,true);handle.onlostpointercapture=e=>end(e,true);
  handle.onkeydown=e=>{if(['ArrowLeft','ArrowUp','ArrowRight','ArrowDown'].includes(e.key)){e.preventDefault();const next=order.indexOf(id)+(['ArrowLeft','ArrowUp'].includes(e.key)?-1:1);if(next>=0&&next<order.length)move(id,order[next])}};
 }
 get('all').onclick=()=>{if(selected.size===order.length)selected.clear();else order.forEach(id=>selected.add(id));draw()};
 get('delete').onclick=()=>{if(!selected.size||selected.size===order.length)return;history.push([...order]);order=order.filter(id=>!selected.has(id));selected.clear();draw()};get('undo').onclick=()=>{if(!history.length)return;order=history.pop();selected.clear();draw()};get('cancel').onclick=()=>finish(null);get('apply').onclick=()=>finish(order);
 modal.addEventListener('click',e=>{if(e.target===modal)finish(null)});
 modal.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();finish(null)}if(e.key==='Tab'){const buttons=[...modal.querySelectorAll('button')].filter(b=>!b.disabled),i=buttons.indexOf(document.activeElement);e.preventDefault();buttons[(i+(e.shiftKey?-1:1)+buttons.length)%buttons.length]?.focus()}});
 draw();get('cancel').focus();
 void(async()=>{for(let id=0;id<count&&!closed;id++){try{const canvas=await render(id+1);if(closed){canvas.width=canvas.height=1;break}cards.get(id).querySelector('.qbPdfOrganizeThumb').append(canvas)}catch{if(!closed)cards.get(id).querySelector('.qbPdfOrganizeThumb').textContent='プレビューを読み込めません'}}})();
 return result;
}
window.QBPDFPageOrganizer={open};
})();
