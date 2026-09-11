/* Shared crop UI. Callers retain their existing image upload and DB save paths. */
(()=>{
'use strict';
let loading=null,currentDialog=null;
function loadAsset(id,tag,url){
  return new Promise((resolve,reject)=>{
    let node=document.getElementById(id);
    if(node&&(tag==='link'?node.sheet:window.Cropper)){resolve();return}
    if(!node){node=document.createElement(tag);node.id=id;if(tag==='link'){node.rel='stylesheet';node.href=url}else node.src=url;}
    node.addEventListener('load',resolve,{once:true});
    node.addEventListener('error',()=>{node.remove();reject(new Error('画像編集機能を読み込めませんでした。もう一度お試しください。'))},{once:true});
    if(!node.isConnected)document.head.appendChild(node);
  });
}
function ensureCropper(){
  if(!loading)loading=Promise.all([
    loadAsset('cropperCss','link','https://cdn.jsdelivr.net/npm/cropperjs@1.6.2/dist/cropper.min.css'),
    window.Cropper?Promise.resolve():loadAsset('cropperJs','script','https://cdn.jsdelivr.net/npm/cropperjs@1.6.2/dist/cropper.min.js')
  ]).catch(e=>{loading=null;throw e});
  return loading;
}
function gesture(points){
  const [a,b]=[...points.values()];if(!a||!b)return null;
  return{x:(a.x+b.x)/2,y:(a.y+b.y)/2,distance:Math.hypot(b.x-a.x,b.y-a.y)};
}
function css(){
  if(document.getElementById('qbCropCss'))return;
  const style=document.createElement('style');style.id='qbCropCss';style.textContent=`
.qbCropModal{position:fixed;inset:0;z-index:10020;background:#000b;display:flex;align-items:center;justify-content:center;padding:12px;overscroll-behavior:contain}
.qbCropPanel{box-sizing:border-box;width:min(1100px,100%);height:min(94vh,900px);height:min(94dvh,900px);display:grid;grid-template-rows:auto minmax(0,1fr) auto;overflow:hidden;background:var(--card,#fff);color:var(--text,#172033);border:1px solid var(--line,#dce3ec);border-radius:16px;font:inherit}
.qbCropHeader{padding:10px 14px}.qbCropTitleRow{display:flex;align-items:center;justify-content:space-between;gap:8px}.qbCropTitleRow h2{font-size:16px;margin:0}.qbCropHint,.qbCropStatus{font-size:12px;line-height:1.5;color:var(--muted,#6f7786);margin:3px 0 0}
.qbCropPanel button{font:inherit;font-size:14px;min-height:44px;min-width:44px;border:1px solid var(--line,#dce3ec);border-radius:8px;padding:8px 12px;background:var(--card,#fff);color:var(--text,#172033);touch-action:manipulation}
.qbCropPanel button:focus-visible{outline:2px solid var(--accent,#126fb3);outline-offset:2px}.qbCropPanel button:disabled{opacity:.5}
.qbCropPanel .qbCropClose{border:0;font-size:26px;padding:0 8px}.qbCropStage{min-height:0;min-width:0;padding:24px;overflow:hidden;display:flex;background:#10131a;touch-action:none;user-select:none;-webkit-user-select:none}
.qbCropSurface{flex:1;min-width:0;min-height:0;position:relative}.qbCropImage{display:block;max-width:100%;opacity:0}
.qbCropFooter{padding:10px 14px;min-height:0;max-height:46vh;display:flex;flex-direction:column;gap:8px}.qbCropControls{display:flex;gap:7px;flex-wrap:wrap;overflow:auto;min-height:0;flex-shrink:1;padding:2px}.qbCropControls [aria-pressed="true"]{border-color:var(--accent,#126fb3);background:var(--accent-soft,#eaf4fb);color:var(--accent,#126fb3)}
.qbCropActions{display:flex;justify-content:flex-end;align-items:center;gap:8px;flex-shrink:0}.qbCropActions .qbCropSave{background:var(--accent,#126fb3);color:var(--card,#fff);border-color:var(--accent,#126fb3)}.qbCropStatus{margin-right:auto}
.qbCropStage .cropper-view-box{outline:2px solid var(--accent,#126fb3)}
.qbCropStage .cropper-face,.qbCropStage .cropper-line{background-color:var(--accent)}
.qbCropStage .cropper-point{width:44px!important;height:44px!important;background:transparent;opacity:1;margin:0!important;z-index:2}
.qbCropStage .cropper-point::before{display:none!important}.qbCropStage .cropper-point::after{content:'';position:absolute;inset:15px;border:2px solid #fff;border-radius:4px;background:var(--accent,#126fb3);box-shadow:0 1px 3px #0009;pointer-events:none}
.qbCropStage .point-nw{left:-22px;top:-22px}.qbCropStage .point-ne{right:-22px;top:-22px}.qbCropStage .point-sw{left:-22px;bottom:-22px}.qbCropStage .point-se{right:-22px;bottom:-22px}
.qbCropStage .point-n{left:calc(50% - 22px);top:-22px}.qbCropStage .point-s{left:calc(50% - 22px);bottom:-22px}.qbCropStage .point-e{right:-22px;top:calc(50% - 22px)}.qbCropStage .point-w{left:-22px;top:calc(50% - 22px)}
.qbCropStage .cropper-line{background:transparent;opacity:1}.qbCropStage .line-n{height:32px;top:-16px}.qbCropStage .line-s{height:32px;bottom:-16px}.qbCropStage .line-e{width:32px;right:-16px}.qbCropStage .line-w{width:32px;left:-16px}
@media(max-width:1100px),(any-pointer:coarse){.qbCropModal{padding:0}.qbCropPanel{width:100%;height:100%;height:100dvh;border:0;border-radius:0}.qbCropHeader{padding-top:max(8px,env(safe-area-inset-top));padding-left:max(12px,env(safe-area-inset-left));padding-right:max(12px,env(safe-area-inset-right))}.qbCropFooter{padding-bottom:max(10px,env(safe-area-inset-bottom));padding-left:max(12px,env(safe-area-inset-left));padding-right:max(12px,env(safe-area-inset-right))}}
`;document.head.appendChild(style);
}
async function open(src,{title='画像をトリミング',rotatable=true,selectionOnly=false}={}){
  if(currentDialog)throw new Error('開いているトリミング画面を閉じてください。');
  // Reserve before loading to prevent repeated taps from opening multiple dialogs.
  currentDialog=true;
  try{await ensureCropper()}catch(e){currentDialog=null;throw e}
  css();
  return new Promise((resolve,reject)=>{
    const modal=document.createElement('div');modal.className='qbCropModal';
    modal.innerHTML=`<section class="qbCropPanel" role="dialog" aria-modal="true" aria-labelledby="qbCropTitle" tabindex="-1"><header class="qbCropHeader"><div class="qbCropTitleRow"><h2 id="qbCropTitle"></h2><button type="button" class="qbCropClose" aria-label="トリミングを閉じる">×</button></div><p class="qbCropHint">1本指で枠を調整・2本指で画像を移動／拡大縮小。PCではドラッグして調整できます。</p></header><div class="qbCropStage"><div class="qbCropSurface"><img class="qbCropImage" alt="トリミング対象"></div></div><footer class="qbCropFooter"><div class="qbCropControls"><button type="button" class="qbCropFull">画像全体に戻す</button><button type="button" data-r="NaN" aria-pressed="true">自由</button><button type="button" data-r="1" aria-pressed="false">1:1</button><button type="button" data-r="1.3333333333333333" aria-pressed="false">4:3</button><button type="button" data-r="1.7777777777777777" aria-pressed="false">16:9</button>${rotatable?'<button type="button" data-rotate="-90">↶ 左へ90°</button><button type="button" data-rotate="90">↷ 右へ90°</button>':''}</div><div class="qbCropActions"><span class="qbCropStatus" role="status">読み込み中…</span><button type="button" class="qbCropCancel">キャンセル</button><button type="button" class="qbCropSave" disabled>この範囲で保存</button></div></footer></section>`;
    modal.querySelector('h2').textContent=title;if(selectionOnly)modal.querySelector('.qbCropSave').textContent='この範囲を適用';
    const panel=modal.querySelector('.qbCropPanel'),stage=modal.querySelector('.qbCropStage'),surface=modal.querySelector('.qbCropSurface'),img=modal.querySelector('img'),saveButton=modal.querySelector('.qbCropSave'),status=modal.querySelector('.qbCropStatus');
    const focus=document.activeElement,htmlOverflow=document.documentElement.style.overflow,bodyOverflow=document.body.style.overflow;
    let cropper=null,closed=false,busy=false,ready=false,previousGesture=null,multiActive=false;
    const points=new Map(),listeners=[];
    const listen=(node,name,handler,options)=>{node.addEventListener(name,handler,options);listeners.push(()=>node.removeEventListener(name,handler,options))};
    const close=(blob=null,error=null)=>{
      if(closed)return;closed=true;for(const unbind of listeners)unbind();points.clear();cropper?.destroy();modal.remove();currentDialog=null;
      document.documentElement.style.overflow=htmlOverflow;document.body.style.overflow=bodyOverflow;
      if(focus?.isConnected)focus.focus({preventScroll:true});if(error)reject(error);else resolve(blob);
    };
    const fitAll=()=>{
      if(!ready||busy)return;
      cropper.setAspectRatio(NaN);cropper.clear();
      const image=cropper.getCanvasData(),container=cropper.getContainerData();
      const scale=Math.min(container.width/image.naturalWidth,container.height/image.naturalHeight);
      const width=image.naturalWidth*scale,height=image.naturalHeight*scale;
      cropper.setCanvasData({width,left:(container.width-width)/2,top:(container.height-height)/2});cropper.crop();
      const canvas=cropper.getCanvasData();cropper.setCropBoxData({left:canvas.left,top:canvas.top,width:canvas.width,height:canvas.height});
      modal.querySelectorAll('[data-r]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.r==='NaN')));
      status.textContent='画像全体を選択中';
    };
    function nonMouse(e){return e.changedTouches||e.pointerType&&e.pointerType!=='mouse'}
    function updatePoints(e,remove=false){
      const list=e.changedTouches?[...e.changedTouches]:[e];
      for(const p of list){const id=p.identifier??p.pointerId;if(remove)points.delete(id);else if(e.type.endsWith('down')||e.type==='touchstart'||points.has(id))points.set(id,{x:p.clientX,y:p.clientY});}
    }
    const start=e=>{if(!nonMouse(e)||busy)return;updatePoints(e);if(points.size>1){multiActive=true;previousGesture=gesture(points)}};
    const move=e=>{
      if(!nonMouse(e)||busy||!ready||!points.size)return;
      const previous=previousGesture;updatePoints(e);const next=gesture(points);previousGesture=next;
      if(!next||!previous||previous.distance<2||next.distance<2)return;
      e.preventDefault();
      const canvas=cropper.getCanvasData(),rect=surface.getBoundingClientRect();
      // Transform around the fingers' midpoint, including translation. Cropper's
      // public setter clamps the image so the crop box never contains empty space.
      const scale=Math.max(.5,Math.min(2,next.distance/previous.distance));
      cropper.setCanvasData({width:canvas.width*scale,left:next.x-rect.left-(previous.x-rect.left-canvas.left)*scale,top:next.y-rect.top-(previous.y-rect.top-canvas.top)*scale});
    };
    const end=e=>{if(!nonMouse(e))return;updatePoints(e,true);previousGesture=gesture(points);if(!points.size)multiActive=false};
    const pointer=!!window.PointerEvent;
    listen(stage,pointer?'pointerdown':'touchstart',start,{capture:true,passive:false});
    listen(document,pointer?'pointermove':'touchmove',move,{capture:true,passive:false});
    for(const name of pointer?['pointerup','pointercancel']:['touchend','touchcancel'])listen(document,name,end,{capture:true,passive:false});
    listen(window,'blur',()=>{points.clear();previousGesture=null;multiActive=false});
    listen(panel,'keydown',e=>{
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(!busy)close();return}
      if(e.key!=='Tab')return;
      const buttons=[...panel.querySelectorAll('button:not(:disabled)')],first=buttons[0],last=buttons.at(-1);
      if(e.shiftKey&&(document.activeElement===first||document.activeElement===panel)){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}
    });
    modal.querySelector('.qbCropClose').onclick=modal.querySelector('.qbCropCancel').onclick=()=>{if(!busy)close()};
    modal.querySelector('.qbCropFull').onclick=fitAll;
    modal.querySelectorAll('[data-r]').forEach(b=>b.onclick=()=>{if(!ready||busy)return;cropper.setAspectRatio(Number(b.dataset.r));modal.querySelectorAll('[data-r]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));status.textContent=''});
    modal.querySelectorAll('[data-rotate]').forEach(b=>b.onclick=()=>{if(ready&&!busy){cropper.rotate(Number(b.dataset.rotate));status.textContent=''}});
    saveButton.onclick=async()=>{
      if(!ready||busy)return;
      busy=true;modal.querySelectorAll('button').forEach(b=>b.disabled=true);cropper.disable();status.textContent='画像を作成中…';
      const failed=e=>{busy=false;cropper.enable();modal.querySelectorAll('button').forEach(b=>b.disabled=false);status.textContent='保存できませんでした：'+(e.message||e)};
      try{
        const data=cropper.getData(true);
        if(!(data.width>0&&data.height>0))throw Error('切り抜く範囲を選択してください。');
        if(selectionOnly){close(data);return}
        const encoder=window.QBImageEditor?.encodePng;
        if(typeof encoder==='function'){
          // Render directly into small tiles, including rotation. Do not first
          // allocate the giant getCroppedCanvas that can fail on iPad Safari.
          const source=cropper.image||img,info=cropper.getImageData(),w=info.naturalWidth,h=info.naturalHeight;
          const angle=Number(data.rotate||0)*Math.PI/180,sx=Number(data.scaleX??1),sy=Number(data.scaleY??1);
          const rw=Math.abs(w*sx*Math.cos(angle))+Math.abs(h*sy*Math.sin(angle)),rh=Math.abs(w*sx*Math.sin(angle))+Math.abs(h*sy*Math.cos(angle));
          const blob=await encoder(Math.max(1,Math.round(data.width)),Math.max(1,Math.round(data.height)),ctx=>{
            ctx.save();ctx.imageSmoothingEnabled=false;ctx.translate(rw/2-data.x,rh/2-data.y);ctx.rotate(angle);ctx.scale(sx,sy);ctx.drawImage(source,-w/2,-h/2,w,h);ctx.restore();
          },p=>{status.textContent='元解像度トリミング '+p+'%';});
          close(blob);return;
        }
        const canvas=cropper.getCroppedCanvas({imageSmoothingEnabled:false});
        if(!canvas||canvas.width<Math.floor(data.width)||canvas.height<Math.floor(data.height))throw Error('元解像度で保存する機能を読み込めませんでした。編集内容を保持して再試行してください。');
        canvas.toBlob(blob=>{canvas.width=canvas.height=1;if(blob)close(blob);else failed(new Error('画像を生成できませんでした。'))},'image/png');
      }catch(e){failed(e)}
    };
    img.onload=()=>{
      if(closed||cropper)return;
      try{cropper=new window.Cropper(img,{
        viewMode:1,dragMode:'move',autoCropArea:1,aspectRatio:NaN,initialAspectRatio:NaN,responsive:true,restore:true,checkOrientation:true,
        modal:true,guides:true,center:true,highlight:true,background:true,cropBoxMovable:true,cropBoxResizable:true,
        toggleDragModeOnDblclick:false,zoomOnTouch:false,zoomOnWheel:false,movable:true,zoomable:true,scalable:false,rotatable,
        ready(){requestAnimationFrame(()=>{if(closed)return;ready=true;fitAll();saveButton.disabled=false;})},
        crop(){if(ready&&!busy)status.textContent=''},
        cropstart(e){if(nonMouse(e.detail.originalEvent)&&(multiActive||e.detail.action==='move'))e.preventDefault()},
        cropmove(e){if(nonMouse(e.detail.originalEvent)&&multiActive)e.preventDefault()}
      })}catch(e){close(null,e)}
    };
    img.onerror=()=>close(null,new Error('画像を読み込めませんでした。'));
    document.body.appendChild(modal);document.documentElement.style.overflow='hidden';document.body.style.overflow='hidden';panel.focus();img.src=src;
  });
}
window.QBImageCrop={open};
})();
