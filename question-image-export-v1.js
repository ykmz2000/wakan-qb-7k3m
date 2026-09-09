/* Independent export: no annotation, note writes, uploads, or attempt history. */
(()=>{
'use strict';
let raf=0,menu=null;
const qid=q=>String(q?.id||q?.dbId||''),q=()=>{try{return window.pq?.()}catch{return null}};
const systemKey=k=>/^(?:IMAGE|IMG|IMAGE_REQUIRED|FIGURE|FIG|SOURCE|PAGE)(?:[_-].*)?$/i.test(k);
function valueText(value){if(value==null)return '解答未登録';if(Array.isArray(value))return value.map(valueText).join('・');if(typeof value==='object')return Object.entries(value).filter(([key])=>!systemKey(key)).map(([key,v])=>`${key}：${valueText(v)}`).join('\n')||'解答未登録';return String(value)}
function answers(Q){
  const raw=Q.occ?.[0]?.official_answer,choice=Q.answer_mode!=='fill_blank'&&Q.choices?.length,keys=(Q.choices||[]).filter(c=>c.is_correct).map(c=>c.choice_key);
  if(choice){const primary=keys.length?keys.join('・'):'解答未登録';if(raw==null)return primary;const official=valueText(raw),letters=s=>String(s).toLowerCase().replace(/[^a-z0-9]/g,'').split('').sort().join('');if(keys.length&&letters(primary)!==letters(official))return `このアプリで管理者またはAIが判断した正答：${primary}\n\n配布された過去問に記載されていた正答：${official}`;return keys.length?primary:official}
  if(raw&&typeof raw==='object'&&!Array.isArray(raw)&&Array.isArray(Q.answer_fields)&&Q.answer_fields.length){const used=new Set(),lines=Q.answer_fields.filter(f=>f&&f.key&&!systemKey(f.key)).map(f=>{used.add(f.key);return `${f.label||f.key}：${valueText(raw[f.key])}`});Object.entries(raw).forEach(([k,v])=>{if(!used.has(k)&&!systemKey(k))lines.push(`${k==='note'?'補足':k==='order'?'順序':k}：${valueText(v)}`)});return lines.join('\n')||'解答未登録'}
  return valueText(raw);
}
function wrappedLines(ctx,text,width){
  const out=[];for(const paragraph of String(text??'').replace(/\r\n?/g,'\n').split('\n')){let line='';for(const char of Array.from(paragraph)){if(line&&ctx.measureText(line+char).width>width){out.push(line);line=char}else line+=char}out.push(line)}return out;
}
function imageFromBlob(blob){return new Promise((resolve,reject)=>{const url=URL.createObjectURL(blob),img=new Image();img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};img.onerror=()=>{URL.revokeObjectURL(url);reject(Error('問題画像を読み込めませんでした。'))};img.src=url})}
async function render(Q,options={}){
  const requestedWidth=[2400,3600,4800].includes(options.width)?options.width:3600;
  const sb=window.qbSupabase,id=qid(Q);if(!sb||!id)throw Error('問題の情報を読み込み中です。');
  const record=await sb.from('questions').select('stem,stem_formatting').eq('id',id).maybeSingle();if(record.error)throw record.error;
  const r=await sb.from('question_images').select('image_path,caption,alt_text,sort_order,created_at').eq('question_id',id).eq('placement','question').is('choice_id',null).order('sort_order').order('created_at');if(r.error)throw r.error;
  const images=[];for(const row of r.data||[]){const file=await sb.storage.from('question-media').download(row.image_path);if(file.error)throw Error('問題画像の取得に失敗しました。通信状態を確認してください。');images.push({image:await imageFromBlob(file.data),caption:row.caption||''})}
  if(qid(q())!==id)throw Error('問題が切り替わりました。もう一度ボタンを押してください。');
  const width=1200,pad=54,inner=width-pad*2,canvas=document.createElement('canvas'),ctx=canvas.getContext('2d'),font='-apple-system,BlinkMacSystemFont,"Hiragino Sans","Yu Gothic",Meiryo,sans-serif',blocks=[];let y=pad;
  function text(t,size=30,bold=false,gap=22,format=null){ctx.font=`${bold?'700 ':''}${size}px ${font}`;const lines=wrappedLines(ctx,t,inner);blocks.push({type:'text',lines,x:pad,y,size,bold,source:String(t),format});y+=lines.length*size*1.55+gap}
  text('定期テスト対策QB',22,true,14);
  const occurrences=(Q.occ||[]).map(o=>`${o.academic_year?o.academic_year+'年度':'年度不明'}・${o.exam_type||'試験区分不明'}${o.original_question_number?'・問'+o.original_question_number:''}`);if(occurrences.length)text(occurrences.join(' ／ '),21,false,24);
  text(Q.stem||Q.q||'',32,true,22,record.data?.stem_formatting);if(Q.instruction)text(Q.instruction,26);
  for(const entry of images){const scale=Math.min(1,inner/entry.image.naturalWidth),w=entry.image.naturalWidth*scale,h=entry.image.naturalHeight*scale;blocks.push({type:'image',image:entry.image,x:pad+(inner-w)/2,y,w,h});y+=h+20;if(entry.caption)text(entry.caption,22)}
  const choices=[...(Q.choices||[])].sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
  if(choices.length){if(Q.answer_mode==='fill_blank')text('参考選択肢',24,true,14);for(const c of choices)text(`${c.choice_key}. ${c.choice_text}`,30,false,12)}
  y+=22;blocks.push({type:'line',y});y+=24;text('解答',28,true,12);text(answers(Q),30,false,0);y+=pad;
  const scale=requestedWidth/width,dim=window.QBImageModel.fitSize(requestedWidth,y*scale,24000000);canvas.width=dim.width;canvas.height=dim.height;ctx.scale(dim.width/width,dim.height/y);ctx.fillStyle='#fff';ctx.fillRect(0,0,width,y);ctx.textBaseline='top';
  const theme=getComputedStyle(document.documentElement),accent=theme.getPropertyValue('--accent').trim()||'#126fb3',marker=theme.getPropertyValue('--accent-soft').trim()||'#eaf4fb';
  for(const b of blocks){
    if(b.type==='image'){ctx.drawImage(b.image,b.x,b.y,b.w,b.h);continue}
    if(b.type==='line'){ctx.strokeStyle='#ccd3dd';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(pad,b.y);ctx.lineTo(width-pad,b.y);ctx.stroke();continue}
    ctx.font=`${b.bold?'700 ':''}${b.size}px ${font}`;
    const f=b.format,ranges=f?.version===1&&f.source_text===b.source&&Array.isArray(f.ranges)?f.ranges.slice(0,512).filter(r=>r&&['bold','underline','strike','marker','accent'].includes(r.kind)&&Number.isInteger(r.start)&&Number.isInteger(r.end)&&r.start>=0&&r.end<=b.source.length&&r.end>r.start):[];let offset=0;
    b.lines.forEach((line,i)=>{
      const top=b.y+i*b.size*1.55,spans=ranges.filter(r=>r.start<offset+line.length&&r.end>offset).map(r=>{const start=Math.max(0,r.start-offset),end=Math.min(line.length,r.end-offset);return{...r,start,end,x:b.x+ctx.measureText(line.slice(0,start)).width,w:ctx.measureText(line.slice(start,end)).width}});
      for(const r of spans)if(r.kind==='marker'){ctx.fillStyle=marker;ctx.fillRect(r.x,top,r.w,b.size*1.2)}
      ctx.fillStyle='#172033';ctx.fillText(line,b.x,top);
      for(const r of spans){if(r.kind==='accent'){ctx.fillStyle=accent;ctx.fillText(line.slice(r.start,r.end),r.x,top)}if(r.kind==='underline'||r.kind==='strike'){ctx.fillStyle=accent;ctx.fillRect(r.x,top+b.size*(r.kind==='underline'?1.15:.58),r.w,Math.max(1,b.size/20))}}
      offset+=line.length;if(b.source[offset]==='\n')offset++;
    });
  }
  const blob=await new Promise((resolve,reject)=>{canvas.toBlob(b=>b?resolve(b):reject(Error('画像の作成に失敗しました。')),'image/png')});canvas.width=canvas.height=1;
  return{blob,width:dim.width,height:dim.height,requestedWidth,adjusted:dim.width<requestedWidth,filename:`問題と解答-${id.slice(0,8)}.png`};
}
function close(){if(!menu)return;menu.remove();menu=null}
async function show(button){
  if(menu){close();return}const Q=q();if(!Q)return;const snapshot=JSON.parse(JSON.stringify(Q)),panel=document.createElement('section');panel.className='qbExportMenu';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','問題・解答を画像として出力');
  const title=document.createElement('b');title.textContent='問題・解答を画像として出力';const info=document.createElement('p');info.textContent='問題文・問題画像・選択肢・解答を1枚の画像にまとめます。';const status=document.createElement('p');status.setAttribute('role','status');status.textContent='画像を準備中…';const actions=document.createElement('div');actions.className='qbExportActions';
  const qualityLabel=document.createElement('label'),quality=document.createElement('select');qualityLabel.className='qbExportQuality';qualityLabel.append(document.createTextNode('画質 '),quality);quality.setAttribute('aria-label','出力画質');for(const [width,label] of [[2400,'軽量（横2,400px）'],[3600,'標準（横3,600px）'],[4800,'最高画質（横4,800px）']]){const option=document.createElement('option');option.value=width;option.textContent=label;quality.append(option)}quality.value='3600';
  const save=document.createElement('button'),copy=document.createElement('button'),cancel=document.createElement('button');save.textContent='画像として保存';copy.textContent='画像としてコピー';cancel.textContent='閉じる';[save,copy,cancel].forEach(b=>b.type='button');save.disabled=copy.disabled=true;cancel.onclick=()=>{close();button.focus()};actions.append(save,copy,cancel);panel.append(title,info,qualityLabel,status,actions);document.body.append(panel);menu=panel;cancel.focus();
  panel.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();cancel.click()}});
  let result=null;
  function setBusy(busy){quality.disabled=busy;save.disabled=busy||!result;copy.disabled=busy||!result||!navigator.clipboard?.write||typeof ClipboardItem==='undefined'}
  async function prepare(){result=null;setBusy(true);status.textContent='画像を準備中…';try{
    const output=await render(snapshot,{width:Number(quality.value)});if(menu!==panel)return;result=output;status.textContent=`${result.width.toLocaleString()} × ${result.height.toLocaleString()}px`+(result.adjusted?' — 長い問題のため、全体が収まる解像度に調整しました。':'');if(!navigator.clipboard?.write||typeof ClipboardItem==='undefined')status.textContent+=' この環境では画像コピーが使えません。画像として保存できます。';
  }catch(e){if(menu===panel)status.textContent='画像を作成できませんでした：'+(e.message||e)}finally{if(menu===panel)setBusy(false)}}
  quality.onchange=prepare;
  copy.onclick=async()=>{if(!result)return;setBusy(true);try{await navigator.clipboard.write([new ClipboardItem({'image/png':result.blob})]);status.textContent='画像をコピーしました。'}catch(e){status.textContent='コピーできませんでした。「画像として保存」をご利用ください。'}finally{if(menu===panel)setBusy(false)}};
  save.onclick=async()=>{if(!result)return;setBusy(true);const file=new File([result.blob],result.filename,{type:'image/png'});try{
      if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:'問題と解答'});status.textContent='共有・保存の操作を完了しました。'}
      else{const url=URL.createObjectURL(result.blob),a=document.createElement('a');a.href=url;a.download=result.filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);status.textContent='画像の保存を開始しました。'}
    }catch(e){if(e.name!=='AbortError')status.textContent='保存を開始できませんでした。もう一度お試しください。'}finally{if(menu===panel)setBusy(false)}};
  await prepare();
}
function mount(){
  if(raf)return;raf=requestAnimationFrame(()=>{raf=0;const stem=document.querySelector('#view > .card > .qtext'),Q=q();if(!stem||!Q||window.qbGetScreen?.()!=='practice')return;let bar=stem.parentElement.querySelector(':scope > .adeStemToolbar'),own=stem.parentElement.querySelector(':scope > .qbExportToolbar');
    if(!bar){bar=own;if(!bar){bar=document.createElement('div');bar.className='qbExportToolbar';stem.after(bar)}}
    let button=stem.parentElement.querySelector('.qbExportButton');if(!button){button=document.createElement('button');button.type='button';button.className='qbExportButton';button.textContent='問題・解答を画像として出力';button.onclick=()=>show(button)}
    if(button.parentElement!==bar)bar.prepend(button);if(own&&own!==bar)own.remove();
    const images=stem.parentElement.querySelector(':scope > .qsiHost');if(images&&(images.compareDocumentPosition(bar)&Node.DOCUMENT_POSITION_FOLLOWING))images.before(bar);
  });
}
function boot(){['qb-question-ready','qb-screen-change','qb-content-updated','qb-answer-shown'].forEach(e=>window.addEventListener(e,()=>{if(e==='qb-screen-change')close();mount()}));const view=document.getElementById('view');if(view)new MutationObserver(ms=>{if(ms.some(m=>[...m.addedNodes].some(n=>n instanceof Element&&(n.matches('.adeStemToolbar,.qtext,.card')||n.querySelector('.adeStemToolbar,.qtext')))))mount()}).observe(view,{childList:true,subtree:true});mount()}
window.QBQuestionExport={render,answers,wrappedLines,mount};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
