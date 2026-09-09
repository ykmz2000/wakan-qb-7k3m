/* A4 layout shared by PDF export and regression tests. Never writes application data. */
((root)=>{
'use strict';
const PAGE={width:794,height:1123,left:52,right:52,top:86,bottom:1065,gap:16};
const FONT='-apple-system,BlinkMacSystemFont,"Hiragino Sans","Yu Gothic",Meiryo,sans-serif';
const kinds=['bold','underline','strike','marker','accent'];
function rangesFor(text,record){
  return record?.version===1&&record.source_text===text&&Array.isArray(record.ranges)?record.ranges.slice(0,512).filter(r=>r&&kinds.includes(r.kind)&&Number.isInteger(r.start)&&Number.isInteger(r.end)&&r.start>=0&&r.end<=text.length&&r.start<r.end):[];
}
function textLines(ctx,value,{size=16,bold=false,format=null,width=PAGE.width-PAGE.left-PAGE.right}={}){
  const text=String(value??''),ranges=rangesFor(text,format),lines=[];let runs=[],used=0,offset=0;
  const flush=()=>{lines.push({type:'text',runs,height:size*1.6,size});runs=[];used=0};
  // Measure the actual weight of each glyph; offsets remain UTF-16, as in DB formatting.
  for(const char of Array.from(text)){
    const start=offset;offset+=char.length;
    if(char==='\r')continue;
    if(char==='\n'){flush();continue}
    const active=kinds.filter(k=>ranges.some(r=>r.kind===k&&r.start<offset&&r.end>start));
    const weight=bold||active.includes('bold');ctx.font=`${weight?800:400} ${size}px ${FONT}`;
    const w=ctx.measureText(char).width;
    if(used+w>width&&runs.length)flush();
    runs.push({char,x:used,width:w,bold:weight,kinds:active});used+=w;
  }
  if(runs.length||!lines.length||text.endsWith('\n'))flush();return lines;
}
function paginate(groups,page=PAGE){
  const capacity=page.bottom-page.top,pages=[];let current={items:[]},y=page.top;
  const next=()=>{if(current.items.length)pages.push(current);current={items:[]};y=page.top};
  const put=(item,group)=>{current.items.push({...item,y,group:group.id});y+=item.height};
  for(const group of groups){
    const atoms=group.items;if(!atoms.length)continue;
    const total=atoms.reduce((n,i)=>n+i.height,0);
    // Keep an entire section / choice together whenever it fits on a fresh A4 page.
    if(total<=capacity){if(y+total>page.bottom)next();atoms.forEach(i=>put(i,group));y+=page.gap;continue}
    // Start an oversized section on a fresh page before splitting its paragraphs / images.
    if(current.items.length)next();
    let index=0;
    while(index<atoms.length){
      const item=atoms[index];
      let need=item.height;
      // Never leave a heading or subheading without its following content.
      if(item.keepNext&&atoms[index+1])need+=atoms[index+1].height;
      if(y+need>page.bottom&&current.items.length)next();
      if(item.height>capacity)throw Error('1ページに収まらない出力ブロックです。');
      put(item,group);index++;
    }
    y+=page.gap;
  }
  next();return pages;
}
function textAtoms(ctx,text,options={}){
  const lines=textLines(ctx,text,options),capacity=PAGE.bottom-PAGE.top;
  // Keep each paragraph intact; only a paragraph taller than A4 can split by line.
  const atoms=[];let chunk=[];
  const flush=()=>{if(!chunk.length)return;atoms.push({type:'paragraph',lines:chunk,height:chunk.reduce((s,l)=>s+l.height,0)});chunk=[]};
  for(const line of lines){if(chunk.reduce((s,l)=>s+l.height,0)+line.height>capacity-80)flush();chunk.push(line);if(!line.runs.length)flush()}
  flush();return atoms;
}
function heading(ctx,text){const lines=textLines(ctx,text,{size:16,bold:true});return{type:'heading',lines,height:lines.length*25.6+10,keepNext:true}}
function buildGroups(ctx,Q,images,mode='full'){
  // Verification-only attachments are intentionally omitted from the study PDF.
  images=images.filter(row=>row.placement!=='medical_verification');
  const groups=[],consumed=new Set(),choices=[...(Q.choices||[])].sort((a,b)=>(a.sort_order??0)-(b.sort_order??0)||String(a.id).localeCompare(String(b.id)));
  function media(rows){
    const width=PAGE.width-PAGE.left-PAGE.right,gap=12,column=(width-gap*2)/3,maxHeight=PAGE.height*50/297;
    const result=[];let cells=[],used=0;
    const flush=()=>{if(!cells.length)return;result.push({type:'imageRow',cells,height:Math.max(...cells.map(c=>c.imageHeight+(c.caption.length?6+c.caption.length*20.8:0)))+12});cells=[];used=0};
    for(const row of rows){
      consumed.add(row.id);const naturalWidth=row.image.width,naturalHeight=row.image.height;
      if(!(naturalWidth>0&&naturalHeight>0))throw Error('画像の寸法を確認できませんでした。');
      const wantedWidth=naturalWidth*Math.min(1,maxHeight/naturalHeight);
      let span=Math.max(1,Math.min(3,Math.ceil((wantedWidth+gap)/(column+gap))));
      let cellWidth=column*span+gap*(span-1),caption=row.caption?textLines(ctx,row.caption,{size:13,width:cellWidth}):[];
      // A very long caption gets a full row, while remaining attached to its image.
      if(caption.length*20.8+maxHeight+90>PAGE.bottom-PAGE.top){span=3;cellWidth=width;caption=row.caption?textLines(ctx,row.caption,{size:13,width:cellWidth}):[]}
      if(used+span>3)flush();
      const scale=Math.min(cellWidth/naturalWidth,maxHeight/naturalHeight,1),w=naturalWidth*scale,h=naturalHeight*scale;
      if(h+caption.length*20.8+90>PAGE.bottom-PAGE.top)throw Error('画像の説明文が長すぎます。');
      cells.push({image:row.preview||row.image,pdfImage:row.pdfImage,width:w,imageHeight:h,caption,imageId:row.id,x:PAGE.left+used*(column+gap)+(cellWidth-w)/2,captionX:PAGE.left+used*(column+gap),cellWidth,span});
      used+=span;if(used===3)flush();
    }
    flush();return result;
  }
  function group(id,title,items){if(items.length)groups.push({id,items:[...(title?[heading(ctx,title)]:[]),...items]})}
  const noChoice=row=>!row.choice_id;
  const rows=(placement,choiceId=null)=>images.filter(r=>r.placement===placement&&(choiceId?String(r.choice_id)===String(choiceId):noChoice(r)));
  group('stem','問題',[
    ...textAtoms(ctx,Q.stem,{format:Q.stem_formatting}),
    ...(Q.instruction?textAtoms(ctx,Q.instruction,{size:14}):[]),...media(rows('question'))
  ]);
  for(const c of choices)group('prompt-'+c.id,'',[
    ...textAtoms(ctx,`${c.choice_key}. ${c.choice_text}`),...media(rows('question',c.id))
  ]);
  if(mode==='questions')return groups;
  group('answer','解答',textAtoms(ctx,answerText(Q)));
  if(mode!=='full')return groups;
  const fields=[['explanation_overview','問題文のポイント','explanation_overview'],['examiner_intent','出題者の意図','examiner_intent'],['exam_summary','試験用まとめ','exam_summary']];
  function section([field,label,placement]){
    const pictureRows=rows(placement);if(field==='explanation_overview')pictureRows.push(...rows('explanation'));
    group(field,label,[...(Q[field]?textAtoms(ctx,Q[field],{format:Q.explanation_formatting?.[field]}):[]),...media(pictureRows)]);
  }
  section(fields[0]);
  for(const c of choices){
    const content=[];
    if(c.correction_text)content.push(heading(ctx,'正しく直すと'),...textAtoms(ctx,c.correction_text,{format:c.explanation_formatting?.correction_text}));
    if(c.explanation)content.push(...textAtoms(ctx,c.explanation,{format:c.explanation_formatting?.explanation}));
    for(const [field,label] of [['correct_for_other_context','別の文脈では'],['examiner_distinction','区別ポイント']])if(c[field])content.push(heading(ctx,label),...textAtoms(ctx,c[field],{format:c.explanation_formatting?.[field]}));
    content.push(...media([...rows('choice_explanation',c.id),...rows('choice',c.id)]));
    const mark=Q.answer_mode==='fill_blank'?'':c.is_correct?'○ ':'× ';
    if(content.length)group('choice-'+c.id,`各選択肢：${c.choice_key}. ${mark}`,[...textAtoms(ctx,c.choice_text),...content]);
  }
  fields.slice(1).forEach(section);
  // Fail explicitly instead of silently dropping an attachment whose placement is unknown.
  if(images.some(r=>!consumed.has(r.id)))throw Error('配置を確認できない画像があります。画像の所属欄を確認してください。');
  return groups;
}
const systemKey=k=>/^(?:IMAGE|IMG|IMAGE_REQUIRED|FIGURE|FIG|SOURCE|PAGE)(?:[_-].*)?$/i.test(k);
function valueText(v){if(v==null||v==='')return '解答未登録';if(Array.isArray(v))return v.map(valueText).join('・');if(typeof v==='object')return Object.entries(v).filter(([k])=>!systemKey(k)).map(([k,x])=>`${k==='note'?'補足':k==='order'?'順序':k}：${valueText(x)}`).join('\n')||'解答未登録';return String(v)}
function answerText(Q){
  const raw=Q.question_occurrences?.[0]?.official_answer??Q.source_answer;
  if(Q.answer_mode!=='fill_blank'&&Q.choices?.length){
    const keys=Q.choices.filter(c=>c.is_correct).map(c=>c.choice_key),primary=keys.join('・');
    if(!keys.length)return raw==null?'解答未登録':`配布された過去問に記載されていた正答：${valueText(raw)}`;
    if(raw==null)return `このアプリで管理者またはAIが判断した正答：${primary}`;
    const normal=s=>String(s).toLowerCase().replace(/[^a-z0-9]/g,'').split('').sort().join('');
    return normal(primary)===normal(valueText(raw))?primary:`このアプリで管理者またはAIが判断した正答：${primary}\n\n配布された過去問に記載されていた正答：${valueText(raw)}`;
  }
  const fields=(Q.answer_fields||[]).map(f=>typeof f==='string'?{key:f,label:f}:f).filter(f=>f?.key&&!systemKey(f.key));
  if(!fields.length)return valueText(raw);
  const lines=fields.map((f,i)=>`${f.label||f.key} → ${valueText(raw&&typeof raw==='object'&&!Array.isArray(raw)?raw[f.key]:Array.isArray(raw)&&fields.length>1?raw[i]:i===0?raw:null)}`);
  if(raw&&typeof raw==='object'&&!Array.isArray(raw))for(const [k,v] of Object.entries(raw))if(!fields.some(f=>f.key===k)&&!systemKey(k))lines.push(`${k==='note'?'補足':k==='order'?'順序':k}：${valueText(v)}`);
  return lines.join('\n');
}
function drawLines(ctx,lines,x,y,theme){
  ctx.textBaseline='top';
  for(const line of lines){for(const run of line.runs){
    const rx=x+run.x,active=run.kinds;ctx.font=`${run.bold?800:400} ${line.size}px ${FONT}`;
    if(active.includes('marker')){ctx.fillStyle=theme.marker;ctx.fillRect(rx,y,run.width,line.size*1.3)}
    ctx.fillStyle=active.includes('accent')?theme.accent:'#172033';ctx.fillText(run.char,rx,y);
    if(active.includes('underline')||active.includes('strike')){ctx.fillStyle=active.includes('accent')?theme.accent:'#172033';if(active.includes('underline'))ctx.fillRect(rx,y+line.size*1.25,run.width,1);if(active.includes('strike'))ctx.fillRect(rx,y+line.size*.65,run.width,1)}
  }y+=line.height}return y;
}
function drawItems(ctx,items,theme,{images=true}={}){for(const item of items){
  if(item.type==='imageRow'){
    for(const cell of item.cells){if(images)ctx.drawImage(cell.image,cell.x,item.y,cell.width,cell.imageHeight);drawLines(ctx,cell.caption,cell.captionX,item.y+cell.imageHeight+6,theme)}
  }
  else if(item.type==='image'){const x=(PAGE.width-item.width)/2;ctx.drawImage(item.image,x,item.y,item.width,item.imageHeight);drawLines(ctx,item.caption,PAGE.left,item.y+item.imageHeight+6,theme)}
  else drawLines(ctx,item.lines,PAGE.left,item.y+(item.type==='heading'?3:0),theme);
}}
const api={PAGE,FONT,rangesFor,textLines,textAtoms,heading,paginate,buildGroups,answerText,drawLines,drawItems};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.QBPDFLayout=api;
})(typeof window!=='undefined'?window:globalThis);
