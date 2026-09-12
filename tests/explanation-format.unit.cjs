'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const F=require('../explanation-format-v1.js');
const record=(text,ranges)=>({version:1,source_text:text,ranges});
const r=(kind,start,end)=>({kind,start,end});
test('old text and literal markup are not silently interpreted',()=>{
  assert.equal(F.html('**keyword** <u>not HTML</u> & < 1',null),'**keyword** &lt;u&gt;not HTML&lt;/u&gt; &amp; &lt; 1');
});
test('all five styles and overlap retain text',()=>{
  const t='甲乙丙丁',out=F.html(t,record(t,['bold','underline','strike','marker','accent'].map(k=>r(k,1,3))));
  for(const k of ['bold','underline','strike','marker','accent'])assert.ok(out.includes('qbFmt-'+k));
  assert.equal(out.replace(/<\/?span[^>]*>/g,''),t);
});
test('untrusted text and malformed formatting cannot add HTML',()=>{
  const t='<img src=x onerror=alert(1)>',out=F.html(t,record(t,[r('bold',0,t.length),r('x\" onclick=alert(1)',0,1),r('marker',-1,3)]));
  assert.ok(out.includes('&lt;img'));assert.ok(!out.includes('<img'));assert.ok(!out.includes('class="x'));
});
test('a different source text, even of equal length, gets no old marks',()=>{
  assert.equal(F.html('abcd',record('wxyz',[r('marker',0,2)])),'abcd');
  assert.equal(F.html('abcd',{version:2,source_text:'abcd',ranges:[r('marker',0,2)]}),'abcd');
});
test('range validation, sorting and merging',()=>{
  assert.deepEqual(F.normalize('abcdef',[r('bold',1,3),r('bold',3,5),r('marker',3,99),r('accent',2,2),r('strike',NaN,2)]),[r('bold',1,5)]);
});
test('surrogate pairs are never split',()=>{
  const t='a😀b';assert.deepEqual(F.normalize(t,[r('bold',1,2)]),[]);assert.deepEqual(F.normalize(t,[r('bold',1,3)]),[r('bold',1,3)]);
});
test('toggle and partial removal are reversible',()=>{
  let v=F.toggle('abcdef',[],1,5,'marker');assert.deepEqual(v,[r('marker',1,5)]);
  v=F.toggle('abcdef',v,2,4,'marker');assert.deepEqual(v,[r('marker',1,2),r('marker',4,5)]);
  v=F.toggle('abcdef',v,2,4,'marker');assert.deepEqual(v,[r('marker',1,5)]);
});
test('clear affects selected text only, across multiple styles',()=>{
  const out=F.normalize('abcdef',F.subtract([r('bold',0,5),r('marker',2,6)],3,4));
  assert.deepEqual(out,[r('bold',0,3),r('bold',4,5),r('marker',2,3),r('marker',4,6)]);
});
test('insert before and within a range',()=>{
  assert.deepEqual(F.rebase('abcdef','ZZabcdef',[r('marker',2,4)]),[r('marker',4,6)]);
  assert.deepEqual(F.rebase('abcdef','abcZZdef',[r('marker',2,5)]),[r('marker',2,7)]);
});
test('replaced marked text is not incorrectly assigned to new words',()=>{
  assert.deepEqual(F.rebase('abcdef','abXYZef',[r('strike',2,4)]),[]);
});
test('trim on save keeps offsets aligned with saved text',()=>{
  assert.deepEqual(F.snapshot('  keyword \n',[r('bold',2,9)]),record('keyword',[r('bold',0,7)]));assert.equal(F.snapshot('  ',[]),null);
});
test('links keep display text separate and reject unsafe protocols',()=>{
  const text='公式資料',link={kind:'link',start:0,end:text.length,href:'https://example.com/path?q=1'};
  const out=F.html(text,record(text,[link]));
  assert.match(out,/class="qbFmt-link"/);assert.match(out,/href="https:\/\/example\.com\/path\?q=1"/);
  assert.match(out,/target="_blank" rel="noopener noreferrer"/);assert.match(out,/🔗/);
  assert.equal(out.replace(/<[^>]+>/g,''),'🔗'+text);
  assert.equal(F.validHref('javascript:alert(1)'),null);assert.equal(F.validHref('data:text/html,x'),null);
  assert.equal(F.html(text,record(text,[{...link,href:'javascript:alert(1)'}])),text);
});
test('no new global click handler or DOM observer',()=>{
  const src=fs.readFileSync(require.resolve('../explanation-format-v1.js'),'utf8');assert.ok(!src.includes('new MutationObserver'));assert.ok(!src.includes("document.addEventListener('click'"));assert.ok(!src.includes('innerHTML=`<div class="card'));
});
