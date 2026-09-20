'use strict';
function pdfFixture(pageCount=3){
 const colors=['1 0 0','0 1 0','0 0 1','1 1 0','1 0 1','0 1 1'],kids=Array.from({length:pageCount},(_,i)=>`${3+i*2} 0 R`).join(' '),objects=['<< /Type /Catalog /Pages 2 0 R >>',`<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`];
 for(let i=0;i<pageCount;i++){const stream=`${colors[i%colors.length]} rg 0 0 200 300 re f`;objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 300] /Resources << >> /Contents ${4+i*2} 0 R >>`,`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)}
 let body='%PDF-1.7\n',offsets=[0];objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(body));body+=`${i+1} 0 obj\n${o}\nendobj\n`});const xref=Buffer.byteLength(body);body+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;return Buffer.from(body);
}
module.exports=pdfFixture;
