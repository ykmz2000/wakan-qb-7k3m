'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../image-library-core-v1.js');
const terms=[{canonical:'動眼神経',aliases:['どうがんしんけい','oculomotor nerve']},{canonical:'眼球運動'}];
test('width, case, and kana normalize without conflating related concepts',()=>{
 assert.equal(C.normalize(' ＡＢＣ　カタカナ '),'abc かたかな');
 assert.notEqual(C.normalize('眼窩底骨折'),C.normalize('眼球運動'));
 assert.deepEqual(C.searchForms('oculomotor nerve',terms),[['oculomotor nerve','動眼神経','どうがんしんけい']]);
 assert.equal(C.searchForms('動眼神経 比較',terms).length,2);
});
test('body snippets find aliases deep in text and keep original characters',()=>{
 const s=C.snippet('前文'.repeat(100)+'動眼神経の図を参照','どうがんしんけい',terms);
 assert.equal(s.find(x=>x.hit).text,'動眼神経');assert.equal(s[0].text,'…');
 assert.equal(C.snippet('ＡＢＣについて','abc')[0].text,'ＡＢＣ');
 assert.equal(C.snippet('<script>alert(1)</script>','alert').map(x=>x.text).join(''),'<script>alert(1)</script>');
});
test('typos are suggestions, not silent replacements',()=>{
 assert.deepEqual(C.suggestions('動眼神径',terms),['動眼神経']);
 assert.deepEqual(C.searchForms('動眼神径',terms),[['動眼神径']]);
});
test('metadata patch contains only actual edits, including intentional clearing',()=>{
 assert.deepEqual(C.changed({name:'名前',subject_ids:['s1']},{name:'名前',subject_ids:['s1']}),{});
 assert.deepEqual(C.changed({ocr_text:'以前の内容',topics:['動眼神経']},{ocr_text:'',topics:[]}),{ocr_text:'',topics:[]});
 assert.deepEqual(C.list('眼科、神経\n眼科,薬理'),['眼科','神経','薬理']);
 assert.throws(()=>C.validate({topics:'not-array'}));assert.throws(()=>C.validate({unknown:'x'}));
});
