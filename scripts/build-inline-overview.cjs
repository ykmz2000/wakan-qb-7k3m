'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {createRequire}=require('node:module');
const deps=path.resolve(process.env.QB_INLINE_BUILD_DIR||'/tmp/qb-inline-build');
const req=createRequire(path.join(deps,'package.json'));
const spec=require('../editor-build/package.json');
for(const [name,version] of Object.entries(spec.dependencies)){
  const installed=JSON.parse(fs.readFileSync(path.join(deps,'node_modules',name,'package.json'),'utf8'));
  if(installed.version!==version)throw new Error(`Unexpected ${name} version: ${installed.version}`);
}
req('esbuild').buildSync({entryPoints:['src/inline-overview-v1.js'],outfile:'inline-overview-v1.js',bundle:true,format:'iife',target:['safari16','chrome109'],minify:true,legalComments:'linked',nodePaths:[path.join(deps,'node_modules')],logLevel:'info'});
const licenseNames=Object.keys(spec.dependencies).filter(n=>n!=='esbuild');
const licenseText=licenseNames.map(name=>{
  const dir=path.join(deps,'node_modules',name);
  const file=['LICENSE','LICENSE.txt','LICENSE.md'].find(n=>fs.existsSync(path.join(dir,n)));
  if(!file)throw new Error('Missing license for '+name);
  return `${name} ${spec.dependencies[name]}\n\n${fs.readFileSync(path.join(dir,file),'utf8')}\n`;
}).join('\n--------------------\n\n');
fs.writeFileSync('inline-overview-v1.LICENSES.txt',licenseText);
console.log('Inline overview bundle generated; dependencies are outside the Pages artifact.');

// Ship the pinned legacy PDF display layer and worker from the same build.
const pdfRoot=path.join(deps,'node_modules/pdfjs-dist'),pdfOut='vendor/pdfjs';
fs.mkdirSync(pdfOut,{recursive:true});
for(const name of ['pdf.mjs','pdf.worker.mjs'])fs.copyFileSync(path.join(pdfRoot,'legacy/build',name),path.join(pdfOut,name));
for(const name of ['cmaps','standard_fonts','wasm'])fs.cpSync(path.join(pdfRoot,name),path.join(pdfOut,name),{recursive:true});
fs.copyFileSync(path.join(pdfRoot,'LICENSE'),path.join(pdfOut,'LICENSE'));

fs.copyFileSync(path.join(deps,'node_modules/pdf-lib/dist/pdf-lib.esm.min.js'),path.join(pdfOut,'pdf-lib.mjs'));
