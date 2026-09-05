document.write('<script src="data/research-base.js"></script><script src="data/2025.js"></script><script src="study-order.js"></script>');

// Load account/admin enhancements after the core QB has rendered.
// This keeps a slow third-party CDN from blocking index.html itself.
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
      console.error('Optional account features failed to load:',e);
      // Core question practice remains usable even if account features fail.
    }
  })();
});