const path=require('path');
const {chromium,webkit}=require('playwright');
const assert=require('assert');

const root=path.resolve(__dirname,'..');
const dnd=path.join(root,'admin-question-order-dnd-v1.js');
const mode=path.join(root,'admin-problem-list-mode-v1.js');

async function setup(page,count=18){
  await page.setViewportSize({width:390,height:520});
  await page.setContent(`<!doctype html><style>
    body{margin:0;font-family:sans-serif}.spacer{height:160px}#view{padding:8px}.problem{height:92px;padding:8px;border-bottom:1px solid #ddd;display:grid;grid-template-columns:52px 1fr 40px;gap:8px;background:#fff}.qid{font-weight:bold}.pick{grid-column:3}.qtext{grid-column:2}
  </style><div class="spacer"></div><div id="view">${Array.from({length:count},(_,i)=>`<div class="problem"><div class="qid">${i+1}</div><div class="qtext">問題 ${i+1}</div><label class="pick"><input type="checkbox" data-q="q${i+1}"></label></div>`).join('')}</div>`);
  await page.evaluate(()=>{
    window.__rpcCalls=[];window.__rpcError=false;window.qbGetScreen=()=> 'problems';window.qbGetPracticeState=()=>({unitId:'u1'});
    window.qbSupabase={
      auth:{getUser:async()=>({data:{user:{id:'admin'}}})},
      from(table){
        if(table==='profiles')return{select(){return this},eq(){return this},maybeSingle:async()=>({data:{role:'admin'}})};
        if(table==='questions')return{select(){return this},in:async(_,ids)=>({data:ids.map((id,i)=>({id,unit_id:'u1',study_order:(i+1)*10}))})};
        throw new Error('unexpected table '+table)
      },
      rpc:async(name,args)=>{window.__rpcCalls.push({name,args});return window.__rpcError?{error:{message:'test failure'}}:{data:args.p_items.length,error:null}}
    }
  });
  await page.addScriptTag({path:dnd});await page.addScriptTag({path:mode});
  await page.waitForSelector('#qsoModeWrap');await page.click('#qsoModeWrap [data-mode="reorder"]');
}
const ids=page=>page.$$eval('#view .problem',rs=>rs.map(r=>r.querySelector('[data-q]').dataset.q));

async function run(engine,name){
  const browser=await engine.launch({headless:true});const page=await browser.newPage();
  try{
    await setup(page);
    assert((await page.locator('.qsoHandle').first().evaluate(e=>parseFloat(getComputedStyle(e).width)))>=42);
    await page.locator('[data-q="q2"]').check();
    const first=page.locator('.problem').first();const a=await first.boundingBox();
    await page.mouse.move(a.x+a.width*.55,a.y+a.height*.5);await page.mouse.down();await page.mouse.move(a.x+a.width*.55,a.y+a.height*.5+8);
    await page.waitForSelector('.qsoDragGhost');assert.equal(await page.locator('.qsoDropIndicator').count(),1);assert.equal(await page.locator('.qsoSourceHidden').count(),1);
    const target=page.locator('.problem').filter({has:page.locator('[data-q="q3"]')}),b=await target.boundingBox();await page.mouse.move(b.x+b.width*.55,b.y+b.height*.6);await page.mouse.up();
    assert.deepEqual((await ids(page)).slice(0,3),['q2','q3','q1']);assert(await page.locator('[data-q="q2"]').isChecked());assert.equal(await page.locator('.qsoDragGhost').count(),0);
    await page.click('#qsoSave');await page.waitForFunction(()=>window.__rpcCalls.length===1);assert.deepEqual((await page.evaluate(()=>window.__rpcCalls[0].args.p_items.slice(0,3).map(x=>x.id))),['q2','q3','q1']);await page.waitForTimeout(240);

    const q1=page.locator('.problem').filter({has:page.locator('[data-q="q1"]')}),q2=page.locator('.problem').filter({has:page.locator('[data-q="q2"]')});const c=await q1.boundingBox(),d=await q2.boundingBox();
    await page.mouse.move(c.x+c.width*.55,c.y+c.height*.5);await page.mouse.down();await page.mouse.move(c.x+c.width*.55,c.y+c.height*.5+8);await page.mouse.move(d.x+d.width*.55,d.y+2);await page.mouse.up();
    await page.evaluate(()=>{window.__rpcError=true});await page.click('#qsoSave');await page.waitForFunction(()=>document.querySelector('.qsoMsg').textContent.includes('元の順番に戻しました'));
    assert.deepEqual((await ids(page)).slice(0,3),['q2','q3','q1']);

    await page.evaluate(()=>scrollTo(0,0));const handle=page.locator('.qsoHandle').first(),h=await handle.boundingBox();await page.mouse.move(h.x+h.width/2,h.y+h.height/2);await page.mouse.down();await page.mouse.move(h.x+h.width/2,510);await page.waitForTimeout(420);assert((await page.evaluate(()=>scrollY))>0);await page.mouse.up();

    const touchRow=page.locator('.problem').nth(1);await touchRow.dispatchEvent('pointerdown',{pointerId:41,pointerType:'touch',button:0,clientX:150,clientY:230});await page.waitForTimeout(190);assert.equal(await page.locator('.qsoDragGhost').count(),1);await touchRow.dispatchEvent('pointerup',{pointerId:41,pointerType:'touch',button:0,clientX:150,clientY:230});
    console.log(`${name}: problem reorder UX OK`)
  }finally{await browser.close()}
}

(async()=>{for(const [name,engine] of [['chromium',chromium],['webkit',webkit]])await run(engine,name)})().catch(e=>{console.error(e);process.exit(1)});
