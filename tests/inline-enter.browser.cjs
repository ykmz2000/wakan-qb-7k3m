'use strict';
// Synthetic editor only. No account, network, DB, or existing content is used.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..');
const platforms=[
  ['desktop','Linux x86_64',0],
  ['iPhone','iPhone',5],
  ['iPad desktop mode','MacIntel',5]
];
async function select(editor,from,to=from){
  await editor.evaluate((el,[a,b])=>{
    el.focus();const walk=document.createTreeWalker(el,NodeFilter.SHOW_TEXT),nodes=[];let n;
    while(n=walk.nextNode())nodes.push(n);
    const point=pos=>{for(const node of nodes){if(pos<=node.length)return[node,pos];pos-=node.length}return[el,el.childNodes.length]};
    const [an,ao]=point(a),[bn,bo]=point(b),range=document.createRange();range.setStart(an,ao);range.setEnd(bn,bo);
    const sel=getSelection();sel.removeAllRanges();sel.addRange(range);document.dispatchEvent(new Event('selectionchange'));
  },[from,to]);
  await editor.page().waitForTimeout(50);
}
async function run(browser,name){
  for(const [device,platform,touch] of platforms){
    const p=await browser.newPage();await p.route('**/*',r=>r.abort());
    await p.setContent('<textarea id="draft">前半後半</textarea>');
    await p.evaluate(({platform,touch})=>{
      Object.defineProperty(navigator,'platform',{get:()=>platform});
      Object.defineProperty(navigator,'maxTouchPoints',{get:()=>touch});
      window.QB_INLINE_TEST=true;
    },{platform,touch});
    await p.addScriptTag({content:fs.readFileSync(path.join(root,'explanation-format-v1.js'),'utf8')});
    await p.addScriptTag({content:fs.readFileSync(path.join(root,'inline-overview-v1.js'),'utf8')});
    await p.evaluate(()=>{
      const ta=document.getElementById('draft');
      window.field=QBInlineOverview.mountField(ta,'explanation',{version:1,source_text:ta.value,ranges:[{kind:'accent',start:2,end:4}]},ta.value,'選択肢の解説');
      window.newlineEvents=[];
      document.querySelector('.qbInlineRich').addEventListener('beforeinput',e=>{
        if(['insertParagraph','insertLineBreak'].includes(e.inputType))newlineEvents.push({type:e.inputType,cancelled:e.defaultPrevented});
      });
    });
    const editor=p.locator('.qbInlineRich');
    const check=async expected=>{
      // iOS fallback runs at 200ms: checking immediately misses the regression.
      await p.waitForTimeout(300);
      assert.equal(await editor.textContent(),expected,name+' '+device+' editor');
      assert.equal(await p.locator('#draft').inputValue(),expected,name+' '+device+' save source');
    };
    await select(editor,2);await p.keyboard.press('Enter');await check('前半\n後半');
    if(touch)assert.ok((await p.evaluate(()=>newlineEvents)).some(e=>e.cancelled),'exercise native mobile beforeinput');
    assert.equal(await editor.locator('.qbFmt-accent').textContent(),'後半');
    await p.locator('[data-qb-inline-format="undo"]').click();await check('前半後半');
    await p.locator('[data-qb-inline-format="redo"]').click();await check('前半\n後半');
    await select(editor,3);await p.keyboard.press('Enter');await p.keyboard.press('Enter');await check('前半\n\n\n後半');
    await select(editor,5);await p.keyboard.press('Shift+Enter');await check('前半\n\n\n\n後半');
    await select(editor,0,2);await p.keyboard.press('Enter');await check('\n\n\n\n\n後半');
    await editor.evaluate(el=>{
      // Software keyboards may provide beforeinput without a keydown.
      el.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertParagraph'}));
      el.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertLineBreak'}));
    });
    await check('\n\n\n\n\n\n\n後半');
    const before=await editor.textContent();
    await editor.evaluate(el=>{
      el.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertParagraph',isComposing:true}));
      el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:'にほん'}));
      el.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:'Enter',keyCode:13,isComposing:true}));
      el.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertParagraph'}));
      el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'日本'}));
    });
    await check(before);
    // Round-trip the real save metadata after inserting line breaks before a mark.
    const roundtrip=await p.evaluate(()=>{
      const text=document.getElementById('draft').value.trim(),record=field.read();
      return QBInlineOverview.codec.readDoc(QBInlineOverview.codec.docFrom(text,record));
    });
    assert.equal(roundtrip.text,'後半');assert.deepEqual(roundtrip.record.ranges,[{kind:'accent',start:0,end:2}]);
    await p.close();console.log(name+' PASS '+device+': single/rapid Enter, Shift-Enter, selection, software input, undo/redo, composition guards, formatting round-trip');
  }
}
(async()=>{for(const [name,type] of [['Chromium',chromium],['WebKit',webkit]]){const browser=await type.launch();try{await run(browser,name)}finally{await browser.close()}}})().catch(e=>{console.error(e);process.exitCode=1});
