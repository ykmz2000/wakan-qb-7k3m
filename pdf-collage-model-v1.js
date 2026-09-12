/* Deterministic collage geometry shared by the browser editor and unit tests. */
((root,factory)=>{
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.QBPDFCollageModel=api;
})(typeof window!=='undefined'?window:null,()=>{
  'use strict';
  const A4={portrait:[595.28,841.89],landscape:[841.89,595.28]};
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  function normalizeRows(rows){
    if(!Array.isArray(rows)||!rows.length)return[[null,null]];
    return rows.slice(0,20).map(row=>Array.isArray(row)?row.slice(0,4):[]).filter(row=>row.length).map(row=>row.length?row:[null]);
  }
  function aspect(item){
    const value=Number(item?.aspect);
    return Number.isFinite(value)&&value>0?clamp(value,.08,12):4/3;
  }
  function mediaType(blob,path){
    if(/\.pdf(?:[?#]|$)/i.test(String(path||'')))return'application/pdf';
    if(blob?.type&&blob.type!=='application/octet-stream')return blob.type;
    const ext=String(path||'').split(/[?#]/)[0].split('.').pop()?.toLowerCase();
    return({jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',gif:'image/gif',webp:'image/webp',bmp:'image/bmp',svg:'image/svg+xml',heic:'image/heic',heif:'image/heif'}[ext]||blob?.type||'application/octet-stream');
  }
  function calculate(rows,{mode='fit',axis='rows',margin=18,gap=8,pageWidth=595.28,maxHeight=5000}={}){
    rows=normalizeRows(rows);margin=clamp(Number(margin)||0,0,72);gap=clamp(Number(gap)||0,0,48);
    const fixed=A4[mode],baseWidth=fixed?fixed[0]:clamp(Number(pageWidth)||595.28,144,2000);
    if(axis==='columns'){
      const inner=Math.max(36,baseWidth-margin*2),cellWidth=Math.max(12,(inner-gap*(rows.length-1))/rows.length);
      const raw=rows.map(column=>{const heights=column.map(item=>item?cellWidth/aspect(item):cellWidth*.45);return{column,heights,height:heights.reduce((sum,value)=>sum+value,0)+gap*Math.max(0,column.length-1)}});
      const contentHeight=Math.max(...raw.map(column=>column.height));
      const availableHeight=fixed?Math.max(36,fixed[1]-margin*2):Math.max(36,maxHeight-margin*2),scale=Math.min(1,availableHeight/contentHeight);
      const width=fixed?fixed[0]:baseWidth,height=fixed?fixed[1]:Math.min(maxHeight,contentHeight*scale+margin*2),drawnWidth=inner*scale,offsetX=margin+(inner-drawnWidth)/2,placements=[];
      raw.forEach((entry,columnIndex)=>{let top=height-margin;entry.column.forEach((item,rowIndex)=>{const itemHeight=entry.heights[rowIndex]*scale;if(item)placements.push({item,row:rowIndex,column:columnIndex,x:offsetX+columnIndex*(cellWidth+gap)*scale,top,y:top-itemHeight,width:cellWidth*scale,height:itemHeight});top-=itemHeight+gap*scale})});
      return{width,height,scale,axis:'columns',margin,gap,contentHeight,placements};
    }
    const inner=Math.max(36,baseWidth-margin*2),raw=[];
    let contentHeight=0;
    for(const row of rows){
      const cellWidth=Math.max(12,(inner-gap*(row.length-1))/row.length);
      const heights=row.map(item=>item?cellWidth/aspect(item):0);
      const rowHeight=Math.max(cellWidth*.45,...heights);
      raw.push({row,cellWidth,rowHeight,heights});contentHeight+=rowHeight;
    }
    contentHeight+=gap*Math.max(0,raw.length-1);
    const availableHeight=fixed?Math.max(36,fixed[1]-margin*2):Math.max(36,maxHeight-margin*2);
    const scale=Math.min(1,availableHeight/contentHeight);
    const width=fixed?fixed[0]:baseWidth;
    const height=fixed?fixed[1]:Math.min(maxHeight,contentHeight*scale+margin*2);
    const drawnWidth=inner*scale,offsetX=margin+(inner-drawnWidth)/2;
    let top=height-margin;const placements=[];
    raw.forEach((entry,rowIndex)=>{
      entry.row.forEach((item,columnIndex)=>{
        if(!item)return;
        const itemHeight=entry.heights[columnIndex]*scale;
        placements.push({item,row:rowIndex,column:columnIndex,x:offsetX+columnIndex*(entry.cellWidth+gap)*scale,top,y:top-itemHeight,width:entry.cellWidth*scale,height:itemHeight});
      });
      top-=entry.rowHeight*scale+gap*scale;
    });
    return{width,height,scale,axis:'rows',margin,gap,contentHeight,placements};
  }
  return{A4,normalizeRows,mediaType,calculate};
});
