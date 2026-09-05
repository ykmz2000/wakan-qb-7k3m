(()=>{
'use strict';
function css(){if(document.getElementById('qbEditorLayoutPolishCss'))return;const s=document.createElement('style');s.id='qbEditorLayoutPolishCss';s.textContent=`
/* Keep every official edit control on the same right edge. */
#ans>.card.adeHost>.adeEditBtnV2,
#ans>.card.adeHost>.adeEditBtn,
#ans .exp.adeHost>.adeEditBtnV2,
#ans .exp.adeHost>.adeEditBtn{
  right:14px!important;
  top:12px!important;
}

/* The host keeps room for the edit button only for its normal text.
   Editors and personal notes reclaim that reserved space so they use the full card width. */
#ans>.card.adeHost>.adeEditor,
#ans .exp.adeHost>.adeEditor,
#ans>.card.adeHost>.qbPersonal,
#ans .exp.adeHost>.qbPersonal,
#ans>.card.adeHost>.qbMediaHostV2,
#ans .exp.adeHost>.qbMediaHostV2{
  width:calc(100% + 78px)!important;
  max-width:none!important;
  margin-right:-78px!important;
}

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

@media(max-width:520px){
  #ans>.card.adeHost,
  #ans .exp.adeHost{padding-right:66px!important}
  #ans>.card.adeHost>.adeEditor,
  #ans .exp.adeHost>.adeEditor,
  #ans>.card.adeHost>.qbPersonal,
  #ans .exp.adeHost>.qbPersonal,
  #ans>.card.adeHost>.qbMediaHostV2,
  #ans .exp.adeHost>.qbMediaHostV2{
    width:calc(100% + 66px)!important;
    margin-right:-66px!important;
  }
  #ans>.card.adeHost>.adeEditBtnV2,
  #ans>.card.adeHost>.adeEditBtn,
  #ans .exp.adeHost>.adeEditBtnV2,
  #ans .exp.adeHost>.adeEditBtn{right:10px!important}
}
`;
document.head.appendChild(s)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',css,{once:true});else css();
})();