(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FormatterConfig=api;}(typeof window!=='undefined'?window:this,function(){
  'use strict';
  function role(font,size,alignment,indent){return {enabled:true,font:font,size:size,alignment:alignment,indent:indent,line:{mode:'oneHalf',value:null},before:null,after:null};}
  function paragraph(){return {enabled:true,westernWrap:true};}
  function decoration(){return {enabled:false,text:'',font:null,size:10.5,alignment:1,distance:1.5,hideFirst:false};}
  function furniture(){return {header:decoration(),footer:decoration(),number:{enabled:false,font:null,size:10.5,alignment:1,format:'plain',start:1,hideFirst:false}};}
  function defaults(){return {version:1,paragraph:paragraph(),furniture:furniture(),signatureCount:2,title:role('华文中宋',22,1,0),body:role('仿宋_GB2312',14,null,2),signature:role('仿宋_GB2312',14,2,0),page:{enabled:false,paper:'A4',orientation:0,top:2.54,bottom:2.54,left:3.18,right:3.18}};}
  function copy(value){if(!value||typeof value!=='object')return value;var out=Array.isArray(value)?[]:{};Object.keys(value).forEach(function(key){out[key]=copy(value[key]);});return out;}
  function migrate(input){
    var out=copy(input),body=out.body||defaults().body;
    out.version=2;out.recognition='position';out.addressee=copy(body);
    out.headings=[];for(var i=0;i<9;i++)out.headings.push(copy(body));
    out.pagination={headingFollow:null,keepTogether:null,bodyWidow:null,signatureTogether:null};
    out.lists={protect:false};return out;
  }
  function modernDefaults(){
    var out=migrate(defaults());out.recognition='styles';out.lists.protect=true;
    out.pagination.headingFollow=true;out.pagination.bodyWidow=true;
    out.addressee.indent=0;
    for(var i=0;i<9;i++){out.headings[i].indent=0;out.headings[i].size=i===0?18:i===1?16:14;}
    return out;
  }
  function validate(input){
    var errors={};
    if(!input||typeof input!=='object'||Array.isArray(input)||[1,2].indexOf(input.version)<0)return {errors:{form:'设置版本无效，请重新打开设置。'}};
    if(input.version===1)input=migrate(input);
    function number(v,key,min,max,integer,nullable){if(v===null&&nullable)return null;if(typeof v!=='number'||!isFinite(v)||v<min||v>max||(integer&&Math.floor(v)!==v)){errors[key]='请输入 '+min+'～'+max+(integer?' 的整数':' 的数值');return null;}return v;}
    function choice(v,key,allowed){if(allowed.indexOf(v)<0)errors[key]='请选择有效选项';return v;}
    function enabled(v,key){if(typeof v!=='boolean')errors[key]='启用状态无效';return v===true;}
    var out={version:2,recognition:choice(input.recognition,'recognition',['position','styles']),signatureCount:number(input.signatureCount,'signatureCount',0,99,true,false)};
    function readRole(s,key){
      s=s||{};var line=s.line||{};
      if(s.font!==null&&(typeof s.font!=='string'||!s.font.trim()||s.font.length>100))errors[key+'.font']='请选择字体或保持原样';
      var result={enabled:enabled(s.enabled,key+'.enabled'),font:typeof s.font==='string'?s.font.trim():null,
        size:number(s.size,key+'.size',1,1638,false,true),alignment:choice(s.alignment,key+'.alignment',[null,0,1,2,3]),
        indent:number(s.indent,key+'.indent',0,20,false,true),before:number(s.before,key+'.before',0,500,false,true),after:number(s.after,key+'.after',0,500,false,true),
        line:{mode:choice(line.mode,key+'.line.mode',[null,'single','oneHalf','double','multiple','exact','atLeast']),value:null}};
      if(['multiple','exact','atLeast'].indexOf(line.mode)>=0)result.line.value=number(line.value,key+'.line.value',line.mode==='multiple'?0.5:1,line.mode==='multiple'?10:500,false,false);
      return result;
    }
    ['title','body','addressee','signature'].forEach(function(key){out[key]=readRole(input[key],key);});
    if(!Array.isArray(input.headings)||input.headings.length!==9)errors.headings='请提供一级至九级标题设置';
    out.headings=[];for(var h=0;h<9;h++)out.headings.push(readRole((input.headings||[])[h],'headings.'+h));
    var pagination=input.pagination||{};out.pagination={};
    ['headingFollow','keepTogether','bodyWidow','signatureTogether'].forEach(function(key){out.pagination[key]=choice(pagination[key],'pagination.'+key,[null,true,false]);});
    var lists=input.lists||{};out.lists={protect:enabled(lists.protect,'lists.protect')};
    var q=input.paragraph===undefined?paragraph():input.paragraph;
    if(!q||typeof q!=='object'){errors.paragraph='统一段落设置无效';q={};}
    out.paragraph={enabled:enabled(q.enabled,'paragraph.enabled'),westernWrap:enabled(q.westernWrap,'paragraph.westernWrap')};
    var p=input.page||{};out.page={enabled:enabled(p.enabled,'page.enabled'),paper:choice(p.paper,'page.paper',[null,'A4','A3','A5','Letter','Legal']),orientation:choice(p.orientation,'page.orientation',[null,0,1])};
    ['top','bottom','left','right'].forEach(function(k){out.page[k]=number(p[k],'page.'+k,0,30,false,true);});
    var supplied=input.furniture===undefined?furniture():input.furniture;
    if(!supplied||typeof supplied!=='object'){errors.furniture='页眉页脚设置无效';supplied={};}
    out.furniture={};
    ['header','footer','number'].forEach(function(k){
      var v=supplied[k]||{},prefix='furniture.'+k+'.',r={enabled:enabled(v.enabled,prefix+'enabled'),hideFirst:enabled(v.hideFirst,prefix+'hideFirst')};
      if(v.font!==null&&(typeof v.font!=='string'||!v.font.trim()||v.font.length>100))errors[prefix+'font']='请选择字体或保持原样';
      r.font=typeof v.font==='string'?v.font.trim():null;r.size=number(v.size,prefix+'size',1,200,false,false);r.alignment=choice(v.alignment,prefix+'alignment',[0,1,2]);
      if(k==='number'){r.format=choice(v.format,prefix+'format',['plain','page','total']);r.start=number(v.start,prefix+'start',1,9999,true,false);}
      else{if(typeof v.text!=='string'||v.text.length>500||/[\x00-\x1f]/.test(v.text))errors[prefix+'text']='请输入不超过500字的单行文字';r.text=v.text;r.distance=number(v.distance,prefix+'distance',0,10,false,false);}
      out.furniture[k]=r;
    });
    return {config:out,errors:errors};
  }
  function normalize(input){
    if(typeof input==='number'){var d=defaults();d.signatureCount=input;input=d;}
    var r=validate(input);var keys=Object.keys(r.errors);if(keys.length)throw new Error(keys[0]+'：'+r.errors[keys[0]]);return r.config;
  }
  return {defaults:defaults,modernDefaults:modernDefaults,validate:validate,normalize:normalize};
}));
