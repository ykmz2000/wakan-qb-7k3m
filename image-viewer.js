(()=>{
'use strict';
function css(){if(document.getElementById('qbImageViewerCss'))return;const s=document.createElement('style');s.id='qbImageViewerCss';s.textContent=`
.qbMediaImg,.qbNoteImageGrid img,.oeiGrid img{display:block!important;width:auto!important;height:auto!important;max-width:100%!important;max-height:none!important;object-fit:contain!important;object-position:center!important;margin:8px auto!important;border-radius:10px;border:1px solid #dce3ec;cursor:zoom-in;background:#fff}
.qbMediaHost,.qbNoteImageGrid,.oeiGrid{overflow:visible!important}
.qbImageLightbox{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.92);display:flex;align-items:center;justify-content:center;padding:max(16px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left));touch-action:manipulation}
.qbImageLightbox img{display:block;max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;box-shadow:0 10px 40px rgba(0,0,0,.45);border-radius:4px}
.qbImageLightboxClose{position:fixed;top:max(12px,env(safe-area-inset-top));right:max(12px,env(safe-area-inset-right));z-index:10000;width:44px;height:44px;border:0;border-radius:999px;background:rgba(255,255,255,.16);color:#fff;font-size:28px;line-height:1;font-weight:500;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.qbImageLightboxHint{position:fixed;left:50%;bottom:max(18px,calc(env(safe-area-inset-bottom) + 10px));transform:translateX(-50%);color:#fff;font-size:11px;background:rgba(0,0,0,.35);padding:6px 10px;border-radius:999px;white-space:nowrap}
`;
document.head.appendChild(s)}
function close(){document.getElementById('qbImageLightbox')?.remove();document.documentElement.style.overflow=''}
function open(src,alt=''){if(!src)return;close();const d=document.createElement('div');d.id='qbImageLightbox';d.className='qbImageLightbox';d.setAttribute('role','dialog');d.setAttribute('aria-modal','true');d.setAttribute('aria-label','画像を拡大表示');d.innerHTML=`<button class="qbImageLightboxClose" type="button" aria-label="閉じる">×</button><img src="${src.replace(/"/g,'&quot;')}" alt="${String(alt||'').replace(/"/g,'&quot;')}"><div class="qbImageLightboxHint">画像をタップすると閉じます</div>`;document.body.appendChild(d);document.documentElement.style.overflow='hidden';d.onclick=e=>{if(e.target===d||e.target.tagName==='IMG'||e.target.closest('.qbImageLightboxClose'))close()}}
function isTarget(img){return img?.matches?.('.qbMediaImg,.qbNoteImageGrid img,.oeiGrid img')}
function boot(){css();document.addEventListener('click',e=>{const img=e.target?.closest?.('img');if(!isTarget(img))return;e.preventDefault();e.stopPropagation();open(img.currentSrc||img.src,img.alt)},true);document.addEventListener('keydown',e=>{if(e.key==='Escape')close()})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();