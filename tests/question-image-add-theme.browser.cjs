'use strict';
// Real image/identity/editor scripts; synthetic DB/Auth/Storage and blocked external network.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const {chromium,webkit}=require('playwright');
const fixturePath=path.join(__dirname,'inline-stem.browser.cjs');
const source=fs.readFileSync(fixturePath,'utf8');
const end=source.lastIndexOf('(async()=>{for(const [name,type]');
assert.ok(end>0,'existing stem fixture entry point must remain identifiable');
const fixture=new Module(fixturePath,module);
fixture.filename=fixturePath;fixture.paths=module.paths;
fixture._compile(source.slice(0,end)+'\nmodule.exports={boot,popup};',fixturePath);
const {boot,popup}=fixture.exports;
async function run(browser,name){
  const {page:p,errors}=await boot(browser);
  const initialDB=await p.evaluate(()=>JSON.stringify(testDB));
  const checks=await p.evaluate(()=>{
    const button=document.querySelector('.qsiHost .qsiMoreBtn');
    if(!button)throw new Error('real further-image button is missing');
    window.testMoreButton=button;
    const root=document.documentElement;
    const originalAccent=root.style.getPropertyValue('--accent');
    const originalBorder=root.style.getPropertyValue('--accent-border');
    const probe=document.createElement('span');
    probe.style.color='var(--accent)';
    probe.style.borderColor='var(--accent-border,var(--line))';
    probe.style.backgroundColor='var(--card)';
    document.body.append(probe);
    const out=[];
    try{
      for(const [key,theme] of Object.entries(QB_THEME_PALETTE)){
        root.style.setProperty('--accent',theme.accent);
        root.style.setProperty('--accent-border',`color-mix(in srgb, ${theme.accent} 42%, white)`);
        const actual=getComputedStyle(button),expected=getComputedStyle(probe);
        out.push({key,color:actual.color,border:actual.borderTopColor,bg:actual.backgroundColor,expectedColor:expected.color,expectedBorder:expected.borderTopColor,expectedBg:expected.backgroundColor});
      }
    }finally{
      if(originalAccent)root.style.setProperty('--accent',originalAccent);else root.style.removeProperty('--accent');
      if(originalBorder)root.style.setProperty('--accent-border',originalBorder);else root.style.removeProperty('--accent-border');
      probe.remove();
    }
    return out;
  });
  assert.equal(checks.length,7);
  for(const c of checks){assert.equal(c.color,c.expectedColor,c.key+' text');assert.equal(c.border,c.expectedBorder,c.key+' border');assert.equal(c.bg,c.expectedBg,c.key+' neutral background')}
  console.log(name+' PASS further-image text/border follows all seven themes without recreating the button');
  await p.locator('.qsiMoreBtn').click();
  await p.locator('.qsiHost .qsiEditor:not(.qsiHidden)').waitFor();
  const controlColors=await p.evaluate(()=>{const root=document.documentElement;root.style.setProperty('--accent','#9864c9');const probe=document.createElement('i');probe.style.color='var(--accent)';document.body.append(probe);const expected=getComputedStyle(probe).color;const colors=[...document.querySelectorAll('.qsiPick,.qsiPasteBtn,.qsiPasteZone,.qsiRecentBtn,.qsiCropTool')].map(n=>getComputedStyle(n).color);probe.remove();return{expected,colors}});
  assert.ok(controlColors.colors.length>=3);for(const color of controlColors.colors)assert.equal(color,controlColors.expected);
  assert.equal(await p.evaluate(()=>document.querySelector('.qsiMoreBtn')===testMoreButton),true);
  assert.equal(await p.evaluate(()=>JSON.stringify(testDB)),initialDB);
  console.log(name+' PASS original click handler opens image controls without a DB write');
  await p.locator('.adeStemBtn').click();
  const rich=p.locator('.qtext .qbInlineRich[contenteditable="true"]');await rich.waitFor();
  await rich.press('End');await p.keyboard.insertText(' 検証用の追記');
  const draft=await rich.textContent();
  await p.locator('.qsiMoreBtn').click();await popup(p,'.qsiImg');
  assert.equal(await rich.textContent(),draft);
  assert.equal(await p.evaluate(()=>JSON.stringify(testDB)),initialDB);
  await p.locator('.qbInlineCancel').click();await rich.waitFor({state:'detached'});
  assert.equal(await p.evaluate(()=>JSON.stringify(testDB)),initialDB);
  assert.deepEqual(errors,[]);await p.close();
  console.log(name+' PASS themed image button and image popup preserve the unsaved stem and manual cancellation');
}
(async()=>{for(const [name,type] of [['Chromium',chromium],['WebKit',webkit]]){const browser=await type.launch();try{await run(browser,name)}finally{await browser.close()}}})().catch(e=>{console.error(e);process.exitCode=1});
