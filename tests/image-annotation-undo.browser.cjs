'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require('playwright'),{boot}=require('./image-library.browser.cjs');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
async function run(browser,label){
 const {page:p,errors}=await boot(browser);await p.setViewportSize({width:1024,height:900});
 await p.addStyleTag({content:read('image-annotation-v1.css')});await p.addScriptTag({content:read('image-annotation-model-v1.js')});
 // Observe scene history while exercising the actual canvas and keyboard handling.
 await p.evaluate(()=>{const H=QBImageModel.History;QBImageModel.History=class extends H{constructor(s){super(s);if(s.items)window.sceneHistory=this}}});
 await p.addScriptTag({content:read('image-annotation-editor-v1.js')});
 await p.evaluate(()=>{localStorage.setItem('qb-image-editor-settings-v1','{}');const c=document.createElement('canvas');c.width=800;c.height=600;c.getContext('2d').fillRect(0,0,800,600);QBImageEditor.open(c.toDataURL())});
 await p.locator('.qbDrawSave:enabled').waitFor();await p.getByRole('button',{name:'文字',exact:true}).click();await p.getByRole('button',{name:'全体表示',exact:true}).click();
 const box=await p.locator('.qbDrawStage').boundingBox(),z=Math.min((box.width-32)/800,(box.height-32)/600),at=(x,y)=>({x:box.x+(box.width-800*z)/2+x*z,y:box.y+(box.height-600*z)/2+y*z});
 const click=async(x,y)=>{const a=at(x,y);await p.mouse.click(a.x,a.y)};
 await click(100,100);const text=p.getByRole('textbox',{name:'画像に入れる文字',exact:true});await text.fill('Alpha');await text.press('End');await text.press('!');await p.keyboard.press('Meta+z');assert.equal(await text.inputValue(),'Alpha');await p.keyboard.press('Meta+Shift+z');assert.equal(await text.inputValue(),'Alpha!');
 await p.keyboard.press('Control+z');assert.equal(await text.inputValue(),'Alpha');
 const guard=await text.evaluate(t=>{t.dispatchEvent(new KeyboardEvent('keydown',{key:'z',code:'KeyZ',metaKey:true,bubbles:true,cancelable:true}));const e=new InputEvent('beforeinput',{inputType:'insertText',data:'z',bubbles:true,cancelable:true});t.dispatchEvent(e);return e.defaultPrevented});assert.equal(guard,true);
 await text.fill('Alpha');await click(500,350);assert.equal(await text.isVisible(),false);assert.equal(await p.evaluate(()=>sceneHistory.current.items.length),1);
 // The next blank click can add text. Text undo cannot resurrect the prior editor's text.
 await click(500,350);await text.fill('Beta');await p.keyboard.press('Meta+z');assert.notEqual(await text.inputValue(),'Alpha');await text.fill('Beta');await click(700,500);assert.equal(await p.evaluate(()=>sceneHistory.current.items.length),2);
 // A single undo on the canvas undoes the latest committed change; repeated selection does not add history.
 await p.locator('[data-tool=lasso]').click();const before=await p.evaluate(()=>sceneHistory.past.length);await click(110,115);await click(700,500);assert.equal(await p.evaluate(()=>sceneHistory.past.length),before);
 await p.keyboard.press('Meta+z');assert.equal(await p.evaluate(()=>sceneHistory.past.length),before-1);
 assert.deepEqual(errors,[]);await p.close();console.log(label+' PASS text-local undo/redo, consumed Z, deselection cushion and scene history');
}
(async()=>{for(const [label,type] of [['Chromium',chromium],['WebKit',webkit]]){const b=await type.launch();try{await run(b,label)}finally{await b.close()}}})().catch(e=>{console.error(e);process.exitCode=1});
