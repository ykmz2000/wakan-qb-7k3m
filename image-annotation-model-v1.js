/* Coordinates are in image pixels, independent of zoom, screen size and DPR. */
(()=>{
'use strict';
const colors=Object.freeze([{name:'赤',value:'#e04444'},{name:'青',value:'#2463d3'},{name:'オレンジ',value:'#f28c28'},{name:'緑',value:'#23995a'},{name:'水色',value:'#22b8dc'},{name:'ピンク',value:'#ef476f'},{name:'黄色',value:'#ffd63d'}]);
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
function hit(item,p,tol){if(item.points){return item.points.some((b,i)=>distance(p,item.points[Math.max(0,i-1)],b)<=tol+item.width/2)}if(item.type==='arrow')return distance(p,item.a,item.b)<=tol+item.width*2;const b=bounds(item);if(item.type==='rect'){const corners=[{x:b.x,y:b.y},{x:b.x+b.w,y:b.y},{x:b.x+b.w,y:b.y+b.h},{x:b.x,y:b.y+b.h}];return corners.some((a,i)=>distance(p,a,corners[(i+1)%4])<=tol+(item.width||0)/2)}return p.x>=b.x-tol&&p.y>=b.y-tol&&p.x<=b.x+b.w+tol&&p.y<=b.y+b.h+tol}
function fitSize(w,h,maxPixels=12000000,maxSide=16384){if(!(w>0&&h>0&&Number.isFinite(w)&&Number.isFinite(h)))throw Error('画像サイズが不正です');const scale=Math.min(1,Math.sqrt(maxPixels/(w*h)),maxSide/w,maxSide/h);return{width:Math.max(1,Math.floor(w*scale)),height:Math.max(1,Math.floor(h*scale)),scale}}
class History{
  constructor(state){this.past=[];this.future=[];this.current=copy(state)}
  push(state){if(JSON.stringify(state)===JSON.stringify(this.current))return;this.past.push(this.current);if(this.past.length>80)this.past.shift();this.current=copy(state);this.future=[]}
  undo(){if(!this.past.length)return copy(this.current);this.future.push(this.current);this.current=this.past.pop();return copy(this.current)}
  redo(){if(!this.future.length)return copy(this.current);this.past.push(this.current);this.current=this.future.pop();return copy(this.current)}
}
function stabilize(previous,point,strength,zoom=1){const radius=Math.max(0,Math.min(100,Number(strength)||0))*.08/Math.max(.02,zoom);if(!radius)return{...point};const distance=Math.hypot(point.x-previous.x,point.y-previous.y),alpha=1-Math.exp(-distance/radius);return{...point,x:previous.x+(point.x-previous.x)*alpha,y:previous.y+(point.y-previous.y)*alpha}}
const api={colors,copy,rect,lineEnd,shapeRect,bounds,union,inside,lasso,transform,hit,fitSize,History,stabilize};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else window.QBImageModel=api;
})();
