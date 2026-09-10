/* Coordinates are in image pixels, independent of zoom, screen size and DPR. */
(()=>{
'use strict';
const colors=Object.freeze([{name:'赤',value:'#e04444'},{name:'青',value:'#2463d3'},{name:'オレンジ',value:'#f28c28'},{name:'緑',value:'#23995a'},{name:'水色',value:'#22b8dc'},{name:'ピンク',value:'#ef476f'},{name:'黄色',value:'#ffd63d'},{name:'黒',value:'#111111'},{name:'白',value:'#ffffff'}]);
const copy=x=>JSON.parse(JSON.stringify(x));
const rect=(a,b)=>({x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(a.x-b.x),h:Math.abs(a.y-b.y)});
function lineEnd(a,b,mode){return mode==='horizontal'?{...b,y:a.y}:mode==='vertical'?{...b,x:a.x}:{...b}}
function shapeRect(a,b,type){if(type!=='circle')return rect(a,b);const size=Math.max(Math.abs(b.x-a.x),Math.abs(b.y-a.y));return rect(a,{x:a.x+(b.x<a.x?-size:size),y:a.y+(b.y<a.y?-size:size)})}
function bounds(item){
  if(item.points?.length){let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;for(const p of item.points){left=Math.min(left,p.x);top=Math.min(top,p.y);right=Math.max(right,p.x);bottom=Math.max(bottom,p.y)}const pad=(item.width||1)/2;return{x:left-pad,y:top-pad,w:right-left+2*pad,h:bottom-top+2*pad}}
  if(item.type==='arrow'){const b=rect(item.a,item.b),pad=Math.max(item.width*3,8);return{x:b.x-pad,y:b.y-pad,w:b.w+pad*2,h:b.h+pad*2}}
  return{x:item.x,y:item.y,w:Math.max(item.w||1,1),h:Math.max(item.h||1,1)};
}
function union(items){if(!items.length)return null;const bs=items.map(bounds),x=Math.min(...bs.map(b=>b.x)),y=Math.min(...bs.map(b=>b.y));return{x,y,w:Math.max(...bs.map(b=>b.x+b.w))-x,h:Math.max(...bs.map(b=>b.y+b.h))-y}}
function inside(p,polygon){let hit=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)hit=!hit}return hit}
function lasso(items,polygon){if(polygon.length<3)return[];return items.filter(item=>{const b=bounds(item),samples=item.points||[item.a,item.b].filter(Boolean);return(samples.length?samples:[{x:b.x,y:b.y},{x:b.x+b.w,y:b.y},{x:b.x,y:b.y+b.h},{x:b.x+b.w,y:b.y+b.h},{x:b.x+b.w/2,y:b.y+b.h/2}]).every(p=>inside(p,polygon))}).map(x=>x.id)}
function transform(item,from,to){const out=copy(item),sx=to.w/Math.max(from.w,1),sy=to.h/Math.max(from.h,1),map=p=>({...p,x:to.x+(p.x-from.x)*sx,y:to.y+(p.y-from.y)*sy});if(out.points)out.points=out.points.map(map);else if(out.type==='arrow'){out.a=map(out.a);out.b=map(out.b)}else{Object.assign(out,map(out));out.w*=sx;out.h*=sy}if(out.width)out.width*=Math.sqrt(Math.abs(sx*sy));if(out.fontSize)out.fontSize*=Math.sqrt(Math.abs(sx*sy));return out}
function distance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)}
function hit(item,p,tol){if(item.points){return item.points.some((b,i)=>distance(p,item.points[Math.max(0,i-1)],b)<=tol+item.width/2)}if(item.type==='arrow')return distance(p,item.a,item.b)<=tol+item.width*2;const b=bounds(item);if(item.type==='rect'){const corners=[{x:b.x,y:b.y},{x:b.x+b.w,y:b.y},{x:b.x,y:b.y+b.h},{x:b.x+b.w,y:b.y+b.h}];return corners.some((a,i)=>distance(p,a,corners[(i+1)%4])<=tol+(item.width||0)/2)}return p.x>=b.x-tol&&p.y>=b.y-tol&&p.x<=b.x+b.w+tol&&p.y<=b.y+b.h+tol}
function reorder(items,selectedIds,mode){
  const selected=new Set(selectedIds||[]),out=(items||[]).map(copy);if(!selected.size)return out;
  if(mode==='front'){const a=out.filter(i=>!selected.has(i.id)),b=out.filter(i=>selected.has(i.id));return [...a,...b]}
  if(mode==='back'){const a=out.filter(i=>selected.has(i.id)),b=out.filter(i=>!selected.has(i.id));return [...a,...b]}
  if(mode==='forward'){for(let i=out.length-2;i>=0;i--)if(selected.has(out[i].id)&&!selected.has(out[i+1].id))[out[i],out[i+1]]=[out[i+1],out[i]];return out}
  if(mode==='backward'){for(let i=1;i<out.length;i++)if(selected.has(out[i].id)&&!selected.has(out[i-1].id))[out[i-1],out[i]]=[out[i],out[i-1]];return out}
  return out;
}
function snapMove(items,selectedIds,dx,dy,sceneWidth,sceneHeight,zoom=1,thresholdPx=10){
  const selected=new Set(selectedIds||[]),moving=(items||[]).filter(i=>selected.has(i.id)),box=union(moving);if(!box)return{dx,dy,guides:[]};
  const threshold=Math.max(.01,thresholdPx/Math.max(.02,zoom)),others=(items||[]).filter(i=>!selected.has(i.id));
  const xTargets={start:[0],center:[sceneWidth/2],end:[sceneWidth]},yTargets={start:[0],center:[sceneHeight/2],end:[sceneHeight]};
  for(const item of others){const b=bounds(item);xTargets.start.push(b.x);xTargets.center.push(b.x+b.w/2);xTargets.end.push(b.x+b.w);yTargets.start.push(b.y);yTargets.center.push(b.y+b.h/2);yTargets.end.push(b.y+b.h)}
  const xAnchors={start:box.x+dx,center:box.x+box.w/2+dx,end:box.x+box.w+dx},yAnchors={start:box.y+dy,center:box.y+box.h/2+dy,end:box.y+box.h+dy};
  function best(anchors,targets){let found=null;for(const role of ['start','center','end'])for(const target of targets[role]){const delta=target-anchors[role],distance=Math.abs(delta);if(distance<=threshold&&(!found||distance<found.distance))found={delta,distance,value:target}}return found}
  const sx=best(xAnchors,xTargets),sy=best(yAnchors,yTargets),guides=[];if(sx)guides.push({axis:'x',value:sx.value});if(sy)guides.push({axis:'y',value:sy.value});return{dx:dx+(sx?.delta||0),dy:dy+(sy?.delta||0),guides};
}
function fitSize(w,h,maxPixels=12000000,maxSide=16384){if(!(w>0&&h>0&&Number.isFinite(w)&&Number.isFinite(h)))throw Error('画像サイズが不正です');const scale=Math.min(1,Math.sqrt(maxPixels/(w*h)),maxSide/w,maxSide/h);return{width:Math.max(1,Math.floor(w*scale)),height:Math.max(1,Math.floor(h*scale)),scale}}
class History{
  constructor(state){this.past=[];this.future=[];this.current=copy(state)}
  push(state){if(JSON.stringify(state)===JSON.stringify(this.current))return;this.past.push(this.current);if(this.past.length>80)this.past.shift();this.current=copy(state);this.future=[]}
  undo(){if(!this.past.length)return copy(this.current);this.future.push(this.current);this.current=this.past.pop();return copy(this.current)}
  redo(){if(!this.future.length)return copy(this.current);this.past.push(this.current);this.current=this.future.pop();return copy(this.current)}
}
function stabilize(previous,point,strength,zoom=1){const radius=Math.max(0,Math.min(100,Number(strength)||0))*.08/Math.max(.02,zoom);if(!radius)return{...point};const distance=Math.hypot(point.x-previous.x,point.y-previous.y),alpha=1-Math.exp(-distance/radius);return{...point,x:previous.x+(point.x-previous.x)*alpha,y:previous.y+(point.y-previous.y)*alpha}}
function counterLabel(value,mode='number'){if(mode!=='letter')return String(value);let n=value,label='';while(n>0){n--;label=String.fromCharCode(97+n%26)+label;n=Math.floor(n/26)}return label}
function counterValue(text,mode='number'){const t=String(text).trim();if(mode==='letter'){if(!/^[a-z]{1,4}$/.test(t))return null;return [...t].reduce((n,c)=>n*26+c.charCodeAt(0)-96,0)}return /^[1-9]\d{0,5}$/.test(t)?Number(t):null}
const api={counterLabel,counterValue,colors,copy,rect,lineEnd,shapeRect,bounds,union,inside,lasso,transform,hit,reorder,snapMove,fitSize,History,stabilize};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else window.QBImageModel=api;
})();
