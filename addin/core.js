(function(root, factory) {
  var api = factory(typeof module === 'object' && module.exports ? require('./config.js') : root.FormatterConfig);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FormatterCore = api;
}(typeof window !== 'undefined' ? window : this, function(Config) {
  'use strict';
  var Furniture=typeof module==='object'&&module.exports?require('./furniture.js'):window.FormatterFurniture;

  function nonempty(text) { return String(text).replace(/[\s\u0000-\u001f\u007f]/g, '').length > 0; }
  function labelParagraph(text) { return /^\s*\S[\s\S]*：[\s\u0000-\u001f\u007f]*$/.test(String(text)); }
  var roleNames=['title','body','addressee','signature','preserve'];
  for(var level=1;level<=9;level++)roleNames.push('heading'+level);
  function eligible(p){return p.story===1&&!p.table&&nonempty(p.text);}
  function indexOf(p,i){return p.index===undefined?i+1:p.index;}
  function headingLevel(p){
    if(p.outlineLevel>=1&&p.outlineLevel<=9)return p.outlineLevel;
    var match=/^(?:heading|标题)\s*([1-9])$/i.exec(String(p.style||'').trim());
    return match?Number(match[1]):0;
  }
  function analyze(paragraphs,input,overrides){
    var config=Config.normalize(input),main=paragraphs.filter(eligible),count=config.signatureCount;
    if(!main.length)throw new Error('没有可排版的正文段落。');
    if(count>=main.length)throw new Error('落款与标题重叠，请减少落款段数。');
    overrides=overrides||{};
    Object.keys(overrides).forEach(function(key){if(!/^[1-9]\d*$/.test(key)||roleNames.indexOf(overrides[key])<0)throw new Error('人工段落角色无效。');});
    var rows=paragraphs.map(function(p,i){
      var valid=eligible(p),assignable=p.story===1&&!p.table,at=main.indexOf(p),role=valid?(at===0?'title':at>=main.length-count?'signature':'body'):assignable?'blank':'preserve';
      var reason=valid?(role==='title'?'首个非空正文段':role==='signature'?'文末 '+count+' 个非空正文段':'普通正文段'):p.table?'表格段落':p.story!==1?'非正文区域':'空段落';
      if(valid&&config.recognition==='styles'){
        var h=headingLevel(p);
        if(h){role='heading'+h;reason=p.outlineLevel>=1&&p.outlineLevel<=9?'大纲级别 '+h:'标题样式 '+h;}
        else if(/^(?:title|标题)$/i.test(String(p.style||'').trim())){role='title';reason='标题样式';}
      }
      if(Object.prototype.hasOwnProperty.call(overrides,String(indexOf(p,i)))){
        if(assignable&&!valid&&overrides[indexOf(p,i)]!=='preserve')throw new Error('空段落仅支持保持原样或自动判断。');
        role=overrides[indexOf(p,i)];reason='人工指定';
      }
      return {index:indexOf(p,i),summary:String(p.text).replace(/[\s\u0000-\u001f\u007f]+/g,' ').trim().slice(0,100),role:role,reason:reason,eligible:valid,assignable:assignable};
    });
    // Only the title-following label receives the colon exception. Other
    // paragraphs containing or ending in a colon retain their own role settings.
    var title=-1;for(var j=0;j<rows.length;j++)if(rows[j].eligible&&rows[j].role==='title'){title=j;break;}
    if(title>=0){for(var k=title+1;k<rows.length;k++)if(rows[k].eligible){
      if(rows[k].role==='body'&&labelParagraph(paragraphs[k].text)){
        rows[k].colonLabel=true;
        if(config.recognition==='styles'&&rows[k].reason!=='人工指定'){rows[k].role='addressee';rows[k].reason='标题后中文冒号称谓';}
      }break;
    }}
    return rows;
  }
  function selected(p,context){return !context||context.scope!=='selection'||p.start<context.selection.end&&p.end>context.selection.start;}
  function roleSettings(config,name){return /^heading[1-9]$/.test(name)?config.headings[Number(name.slice(7))-1]:config[name];}
  function plan(paragraphs,input,overrides,context){
    var config=Config.normalize(input),rows=analyze(paragraphs,config,overrides),out=[],bridges={};
    function participates(row){
      if(!row||!row.eligible||row.role==='preserve')return false;
      var style=roleSettings(config,row.role);
      return style.enabled||config.paragraph.enabled||config.paragraph.westernWrap||config.pagination.keepTogether!==null||
        ((row.role==='body'||row.role==='addressee')&&config.pagination.bodyWidow!==null)||
        ((row.role==='title'||/^heading/.test(row.role))&&config.pagination.headingFollow!==null)||
        (row.role==='signature'&&config.pagination.signatureTogether!==null);
    }
    function linkAfter(i,signature){
      var p=paragraphs[i],blank=[];
      if(p.manualBreak)return false;
      for(var j=i+1;j<rows.length;j++){
        var next=paragraphs[j],row=rows[j];
        if(next.story!==1||next.table||!selected(next,context)||next.manualBreak||next.pageBreakBefore||row.reason==='人工指定'&&row.role==='preserve')return false;
        if(!row.eligible){blank.push(j);continue;}
        if(!participates(row)||(signature&&row.role!=='signature'))return false;
        blank.forEach(function(k){bridges[k]=true;});return true;
      }
      return false;
    }
    rows.forEach(function(row,i){
      var p=paragraphs[i];if(!row.eligible||row.role==='preserve'||!selected(p,context))return;
      var style=roleSettings(config,row.role),common=config.paragraph.enabled,roleEnabled=style.enabled;
      var protect=config.lists.protect&&p.list&&p.list.type!==0,follow=null;
      if(row.role==='title'||/^heading/.test(row.role)){if(config.pagination.headingFollow!==null)follow=config.pagination.headingFollow&&linkAfter(i,false);}
      else if(row.role==='signature'&&config.pagination.signatureTogether!==null)follow=config.pagination.signatureTogether&&linkAfter(i,true);
      var indent=row.colonLabel&&style.indent!==null?0:style.indent;
      out.push({paragraph:p,role:row.role,enabled:participates(row),
        font:roleEnabled?style.font:null,size:roleEnabled?style.size:null,indent:roleEnabled&&!protect?indent:null,
        alignment:roleEnabled?style.alignment:null,outlineLevel:roleEnabled&&/^heading[1-9]$/.test(row.role)?Number(row.role.slice(7)):null,
        line:common?{mode:'oneHalf',value:null}:roleEnabled?style.line:{mode:null,value:null},
        before:common?0:roleEnabled?style.before:null,after:common?0:roleEnabled?style.after:null,
        leftIndent:common&&!protect?0:null,rightIndent:common&&!protect?0:null,autoAdjustRightIndent:common&&!protect?false:null,
        disableLineHeightGrid:common?true:null,wordWrap:config.paragraph.westernWrap?true:null,
        keepWithNext:follow,keepTogether:config.pagination.keepTogether,
        widowControl:row.role==='body'||row.role==='addressee'?config.pagination.bodyWidow:null,listProtected:protect});
    });
    Object.keys(bridges).forEach(function(key){out.push({paragraph:paragraphs[Number(key)],role:'blank',enabled:true,paginationBridge:true,
      font:null,size:null,indent:null,alignment:null,outlineLevel:null,line:{mode:null,value:null},before:null,after:null,
      leftIndent:null,rightIndent:null,autoAdjustRightIndent:null,disableLineHeightGrid:null,wordWrap:null,
      keepWithNext:true,keepTogether:null,widowControl:null,listProtected:config.lists.protect&&paragraphs[Number(key)].list&&paragraphs[Number(key)].list.type!==0});});
    out.sort(function(a,b){return paragraphs.indexOf(a.paragraph)-paragraphs.indexOf(b.paragraph);});return out;
  }
  function optional(object,key){try{return object&&object[key];}catch(ignore){return undefined;}}
  function listInfo(range){
    var list=optional(range,'ListFormat');if(!list)return null;
    return {object:list,type:optional(list,'ListType'),level:optional(list,'ListLevelNumber'),value:optional(list,'ListValue'),string:optional(list,'ListString')};
  }
  function document(app){var doc=app.ActiveDocument;if(!doc)throw new Error('请先在 WPS 中打开 Word 文档。');return doc;}
  function fingerprint(doc,paragraphs){
    var value=String(doc.Content.Text)+'|'+paragraphs.map(function(p){return [p.index,p.start,p.end,p.story,p.table?1:0,p.text].join(':');}).join('|');
    var a=2166136261,b=5381;for(var i=0;i<value.length;i++){a^=value.charCodeAt(i);a=(a+(a<<1)+(a<<4)+(a<<7)+(a<<8)+(a<<24))|0;b=((b<<5)+b)^value.charCodeAt(i);}
    return 'v1:'+value.length+':'+(a>>>0).toString(16)+':'+(b>>>0).toString(16);
  }
  function validateSelection(paragraphs,selection){
    if(!selection||!isFinite(selection.start)||!isFinite(selection.end)||selection.end<=selection.start)throw new Error('请先选中要排版的文字；空选区不会修改文档。');
    if(selection.story!==1)throw new Error('仅支持正文区域的选区，未开始排版。');
    if(!paragraphs.some(function(p){return eligible(p)&&p.start<selection.end&&p.end>selection.start;}))throw new Error('选区中没有可排版的普通正文段落，未开始排版。');
  }
  function captureContext(app,scope){
    var doc=document(app),paragraphs=readParagraphs(doc),selection=null;
    if(scope!==undefined&&scope!=='document'&&scope!=='selection')throw new Error('排版范围无效。');
    scope=scope||'document';
    if(scope==='selection'){
      var range=app.Selection&&app.Selection.Range;
      selection={start:Number(optional(range,'Start')),end:Number(optional(range,'End')),story:Number(optional(range,'StoryType')),table:false};
      try{selection.table=!!range.Information(12);}catch(ignore){}
      validateSelection(paragraphs,selection);
    }
    return {docID:String(doc.DocID),scope:scope,selection:selection,fingerprint:fingerprint(doc,paragraphs)};
  }
  function checkedContext(doc,paragraphs,context){
    context=context||{scope:'document'};
    if(context.scope!==undefined&&context.scope!=='document'&&context.scope!=='selection')throw new Error('排版范围无效。');
    if(context.docID!==undefined&&String(context.docID)!==String(doc.DocID))throw new Error('当前文档已经切换，未开始排版。');
    if(context.fingerprint!==undefined&&context.fingerprint!==null&&context.fingerprint!==fingerprint(doc,paragraphs))throw new Error('文档内容或段落结构已变化，请重新分析后排版。');
    if(context.scope==='selection')validateSelection(paragraphs,context.selection);
    return context;
  }
  function preview(app,input,context){
    var doc=document(app),paragraphs=readParagraphs(doc),config=Config.normalize(input);context=checkedContext(doc,paragraphs,context);
    var rows=analyze(paragraphs,config,context.overrides),targets=plan(paragraphs,config,context.overrides,context),counts={change:0,skip:0,unchanged:0};
    rows.forEach(function(row,i){
      var target=targets.filter(function(t){return t.paragraph===paragraphs[i]&&t.enabled;})[0];
      if(target&&target.paginationBridge)row.reason='空段：仅链接分页';
      row.selected=selected(paragraphs[i],context);
      row.change=!!(target&&properties(target).some(function(p){return !equals(p.object[p.key],p.value);}));
      row.skip=!target;if(row.skip)counts.skip++;else if(row.change)counts.change++;else counts.unchanged++;
    });
    return {docID:String(doc.DocID),document:String(optional(doc,'Name')||''),scope:context.scope||'document',selection:context.selection||null,
      fingerprint:fingerprint(doc,paragraphs),rows:rows,counts:counts,targetCount:targets.filter(function(t){return t.enabled;}).length,
      warnings:context.scope==='selection'&&(config.page.enabled||Object.keys(config.furniture).some(function(k){return config.furniture[k].enabled;}))?['选区排版不调整页面、页眉页脚和页码。']:[]};
  }
  function extract(app){
    document(app);var range=app.Selection&&app.Selection.Range;if(!range)throw new Error('无法读取 WPS 当前段落，请先将光标放入正文。');
    if(Number(optional(range,'StoryType'))!==1)throw new Error('请在正文区域提取格式。');
    var start=Number(optional(range,'Start')),end=Number(optional(range,'End')),paragraphs=readParagraphs(app.ActiveDocument);
    if(!isFinite(start)||!isFinite(end)||end<start)throw new Error('无法定位当前段落。');
    var matches=paragraphs.filter(function(p){return start===end?p.start<=start&&p.end>start:p.start<end&&p.end>start;});
    if(matches.length!==1||matches[0].story!==1||matches[0].table)throw new Error('请将光标放入一个普通正文段落，或只选中该段落。');
    range=matches[0].range;
    var font=optional(range,'Font'),pf=optional(range,'ParagraphFormat'),warnings=[];
    if(!font||!pf)throw new Error('此 WPS 版本无法读取当前段落格式。');
    function numeric(object,key,min,max){var v=optional(object,key);if(typeof v!=='number'||!isFinite(v)||v<min||v>max){warnings.push(key+' 为混合值或不可读取，已设为保持原样');return null;}return v;}
    var name=optional(font,'NameFarEast')||optional(font,'Name');
    if(typeof name!=='string'||!name.trim()||name.length>100){name=null;warnings.push('字体为混合值或不可读取，已设为保持原样');}
    var alignment=numeric(pf,'Alignment',0,3);if(alignment!==null&&Math.floor(alignment)!==alignment)alignment=null;
    var rule=numeric(pf,'LineSpacingRule',0,5),modes=['single','oneHalf','double','atLeast','exact','multiple'];
    var mode=rule!==null&&Math.floor(rule)===rule?modes[rule]:null,value=null;
    if(mode==='multiple'||mode==='atLeast'||mode==='exact'){value=numeric(pf,'LineSpacing',mode==='multiple'?6:1,mode==='multiple'?120:500);if(value===null)mode=null;else if(mode==='multiple')value/=12;}
    var indent=numeric(pf,'CharacterUnitFirstLineIndent',0,20),pointIndent=numeric(pf,'FirstLineIndent',-32768,32768);
    if(indent!==null&&(pointIndent===null||pointIndent<0||(indent===0&&!near(pointIndent,0))||(indent>0&&near(pointIndent,0)))){
      indent=null;warnings.push('首行缩进的字符和磅值不一致，已设为保持原样');
    }
    return {format:{enabled:true,font:name===null?null:name.trim(),size:numeric(font,'Size',1,1638),alignment:alignment,
      indent:indent,line:{mode:mode,value:value},before:numeric(pf,'SpaceBefore',0,500),after:numeric(pf,'SpaceAfter',0,500)},warnings:warnings};
  }
  function fonts(app) {
    var result=[];
    for(var i=1;i<=app.FontNames.Count;i++) result.push(String(app.FontNames.Item(i)));
    return result;
  }
  function readParagraphs(doc) {
    var out=[], paras=doc.Content.Paragraphs;
    for(var i=1;i<=paras.Count;i++) {
      var range=paras.Item(i).Range;
      var story=Number(range.StoryType), table=Boolean(range.Information(12));
      out.push({index:i, start:Number(range.Start), end:Number(range.End), story:story,
        table:table, text:String(range.Text), range:range,
        style:(function(){var style=optional(range,'Style');return typeof style==='string'?style:optional(style,'NameLocal')||optional(style,'Name')||'';})(),
        outlineLevel:Number(optional(range.ParagraphFormat,'OutlineLevel')),list:listInfo(range),
        manualBreak:/\f/.test(String(range.Text)),pageBreakBefore:equals(optional(range.ParagraphFormat,'PageBreakBefore'),true)});
    }
    return out;
  }
  function near(a,b) { return Math.abs(Number(a)-Number(b)) < 0.01; }
  function properties(target) {
    var r=target.paragraph.range, f=r.Font, p=r.ParagraphFormat;
    var out=[];
    function add(object,key,value){if(value!==null)out.push({object:object,key:key,value:value});}
    if(target.font!==null){add(f,'Name',target.font);add(f,'NameFarEast',target.font);}
    add(f,'Size',target.size);
    // WPS retains character-unit indents independently of point indents.
    // Clear both when supported, or later layout changes restore the old points.
    if(target.leftIndent!==null&&p.CharacterUnitLeftIndent!==undefined&&p.CharacterUnitLeftIndent!==null)
      add(p,'CharacterUnitLeftIndent',0);
    if(target.rightIndent!==null&&p.CharacterUnitRightIndent!==undefined&&p.CharacterUnitRightIndent!==null)
      add(p,'CharacterUnitRightIndent',0);
    add(p,'LeftIndent',target.leftIndent);add(p,'RightIndent',target.rightIndent);
    add(p,'AutoAdjustRightIndent',target.autoAdjustRightIndent);
    add(p,'DisableLineHeightGrid',target.disableLineHeightGrid);
    add(p,'WordWrap',target.wordWrap);
    var rules={single:0,oneHalf:1,double:2,atLeast:3,exact:4,multiple:5};
    if(target.line.mode!==null){
      add(p,'LineSpacingRule',rules[target.line.mode]);
      if(target.line.value!==null)add(p,'LineSpacing',target.line.mode==='multiple'?target.line.value*12:target.line.value);
    }
    add(p,'Alignment',target.alignment);
    if(target.before!==null){add(p,'SpaceBeforeAuto',false);add(p,'SpaceBefore',target.before);}
    if(target.after!==null){add(p,'SpaceAfterAuto',false);add(p,'SpaceAfter',target.after);}
    add(p,'OutlineLevel',target.outlineLevel);
    add(p,'KeepWithNext',target.keepWithNext);add(p,'KeepTogether',target.keepTogether);add(p,'WidowControl',target.widowControl);
    // Apply role-specific first-line indents after font, geometry and grid changes.
    if(target.indent===0) {
      out.push({object:p,key:'CharacterUnitFirstLineIndent',value:0},{object:p,key:'FirstLineIndent',value:0});
    } else if(target.indent!==null) {
      if(!near(p.CharacterUnitFirstLineIndent,target.indent))out.push({object:p,key:'FirstLineIndent',value:0});
      out.push({object:p,key:'CharacterUnitFirstLineIndent',value:target.indent});
    }
    return out;
  }
  function pageEquals(a,b){
    // Some Mac WPS builds truncate point measurements on readback.
    // Match that representation without relaxing fractional-value checks.
    if(a===null||a===undefined||!isFinite(Number(a)))return false;
    var actual=Number(a),expected=Number(b);
    return Math.abs(actual-expected)<0.15 || (actual===Math.floor(actual)&&actual===Math.floor(expected));
  }
  function equals(a,b) {
    // WPS exposes Office boolean properties as either booleans or 0/-1.
    // Do not coerce undefined, null or mixed-value sentinels into false.
    if(typeof b==='boolean')return b ? a===true||a===-1||a===1 : a===false||a===0;
    return typeof b==='number' ? near(a,b) : String(a)===String(b);
  }
  function keepValues(target) {
    var r=target.paragraph.range,values=[r.Font.Bold,r.Font.Italic,r.Font.Color];
    if(target.indent===null)values.push(r.ParagraphFormat.CharacterUnitFirstLineIndent,r.ParagraphFormat.FirstLineIndent);
    if(target.before===null)values.push(r.ParagraphFormat.SpaceBefore,r.ParagraphFormat.SpaceBeforeAuto);
    if(target.after===null)values.push(r.ParagraphFormat.SpaceAfter,r.ParagraphFormat.SpaceAfterAuto);
    if(target.listProtected){
      var info=listInfo(r),pf=r.ParagraphFormat;
      values.push(info&&info.type,info&&info.level,info&&info.value,info&&info.string);
      ['CharacterUnitLeftIndent','CharacterUnitRightIndent','CharacterUnitFirstLineIndent','LeftIndent','RightIndent','FirstLineIndent'].forEach(function(key){values.push(optional(pf,key));});
    }
    return values;
  }
  function preflightLists(targets,config){
    if(!config.lists.protect)return;
    targets.forEach(function(target){
      var info=target.paragraph.list;
      if(!info||typeof info.type!=='number'||!isFinite(info.type)||info.type<0||info.type>9)throw new Error('此 WPS 版本无法读取编号类型，未开始排版。');
      if(!target.listProtected)return;
      ['level','value','string'].forEach(function(key){if(info[key]===undefined||info[key]===null||key==='string'&&typeof info[key]!=='string'||key!=='string'&&(typeof info[key]!=='number'||!isFinite(info[key])||Math.floor(info[key])!==info[key]||info[key]<1||info[key]===9999999)||key==='level'&&info[key]>9)throw new Error('此 WPS 版本不支持编号保护属性 '+key+'，未开始排版。');});
      ['CharacterUnitLeftIndent','CharacterUnitRightIndent','CharacterUnitFirstLineIndent','LeftIndent','RightIndent','FirstLineIndent'].forEach(function(key){if(optional(target.paragraph.range.ParagraphFormat,key)===9999999||!isFinite(Number(optional(target.paragraph.range.ParagraphFormat,key)))||optional(target.paragraph.range.ParagraphFormat,key)===null||optional(target.paragraph.range.ParagraphFormat,key)===undefined)throw new Error('此 WPS 版本不支持编号缩进保护属性 '+key+'，未开始排版。');});
    });
  }
  function pageProperties(doc,settings){
    if(!settings.enabled)return [];
    var papers={A4:[595.2756,841.8898],A3:[841.8898,1190.5512],A5:[419.5276,595.2756],Letter:[612,792],Legal:[612,1008]},out=[];
    for(var i=1;i<=doc.Sections.Count;i++){
      var setup=doc.Sections.Item(i).PageSetup,props=[];
      var orientation=settings.orientation===null?Number(setup.Orientation):settings.orientation;
      var size=settings.paper===null?[Math.min(Number(setup.PageWidth),Number(setup.PageHeight)),Math.max(Number(setup.PageWidth),Number(setup.PageHeight))]:papers[settings.paper];
      var width=size[orientation===1?1:0],height=size[orientation===1?0:1];
      if(settings.orientation!==null)props.push({object:setup,key:'Orientation',value:orientation});
      if(settings.paper!==null||settings.orientation!==null){props.push({object:setup,key:'PageWidth',value:width},{object:setup,key:'PageHeight',value:height});}
      var margin={};
      ['top','bottom','left','right'].forEach(function(k){var key=k[0].toUpperCase()+k.slice(1)+'Margin';margin[k]=settings[k]===null?Number(setup[key]):settings[k]*72/2.54;if(settings[k]!==null)props.push({object:setup,key:key,value:margin[k]});});
      if(margin.left+margin.right>=width||margin.top+margin.bottom>=height)throw new Error('第 '+i+' 节的页边距超过纸张可用范围，未开始排版。');
      props.forEach(function(p){if(!isFinite(Number(p.object[p.key])))throw new Error('WPS 不支持该页面属性：'+p.key);});
      out.push(props);
    }
    return out;
  }
  function apply(app, count, expectedID, context) {
    var doc=document(app);
    var id=String(doc.DocID);
    if(expectedID!==undefined && String(expectedID)!==id) throw new Error('当前文档已经切换，未开始排版。');
    if(doc.ReadOnly || Number(doc.ProtectionType)!==-1) throw new Error('文档为只读或受保护状态，未开始排版。');
    if(doc.TrackRevisions) throw new Error('请先关闭修订模式，再进行一键排版。');
    var config=Config.normalize(count);
    var paragraphs=readParagraphs(doc);context=checkedContext(doc,paragraphs,context);
    var targets=plan(paragraphs,config,context.overrides,context).filter(function(t){return t.enabled;});
    preflightLists(targets,config);
    var selectionOnly=context.scope==='selection';
    var pages=selectionOnly?[]:pageProperties(doc,config.page);
    var furniture=selectionOnly?{operations:[],properties:[]}:Furniture.plan(doc,config.furniture);
    var available=fonts(app), missing=targets.map(function(t){return t.font;}).concat(Object.keys(config.furniture).filter(function(k){return !selectionOnly&&config.furniture[k].enabled;}).map(function(k){return config.furniture[k].font;})).filter(function(n,i,a){return n!==null&&a.indexOf(n)===i&&available.indexOf(n)<0;});
    if(missing.length) throw new Error('WPS 缺少字体：'+missing.join('、')+'。未开始排版。');

    var newKeys={LeftIndent:true,RightIndent:true,AutoAdjustRightIndent:true,DisableLineHeightGrid:true,WordWrap:true,OutlineLevel:true,KeepWithNext:true,KeepTogether:true,WidowControl:true};
    targets.forEach(function(t){properties(t).forEach(function(p){if(newKeys[p.key]&&(p.object[p.key]===undefined||p.object[p.key]===null))
      throw new Error('此 WPS 版本不支持段落属性 '+p.key+'，未开始排版。');});});

    var changed=targets.filter(function(t){return properties(t).some(function(p){return !equals(p.object[p.key],p.value);});});
    var changedPages=pages.filter(function(ps){return ps.some(function(p){return !pageEquals(p.object[p.key],p.value);});});
    if(!changed.length&&!changedPages.length&&!furniture.operations.length&&!furniture.properties.length) return {ok:true,changed:0,message:'已经符合指定格式，无需修改。'};
    var textBefore=String(doc.Content.Text);
    var keep=targets.map(function(t){return JSON.stringify(keepValues(t));});
    var undo=app.UndoRecord;
    if(!undo || typeof undo.StartCustomRecord!=='function' || typeof undo.EndCustomRecord!=='function')
      throw new Error('此 WPS 版本不支持整组撤销，未开始排版。');
    if(undo.IsRecordingCustomRecord) throw new Error('WPS 正在处理其他编辑操作，请稍后重试。');
    var started=false,writes=0;
    try {
      undo.StartCustomRecord('一键排版'); started=true;
      changed.forEach(function(t) {
        if(!app.ActiveDocument || String(app.ActiveDocument.DocID)!==id) throw new Error('文档发生切换，已停止排版。');
        properties(t).forEach(function(p) {
          if(!equals(p.object[p.key],p.value)) { p.object[p.key]=p.value; writes++; }
        });
        if(t.indent!==null&&!near(t.paragraph.range.ParagraphFormat.CharacterUnitFirstLineIndent,t.indent))
          throw new Error('WPS 未正确应用字符缩进。');
      });
      changedPages.forEach(function(ps){
        if(!app.ActiveDocument||String(app.ActiveDocument.DocID)!==id)throw new Error('文档发生切换，已停止排版。');
        ps.forEach(function(p){if(!pageEquals(p.object[p.key],p.value)){p.object[p.key]=p.value;writes++;}});
      });
      Furniture.apply(furniture,function(){writes++;});
      Furniture.verify(furniture);
      pages.forEach(function(ps){ps.forEach(function(p){if(!pageEquals(p.object[p.key],p.value))throw new Error('WPS 页面回读校验失败：'+p.key+'（预期 '+p.value+'，实际 '+p.object[p.key]+'）');});});
      if(String(doc.Content.Text)!==textBefore) throw new Error('文字内容校验失败。');
      targets.forEach(function(t,i) {
        if(JSON.stringify(keepValues(t))!==keep[i]) throw new Error('原有加粗、首行缩进、段间距或编号缩进发生变化。');
        properties(t).forEach(function(p){if(!equals(p.object[p.key],p.value)) {
          var pf=t.paragraph.range.ParagraphFormat;
          throw new Error('WPS 格式回读校验失败：第 '+t.paragraph.index+' 段 '+p.key+'（预期 '+p.value+'，实际 '+p.object[p.key]+'；字符左右缩进 '+pf.CharacterUnitLeftIndent+'/'+pf.CharacterUnitRightIndent+'；字符首行缩进 '+pf.CharacterUnitFirstLineIndent+'）');
        }});
      });
      undo.EndCustomRecord(); started=false;
      return {ok:true,changed:changed.length,changedSections:changedPages.length,changedFurniture:furniture.operations.length,message:'已排版 '+changed.length+' 段'+(changedPages.length?'，调整 '+changedPages.length+' 节页面':'')+(furniture.operations.length?'，更新页眉页脚':'')+' · ⌘Z 撤销'};
    } catch(e) {
      if(started) { try { undo.EndCustomRecord(); } catch(ignore) {} }
      if(writes>0) {
        try {
          if(doc.Undo(1)===false) throw new Error('undo failed');
          throw new Error(String(e.message||e)+' 已撤销本次修改。');
        } catch(undoError) {
          if(String(undoError.message).indexOf('已撤销本次修改')>=0) throw undoError;
          throw new Error(String(e.message||e)+' 自动撤销未成功，请在 WPS 检查并手动撤销。');
        }
      }
      throw e;
    }
  }
  return {plan:plan,apply:apply,readParagraphs:readParagraphs,fonts:fonts,captureContext:captureContext,analyze:analyze,preview:preview,extract:extract};
}));
