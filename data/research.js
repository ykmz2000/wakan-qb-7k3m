document.write('<script src="data/research-base.js"></script><script src="data/2025.js"></script><script src="study-order.js"></script>');

// Authentication gate: keep the QB hidden until Supabase confirms a session.
document.documentElement.classList.add('qb-auth-pending');
const gateStyle=document.createElement('style');
gateStyle.id='qbAuthGateStyle';
gateStyle.textContent=`html.qb-auth-pending body>*:not(#authOverlay){visibility:hidden!important}html.qb-auth-pending body{background:#f5f7fb!important}`;
document.head.appendChild(gateStyle);

window.addEventListener('DOMContentLoaded',()=>{
  // Change this release token whenever enhancement scripts change so iPad/Safari
  // cannot keep serving an older cached auth/resume/navigation bundle.
  const RELEASE='20260905-1402';
  const load=(src,local=false)=>new Promise((resolve,reject)=>{
    const s=document.createElement('script');
    s.src=local?`${src}?v=${RELEASE}`:src;
    s.onload=resolve;
    s.onerror=reject;
    document.body.appendChild(s);
  });
  (async()=>{
    try{
      await load('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
      await load('auth.js',true);
      await load('data/grade-layer.js',true);
      await load('admin-inline.js',true);
      await load('question-series-ux.js',true);
      await load('resume-session.js',true);
    }catch(e){
      console.error('Authentication failed to load:',e);
    }
  })();
});