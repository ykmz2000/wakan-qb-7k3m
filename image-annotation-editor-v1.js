/* Transient objects only. The save callback receives one flattened PNG. */
(()=>{
'use strict';
let current=null;
const M=window.QBImageModel;
const settingsKey='qb-image-editor-settings-v1';
let sessionSettings={};
function readSettings(){try{return JSON.parse(localStorage.getItem(settingsKey)||'null')||sessionSettings}catch{return sessionSettings}}
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n};
const btn=(label,cls,fn)=>{const b=el('button',cls,label);b.type='button';b.onclick=fn;return b};
function filesFromPaste(e){const items=[...(e.clipboardData?.items||[])].filter(i=>i.kind==='file'&&/^image\//.test(i.type)).map(i=>i.getAsFile()).filter(Boolean);return items.length?items:[...(e.clipboardData?.files||[])].filter(f=>/^image\//.test(f.type))}
function loadImage(source){return new Promise((resolve,reject)=>{const img=new Image();img.crossOrigin='anonymous';img.onload=()=>resolve(img);img.onerror=()=>reject(Error('画像を開けませんでした。PNG・JPEG・WebPなどの画像をお試しください。'));img.src=source})}
function png(canvas){return new Promise((resolve,reject)=>{try{canvas.toBlob(b=>b?resolve(b):reject(Error('画像を作成できませんでした。')), 'image/png')}catch(e){reject(e)}})}
async function open(source,options={}){
  if(current)throw Error('画像編集中です。保存またはキャンセルしてから開いてください。');
  const preferences=readSettings();
  const correction={pen:20,marker:50};for(const key of ['pen','marker']){const v=preferences.correction?.[key];if(typeof v==='number'&&Number.isFinite(v))correction[key]=Math.round(Math.max(0,Math.min(100,v)))}
  const previous=document.activeElement,urls=[],assets=new Map(),listeners=[];let sequence=0;
  const asset=async input=>{if(input instanceof Blob&&input.size>20*1024*1024)throw Error('追加する画像は20MB以下にしてください。');const url=input instanceof Blob?URL.createObjectURL(input):String(input);if(input instanceof Blob)urls.push(url);const img=await loadImage(url),id='asset-'+(++sequence);assets.set(id,{img,url});return id};
  const modal=el('div','qbDrawModal'),panel=el('section','qbDrawPanel');panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label',options.title||'画像に書き込む');panel.tabIndex=-1;modal.append(panel);
  const header=el('header','qbDrawHeader'),top=el('div','qbDrawTitleRow');top.append(el('b','',options.title||'画像に書き込む'));const closeButton=btn('×','qbDrawClose',()=>cancel());closeButton.setAttribute('aria-label','画像編集を閉じる');top.append(closeButton);header.append(top);
  const tools=el('div','qbDrawTools');tools.setAttribute('role','toolbar');tools.setAttribute('aria-label','画像の編集ツール');header.append(tools);
  const settings=el('div','qbDrawSettings'),palette=el('div','qbDrawPalette');palette.setAttribute('role','group');palette.setAttribute('aria-label','色');settings.append(palette);
  const sizeLabel=el('label','qbDrawSize','太さ '),size=el('select');size.setAttribute('aria-label','線の太さ');for(const [v,t] of [[2,'細い'],[5,'標準'],[10,'太い']]){const o=el('option','',t);o.value=v;size.append(o)}size.value=5;sizeLabel.append(size);settings.append(sizeLabel);
  const markerModeLabel=el('label','qbDrawSize','マーカーの描き方 '),markerMode=el('select');markerMode.setAttribute('aria-label','マーカーの描き方');for(const [v,t] of [['freehand','フリーハンド'],['straight','直線（斜めも可）'],['horizontal','水平（横のみ）'],['vertical','垂直（縦のみ）']]){const o=el('option','',t);o.value=v;markerMode.append(o)}markerMode.value=['straight','horizontal','vertical'].includes(preferences.markerMode)?preferences.markerMode:'freehand';markerModeLabel.append(markerMode);settings.append(markerModeLabel);
  const penModeLabel=markerModeLabel.cloneNode(true),penMode=penModeLabel.querySelector('select');penModeLabel.firstChild.textContent='ペンの描き方 ';penMode.setAttribute('aria-label','ペンの描き方');penMode.value=['straight','horizontal','vertical'].includes(preferences.penMode)?preferences.penMode:'freehand';settings.append(penModeLabel);
  const fontLabel=el('label','qbDrawSize','文字サイズ '),font=el('select');font.setAttribute('aria-label','文字サイズ');for(const v of [16,24,32,48,64,96]){const o=el('option','',v);o.value=v;font.append(o)}font.value=32;fontLabel.append(font);settings.append(fontLabel);
  const counterSettings=el('div','qbDrawCounterSettings'),counterMode=el('select'),counterSize=el('select'),counterNext=el('input');counterMode.setAttribute('aria-label','連番の種類');for(const [v,t] of [['number','1, 2, 3…'],['letter','a, b, c…']]){const o=el('option','',t);o.value=v;counterMode.append(o)}counterSize.setAttribute('aria-label','ステッカーの大きさ');for(const v of [32,48,64,96,128]){const o=el('option','',v);o.value=v;counterSize.append(o)}counterSize.value='64';counterNext.setAttribute('aria-label','次に貼る番号');counterNext.type='text';counterNext.value='1';counterNext.autocomplete='off';counterNext.spellcheck=false;for(const [label,field] of [['種類 ',counterMode],['大きさ ',counterSize],['次の番号 ',counterNext]]){const l=el('label','qbDrawSize',label);l.append(field);counterSettings.append(l)}settings.append(counterSettings);
  const finger=el('input');finger.type='checkbox';const fingerLabel=el('label','qbDrawFinger');fingerLabel.append(finger,document.createTextNode('指で描く'));settings.append(fingerLabel);header.append(settings);
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
  const oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';panel.focus();
  let done;const result=new Promise(resolve=>{done=resolve});current={modal};
  let scene=null,history=null,selection=[],tool='pen',color=M.colors[0].value,zoom=1,ox=0,oy=0,frame=0,closed=false,busy=false,subDialog=false,changed=false,gesture=null,lassoPoints=null,penDown=false,textStart=null;
  const pointers=new Map();let textHistory=null,textComposing=false;let pinch=null,editingTextId=null,nativeGesture=null,nativeEndedAt=0,lastPoint=null;
  if(['lasso','pen','marker','text','arrow','rect','circle','ellipse','counter'].includes(preferences.tool))tool=preferences.tool;
  if(M.colors.some(c=>c.value===preferences.color))color=preferences.color;
  if([2,5,10].includes(preferences.size))size.value=preferences.size;
  if([16,24,32,48,64,96].includes(preferences.font))font.value=preferences.font;
  finger.checked=preferences.finger===true;
  function remember(){sessionSettings={tool,color,size:Number(size.value),font:Number(font.value),finger:finger.checked,markerMode:markerMode.value,penMode:penMode.value,correction:{...correction}};try{localStorage.setItem(settingsKey,JSON.stringify(sessionSettings))}catch{}}
  function updateCorrection(){counterSettings.hidden=tool!=='counter';sizeLabel.hidden=fontLabel.hidden=tool==='counter';if(scene&&document.activeElement!==counterNext)counterNext.value=M.counterLabel(scene.counters[counterMode.value],counterMode.value);penModeLabel.hidden=tool!=='pen';markerModeLabel.hidden=tool!=='marker';correctionLabel.hidden=!['pen','marker'].includes(tool)||(tool==='marker'&&markerMode.value!=='freehand')||(tool==='pen'&&penMode.value!=='freehand');correctionRange.value=correctionNumber.value=correction[tool]??0}
  for(const input of [correctionRange,correctionNumber])input.oninput=()=>{if(busy||!['pen','marker'].includes(tool)||input.value==='')return;const v=Number(input.value);if(!Number.isFinite(v))return;correction[tool]=Math.round(Math.max(0,Math.min(100,v)));updateCorrection();remember()};
  penMode.onchange=markerMode.onchange=()=>{remember();update()};
  function strokeWidth(type){return Number(size.value)*(type==='marker'?5:['rect','circle','ellipse'].includes(type)?2:1)}
  const listen=(n,event,fn,opts)=>{n.addEventListener(event,fn,opts);listeners.push(()=>n.removeEventListener(event,fn,opts))};
  listen(finger,'change',remember);
  function close(value){if(closed)return;remember();closed=true;cancelAnimationFrame(frame);resizeObserver.disconnect();listeners.forEach(f=>f());urls.forEach(u=>URL.revokeObjectURL(u));modal.remove();document.body.style.overflow=oldOverflow;current=null;previous?.isConnected&&previous.focus?.({preventScroll:true});done(value)}
  function cancel(){if(busy||subDialog)return;commitText();if(changed&&!confirm('今回の画像編集を破棄しますか？'))return;close(null)}
  function update(){updateCorrection();if(!scene){panel.querySelectorAll('button,input,select,textarea').forEach(b=>b.disabled=!(b.classList.contains('qbDrawClose')||b.textContent==='キャンセル'));return;}undoButton.disabled=busy||!(textHistory?.past.length||history.past.length);redoButton.disabled=busy||!(editingTextId?textHistory?.future.length:history.future.length);saveButton.disabled=busy;const selected=scene.items.filter(i=>selection.includes(i.id));textInput.hidden=!editingTextId;cropButton.disabled=busy||selected.length!==1||selected[0].type!=='image';[deleteButton,frontButton,backButton].forEach(b=>b.disabled=busy||!selected.length);palette.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.color===color)));tools.querySelectorAll('[data-tool]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tool===tool)));requestDraw()}
  function checkpoint(){history.push(scene);changed=history.past.length>0;update()}
  function commitText(){const hadText=!!textStart;textStart=null;editingTextId=null;textHistory=null;textInput.hidden=true;if(hadText)checkpoint();else requestDraw()}
  function useTool(next){if(busy||subDialog)return;commitText();tool=next;remember();selection=[];textInput.value='';update();canvas.focus({preventScroll:true})}
  function select(ids){commitText();selection=ids;const item=scene.items.find(i=>ids.length===1&&i.id===ids[0]);if(item){color=item.color||color;if(item.type==='text'){textInput.value=item.text;font.value=String(item.fontSize)}}update()}
  const toolsList=[['lasso','投げ縄'],['pen','ペン'],['marker','マーカー'],['text','文字'],['counter','連番'],['arrow','矢印'],['rect','四角い枠'],['circle','正円の枠'],['ellipse','楕円の枠']];
  for(const [name,label] of toolsList){const b=btn(label,'',()=>useTool(name));b.dataset.tool=name;b.setAttribute('aria-pressed',String(tool===name));tools.append(b)}
  const fileInput=el('input');fileInput.type='file';fileInput.accept='image/*';fileInput.multiple=true;fileInput.hidden=true;fileInput.onchange=()=>{addImages([...fileInput.files]);fileInput.value=''};tools.append(btn('画像追加','',()=>fileInput.click()),fileInput);
  for(const c of M.colors){const b=btn('','qbDrawSwatch',()=>{if(busy)return;commitText();color=c.value;remember();scene?.items.filter(i=>selection.includes(i.id)&&i.type!=='image').forEach(i=>i.color=color);if(selection.length)checkpoint();else update()});b.dataset.color=c.value;b.style.setProperty('--swatch',c.value);b.title=c.name;b.setAttribute('aria-label',c.name);palette.append(b)}
  size.onchange=()=>{if(busy)return;remember();scene.items.filter(i=>selection.includes(i.id)&&['pen','marker','arrow','rect','circle','ellipse'].includes(i.type)).forEach(i=>i.width=strokeWidth(i.type));if(selection.length)checkpoint()};
  font.onchange=()=>{if(busy)return;remember();scene.items.filter(i=>selection.includes(i.id)&&i.type==='text').forEach(i=>{i.fontSize=Number(font.value);measureText(i)});if(selection.length)checkpoint()};
  counterMode.onchange=()=>update();
  counterNext.onchange=()=>{if(!scene||busy)return;const value=M.counterValue(counterNext.value,counterMode.value);if(value){scene.counters[counterMode.value]=value;checkpoint()}else{counterNext.value=M.counterLabel(scene.counters[counterMode.value],counterMode.value);status.textContent='番号は1以上の整数、英字はa〜z（aa以降も可）で入力してください。'}};
  counterSize.onchange=()=>{if(!scene||busy)return;const d=Number(counterSize.value);scene.items.filter(i=>selection.includes(i.id)&&i.type==='counter').forEach(i=>{i.x+=(i.w-d)/2;i.y+=(i.h-d)/2;i.w=i.h=d});if(selection.length)checkpoint()};
  function undo(redo=false){if(busy||subDialog||gesture||textComposing||!history)return;if(editingTextId&&textHistory){const stack=redo?textHistory.future:textHistory.past;if(stack.length){const value=redo?textHistory.redo():textHistory.undo();textInput.value=value.text;textInput.setSelectionRange(Math.min(value.start,value.text.length),Math.min(value.end,value.text.length));applyText();update();return}if(redo)return;}commitText();scene=redo?history.redo():history.undo();selection=[];changed=history.past.length>0;update()}
  const undoButton=btn('↶ 元に戻す','',()=>undo()),redoButton=btn('↷ やり直す','',()=>undo(true));tools.append(undoButton,redoButton);
  for(const b of [undoButton,redoButton])b.addEventListener('pointerdown',e=>e.preventDefault());
  const deleteButton=btn('削除','',()=>{if(busy)return;commitText();scene.items=scene.items.filter(i=>!selection.includes(i.id));selection=[];checkpoint()});
  const frontButton=btn('前面へ','',()=>reorder(true)),backButton=btn('背面へ','',()=>reorder(false)),cropButton=btn('追加画像をトリミング','',()=>cropSelected());editActions.append(deleteButton,frontButton,backButton,cropButton);
  function reorder(front){if(busy)return;commitText();const a=scene.items.filter(i=>selection.includes(i.id)),b=scene.items.filter(i=>!selection.includes(i.id));scene.items=front?[...b,...a]:[...a,...b];checkpoint()}
  navigation.append(btn('−','',()=>zoomAt(.8)),btn('全体表示','',()=>fit()),btn('＋','',()=>zoomAt(1.25)),btn('左に余白','',()=>margin('left')),btn('右に余白','',()=>margin('right')),btn('上に余白','',()=>margin('top')),btn('下に余白','',()=>margin('bottom')));
  function margin(side){if(!scene||busy||subDialog||gesture)return;commitText();const amount=Math.max(160,Math.round(scene.width*.25)),dx=side==='left'?amount:0,dy=side==='top'?amount:0;if(side==='left'||side==='right')scene.width+=amount;else scene.height+=amount;if(dx||dy){scene.base.x+=dx;scene.base.y+=dy;scene.items=scene.items.map(item=>M.transform(item,{x:0,y:0,w:1,h:1},{x:dx,y:dy,w:1,h:1}))}checkpoint();fit()}
  function fit(){if(!scene)return;const r=stage.getBoundingClientRect();zoom=Math.min((r.width-32)/scene.width,(r.height-32)/scene.height);ox=(r.width-scene.width*zoom)/2;oy=(r.height-scene.height*zoom)/2;requestDraw()}
  function zoomAt(f,p){if(!scene)return;const r=stage.getBoundingClientRect(),x=p?.x??r.width/2,y=p?.y??r.height/2,next=Math.max(.02,Math.min(12,zoom*f));ox=x-(x-ox)*next/zoom;oy=y-(y-oy)*next/zoom;zoom=next;requestDraw()}
  const resizeObserver=new ResizeObserver(()=>{const r=stage.getBoundingClientRect(),d=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.max(1,Math.round(r.width*d));canvas.height=Math.max(1,Math.round(r.height*d));requestDraw()});resizeObserver.observe(stage);
  function renderItem(ctx,item){
    ctx.save();ctx.setLineDash([]);ctx.lineDashOffset=0;ctx.strokeStyle=item.color||color;ctx.fillStyle=item.color||color;ctx.lineWidth=item.width||2;ctx.lineCap='round';ctx.lineJoin='round';
    if(item.points){ctx.globalAlpha=item.type==='marker'?.32:1;ctx.beginPath();const p=item.points;ctx.moveTo(p[0].x,p[0].y);if(p.length===1){ctx.lineTo(p[0].x+.01,p[0].y)}else for(let i=1;i<p.length;i++)ctx.lineTo(p[i].x,p[i].y);ctx.stroke()}
    else if(item.type==='counter'){ctx.beginPath();ctx.ellipse(item.x+item.w/2,item.y+item.h/2,item.w/2,item.h/2,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=['#ffd63d','#22b8dc','#f28c28'].includes(item.color)?'#172033':'#fff';ctx.textAlign='center';ctx.textBaseline='middle';let fontSize=item.h*.58;ctx.font=`700 ${fontSize}px sans-serif`;const measured=ctx.measureText(item.label).width;if(measured>item.w*.76){fontSize*=item.w*.76/measured;ctx.font=`700 ${fontSize}px sans-serif`}ctx.fillText(item.label,item.x+item.w/2,item.y+item.h/2)}
    else if(item.type==='rect'){ctx.lineJoin='miter';ctx.strokeRect(item.x,item.y,item.w,item.h)}
    else if(item.type==='circle'||item.type==='ellipse'){ctx.beginPath();ctx.ellipse(item.x+item.w/2,item.y+item.h/2,item.w/2,item.h/2,0,0,Math.PI*2);ctx.stroke()}
    else if(item.type==='arrow'){const a=item.a,b=item.b,angle=Math.atan2(b.y-a.y,b.x-a.x),len=Math.max(12,item.width*4);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.moveTo(b.x-len*Math.cos(angle-.5),b.y-len*Math.sin(angle-.5));ctx.lineTo(b.x,b.y);ctx.lineTo(b.x-len*Math.cos(angle+.5),b.y-len*Math.sin(angle+.5));ctx.stroke()}
    else if(item.type==='text'){ctx.font=`${item.fontSize}px -apple-system,BlinkMacSystemFont,"Hiragino Sans","Yu Gothic",sans-serif`;ctx.textBaseline='top';item.text.split('\n').forEach((line,i)=>ctx.fillText(line,item.x,item.y+i*item.fontSize*1.3))}
    else if(item.type==='image'){const img=assets.get(item.assetId)?.img;if(img)ctx.drawImage(img,item.x,item.y,item.w,item.h)}ctx.restore();
  }
  function paint(ctx,preview=false){ctx.fillStyle='#fff';ctx.fillRect(0,0,scene.width,scene.height);const base=assets.get(scene.base.assetId)?.img;if(base)ctx.drawImage(base,scene.base.x,scene.base.y,scene.base.w,scene.base.h);scene.items.forEach(i=>{if(!preview||i.id!==editingTextId)renderItem(ctx,i)})}
  function requestDraw(){if(closed||frame)return;frame=requestAnimationFrame(()=>{frame=0;draw()})}
  function draw(){if(!scene)return;const ctx=canvas.getContext('2d'),r=stage.getBoundingClientRect(),d=canvas.width/Math.max(1,r.width);ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.setTransform(d*zoom,0,0,d*zoom,d*ox,d*oy);ctx.save();ctx.beginPath();ctx.rect(0,0,scene.width,scene.height);ctx.clip();paint(ctx,true);ctx.restore();ctx.save();
    const box=M.union(scene.items.filter(i=>selection.includes(i.id)));ctx.strokeStyle='#126fb3';ctx.lineWidth=1.5/zoom;ctx.setLineDash([5/zoom,4/zoom]);if(box){ctx.strokeRect(box.x,box.y,box.w,box.h);ctx.setLineDash([]);for(const [x,y] of [[box.x,box.y],[box.x+box.w,box.y],[box.x,box.y+box.h],[box.x+box.w,box.y+box.h]]){ctx.fillStyle='#fff';ctx.fillRect(x-5/zoom,y-5/zoom,10/zoom,10/zoom);ctx.strokeRect(x-5/zoom,y-5/zoom,10/zoom,10/zoom)}}
    if(lassoPoints?.length){ctx.beginPath();ctx.moveTo(lassoPoints[0].x,lassoPoints[0].y);lassoPoints.forEach(p=>ctx.lineTo(p.x,p.y));ctx.stroke()}ctx.restore();positionTextInput();
  }
  const local=e=>{const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}};
  const straightEnd=(g,p)=>M.lineEnd(g.start,p,g.item.lineMode);
  const point=e=>{const p=local(e);return{x:(p.x-ox)/zoom,y:(p.y-oy)/zoom}};
  function measureText(item){const ctx=canvas.getContext('2d');ctx.font=`${item.fontSize}px -apple-system,BlinkMacSystemFont,"Hiragino Sans","Yu Gothic",sans-serif`;item.w=Math.max(item.fontSize,...item.text.split('\n').map(l=>ctx.measureText(l).width));item.h=Math.max(1,item.text.split('\n').length)*item.fontSize*1.3}
  function positionTextInput(){
    const item=scene?.items.find(i=>i.id===editingTextId);if(!item)return;
    const scale=Math.max(.02,zoom);Object.assign(textInput.style,{left:(ox+item.x*zoom)+'px',top:(oy+item.y*zoom)+'px',width:Math.max(160,item.w+24)+'px',height:Math.max(item.fontSize*1.3+10,item.h+10)+'px',fontSize:item.fontSize+'px',color:item.color,transform:`scale(${scale})`});
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

  async function addImages(files){if(!scene||busy||subDialog||!files.length)return;commitText();busy=true;status.textContent='画像を追加中…';try{const pending=[];for(const f of files){const id=await asset(f);if(closed)return;const img=assets.get(id).img,scale=Math.min(1,scene.width*.6/img.width,scene.height*.6/img.height),w=img.width*scale,h=img.height*scale;pending.push({id:crypto.randomUUID(),type:'image',assetId:id,x:(scene.width-w)/2+pending.length*16,y:(scene.height-h)/2+pending.length*16,w,h})}scene.items.push(...pending);selection=pending.map(i=>i.id);tool='lasso';checkpoint();status.textContent='画像を追加しました'}catch(e){status.textContent=e.message}finally{busy=false;update()}}
  async function cropSelected(){const item=scene.items.find(i=>selection.length===1&&selection[0]===i.id&&i.type==='image');if(!item||busy||subDialog)return;commitText();subDialog=true;try{const blob=await window.QBImageCrop.open(assets.get(item.assetId).url,{title:'追加画像をトリミング',rotatable:false});if(blob){const id=await asset(blob),img=assets.get(id).img,scale=Math.min(item.w/img.width,item.h/img.height);item.assetId=id;item.w=img.width*scale;item.h=img.height*scale;checkpoint()}}catch(e){status.textContent=e.message}finally{subDialog=false;panel.focus({preventScroll:true})}}
  function abortGesture(){if(gesture?.before)scene=gesture.before;gesture=null;lassoPoints=null;requestDraw()}
  function touchPair(){const p=[...pointers.values()].filter(x=>x.type==='touch');return p.length>=2?{x:(p[0].x+p[1].x)/2,y:(p[0].y+p[1].y)/2,dist:Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y)}:null}
  listen(canvas,'pointerdown',e=>{
    if(!scene||busy||subDialog||e.button>0)return;e.preventDefault();try{canvas.setPointerCapture(e.pointerId)}catch{}const l=local(e);pointers.set(e.pointerId,{...l,type:e.pointerType});
    if(e.pointerType==='touch'&&penDown)return;const pair=penDown||e.pointerType==='pen'?null:touchPair();if(pair){abortGesture();pinch=pair;return}commitText();canvas.focus({preventScroll:true});const p=point(e);
    if(e.pointerType==='pen'){if(gesture?.kind==='pan')gesture=null;penDown=true}
    if(gesture)return;
    // Mouse, trackpad and touch can select placed objects without changing tools.
    // Pencil ink remains ink, so handwriting over a diagram does not move it.
    const direct=!(e.pointerType==='pen'&&['pen','marker'].includes(tool));
    if(tool==='lasso'||direct){
      const selected=scene.items.filter(i=>selection.includes(i.id)),box=M.union(selected);
      if(box){const corners=[{x:box.x,y:box.y},{x:box.x+box.w,y:box.y},{x:box.x,y:box.y+box.h},{x:box.x+box.w,y:box.y+box.h}],corner=corners.findIndex(c=>Math.hypot(c.x-p.x,c.y-p.y)<14/zoom);if(corner>=0){gesture={kind:'resize',before:M.copy(scene),box,corner,id:e.pointerId};return}}
      const hit=[...scene.items].reverse().find(i=>(tool==='lasso'||['text','arrow','rect','circle','ellipse','image','counter'].includes(i.type))&&M.hit(i,p,6/zoom));
      if(hit){const wasSelected=selection.length===1&&selection[0]===hit.id;if(!selection.includes(hit.id))select([hit.id]);gesture={kind:'move',before:M.copy(scene),start:p,id:e.pointerId,moved:false,textId:wasSelected&&hit.type==='text'?hit.id:null};return}
    }
    if(tool==='text'&&selection.length){select([]);return}
    if(e.pointerType==='touch'&&!finger.checked&&tool!=='counter'){gesture={kind:'pan',start:l,ox,oy,id:e.pointerId};return}
    if(tool==='lasso'){select([]);lassoPoints=[p];gesture={kind:'lasso',id:e.pointerId};return}
    if(p.x<0||p.y<0||p.x>scene.width||p.y>scene.height)return;
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
    else if(g.kind==='move'){if(!g.moved&&Math.hypot(p.x-g.start.x,p.y-g.start.y)*zoom<4)return;g.moved=true;scene.items=g.before.items.map(i=>{if(!selection.includes(i.id))return M.copy(i);const b=M.bounds(i);return M.transform(i,b,{...b,x:b.x+p.x-g.start.x,y:b.y+p.y-g.start.y})})}
    else if(g.kind==='resize'){const b=g.box,anchor={x:g.corner%2===0?b.x+b.w:b.x,y:g.corner<2?b.y+b.h:b.y},to=M.rect(anchor,p),only=scene.items.filter(i=>selection.includes(i.id));to.w=Math.max(8,to.w);to.h=Math.max(8,to.h);if(only.length!==1||!['rect','ellipse'].includes(only[0].type)){const scale=Math.max(to.w/Math.max(1,b.w),to.h/Math.max(1,b.h));to.w=b.w*scale;to.h=b.h*scale;to.x=g.corner%2===0?anchor.x-to.w:anchor.x;to.y=g.corner<2?anchor.y-to.h:anchor.y}scene.items=g.before.items.map(i=>selection.includes(i.id)?M.transform(i,b,to):M.copy(i))}
    requestDraw();
  });
  const end=e=>{if(!pointers.has(e.pointerId))return;pointers.delete(e.pointerId);if(e.pointerType==='pen')penDown=false;if(pinch){if(!pointers.size)pinch=null;return}if(!gesture||gesture.id!==e.pointerId)return;const g=gesture;if(e.type==='pointercancel'){abortGesture();return}if(g.kind==='draw'&&g.item.points){const p=point(e),last=g.item.points.at(-1);if(g.item.straight)g.item.points=[g.start,straightEnd(g,p)];else if(Math.hypot(p.x-last.x,p.y-last.y)>.01)g.item.points.push(p)}if(g.kind==='draw'&&['rect','circle','ellipse'].includes(g.item.type))Object.assign(g.item,M.shapeRect(g.start,point(e),g.item.type));if(g.kind==='counter'){if(!g.moved&&Math.hypot(local(e).x-g.start.x,local(e).y-g.start.y)<=6){const mode=counterMode.value,n=scene.counters[mode],d=Number(counterSize.value),p=g.point;scene.items.push({id:crypto.randomUUID(),type:'counter',label:M.counterLabel(n,mode),color,x:p.x-d/2,y:p.y-d/2,w:d,h:d});scene.counters[mode]=n+1;checkpoint()}}else if(g.kind==='lasso'){selection=M.lasso(scene.items,lassoPoints);lassoPoints=null}else if(g.kind!=='pan'){if(g.kind==='draw'&&['rect','circle','ellipse'].includes(g.item.type)&&(g.item.w<1||g.item.h<1))scene=g.before;checkpoint()}gesture=null;update();if(g.kind==='move'&&!g.moved&&g.textId){const item=scene.items.find(i=>i.id===g.textId);if(item)editText(item)}};listen(canvas,'pointerup',end);listen(canvas,'pointercancel',end);
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
  listen(document,'gesturestart',e=>{if(!scene||busy||subDialog||penDown)return;e.preventDefault();e.stopImmediatePropagation();commitText();abortGesture();nativeGesture={scale:1,anchor:gestureAnchor(e)}},{passive:false,capture:true});
  listen(document,'gesturechange',e=>{if(!scene||busy||subDialog||penDown)return;e.preventDefault();e.stopImmediatePropagation();if(pinch||touchPair())return;if(!nativeGesture)nativeGesture={scale:1,anchor:gestureAnchor(e)};const scale=Number(e.scale);if(Number.isFinite(scale)&&scale>0){zoomAt(scale/nativeGesture.scale,nativeGesture.anchor);nativeGesture.scale=scale}},{passive:false,capture:true});
  listen(document,'gestureend',e=>{if(!nativeGesture)return;e.preventDefault();e.stopImmediatePropagation();nativeGesture=null;nativeEndedAt=performance.now()},{passive:false,capture:true});
  listen(document,'wheel',e=>{if(!scene||busy||subDialog||(!(e.ctrlKey||e.metaKey)&&!stage.contains(e.target)))return;e.preventDefault();e.stopImmediatePropagation();if(nativeGesture||pinch||touchPair()||performance.now()-nativeEndedAt<120)return;const unit=e.deltaMode===1?16:e.deltaMode===2?stage.clientHeight:1;if(e.ctrlKey||e.metaKey)zoomAt(Math.exp(-e.deltaY*unit*.004),gestureAnchor(e));else{ox-=e.deltaX*unit;oy-=e.deltaY*unit;requestDraw()}},{passive:false,capture:true});
  async function save(){if(!scene||busy||subDialog||gesture)return;commitText();busy=true;update();panel.querySelectorAll('button,input,select,textarea').forEach(b=>b.disabled=true);status.textContent='保存中…';let output;try{const d={width:Math.ceil(scene.width),height:Math.ceil(scene.height)};if(d.width>16384||d.height>16384||d.width*d.height>32000000)throw Error('元の画質を保つには画像が大きすぎます。余白を減らすか画像を分けてください（最大3,200万画素・一辺16,384px）。');const out=document.createElement('canvas');out.width=d.width;out.height=d.height;const ctx=out.getContext('2d');if(!ctx)throw Error('画像を作成できませんでした。');ctx.scale(d.width/scene.width,d.height/scene.height);paint(ctx);output=await png(out);out.width=out.height=1;await options.onSave?.(output,{width:d.width,height:d.height});close(output)}catch(e){status.textContent='保存できませんでした：'+(e.message||e);busy=false;panel.querySelectorAll('button,input,select,textarea').forEach(b=>b.disabled=false);update()}}
  listen(window,'paste',e=>{if(closed||subDialog)return;const files=filesFromPaste(e);if(!files.length){if(e.target===pasteTarget){e.preventDefault();e.stopImmediatePropagation();pasteTarget.value='';status.textContent='画像をコピーしてから貼り付けてください。';canvas.focus({preventScroll:true})}return}e.preventDefault();e.stopImmediatePropagation();pasteTarget.value='';if(!busy&&!gesture){canvas.focus({preventScroll:true});addImages(files)}},true);
  listen(window,'keydown',e=>{
    if(closed||subDialog)return;const mod=e.metaKey||e.ctrlKey,key=e.key.toLowerCase(),input=e.target.closest?.('input,textarea');
    if(mod&&key==='v'){if(busy||!scene||gesture)e.preventDefault();else if(!input&&!e.target.isContentEditable){pasteTarget.value='';pasteTarget.focus({preventScroll:true})}e.stopImmediatePropagation();return}
    if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();cancel();return}
    if(mod&&key==='s'){e.preventDefault();e.stopImmediatePropagation();if(!e.repeat&&!e.isComposing)save();return}
    if(mod&&(key==='z'||e.code==='KeyZ')&&(!input||input===textInput)){e.preventDefault();e.stopImmediatePropagation();if(!e.repeat&&!e.isComposing)undo(e.shiftKey);return}
    if(['Delete','Backspace'].includes(e.key)&&!input){e.preventDefault();e.stopImmediatePropagation();deleteButton.click();return}
    if(e.key==='Tab'){const all=[...panel.querySelectorAll('button,input,select,textarea,[tabindex="0"]')].filter(n=>n!==pasteTarget&&!n.disabled&&!n.hidden&&n.getClientRects().length),first=all[0],last=all.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===panel)){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}
    // Keep page-level save/navigation/format shortcuts scoped to this dialog.
    e.stopPropagation();
  },true);
  listen(window,'beforeunload',e=>{if(changed||busy){e.preventDefault();e.returnValue=''}});
  update();
  try{const id=await asset(source);if(closed)return result;const img=assets.get(id).img;scene={width:img.width,height:img.height,base:{assetId:id,x:0,y:0,w:img.width,h:img.height},items:[],counters:{number:1,letter:1}};history=new M.History(scene);panel.querySelectorAll('button,input,select,textarea').forEach(b=>b.disabled=false);status.textContent='保存後は書き込みをまとめて1枚の画像にします。';fit();update();if(options.initialImages?.length)await addImages(options.initialImages)}catch(e){status.textContent=e.message}
  return result;
}
window.QBImageEditor={open,filesFromPaste,isOpen:()=>!!current};
})();

