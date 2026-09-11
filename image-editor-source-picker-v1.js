/* Read-only source selection. No uploads, attachments, metadata edits or usage writes. */
(()=>{
'use strict';
let active=null;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function css(){
  if(document.getElementById('qbImageEditorSourceCss'))return;
  const s=document.createElement('style');s.id='qbImageEditorSourceCss';s.textContent=`
.qbeSourceModal{position:fixed;inset:0;z-index:10170;background:#0009;display:flex;align-items:flex-end;justify-content:center;padding:12px;color:var(--text,#172033)}
.qbeSourcePanel{box-sizing:border-box;width:min(760px,100%);max-height:88dvh;overflow:auto;background:var(--card,#fff);border:1px solid var(--line,#dce3ec);border-radius:16px;padding:14px;box-shadow:0 16px 60px #0005}
.qbeSourcePanel button,.qbeSourcePanel select{min-height:44px;border:1px solid var(--line,#dce3ec);background:var(--card,#fff);color:var(--accent,#126fb3);font:inherit;padding:8px 10px;border-radius:8px}.qbeSourcePanel button:disabled{opacity:.45}.qbeSourcePanel :is(button,input,select):focus-visible{outline:2px solid var(--accent,#126fb3);outline-offset:2px}.qbeSourcePanel [hidden]{display:none!important}
.qbeSourceHead{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}.qbeSourceHead b{font-size:16px}.qbeSourceClose{font-size:24px!important;line-height:1}
.qbeSourceChoices{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.qbeSourceChoices button{min-height:54px!important;text-align:left;font-weight:800}
.qbeSourceSearch{display:flex;gap:8px;margin:8px 0 12px;flex-wrap:wrap}.qbeSourceSearch input{flex:1;min-width:120px;min-height:44px;font:inherit;border:1px solid var(--line);background:var(--card);color:var(--text);padding:8px}.qbeSourceSearch select{max-width:100%}
.qbeLibraryGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.qbeLibraryItem{position:relative;min-width:0;border:2px solid transparent!important;background:var(--bg,#f5f7fb)!important;padding:6px!important;text-align:left}.qbeLibraryItem[aria-pressed=true]{border-color:var(--accent)!important;background:var(--accent-soft,var(--bg))!important}.qbeLibraryItem img{display:block;width:100%;height:140px;object-fit:contain;background:#fff}.qbeLibraryName{display:block;font-size:12px;line-height:1.4;margin-top:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.qbeLibraryOrder{position:absolute;right:9px;top:9px;min-width:24px;height:24px;padding:2px 6px;background:var(--accent);color:#fff;display:grid;place-items:center;font-size:12px;font-weight:900}
.qbeLibraryStatus{font-size:12px;color:var(--muted);min-height:22px;margin:8px 0}.qbeLibraryFoot{display:flex;gap:8px;position:sticky;bottom:-14px;background:var(--card);padding:10px 0 0}.qbeLibraryFoot button{flex:1}.qbeLibraryMore{width:100%;margin-top:10px}
@media(max-width:560px){.qbeSourceModal{padding:0}.qbeSourcePanel{width:100%;max-height:94dvh;border-radius:16px 16px 0 0}.qbeLibraryGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.qbeLibraryItem img{height:112px}}
`;document.head.appendChild(s);
}
function modalBase(title){
  css();const origin=document.activeElement,d=document.createElement('div');d.className='qbeSourceModal';
  d.innerHTML=`<section class="qbeSourcePanel" role="dialog" aria-modal="true" aria-label="${esc(title)}" tabindex="-1"><div class="qbeSourceHead"><b>${esc(title)}</b><button type="button" class="qbeSourceClose" aria-label="閉じる">×</button></div><div class="qbeSourceBody"></div></section>`;
  const background=[...document.body.children].filter(n=>!['SCRIPT','STYLE','LINK'].includes(n.tagName)).map(n=>[n,n.inert]);
  background.forEach(([n])=>n.inert=true);document.body.append(d);active=d;
  const oldOverflow=document.documentElement.style.overflow;document.documentElement.style.overflow='hidden';
  d.release=()=>{d.remove();background.forEach(([n,v])=>{if(n.isConnected)n.inert=v});document.documentElement.style.overflow=oldOverflow;active=null;if(origin?.isConnected&&!origin.closest('[inert]'))origin.focus({preventScroll:true})};return d;
}
function trap(d,close){d.addEventListener('keydown',e=>{
  e.stopPropagation();if(e.isComposing||e.keyCode===229)return;
  if(e.key==='Escape'){e.preventDefault();close();return}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();return}
  if(e.key!=='Tab')return;
  const nodes=[...d.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(n=>n.getClientRects().length),first=nodes[0],last=nodes.at(-1);
  if(!first)return;if(e.shiftKey&&(document.activeElement===first||document.activeElement===d.querySelector('section'))){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
})}
function choose({onDevice}={}){
  if(active)return Promise.resolve(null);
  return new Promise(resolve=>{
    const d=modalBase('画像を追加'),body=d.querySelector('.qbeSourceBody');
    body.innerHTML='<div class="qbeSourceChoices"><button type="button" data-source="device">ファイルを選択</button><button type="button" data-source="recent">最近のファイルから</button><button type="button" data-source="library">ライブラリから</button><button type="button" data-source="question">この問題を画像化</button></div>';let closed=false;
    function close(value=null){if(closed)return;closed=true;d.release();resolve(value)}
    d.querySelector('.qbeSourceClose').onclick=()=>close();
    d.addEventListener('click',e=>{const b=e.target.closest('[data-source]');if(b){const source=b.dataset.source;close(source);if(source==='device')onDevice?.()}else if(e.target===d)close()});
    trap(d,close);d.querySelector('[data-source]').focus({preventScroll:true});
  });
}
async function pickLibrary({sb=window.qbSupabase}={}){
  const S=window.QBImageLibraryStore;if(!sb||!S)throw Error('ライブラリを利用できません。');if(active)return [];
  await S.authorize(sb);if(active)return [];
  return new Promise(resolve=>{
    const d=modalBase('ライブラリから選択'),body=d.querySelector('.qbeSourceBody');
    body.innerHTML='<div class="qbeSourceSearch"><input type="search" placeholder="タイトル・キーワードで検索" aria-label="ライブラリを検索"><button type="button" class="qbeSearchButton">検索</button><select aria-label="ライブラリの科目"><option value="">全科目</option></select></div><div class="qbeLibraryStatus" role="status">読み込み中…</div><div class="qbeLibraryGrid"></div><button type="button" class="qbeLibraryMore" hidden>さらに読み込む</button><div class="qbeLibraryFoot"><button type="button" class="qbeCancel">キャンセル</button><button type="button" class="qbeUse" disabled>選択した画像を追加</button></div>';
    const input=d.querySelector('input'),subject=d.querySelector('select'),grid=d.querySelector('.qbeLibraryGrid'),status=d.querySelector('.qbeLibraryStatus'),more=d.querySelector('.qbeLibraryMore'),use=d.querySelector('.qbeUse'),selected=new Map();
    let rows=[],offset=0,closed=false,generation=0,loading=false,composing=false,lastComposition=-Infinity;
    function close(value=[]){if(closed)return;closed=true;generation++;d.release();resolve(value)}
    function sync(){
      const order=new Map([...selected.keys()].map((id,i)=>[id,i+1]));
      for(const b of grid.querySelectorAll('.qbeLibraryItem')){const n=order.get(b.dataset.id);b.setAttribute('aria-pressed',String(!!n));const badge=b.querySelector('.qbeLibraryOrder');badge.hidden=!n;badge.textContent=n||''}
      use.disabled=!selected.size;use.textContent=selected.size?`選択した${selected.size}枚を追加`:'選択した画像を追加';
    }
    function addCard(row){
      const b=document.createElement('button');b.type='button';b.className='qbeLibraryItem';b.dataset.id=row.id;b.setAttribute('aria-pressed','false');const name=row.metadata?.name||'画像';
      b.innerHTML=`<img alt="${esc(name)}" loading="lazy"><span class="qbeLibraryName">${esc(name)}</span><span class="qbeLibraryOrder" hidden></span>`;grid.append(b);
      S.signedURL(sb,row.object_path).then(url=>{if(!closed&&b.isConnected&&b.querySelector('img'))window.QBFiles?QBFiles.present(b.querySelector('img'),url,false):b.querySelector('img').src=url}).catch(()=>{if(b.isConnected)b.title='プレビューの取得に失敗しました。検索で再読み込みしてください。'});
      b.onclick=()=>{selected.has(row.id)?selected.delete(row.id):selected.set(row.id,row);sync()};
    }
    async function load(reset=false){
      if(closed||loading&&!reset)return;const token=++generation;loading=true;
      if(reset){offset=0;rows=[];grid.replaceChildren();sync()}status.textContent='読み込み中…';more.hidden=true;
      try{
        // RPC search returns {item,score,...}, not an item row. 'images' also exposes set members.
        const batch=await S.search(sb,{query:input.value.trim(),subjects:subject.value?[subject.value]:[],sort:'recent',view:'images',archived:false,offset});
        if(closed||token!==generation)return;
        for(const hit of batch){const row=hit.item||hit;if(!row.id||!row.object_path||row.archived||rows.some(x=>x.id===row.id))continue;rows.push(row);addCard(row)}
        offset+=batch.length;more.hidden=batch.length<30;status.textContent=rows.length?`${rows.length}件を表示`:'該当する画像がありません。';sync();
      }catch(e){if(!closed&&token===generation)status.textContent='読み込めませんでした：'+(e.message||e)}finally{if(token===generation)loading=false}
    }
    d.querySelector('.qbeSourceClose').onclick=d.querySelector('.qbeCancel').onclick=()=>close();
    const search=()=>{if(!composing&&performance.now()-lastComposition>60)load(true)};
    d.querySelector('.qbeSearchButton').onclick=search;
    input.addEventListener('compositionstart',()=>composing=true);input.addEventListener('compositionend',()=>{composing=false;lastComposition=performance.now()});
    input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing&&e.keyCode!==229){e.preventDefault();search()}});
    subject.onchange=()=>load(true);more.onclick=()=>load(false);use.onclick=()=>close([...selected.values()]);
    d.addEventListener('click',e=>{if(e.target===d)close()});trap(d,()=>close());input.focus({preventScroll:true});
    S.catalog(sb,'subjects').then(list=>{if(!closed)for(const s of list)subject.add(new Option(s.name,s.id))}).catch(()=>{if(!closed)subject.title='科目一覧を取得できませんでした。キーワード検索は利用できます。'});
    load(true);
  });
}
window.QBImageEditorSources={choose,pickLibrary};
})();
