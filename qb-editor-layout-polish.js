(()=>{
'use strict';
function css(){if(document.getElementById('qbEditorLayoutPolishCss'))return;const s=document.createElement('style');s.id='qbEditorLayoutPolishCss';s.textContent=`
/* Edit controls belong to the bold section heading; body content keeps the full width. */
#ans .adeEditHeading,#ans .oaiEditHeading{display:flex!important;align-items:center!important;gap:8px!important;width:100%!important;min-width:0!important}
#ans .adeHeadingText,#ans .oaiHeadingText{min-width:0!important;overflow-wrap:anywhere!important}
#ans .adeEditHeading>.adeEditBtnV2,#ans .oaiEditHeading>.oaiEditBtn{position:static!important;margin-left:auto!important;flex:0 0 auto!important;white-space:nowrap!important}
#ans>.card.adeHost>.line,#ans>.card.adeHost>.summary,#ans .exp.adeHost>.line,#ans .fbAnswerGroup.oaiHost>.fbAnswerLine{width:100%!important;max-width:none!important}

/* Personal-note header spans the complete width, so its edit button lines up with the official edit button. */
.qbPersonalHead{width:100%!important;display:flex!important;align-items:center!important}
.qbPersonalHead>.qbPencil{margin-left:auto!important;margin-right:0!important;padding-right:0!important;text-align:right!important}
.qbPersonalBody{width:100%!important;max-width:none!important}

/* Make editing feel like a full-width form on phones/tablets. */
.adeEditor{box-sizing:border-box!important;width:100%!important;max-width:none!important;padding:12px!important}
.adeEditor .adeText,
.adeEditor .adeInput,
.qbNoteEditor textarea{
  box-sizing:border-box!important;
  width:100%!important;
  max-width:none!important;
}
.adeEditor .adeText{min-height:100px!important}
.qbNoteEditor{width:100%!important;max-width:none!important;padding:10px!important}
.qbNoteEditor textarea{min-height:96px!important}

`;
document.head.appendChild(s)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',css,{once:true});else css();
})();
