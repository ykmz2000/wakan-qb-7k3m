/* Transient objects only. The save callback receives one flattened PNG. */
(()=>{
'use strict';
let current=null;
const M=window.QBImageModel;
const MAX_IMAGE_BYTES=100*1024*1024,WARN_IMAGE_BYTES=50*1024*1024;
const settingsKey='qb-image-editor-settings-v1';
let sessionSettings={};
function readSettings(){try{return JSON.parse(localStorage.getItem(settingsKey)||'null')||sessionSettings}catch{return sessionSettings}}
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n};
const btn=(label,cls,fn)=>{const b=el('button',cls,label);b.type='button';b.onclick=fn;return b};
function filesFromPaste(e){if(window.QBFiles)return QBFiles.filesFromPaste(e);const items=[...(e.clipboardData?.items||[])].filter(i=>i.kind==='file'&&/^image\//.test(i.type)).map(i=>i.getAsFile()).filter(Boolean);return items.length?items:[...(e.clipboardData?.files||[])].filter(f=>/^image\//.test(f.type))}
function loadImage(source){return new Promise((resolve,reject)=>{const img=new Image();if(/^https?:/i.test(String(source)))img.crossOrigin='anonymous';img.onload=()=>resolve(img);img.onerror=()=>reject(Error('画像を開けませんでした。PNG・JPEG・WebPなどの画像をお試しください。'));img.src=source})}
// Encode a single lossless PNG without allocating a full-size output canvas.
// PNG scanlines share one zlib stream; IDAT boundaries are independent of tiles.
async function tiledPng(width,height,paint,progress){
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width>0x7fffffff||height>0x7fffffff)throw Error('画像の寸法がPNG形式で扱える範囲を超えています。');
  if(typeof CompressionStream==='undefined')throw Error('このブラウザは高解像度保存に対応していません。ブラウザを更新してください。');
  const table=new Uint32Array(256);
  for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;table[n]=c;}
  function chunk(type,data){const b=new Uint8Array(data.length+12),v=new DataView(b.buffer);v.setUint32(0,data.length);for(let i=0;i<4;i++)b[4+i]=type.charCodeAt(i);b.set(data,8);let crc=0xffffffff;for(let i=4;i<b.length-4;i++)crc=table[(crc^b[i])&255]^(crc>>>8);v.setUint32(b.length-4,(crc^0xffffffff)>>>0);return b;}
  const header=new Uint8Array(13),hv=new DataView(header.buffer);hv.setUint32(0,width);hv.setUint32(4,height);header[8]=8;header[9]=6;
  const parts=[new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('sRGB',new Uint8Array([0]))];
  const stream=new CompressionStream('deflate'),writer=stream.writable.getWriter(),reader=stream.readable.getReader();
  let readError,encodedBytes=parts.reduce((n,p)=>n+p.length,0);
  const draining=(async()=>{try{for(;;){const {done,value}=await reader.read();if(done)break;const part=chunk('IDAT',value);encodedBytes+=part.length;if(encodedBytes>MAX_IMAGE_BYTES)throw Error('保存画像が100MBを超えます。画質を落とさず保存するため、画像を分けてください。');parts.push(part);}}catch(e){readError=e;await reader.cancel(e).catch(()=>{});}})();
  const canvas=document.createElement('canvas');
  try{
    // At most ~4MiB of assembled scanlines, plus a small rendering tile.
    const stride=width*4+1,rows=Math.max(1,Math.min(128,Math.floor(4194304/stride)));
    for(let y=0;y<height;y+=rows){
      const h=Math.min(rows,height-y),band=new Uint8Array(stride*h);
      for(let x=0;x<width;x+=2048){
        const w=Math.min(2048,width-x);canvas.width=w;canvas.height=h;
        const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('画像の描画に必要なメモリを確保できませんでした。');
        ctx.translate(-x,-y);paint(ctx);
        const pixels=ctx.getImageData(0,0,w,h).data;
        for(let r=0;r<h;r++)band.set(pixels.subarray(r*w*4,(r+1)*w*4),r*stride+1+x*4);
      }
      // Sub filter preserves exact pixels and compresses blank margins efficiently.
      for(let r=0;r<h;r++){const start=r*stride;band[start]=1;for(let i=stride-1;i>=5;i--)band[start+i]=(band[start+i]-band[start+i-4])&255;}
      await writer.write(band);if(readError)throw readError;
      progress?.(Math.round((y+h)/height*100));await new Promise(resolve=>setTimeout(resolve,0));
    }
    await writer.close();await draining;if(readError)throw readError;
    parts.push(chunk('IEND',new Uint8Array()));return new Blob(parts,{type:'image/png'});
  }catch(e){await writer.abort(e).catch(()=>{});await reader.cancel(e).catch(()=>{});await draining;throw e;}
  finally{canvas.width=canvas.height=1;writer.releaseLock();reader.releaseLock();}
}
async function open(source,options={}){
  if(current)throw Error('画像編集中です。保存またはキャンセルしてから開いてください。');
  const preferences=readSettings();
  const correction={pen:20,marker:50};for(const key of ['pen','marker']){const v=preferences.correction?.[key];if(typeof v==='number'&&Number.isFinite(v))correction[key]=Math.round(Math.max(0,Math.min(100,v)))}
  let snapEnabled=preferences.snap!==false;
  const previous=document.activeElement,urls=[],assets=new Map(),listeners=[];let sequence=0;
  const asset=async input=>{const isBlob=input instanceof Blob;if(isBlob&&input.size>MAX_IMAGE_BYTES)throw Error('追加する画像は100MB以下にしてください。');const url=isBlob?URL.createObjectURL(input):String(input);if(isBlob)urls.push(url);let img;try{img=await loadImage(url)}catch(error){if(!isBlob||typeof createImageBitmap!=='function')throw error;img=await createImageBitmap(input)}const id='asset-'+(++sequence);assets.set(id,{img,url});return id};
  const modal=el('div','qbDrawModal'),panel=el('section','qbDrawPanel');panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label',options.title||'画像編集');panel.tabIndex=-1;modal.append(panel);
  const header=el('header','qbDrawHeader'),top=el('div','qbDrawTitleRow');top.append(el('b','',options.title||'画像編集'));const closeButton=btn('×','qbDrawClose',()=>cancel());closeButton.setAttribute('aria-label','画像編集を閉じる');top.append(closeButton);header.append(top);
  const tools=el('div','qbDrawTools');tools.setAttribute('role','toolbar');tools.setAttribute('aria-label','画像の編集ツール');header.append(tools);
  const settings=el('div','qbDrawSettings'),palette=el('div','qbDrawPalette');palette.setAttribute('role','group');palette.setAttribute('aria-label','色');settings.append(palette);
  const sizeLabel=el('label','qbDrawSize','太さ '),size=el('select');size.setAttribute('aria-label','線の太さ');for(const [v,t] of [[2,'細い'],[5,'標準'],[10,'太い']]){const o=el('option','',t);o.value=v;size.append(o)}size.value=5;sizeLabel.append(size);settings.append(sizeLabel);
  const markerModeLabel=el('label','qbDrawSize','マーカーの描き方 '),markerMode=el('select');markerMode.setAttribute('aria-label','マーカーの描き方');for(const [v,t] of [['freehand','フリーハンド'],['straight','直線（斜めも可）'],['horizontal','水平（横のみ）'],['vertical','垂直（縦のみ）']]){const o=el('option','',t);o.value=v;markerMode.append(o)}markerMode.value=['straight','horizontal','vertical'].includes(preferences.markerMode)?preferences.markerMode:'freehand';markerModeLabel.append(markerMode);settings.append(markerModeLabel);
  const penModeLabel=markerModeLabel.cloneNode(true),penMode=penModeLabel.querySelector('select');penModeLabel.firstChild.textContent='ペンの描き方 ';penMode.setAttribute('aria-label','ペンの描き方');penMode.value=['straight','horizontal','vertical'].includes(preferences.penMode)?preferences.penMode:'freehand';settings.append(penModeLabel);
  const fontLabel=el('label','qbDrawSize','文字サイズ '),font=el('select');font.setAttribute('aria-label','文字サイズ');for(const v of [16,24,32,48,64,96]){const o=el('option','',v);o.value=v;font.append(o)}font.value=32;fontLabel.append(font);settings.append(fontLabel);
  const counterSettings=el('div','qbDrawCounterSettings'),counterMode=el('select'),counterSize=el('select'),counterNext=el('input');counterMode.setAttribute('aria-label','連番の種類');for(const [v,t] of [['letter','a, b, c…'],['number','1, 2, 3…']]){const o=el('option','',t);o.value=v;counterMode.append(o)}counterSize.setAttribute('aria-label','ステッカーの大きさ');for(const v of [32,48,64,96,128]){const o=el('option','',v);o.value=v;counterSize.append(o)}counterSize.value='64';counterNext.setAttribute('aria-label','次に貼る番号');counterNext.type='text';counterNext.value='a';counterNext.autocomplete='off';counterNext.spellcheck=false;for(const [label,field] of [['種類 ',counterMode],['大きさ ',counterSize],['次の番号 ',counterNext]]){const l=el('label','qbDrawSize',label);l.append(field);counterSettings.append(l)}settings.append(counterSettings);
  const finger=el('input');finger.type='checkbox';const fingerLabel=el('label','qbDrawFinger');fingerLabel.append(finger,document.createTextNode('指で描く'));settings.append(fingerLabel);
  const snapButton=btn('スナップ '+(snapEnabled?'ON':'OFF'),'qbDrawSnap',()=>{if(busy||subDialog)return;snapEnabled=!snapEnabled;snapGuides=[];remember();update()});snapButton.setAttribute('aria-pressed',String(snapEnabled));settings.append(snapButton);header.append(settings);
  const textInput=el('textarea','qbDrawText');textInput.placeholder='文字を入力';textInput.setAttribute('aria-label','画像に入れる文字');textInput.rows=1;textInput.hidden=true;textInput.spellcheck=false;
  const correctionLabel=el('label','qbDrawCorrection','手ぶれ補正 '),correctionRange=el('input'),correctionNumber=el('input');correctionRange.type='range';correctionNumber.type='number';for(const input of [correctionRange,correctionNumber]){input.min=0;input.max=100;input.step=1;input.setAttribute('aria-label',input===correctionRange?'手ぶれ補正':'手ぶれ補正の数値');correctionLabel.append(input)}settings.append(correctionLabel);
  const editActions=el('div','qbDrawObjectActions');header.append(editActions);
  const stage=el('div','qbDrawStage'),canvas=el('canvas','qbDrawCanvas');canvas.tabIndex=0;canvas.setAttribute('aria-label','画像の書き込み領域');stage.append(canvas,textInput);
  const pasteTarget=el('textarea','qbDrawPasteTarget');pasteTarget.tabIndex=-1;pasteTarget.setAttribute('aria-label','画像の貼り付け先');pasteTarget.setAttribute('inputmode','none');Object.assign(pasteTarget.style,{position:'absolute',width:'1px',height:'1px',opacity:'0',padding:'0',border:'0',top:'0',left:'0',pointerEvents:'none'});stage.append(pasteTarget);
  const workspace=el('div','qbDrawWorkspace'),reference=el('aside','qbDrawReference');reference.hidden=true;reference.setAttribute('aria-label','問題と解答の参照');workspace.append(stage,reference);
  let questionSnapshot=null,referenceLoaded=false,referenceLoading=false;
  try{const q=window.pq?.();if(q)questionSnapshot=JSON.parse(JSON.stringify(q))}catch{}
  const referenceButton=btn('問題・解答を表示','qbDrawReferenceButton',async()=>{
    reference.hidden=!reference.hidden;workspace.classList.toggle('hasReference',!reference.hidden);referenceButton.setAttribute('aria-pressed',String(!reference.hidden));referenceButton.textContent=reference.hidden?'問題・解答を表示':'問題・解答を隠す';
    if(reference.hidden||referenceLoaded||referenceLoading)return;referenceLoading=true;reference.textContent='問題と解答を読み込み中…';
    try{if(!questionSnapshot||!window.QBQuestionExport)throw Error('参照できる問題がありません。');const result=await window.QBQuestionExport.render(questionSnapshot,{width:2400});if(closed)return;const url=URL.createObjectURL(result.blob);urls.push(url);const img=el('img');img.alt='問題文・問題画像・選択肢・解答';img.src=url;mountReference(img);referenceLoaded=true}catch(e){if(!closed)reference.textContent='読み込めませんでした：'+e.message+' 閉じて再度表示すると再試行します。'}finally{referenceLoading=false}
  });referenceButton.setAttribute('aria-pressed','false');top.insertBefore(referenceButton,closeButton);
  const footer=el('footer','qbDrawFooter'),navigation=el('div','qbDrawNavigation'),actions=el('div','qbDrawActions'),status=el('span','qbDrawStatus','画像を読み込み中…');status.setAttribute('role','status');
  const saveButton=btn('確定して保存','qbDrawSave',()=>save());saveButton.disabled=true;
  actions.append(status,btn('キャンセル','',()=>cancel()),saveButton);footer.append(navigation,actions);panel.append(header,workspace,footer);document.body.append(modal);
  // aria-modal alone does not disable background focus or native text editing.
  const background=[...document.body.children].filter(n=>n!==modal).map(n=>[n,n.inert]);
  background.forEach(([n])=>n.inert=true);
  const oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';panel.focus();
  let done;const result=new Promise(resolve=>{done=resolve});current={modal};
  let scene=null,history=null,selection=[],tool='pen',color=M.colors[0].value,zoom=1,ox=0,oy=0,frame=0,closed=false,busy=false,subDialog=false,changed=false,gesture=null,lassoPoints=null,penDown=false,textStart=null,snapGuides=[];
  const pointers=new Map();let textHistory=null,textComposing=false;let pinch=null,editingTextId=null,nativeGesture=null,nativeEndedAt=0,lastPoint=null;
  if(['lasso','pen','marker','text','arrow','rect','circle','ellipse','counter','image'].includes(preferences.tool))tool=preferences.tool;
  if(M.colors.some(c=>c.value===preferences.color))color=preferences.color;
  if([2,5,10].includes(preferences.size))size.value=preferences.size;
  if([16,24,32,48,64,96].includes(preferences.font))font.value=preferences.font;
  finger.checked=preferences.finger===true;
  function remember(){sessionSettings={tool,color,size:Number(size.value),font:Number(font.value),finger:finger.checked,snap:snapEnabled,markerMode:markerMode.value,penMode:penMode.value,correction:{...correction}};try{localStorage.setItem(settingsKey,JSON.stringify(sessionSettings))}catch{}}
  function updateCorrection(){counterSettings.hidden=tool!=='counter';sizeLabel.hidden=fontLabel.hidden=tool==='counter';if(scene&&document.activeElement!==counterNext)counterNext.value=M.counterLabel(scene.counters[counterMode.value],counterMode.value);penModeLabel.hidden=tool!=='pen';markerModeLabel.hidden=tool!=='marker';correctionLabel.hidden=!['pen','marker'].includes(tool)||(tool==='marker'&&markerMode.value!=='freehand')||(tool==='pen'&&penMode.value!=='freehand');correctionRange.value=correctionNumber.value=correction[tool]??0}
  for(const input of [correctionRange,correctionNumber])input.oninput=()=>{if(busy||!['pen','marker'].includes(tool)||input.value==='')return;const v=Number(input.value);if(!Number.isFinite(v))return;correction[tool]=Math.round(Math.max(0,Math.min(100,v)));updateCorrection();remember()};
  penMode.onchange=markerMode.onchange=()=>{remember();update()};
  function strokeWidth(type){return Number(size.value)*(type==='marker'?5:['rect','circle','ellipse'].includes(type)?2:1)}
  const listen=(n,event,fn,opts)=>{n.addEventListener(event,fn,opts);listeners.push(()=>n.removeEventListener(event,fn,opts))};
  listen(finger,'change',remember);
  function close(value){if(closed)return;remember();closed=true;cancelAnimationFrame(frame);resizeObserver.disconnect();listeners.forEach(f=>f());for(const a of assets.values())a.img?.close?.();urls.forEach(u=>URL.revokeObjectURL(u));modal.remove();background.forEach(([n,inert])=>n.inert=inert);document.body.style.overflow=oldOverflow;current=null;previous?.isConnected&&previous.focus?.({preventScroll:true});done(value)}
  function cancel(){if(busy||subDialog)return;commitText();if(changed&&!confirm('今回の画像編集を破棄しますか？'))return;close(null)}
  function update(){updateCorrection();snapButton.textContent='スナップ '+(snapEnabled?'ON':'OFF');snapButton.setAttribute('aria-pressed',String(snapEnabled));if(!scene){panel.querySelectorAll('button,input,select,textarea').forEach(b=>b.disabled=!(b.classList.contains('qbDrawClose')||b.textContent==='キャンセル'));return;}undoButton.disabled=busy||!(textHistory?.past.length||history.past.length);redoButton.disabled=busy||!(editingTextId?textHistory?.future.length:history.future.length);saveButton.disabled=busy;const selected=scene.items.filter(i=>selection.includes(i.id));textInput.hidden=!editingTextId;cropButton.hidden=selected.length!==1||selected[0].type!=='image';cropButton.disabled=busy||subDialog;cropAllButton.disabled=busy||subDialog;[deleteButton,frontmostButton,forwardButton,backwardButton,backmostButton].forEach(b=>b.disabled=busy||!selected.length);palette.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.color===color)));tools.querySelectorAll('[data-tool]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tool===tool)));requestDraw()}
  function checkpoint(){history.push(scene);changed=history.past.length>0;update()}
  function commitText(){const hadText=!!textStart;textStart=null;editingTextId=null;textHistory=null;textInput.hidden=true;if(hadText)checkpoint();else requestDraw()}
  function useTool(next){if(busy||subDialog||gesture)return;commitText();tool=next;snapGuides=[];remember();selection=[];textInput.value='';update();canvas.focus({preventScroll:true})}
  function select(ids){commitText();selection=ids;const item=scene.items.find(i=>ids.length===1&&i.id===ids[0]);if(item){color=item.color||color;if(item.type==='text'){textInput.value=item.text;font.value=String(item.fontSize)}}update()}
  const toolsList=[['lasso','投げ縄'],['pen','ペン'],['marker','マーカー'],['text','文字'],['counter','連番'],['arrow','矢印'],['rect','四角い枠'],['circle','正円の枠'],['ellipse','楕円の枠']];
  for(const [name,label] of toolsList){const b=btn(label,'',()=>useTool(name));b.dataset.tool=name;b.setAttribute('aria-pressed',String(tool===name));tools.append(b)}
  const fileInput=el('input');fileInput.type='file';fileInput.accept='image/*,application/pdf';fileInput.multiple=true;fileInput.hidden=true;fileInput.onchange=()=>{addImages([...fileInput.files]);fileInput.value=''};
  const imageButton=btn('画像追加','',()=>chooseImageSource());imageButton.dataset.tool='image';imageButton.setAttribute('aria-pressed',String(tool==='image'));tools.append(imageButton,fileInput);
  function childMode(value){subDialog=value;panel.inert=value;modal.classList.toggle('qbDrawHasChild',value);if(!value&&!closed)panel.focus({preventScroll:true})}
  async function chooseImageSource(){
    if(!scene||busy||subDialog||gesture)return;commitText();tool='image';selection=[];snapGuides=[];remember();update();
    if(!window.QBImageEditorSources){fileInput.click();return}
    let source=null;childMode(true);
    try{source=await window.QBImageEditorSources.choose({onDevice:()=>{childMode(false);fileInput.click()}})}catch(e){status.textContent=e.message||e}finally{childMode(false)}
    if(!source||closed||source==='device')return;
    const blobs=[];let complete=false;busy=true;childMode(true);update();status.textContent='画像を準備中…';
    try{
      if(source==='recent'){
        if(!window.qbRecentImagePicker||!window.qbSupabase)throw Error('最近の画像を読み込めません。');
        const rows=await window.qbRecentImagePicker.pick({sb:window.qbSupabase,title:'最近の画像から',parent:modal,context:questionSnapshot});
        for(const row of rows||[]){const latest=await window.qbSupabase.from('question_images').select('image_path,annotation_base_image_path,annotation_result_image_path').eq('id',row.id).maybeSingle();if(latest.error)throw latest.error;const r0=latest.data,before=row.image_variant==='before-annotation';if(!r0||(before?(r0.annotation_base_image_path!==row.image_path||r0.annotation_result_image_path!==r0.image_path):r0.image_path!==row.image_path))throw Error('元画像が更新されています。最近の画像から選び直してください。');const r=await window.qbSupabase.storage.from('question-media').download(row.image_path);if(r.error)throw r.error;blobs.push(r.data)}
      }else if(source==='library'){
        if(!window.QBImageLibraryStore||!window.qbSupabase)throw Error('画像ライブラリを読み込めません。');
        const rows=await window.QBImageEditorSources.pickLibrary({sb:window.qbSupabase});
        for(const row of rows||[]){const latest=await window.QBImageLibraryStore.get(window.qbSupabase,row.id);if(latest.archived||latest.revision!==row.revision||latest.object_path!==row.object_path)throw Error('ライブラリの元画像が更新されています。選び直してください。');blobs.push(await window.QBImageLibraryStore.download(window.qbSupabase,latest))}
      }else if(source==='question'){
        if(!questionSnapshot||!window.QBQuestionExport)throw Error('この問題を画像化できません。');
        const result=await window.QBQuestionExport.render(questionSnapshot,{width:3600,native:true});blobs.push(result.blob);
      }
      complete=true;
    }catch(e){status.textContent='画像を追加できませんでした：'+(e.message||e)}finally{busy=false;childMode(false);if(!closed)update()}
    if(complete&&blobs.length&&!closed)await addImages(blobs);
  }
  for(const c of M.colors){const b=btn('','qbDrawSwatch',()=>{if(busy)return;commitText();color=c.value;remember();scene?.items.filter(i=>selection.includes(i.id)&&i.type!=='image').forEach(i=>i.color=color);if(selection.length)checkpoint();else update()});b.dataset.color=c.value;b.style.setProperty('--swatch',c.value);b.title=c.name;b.setAttribute('aria-label',c.name);palette.append(b)}
  size.onchange=()=>{if(busy)return;remember();scene.items.filter(i=>selection.includes(i.id)&&['pen','marker','arrow','rect','circle','ellipse'].includes(i.type)).forEach(i=>i.width=strokeWidth(i.type));if(selection.length)checkpoint()};
  font.onchange=()=>{if(busy)return;remember();scene.items.filter(i=>selection.includes(i.id)&&i.type==='text').forEach(i=>{i.fontSize=Number(font.value);measureText(i)});if(selection.length)checkpoint()};
  counterMode.onchange=()=>update();
  counterNext.onchange=()=>{if(!scene||busy)return;const value=M.counterValue(counterNext.value,counterMode.value);if(value){scene.counters[counterMode.value]=value;checkpoint()}else{counterNext.value=M.counterLabel(scene.counters[counterMode.value],counterMode.value);status.textContent='番号は1以上の整数、英字はa〜z（aa以降も可）で入力してください。'}};
  counterSize.onchange=()=>{if(!scene||busy)return;const d=Number(counterSize.value);scene.items.filter(i=>selection.includes(i.id)&&i.type==='counter').forEach(i=>{i.x+=(i.w-d)/2;i.y+=(i.h-d)/2;i.w=i.h=d});if(selection.length)checkpoint()};
  function undo(redo=false){if(busy||subDialog||gesture||textComposing||!history)return;if(editingTextId&&textHistory){const stack=redo?textHistory.future:textHistory.past;if(stack.length){const value=redo?textHistory.redo():textHistory.undo();textInput.value=value.text;textInput.setSelectionRange(Math.min(value.start,value.text.length),Math.min(value.end,value.text.length));applyText();update();return}if(redo)return;}commitText();scene=redo?history.redo():history.undo();selection=[];snapGuides=[];changed=history.past.length>0;update()}
  const undoButton=btn('↶ 元に戻す','',()=>undo()),redoButton=btn('↷ やり直す','',()=>undo(true));tools.append(undoButton,redoButton);
  for(const b of [undoButton,redoButton])b.addEventListener('pointerdown',e=>e.preventDefault());
  const deleteButton=btn('削除','',()=>{if(busy)return;commitText();scene.items=scene.items.filter(i=>!selection.includes(i.id));selection=[];snapGuides=[];checkpoint()});
  const frontmostButton=btn('最前面へ','',()=>reorder('front')),forwardButton=btn('一つ前面へ','',()=>reorder('forward')),backwardButton=btn('一つ背面へ','',()=>reorder('backward')),backmostButton=btn('最背面へ','',()=>reorder('back')),cropButton=btn('選択画像をトリミング','qbDrawCropSelected',()=>cropSelection(false)),cropAllButton=btn('全体をトリミング','qbDrawCropAll',()=>cropSelection(true));tools.append(cropAllButton);editActions.append(deleteButton,frontmostButton,forwardButton,backwardButton,backmostButton,cropButton);
  function reorder(mode){if(busy||subDialog||gesture)return;commitText();scene.items=M.reorder(scene.items,selection,mode);checkpoint()}
  navigation.append(btn('−','',()=>zoomAt(.8)),btn('全体表示','',()=>fit()),btn('＋','',()=>zoomAt(1.25)),btn('左に余白','',()=>margin('left')),btn('右に余白','',()=>margin('right')),btn('上に余白','',()=>margin('top')),btn('下に余白','',()=>margin('bottom')));
  function margin(side){if(!scene||busy||subDialog||gesture)return;commitText();const amount=Math.max(160,Math.round(scene.width*.25)),dx=side==='left'?amount:0,dy=side==='top'?amount:0;if(side==='left'||side==='right')scene.width+=amount;else scene.height+=amount;if(dx||dy){scene.base.x+=dx;scene.base.y+=dy;scene.items=scene.items.map(item=>M.transform(item,{x:0,y:0,w:1,h:1},{x:dx,y:dy,w:1,h:1}))}checkpoint();fit()}
  function fit(){if(!scene)return;const r=stage.getBoundingClientRect();zoom=Math.min((r.width-32)/scene.width,(r.height-32)/scene.height);ox=(r.width-scene.width*zoom)/2;oy=(r.height-scene.height*zoom)/2;requestDraw()}
  function zoomAt(f,p){if(!scene)return;const r=stage.getBoundingClientRect(),x=p?.x??r.width/2,y=p?.y??r.height/2,next=Math.max(.02,Math.min(12,zoom*f));ox=x-(x-ox)*next/zoom;oy=y-(y-oy)*next/zoom;zoom=next;requestDraw()}
  const resizeObserver=new ResizeObserver(()=>{const r=stage.getBoundingClientRect(),d=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.max(1,Math.round(r.width*d));canvas.height=Math.max(1,Math.round(r.height*d));requestDraw()});resizeObserver.observe(stage);
  function renderItem(ctx,item){
    ctx.save();ctx.setLineDash([]);ctx.lineDashOffset=0;ctx.strokeStyle=item.color||color;ctx.fillStyle=item.color||color;ctx.lineWidth=item.width||2;ctx.lineCap='round';ctx.lineJoin='round';
    if(item.points){ctx.globalAlpha=item.type==='marker'?.32:1;ctx.beginPath();const p=item.points;ctx.moveTo(p[0].x,p[0].y);if(p.length===1){ctx.lineTo(p[0].x+.01,p[0].y)}else for(let i=1;i<p.length;i++)ctx.lineTo(p[i].x,p[i].y);ctx.stroke()}
    else if(item.type==='counter'){ctx.beginPath();ctx.ellipse(item.x+item.w/2,item.y+item.h/2,item.w/2,item.h/2,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=['#ffd63d','#22b8dc','#f28c28','#ffffff'].includes(item.color)?'#172033':'#fff';ctx.textAlign='center';ctx.textBaseline='middle';let fontSize=item.h*.58;ctx.font=`700 ${fontSize}px sans-serif`;const measured=ctx.measureText(item.label).width;if(measured>item.w*.76){fontSize*=item.w*.76/measured;ctx.font=`700 ${fontSize}px sans-serif`}ctx.fillText(item.label,item.x+item.w/2,item.y+item.h/2)}
    else if(item.type==='rect'){ctx.lineJoin='miter';ctx.strokeRect(item.x,item.y,item.w,item.h)}
    else if(item.type==='circle'||item.type==='ellipse'){ctx.beginPath();ctx.ellipse(item.x+item.w/2,item.y+item.h/2,item.w/2,item.h/2,0,0,Math.PI*2);ctx.stroke()}
    else if(item.type==='arrow'){const a=item.a,b=item.b,angle=Math.atan2(b.y-a.y,b.x-a.x),len=Math.max(12,item.width*4);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.moveTo(b.x-len*Math.cos(angle-.5),b.y-len*Math.sin(angle-.5));ctx.lineTo(b.x,b.y);ctx.lineTo(b.x-len*Math.cos(angle+.5),b.y-len*Math.sin(angle+.5));ctx.stroke()}
    else if(item.type==='text'){ctx.font=`${item.fontSize}px -apple-system,BlinkMacSystemFont,"Hiragino Sans","Yu Gothic",sans-serif`;ctx.textBaseline='top';item.text.split('\n').forEach((line,i)=>ctx.fillText(line,item.x,item.y+i*item.fontSize*1.3))}
    else if(item.type==='image'){const img=assets.get(item.assetId)?.img;if(img)drawAsset(ctx,img,item)}ctx.restore();
  }
  function drawAsset(ctx,img,item){const r=item.sourceRect;if(r)ctx.drawImage(img,r.x,r.y,r.w,r.h,item.x,item.y,item.w,item.h);else ctx.drawImage(img,item.x,item.y,item.w,item.h)}
  function paint(ctx,preview=false){ctx.imageSmoothingEnabled=preview;ctx.imageSmoothingQuality='high';ctx.fillStyle='#fff';ctx.fillRect(0,0,scene.width,scene.height);const base=assets.get(scene.base.assetId)?.img;if(base)drawAsset(ctx,base,scene.base);scene.items.forEach(i=>{if(!preview||i.id!==editingTextId)renderItem(ctx,i)})}
  function requestDraw(){if(closed||frame)return;frame=requestAnimationFrame(()=>{frame=0;draw()})}
  function draw(){if(!scene)return;const ctx=canvas.getContext('2d'),r=stage.getBoundingClientRect(),d=canvas.width/Math.max(1,r.width),accent=getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()||'#126fb3';ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.setTransform(d*zoom,0,0,d*zoom,d*ox,d*oy);ctx.save();ctx.beginPath();ctx.rect(0,0,scene.width,scene.height);ctx.clip();paint(ctx,true);ctx.restore();ctx.save();
    const box=M.union(scene.items.filter(i=>selection.includes(i.id)));ctx.strokeStyle=accent;ctx.lineWidth=1.5/zoom;ctx.setLineDash([5/zoom,4/zoom]);if(box){ctx.strokeRect(box.x,box.y,box.w,box.h);ctx.setLineDash([]);for(const [x,y] of [[box.x,box.y],[box.x+box.w,box.y],[box.x,box.y+box.h],[box.x+box.w,box.y+box.h]]){ctx.fillStyle='#fff';ctx.fillRect(x-5/zoom,y-5/zoom,10/zoom,10/zoom);ctx.strokeRect(x-5/zoom,y-5/zoom,10/zoom,10/zoom)}}
    if(snapGuides.length){ctx.setLineDash([]);ctx.strokeStyle=accent;ctx.lineWidth=1/zoom;ctx.globalAlpha=.75;for(const guide of snapGuides){ctx.beginPath();if(guide.axis==='x'){ctx.moveTo(guide.value,0);ctx.lineTo(guide.value,scene.height)}else{ctx.moveTo(0,guide.value);ctx.lineTo(scene.width,guide.value)}ctx.stroke()}ctx.globalAlpha=1}
    if(lassoPoints?.length){ctx.beginPath();ctx.moveTo(lassoPoints[0].x,lassoPoints[0].y);lassoPoints.forEach(p=>ctx.lineTo(p.x,p.y));ctx.stroke()}ctx.restore();positionTextInput();
  }
  const local=e=>{const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}};
  const straightEnd=(g,p)=>M.lineEnd(g.start,p,g.item.lineMode);
  const point=e=>{const p=local(e);return{x:(p.x-ox)/zoom,y:(p.y-oy)/zoom}};
  function measureText(item){const ctx=canvas.getContext('2d');ctx.font=`${item.fontSize}px -apple-system,BlinkMacSystemFont,"Hiragino Sans","Yu Gothic",sans-serif`;item.w=Math.max(item.fontSize,...item.text.split('\n').map(l=>ctx.measureText(l).width));item.h=Math.max(1,item.text.split('\n').length)*item.fontSize*1.3}
  function positionTextInput(){
    const item=scene?.items.find(i=>i.id===editingTextId);if(!item)return;
    const scale=Math.max(.02,zoom);Object.assign(textInput.style,{left:(ox+item.x*zoom)+'px',top:(oy+item.y*zoom)+'px',width:Math.max(160,item.w+24)+'px',height:Math.max(item.fontSize*1.3+10,item.h+10)+'px',fontSize:item.fontSize+'px',color:item.color,background:item.color==='#ffffff'?'#353942':'#fff',transform:`scale(${scale})`});
  }
  function editText(item,selectAll=false){
    editingTextId=item.id;selection=[item.id];textInput.value=item.text;textInput.hidden=false;textStart=M.copy(scene);positionTextInput();textInput.focus({preventScroll:true});
    if(selectAll)textInput.select();else textInput.setSelectionRange(item.text.length,item.text.length);textHistory=new M.History(textSnapshot());update();
  }
  function textSnapshot(){return{text:textInput.value,start:textInput.selectionStart,end:textInput.selectionEnd}}
  function applyText(){const item=scene?.items.find(i=>i.id===editingTextId&&i.type==='text');if(!item)return;item.text=textInput.value;measureText(item);requestDraw()}
  textInput.onblur=commitText;
  textInput.oninput=()=>{if(busy||!textHistory)return;applyText();if(!textComposing&&textInput.value!==textHistory.current.text)textHistory.push(textSnapshot());update()};
  textInput.addEventListener('compositionstart',()=>textComposing=true);
  textInput.addEventListener('compositionend',()=>{textComposing=false;textInput.oninput()});
  textInput.addEventListener('beforeinput',e=>{if(['historyUndo','historyRedo'].includes(e.inputType)){e.preventDefault();e.stopImmediatePropagation();undo(e.inputType==='historyRedo')}else if(textHistory&&textInput.value===textHistory.current.text){textHistory.current=textSnapshot()}});

  async function addImages(files){if(!scene||busy||subDialog||!files.length)return;commitText();busy=true;status.textContent=files.some(f=>f instanceof Blob&&f.size>WARN_IMAGE_BYTES)?'大きな画像を追加しています…':'画像を追加中…';try{const pending=[];for(let f of files){if(window.QBFiles?.isPDF(f)){childMode(true);try{f=await QBFiles.open(f,{pickPage:true})}finally{childMode(false)}if(!f)continue}const id=await asset(f);if(closed)return;const img=assets.get(id).img,scale=Math.min(1,scene.width*.6/img.width,scene.height*.6/img.height),w=img.width*scale,h=img.height*scale;pending.push({id:crypto.randomUUID(),type:'image',assetId:id,x:(scene.width-w)/2+pending.length*16,y:(scene.height-h)/2+pending.length*16,w,h})}scene.items.push(...pending);selection=pending.map(i=>i.id);tool='image';checkpoint();status.textContent='画像を追加しました'}catch(e){status.textContent=e.message}finally{busy=false;update()}}
  // Cropping records a viewport/source rectangle in History. No intermediate
  // upload or full-resolution canvas is needed, even with unsaved annotations.
  async function cropSelection(whole){
    if(!scene||busy||subDialog||gesture)return;
    const item=whole?null:scene.items.find(i=>selection.length===1&&selection[0]===i.id&&i.type==='image');
    if(!whole&&!item)return;
    commitText();snapGuides=[];childMode(true);
    const preview=document.createElement('canvas');let url;
    try{
      const img=item?assets.get(item.assetId)?.img:null;
      if(item&&!img)throw Error('画像を読み込めません。');
      const source=item?(item.sourceRect||{x:0,y:0,w:img.naturalWidth||img.width,h:img.naturalHeight||img.height}):{x:0,y:0,w:scene.width,h:scene.height};
      const scale=Math.min(1,1600/source.w,1600/source.h);
      preview.width=Math.max(1,Math.round(source.w*scale));preview.height=Math.max(1,Math.round(source.h*scale));
      const ctx=preview.getContext('2d');if(!ctx)throw Error('プレビューを作成できません。');
      if(item)ctx.drawImage(img,source.x,source.y,source.w,source.h,0,0,preview.width,preview.height);
      else {ctx.scale(preview.width/scene.width,preview.height/scene.height);paint(ctx,true)}
      const blob=await new Promise(resolve=>preview.toBlob(resolve,'image/png'));if(!blob)throw Error('プレビューを作成できません。');
      url=URL.createObjectURL(blob);
      const data=await window.QBImageCrop.open(url,{title:whole?'画像全体をトリミング':'選択した画像をトリミング',rotatable:false,selectionOnly:true});
      if(!data)return;
      const x=Math.max(0,Math.min(source.w-1,Math.round(data.x*source.w/preview.width))),y=Math.max(0,Math.min(source.h-1,Math.round(data.y*source.h/preview.height)));
      const w=Math.max(1,Math.min(source.w-x,Math.round(data.width*source.w/preview.width))),h=Math.max(1,Math.min(source.h-y,Math.round(data.height*source.h/preview.height)));
      if(x===0&&y===0&&w===source.w&&h===source.h)return;
      if(item){item.sourceRect={x:source.x+x,y:source.y+y,w,h};item.w*=w/source.w;item.h*=h/source.h}
      else {scene.base.x-=x;scene.base.y-=y;scene.items=scene.items.map(i=>M.transform(i,{x:0,y:0,w:1,h:1},{x:-x,y:-y,w:1,h:1}));scene.width=w;scene.height=h;selection=[]}
      checkpoint();fit();
    }catch(e){status.textContent='トリミングできませんでした：'+(e.message||e)}
    finally{if(url)URL.revokeObjectURL(url);preview.width=preview.height=1;childMode(false);update()}
  }
  function abortGesture(){if(gesture?.before)scene=gesture.before;gesture=null;lassoPoints=null;snapGuides=[];requestDraw()}
  function touchPair(){const p=[...pointers.values()].filter(x=>x.type==='touch');return p.length>=2?{x:(p[0].x+p[1].x)/2,y:(p[0].y+p[1].y)/2,dist:Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y)}:null}
  const directTypes=new Set(['image','rect','circle','ellipse','counter','arrow','text']);
  listen(canvas,'pointerdown',e=>{
    if(!scene||busy||subDialog||e.button>0)return;e.preventDefault();try{canvas.setPointerCapture(e.pointerId)}catch{}const l=local(e);pointers.set(e.pointerId,{...l,type:e.pointerType});
    if(e.pointerType==='touch'&&penDown)return;const pair=penDown||e.pointerType==='pen'?null:touchPair();if(pair){abortGesture();pinch=pair;return}commitText();canvas.focus({preventScroll:true});const p=point(e);
    if(e.pointerType==='pen'){if(gesture?.kind==='pan')gesture=null;penDown=true}
    if(gesture)return;snapGuides=[];
    if(tool==='lasso'||directTypes.has(tool)){
      const selected=scene.items.filter(i=>selection.includes(i.id)&&(tool==='lasso'||i.type===tool)),box=M.union(selected);
      if(box){const corners=[{x:box.x,y:box.y},{x:box.x+box.w,y:box.y},{x:box.x,y:box.y+box.h},{x:box.x+box.w,y:box.y+box.h}],corner=corners.findIndex(c=>Math.hypot(c.x-p.x,c.y-p.y)<14/zoom);if(corner>=0){gesture={kind:'resize',before:M.copy(scene),box,corner,id:e.pointerId};return}}
      const hit=[...scene.items].reverse().find(i=>(tool==='lasso'||i.type===tool)&&M.hit(i,p,6/zoom));
      if(hit){const wasSelected=selection.length===1&&selection[0]===hit.id;if(!selection.includes(hit.id)||tool!=='lasso'&&selection.some(id=>scene.items.find(i=>i.id===id)?.type!==tool))select([hit.id]);gesture={kind:'move',before:M.copy(scene),start:p,id:e.pointerId,moved:false,textId:wasSelected&&hit.type==='text'?hit.id:null};return}

    }
    if(tool==='text'&&selection.length){select([]);return}
    if(e.pointerType==='touch'&&!finger.checked&&tool!=='counter'){gesture={kind:'pan',start:l,ox,oy,id:e.pointerId};return}
    if(tool==='lasso'){select([]);lassoPoints=[p];gesture={kind:'lasso',id:e.pointerId};return}
    if(p.x<0||p.y<0||p.x>scene.width||p.y>scene.height)return;
    if(tool==='image')return;
    if(tool==='text'){const item={id:crypto.randomUUID(),type:'text',text:'文字を入力',fontSize:Number(font.value)||32,color,x:p.x,y:p.y,w:1,h:1};measureText(item);scene.items.push(item);selection=[item.id];checkpoint();editText(item,true);return}
    if(tool==='counter'){selection=[];gesture={kind:'counter',start:l,point:p,ox,oy,id:e.pointerId,moved:false};return}
    const before=M.copy(scene),item={id:crypto.randomUUID(),type:tool,color,width:strokeWidth(tool)};if(tool==='pen'||tool==='marker'){item.points=[p];const mode=tool==='pen'?penMode.value:markerMode.value;if(mode!=='freehand'){item.straight=true;item.lineMode=mode}}if(['rect','circle','ellipse'].includes(tool))Object.assign(item,{x:p.x,y:p.y,w:0,h:0});if(tool==='arrow')Object.assign(item,{a:p,b:p});scene.items.push(item);selection=[];gesture={kind:'draw',before,item,correction:correction[tool]??0,strokeZoom:zoom,start:p,id:e.pointerId};requestDraw();
  });
  listen(canvas,'pointermove',e=>{
    lastPoint=local(e);if(!pointers.has(e.pointerId)||busy||subDialog)return;e.preventDefault();pointers.set(e.pointerId,{...local(e),type:e.pointerType});if(e.pointerType==='touch'&&penDown)return;
    const pair=penDown||e.pointerType==='pen'?null:touchPair();if(pair){if(pinch){const ratio=pair.dist/Math.max(1,pinch.dist);zoomAt(ratio,pinch);ox+=pair.x-pinch.x;oy+=pair.y-pinch.y;requestDraw()}pinch=pair;return}
    if(pinch||!gesture||gesture.id!==e.pointerId)return;const g=gesture,p=point(e);
    if(g.kind==='counter'){const l=local(e);if(Math.hypot(l.x-g.start.x,l.y-g.start.y)>6)g.moved=true;if(g.moved){ox=g.ox+l.x-g.start.x;oy=g.oy+l.y-g.start.y}}
    else if(g.kind==='pan'){const l=local(e);ox=g.ox+l.x-g.start.x;oy=g.oy+l.y-g.start.y}
    else if(g.kind==='draw'){if(g.item.straight){g.item.points=[g.start,straightEnd(g,p)]}else if(g.item.points){const events=e.getCoalescedEvents?.()||[e];for(const ev of events.length?events:[e]){const last=g.item.points.at(-1),n=M.stabilize(last,point(ev),g.correction,g.strokeZoom);if(Math.hypot(n.x-last.x,n.y-last.y)>=.6/zoom)g.item.points.push(n)}}else if(['rect','circle','ellipse'].includes(g.item.type))Object.assign(g.item,M.shapeRect(g.start,p,g.item.type));else g.item.b=p}
    else if(g.kind==='lasso')lassoPoints.push(p);
    else if(g.kind==='move'){if(!g.moved&&Math.hypot(p.x-g.start.x,p.y-g.start.y)*zoom<4)return;g.moved=true;const rawDx=p.x-g.start.x,rawDy=p.y-g.start.y,snapped=snapEnabled?M.snapMove(g.before.items,selection,rawDx,rawDy,g.before.width,g.before.height,zoom,10):{dx:rawDx,dy:rawDy,guides:[]};snapGuides=snapped.guides;scene.items=g.before.items.map(i=>{if(!selection.includes(i.id))return M.copy(i);const b=M.bounds(i);return M.transform(i,b,{...b,x:b.x+snapped.dx,y:b.y+snapped.dy})})}
    else if(g.kind==='resize'){snapGuides=[];const b=g.box,anchor={x:g.corner%2===0?b.x+b.w:b.x,y:g.corner<2?b.y+b.h:b.y},to=M.rect(anchor,p),only=scene.items.filter(i=>selection.includes(i.id));to.w=Math.max(8,to.w);to.h=Math.max(8,to.h);if(only.length!==1||!['rect','ellipse'].includes(only[0].type)){const scale=Math.max(to.w/Math.max(1,b.w),to.h/Math.max(1,b.h));to.w=b.w*scale;to.h=b.h*scale;to.x=g.corner%2===0?anchor.x-to.w:anchor.x;to.y=g.corner<2?anchor.y-to.h:anchor.y}scene.items=g.before.items.map(i=>selection.includes(i.id)?M.transform(i,b,to):M.copy(i))}
    requestDraw();
  });
  const end=e=>{if(!pointers.has(e.pointerId))return;pointers.delete(e.pointerId);if(e.pointerType==='pen')penDown=false;if(pinch){if(!pointers.size)pinch=null;return}if(!gesture||gesture.id!==e.pointerId)return;const g=gesture;if(e.type==='pointercancel'){abortGesture();return}if(g.kind==='draw'&&g.item.points){const p=point(e),last=g.item.points.at(-1);if(g.item.straight)g.item.points=[g.start,straightEnd(g,p)];else if(Math.hypot(p.x-last.x,p.y-last.y)>.01)g.item.points.push(p)}if(g.kind==='draw'&&['rect','circle','ellipse'].includes(g.item.type))Object.assign(g.item,M.shapeRect(g.start,point(e),g.item.type));if(g.kind==='counter'){if(!g.moved&&Math.hypot(local(e).x-g.start.x,local(e).y-g.start.y)<=6){const mode=counterMode.value,n=scene.counters[mode],d=Number(counterSize.value),p=g.point;scene.items.push({id:crypto.randomUUID(),type:'counter',label:M.counterLabel(n,mode),color,x:p.x-d/2,y:p.y-d/2,w:d,h:d});scene.counters[mode]=n+1;checkpoint()}}else if(g.kind==='lasso'){selection=M.lasso(scene.items,lassoPoints);lassoPoints=null}else if(g.kind!=='pan'){if(g.kind==='draw'&&['rect','circle','ellipse'].includes(g.item.type)&&(g.item.w<1||g.item.h<1))scene=g.before;checkpoint()}gesture=null;snapGuides=[];update();if(g.kind==='move'&&!g.moved&&g.textId){const item=scene.items.find(i=>i.id===g.textId);if(item)editText(item)}};listen(canvas,'pointerup',end);listen(canvas,'pointercancel',end);
  function mountReference(img){
    const bar=el('div','qbDrawReferenceControls'),view=el('div','qbDrawReferenceViewport');view.tabIndex=0;view.setAttribute('aria-label','問題・解答の拡大表示');img.draggable=false;view.append(img);reference.replaceChildren(bar,view);
    let scale=1,x=0,y=0,nativeScale=null,lastNative=0;const contacts=new Map();
    const paint=()=>{img.style.transform=`translate(${x}px,${y}px) scale(${scale})`;view.dataset.scale=String(scale)};
    const local=e=>{const b=view.getBoundingClientRect();return{x:e.clientX-b.left,y:e.clientY-b.top}};
    const zoom=(factor,p={x:view.clientWidth/2,y:view.clientHeight/2})=>{const next=Math.max(1,Math.min(10,scale*factor));x=p.x-(p.x-x)*next/scale;y=p.y-(p.y-y)*next/scale;scale=next;paint()};
    const pair=()=>{const a=[...contacts.values()];return a.length>=2?{x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2,dist:Math.hypot(a[1].x-a[0].x,a[1].y-a[0].y)}:null};
    bar.append(el('b','','問題・解答'),btn('−','',()=>zoom(.8)),btn('全体表示','',()=>{scale=1;x=y=0;paint()}),btn('＋','',()=>zoom(1.25)));
    listen(view,'pointerdown',e=>{if(e.button>0)return;e.preventDefault();e.stopPropagation();view.focus({preventScroll:true});contacts.set(e.pointerId,local(e));try{view.setPointerCapture(e.pointerId)}catch{}});
    listen(view,'pointermove',e=>{if(!contacts.has(e.pointerId))return;e.preventDefault();e.stopPropagation();const before=pair(),prev=contacts.get(e.pointerId),p=local(e);contacts.set(e.pointerId,p);const after=pair();if(before&&after){zoom(after.dist/Math.max(1,before.dist),before);x+=after.x-before.x;y+=after.y-before.y}else{x+=p.x-prev.x;y+=p.y-prev.y}paint()});
    for(const kind of ['pointerup','pointercancel','lostpointercapture'])listen(view,kind,e=>contacts.delete(e.pointerId));
    // Capture before the editor-wide gesture handlers: reference and canvas have separate transforms.
    listen(window,'wheel',e=>{if(!view.contains(e.target))return;e.preventDefault();e.stopImmediatePropagation();if(nativeScale!==null||performance.now()-lastNative<120)return;const unit=e.deltaMode===1?16:e.deltaMode===2?view.clientHeight:1;if(e.ctrlKey||e.metaKey)zoom(Math.exp(-e.deltaY*unit*.004),local(e));else{x-=e.deltaX*unit;y-=e.deltaY*unit;paint()}},{capture:true,passive:false});
    for(const kind of ['gesturestart','gesturechange','gestureend'])listen(window,kind,e=>{if(!view.contains(e.target)&&nativeScale===null)return;e.preventDefault();e.stopImmediatePropagation();if(kind==='gesturestart'){nativeScale=1}else if(kind==='gestureend'){nativeScale=null;lastNative=performance.now()}else if(!pair()){const next=Number(e.scale);if(next>0){zoom(next/(nativeScale||1),local(e));nativeScale=next}}},{capture:true,passive:false});
    paint();
  }
  function gestureAnchor(e){const r=stage.getBoundingClientRect();return Number.isFinite(e.clientX)&&Number.isFinite(e.clientY)&&e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom?{x:e.clientX-r.left,y:e.clientY-r.top}:lastPoint||{x:r.width/2,y:r.height/2}}
  // Safari trackpads emit GestureEvents; other browsers commonly emit Ctrl+wheel.
  listen(window,'gesturestart',e=>{if(!scene||busy||subDialog||penDown||reference.contains(e.target))return;e.preventDefault();e.stopImmediatePropagation();commitText();abortGesture();nativeGesture={scale:1,anchor:gestureAnchor(e)}},{passive:false,capture:true});
  listen(window,'gesturechange',e=>{if(!scene||busy||subDialog||penDown||reference.contains(e.target))return;e.preventDefault();e.stopImmediatePropagation();if(pinch||touchPair())return;if(!nativeGesture)nativeGesture={scale:1,anchor:gestureAnchor(e)};const scale=Number(e.scale);if(Number.isFinite(scale)&&scale>0){zoomAt(scale/nativeGesture.scale,nativeGesture.anchor);nativeGesture.scale=scale}},{passive:false,capture:true});
  listen(window,'gestureend',e=>{if(!nativeGesture)return;e.preventDefault();e.stopImmediatePropagation();nativeGesture=null;nativeEndedAt=performance.now()},{passive:false,capture:true});
  listen(window,'wheel',e=>{if(!scene||busy||subDialog||reference.contains(e.target)||(!(e.ctrlKey||e.metaKey)&&!stage.contains(e.target)))return;e.preventDefault();e.stopImmediatePropagation();if(nativeGesture||pinch||touchPair()||performance.now()-nativeEndedAt<120)return;const unit=e.deltaMode===1?16:e.deltaMode===2?stage.clientHeight:1;if(e.ctrlKey||e.metaKey)zoomAt(Math.exp(-e.deltaY*unit*.004),gestureAnchor(e));else{ox-=e.deltaX*unit;oy-=e.deltaY*unit;requestDraw()}},{passive:false,capture:true});
  async function save(){if(!scene||busy||subDialog||gesture)return;commitText();busy=true;update();panel.querySelectorAll('button,input,select,textarea').forEach(b=>b.disabled=true);status.textContent='保存中…';let output;try{const d=M.nativeExportPlan(scene,id=>{const img=assets.get(id)?.img;return img?{width:img.naturalWidth||img.width,height:img.naturalHeight||img.height}:null});if(d.width*d.height>200000000&&!confirm(`元解像度で保存すると ${d.width.toLocaleString()} × ${d.height.toLocaleString()}px になります。自動縮小せず保存を続けますか？`))throw Error('保存を中止しました。編集内容は残っています。');output=await tiledPng(d.width,d.height,ctx=>{ctx.fillStyle='#fff';ctx.fillRect(0,0,d.width,d.height);ctx.scale(d.scale,d.scale);paint(ctx)},percent=>status.textContent=`元解像度PNG ${d.width.toLocaleString()} × ${d.height.toLocaleString()}px — ${percent}%`);if(output.size>MAX_IMAGE_BYTES)throw Error('保存画像が100MBを超えました。画質は自動で落としません。画像を分けて保存してください。');if(output.size>WARN_IMAGE_BYTES)status.textContent=`大きな画像（${(output.size/1024/1024).toFixed(1)}MB）を保存中…`;await options.onSave?.(output,{width:d.width,height:d.height});close(output)}catch(e){status.textContent='保存できませんでした：'+(e.message||e);busy=false;panel.querySelectorAll('button,input,select,textarea').forEach(b=>b.disabled=false);update()}}
  listen(window,'paste',e=>{if(closed||subDialog)return;const files=filesFromPaste(e);if(!files.length){if(e.target===pasteTarget){e.preventDefault();e.stopImmediatePropagation();pasteTarget.value='';status.textContent='画像をコピーしてから貼り付けてください。';canvas.focus({preventScroll:true})}return}e.preventDefault();e.stopImmediatePropagation();pasteTarget.value='';if(!busy&&!gesture){canvas.focus({preventScroll:true});addImages(files)}},true);
  listen(window,'keydown',e=>{
    if(closed||subDialog)return;const mod=e.metaKey||e.ctrlKey,key=e.key.toLowerCase(),input=e.target.closest?.('input,textarea');
    if(mod&&key==='v'){if(busy||!scene||gesture)e.preventDefault();else if(!input&&!e.target.isContentEditable){pasteTarget.value='';pasteTarget.focus({preventScroll:true})}e.stopImmediatePropagation();return}
    if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();cancel();return}
    if(mod&&key==='s'){e.preventDefault();e.stopImmediatePropagation();if(!e.repeat&&!e.isComposing)save();return}
    if(mod&&(key==='z'||e.code==='KeyZ'||key==='y'||e.code==='KeyY')){e.preventDefault();e.stopImmediatePropagation();if(!e.repeat&&!e.isComposing)undo(e.shiftKey||key==='y'||e.code==='KeyY');return}
    if(['Delete','Backspace'].includes(e.key)&&!input){e.preventDefault();e.stopImmediatePropagation();deleteButton.click();return}
    if(e.key==='Tab'){const all=[...panel.querySelectorAll('button,input,select,textarea,[tabindex="0"]')].filter(n=>n!==pasteTarget&&!n.disabled&&!n.hidden&&n.getClientRects().length),first=all[0],last=all.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===panel)){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}
    // Keep page-level save/navigation/format shortcuts scoped to this dialog.
    e.stopPropagation();
  },true);
  // iPad/macOS can deliver native history actions without a keyboard event.
  listen(window,'beforeinput',e=>{if(closed||subDialog||!['historyUndo','historyRedo'].includes(e.inputType))return;e.preventDefault();e.stopImmediatePropagation();undo(e.inputType==='historyRedo')},true);
  listen(document,'focusin',e=>{if(!closed&&!subDialog&&!modal.contains(e.target))panel.focus({preventScroll:true})},true);
  listen(window,'beforeunload',e=>{if(changed||busy){e.preventDefault();e.returnValue=''}});
  update();
  try{const id=await asset(source);if(closed)return result;const img=assets.get(id).img;scene={width:img.width,height:img.height,base:{assetId:id,x:0,y:0,w:img.width,h:img.height},items:[],counters:{number:1,letter:1}};history=new M.History(scene);panel.querySelectorAll('button,input,select,textarea').forEach(b=>b.disabled=false);status.textContent='保存後は書き込みをまとめて1枚の画像にします。';fit();update();if(options.initialImages?.length)await addImages(options.initialImages)}catch(e){status.textContent=e.message}
  return result;
}
window.QBImageEditor={open,filesFromPaste,encodePng:tiledPng,isOpen:()=>!!current};
})();
