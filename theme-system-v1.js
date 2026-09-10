(()=>{
'use strict';
const THEMES={
  blue:{label:'ブルー',accent:'#4F9FDC'},
  teal:{label:'ティール',accent:'#45BDB5'},
  green:{label:'グリーン',accent:'#65B989'},
  purple:{label:'パープル',accent:'#9274DA'},
  rose:{label:'ローズ',accent:'#F27FA9'},
  orange:{label:'オレンジ',accent:'#E9A34F'},
  mono:{label:'モノクロ',accent:'#7A8793'}
};
window.QB_THEME_PALETTE=THEMES;
let sb=null,user=null,current='blue',ready=false,authHooked=false;
const valid=k=>Object.prototype.hasOwnProperty.call(THEMES,k)?k:'blue';
function applyTheme(key){
  key=valid(key);current=key;const t=THEMES[key],r=document.documentElement.style;
  r.setProperty('--accent',t.accent);
  r.setProperty('--accent-soft',`color-mix(in srgb, ${t.accent} 12%, white)`);
  r.setProperty('--accent-soft-strong',`color-mix(in srgb, ${t.accent} 20%, white)`);
  r.setProperty('--accent-border',`color-mix(in srgb, ${t.accent} 42%, white)`);
  r.setProperty('--accent-gradient-start',`color-mix(in srgb, ${t.accent} 70%, white)`);
  r.setProperty('--accent-gradient-end',t.accent);
  document.documentElement.dataset.qbTheme=key;
  window.dispatchEvent(new CustomEvent('qb-theme-change',{detail:{themeKey:key,accent:t.accent}}));
}
function css(){
  if(document.getElementById('qbThemeSystemCss'))return;
  const s=document.createElement('style');s.id='qbThemeSystemCss';s.textContent=`
:root{--accent-soft:#edf6fd;--accent-soft-strong:#dfeffc;--accent-border:#b9d9ee;--accent-gradient-start:color-mix(in srgb,var(--accent) 70%,white);--accent-gradient-end:var(--accent)}
.progress>div,.qbPppFill{background:linear-gradient(90deg,var(--accent-gradient-start),var(--accent-gradient-end))!important}
.primary,.filter.on,.authTabs button.on,.authPrimary,#qbPracticeDockV2 button.qbpdMain{background:var(--accent)!important}
.acctAvatar,.acctAvatarLarge{background-color:var(--accent)!important}
.secondary,.qid,.pwToggle,.qbComingSoonTitle,.qbRankBtn,.qbSubjectStatusToggle,#view .list[data-s] .lt,#view .list[data-u] .lt,.qbSubjectExamTitle,.qbExamItemButton,.choice:not(.good):not(.bad){color:var(--accent)!important}
.choice.sel{border-color:var(--accent)!important;background:var(--accent-soft)!important;color:var(--accent)!important}
#view .choice.good,#view .choice.bad{opacity:1!important;color:var(--text)!important;-webkit-text-fill-color:currentColor}
#view .choice.good{border-color:var(--ok)!important;background:color-mix(in srgb,var(--ok) 10%,var(--card))!important}
#view .choice.bad{border-color:var(--bad)!important;background:color-mix(in srgb,var(--bad) 10%,var(--card))!important}
#view .choice[data-qb-choice-feedback]::after{content:attr(data-qb-choice-feedback);display:block;margin-top:6px;font-size:12px;font-weight:700;color:var(--ok);white-space:normal}
#view .choice.bad[data-qb-choice-feedback]::after{color:var(--bad)}
.badge:not(.gray){background:var(--accent-soft)!important;color:var(--accent)!important}
.resultcard.review{border-color:var(--accent)!important;background:var(--accent-soft)!important}
#qbGlobalDock .qbgdResume,#qbGlobalDock .qbgdStart{background:var(--accent-soft)!important;color:var(--accent)!important}
#qbPracticeDockV2 button.qbpdMain{box-shadow:0 3px 10px color-mix(in srgb,var(--accent) 24%,transparent)!important}
.qbNextExamCard{border-color:var(--accent-border)!important;background:linear-gradient(180deg,var(--accent-soft),#fff)!important}.qbExamDay.qbExamNext{border-color:var(--accent)!important;background:var(--accent-soft)!important}.qbExamDayTag{background:var(--accent)!important}.qbExamItemButton{color:var(--accent)!important}
.imageQueueBtn{color:var(--accent)!important;border-color:var(--accent-border)!important;background:var(--accent-soft)!important}
#qbThemePicker{margin:8px 0 14px}.qbThemeGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.qbThemeChoice{border:1px solid var(--line,#dce3ec);background:#fff;border-radius:11px;padding:8px 6px;min-height:52px;font-size:11px;font-weight:900;color:var(--text,#172033);display:flex;align-items:center;gap:7px;justify-content:center}.qbThemeChoice.on{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent) inset;background:var(--accent-soft)}.qbThemeDot{width:17px;height:17px;border-radius:50%;background:var(--swatch);flex:0 0 auto}.qbThemeMsg{font-size:11px;color:var(--muted,#6f7786);margin-top:6px;min-height:16px}@media(max-width:440px){.qbThemeGrid{grid-template-columns:repeat(3,minmax(0,1fr))}}
`;
  document.head.appendChild(s)
}
function hookAuth(){
  if(authHooked||!sb)return;authHooked=true;
  sb.auth.onAuthStateChange((_event,session)=>{
    if(session?.user){ready=false;user=null;setTimeout(()=>context().then(ok=>{if(ok){injectPicker();updatePickerState()}}),0)}
    else{ready=false;user=null;current='blue';applyTheme('blue')}
  })
}
async function context(){
  if(ready)return true;
  sb=window.qbSupabase;if(!sb)return false;hookAuth();
  const a=await sb.auth.getUser();user=a.data?.user||null;if(!user)return false;
  const p=await sb.from('profiles').select('theme_key').eq('id',user.id).maybeSingle();
  if(!p.error&&p.data?.theme_key)current=valid(p.data.theme_key);else current='blue';
  applyTheme(current);ready=true;return true;
}
function updatePickerState(root=document){root.querySelectorAll?.('.qbThemeChoice').forEach(b=>b.classList.toggle('on',b.dataset.theme===current))}
async function chooseTheme(key,msg){
  if(!await context())return;
  key=valid(key);if(key===current)return;
  const prev=current;applyTheme(key);updatePickerState();if(msg)msg.textContent='保存中…';
  const r=await sb.from('profiles').update({theme_key:key,updated_at:new Date().toISOString()}).eq('id',user.id);
  if(r.error){applyTheme(prev);updatePickerState();if(msg)msg.textContent='変更できませんでした：'+r.error.message;return}
  if(msg)msg.textContent='システムカラーを変更しました。別端末でも同じ色になります。'
}
function injectPicker(){
  const sheet=document.getElementById('acctSheet');if(!sheet||sheet.querySelector('#qbThemePicker'))return;
  const nameInput=sheet.querySelector('#acctName'),row=nameInput?.closest('.acctRow'),anchor=row||sheet.querySelector('.acctAvatarEditor');if(!anchor)return;
  const host=document.createElement('div');host.id='qbThemePicker';
  host.innerHTML=`<label class="muted">システムカラー</label><div class="qbThemeGrid">${Object.entries(THEMES).map(([k,t])=>`<button type="button" class="qbThemeChoice ${k===current?'on':''}" data-theme="${k}"><span class="qbThemeDot" style="--swatch:${t.accent}"></span><span>${t.label}</span></button>`).join('')}</div><div class="qbThemeMsg">選んだ色はアカウントに保存されます。</div>`;
  anchor.insertAdjacentElement('afterend',host);
  const msg=host.querySelector('.qbThemeMsg');host.querySelectorAll('.qbThemeChoice').forEach(b=>b.onclick=()=>chooseTheme(b.dataset.theme,msg))
}
function observe(){const o=new MutationObserver(()=>injectPicker());o.observe(document.body,{childList:true,subtree:true});injectPicker()}
async function refresh(){ready=false;await context();injectPicker();updatePickerState()}
async function boot(){css();applyTheme('blue');for(let i=0;i<60&&!await context();i++)await new Promise(r=>setTimeout(r,100));observe();window.addEventListener('qb-app-ready',()=>refresh().catch(console.error))}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
