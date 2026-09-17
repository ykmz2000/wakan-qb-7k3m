'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const files=['index.html','admin.html','ranking.html','auth.js','question-image-export-v1.js','unit-pdf-export-v1.js','data/grade-layer.js','favicon.svg','docs/supabase-auth-email-settings.md'];
test('all user-facing application branding uses プール',()=>{
 for(const file of files){
  const text=fs.readFileSync(path.join(root,file),'utf8');
  assert.equal(text.includes('定期テスト対策QB'),false,`${file} still exposes the old name`);
  assert.equal(text.includes('定期テスト対策プール'),true,`${file} does not expose the new name`);
 }
 const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.match(index,/auth\.js\?v=20260917-pool-brand-01/);
 assert.match(index,/question-image-export-v1\.js\?v=20260917-pool-brand-01/);
 assert.match(index,/unit-pdf-export-v1\.js\?v=20260917-pool-brand-01/);
});
