document.write('<script src="data/research-base.js"></script><script src="data/2025.js"></script><script src="study-order.js"></script>');

// Authentication gate: keep the QB hidden until Supabase confirms a session.
// This is a UI access gate; database security remains enforced separately by Supabase RLS.
document.documentElement.classList.add('qb-auth-pending');
const gateStyle=document.createElement('style');
gateStyle.id='qbAuthGateStyle';
gateStyle.textContent=`html.qb-auth-pending body>*:not(#authOverlay){visibility:hidden!important}html.qb-auth-pending body{background:#f5f7fb!important}`;
document.head.appendChild(gateStyle);

window.addEventListener('DOMContentLoaded',()=>{
  const load=(src)=>new Promise((resolve,reject)=>{
    const s=document.createElement('script');
    s.src=src;
    s.onload=resolve;
    s.onerror=reject;
    document.body.appendChild(s);
  });
  (async()=>{
    try{
      await load('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
      await load('auth.js');
      await load('data/grade-layer.js');
      await load('admin-inline.js');
      await load('question-series-ux.js');
      await load('resume-session.js');
    }catch(e){
      console.error('Authentication failed to load:',e);
      // Fail closed: do not expose the QB when authentication cannot be checked.
    }
  })();
});