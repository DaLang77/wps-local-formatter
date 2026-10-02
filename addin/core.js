(function(root, factory) {
  var api = factory(typeof module === 'object' && module.exports ? require('./config.js') : root.FormatterConfig);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FormatterCore = api;
}(typeof window !== 'undefined' ? window : this, function(Config) {
  'use strict';
  var Furniture=typeof module==='object'&&module.exports?require('./furniture.js'):window.FormatterFurniture;

  function nonempty(text) { return String(text).replace(/[\s\u0000-\u001f\u007f]/g, '').length > 0; }
  function labelParagraph(text) { return /^\s*\S[\s\S]*：[\s\u0000-\u001f\u007f]*$/.test(String(text)); }
  function plan(paragraphs, count) {
    var config=Config.normalize(count); count=config.signatureCount;
    var main = paragraphs.filter(function(p) { return p.story === 1 && !p.table && nonempty(p.text); });
    if (!main.length) throw new Error('没有可排版的正文段落。');
    if (count >= main.length) throw new Error('落款与标题重叠，请减少落款段数。');
    return main.map(function(p, i) {
      var role = i === 0 ? 'title' : i >= main.length - count ? 'signature' : 'body';
      var style=config[role];
      var indent=i===1 && role==='body' && style.indent!==null && labelParagraph(p.text) ? 0 : style.indent;
      var common=config.paragraph.enabled;
      var roleEnabled=style.enabled;
      return {paragraph:p,role:role,enabled:roleEnabled||common||config.paragraph.westernWrap,
        font:roleEnabled?style.font:null,size:roleEnabled?style.size:null,indent:roleEnabled?indent:null,
        alignment:roleEnabled?style.alignment:null,
        line:common?{mode:'oneHalf',value:null}:roleEnabled?style.line:{mode:null,value:null},
        before:common?0:roleEnabled?style.before:null,after:common?0:roleEnabled?style.after:null,
        leftIndent:common?0:null,rightIndent:common?0:null,autoAdjustRightIndent:common?false:null,
        disableLineHeightGrid:common?true:null,wordWrap:config.paragraph.westernWrap?true:null};
    });
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
        table:table, text:String(range.Text), range:range});
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
    return values;
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
  function apply(app, count, expectedID) {
    var doc=app.ActiveDocument;
    if(!doc) throw new Error('请先在 WPS 中打开 Word 文档。');
    var id=String(doc.DocID);
    if(expectedID!==undefined && String(expectedID)!==id) throw new Error('当前文档已经切换，未开始排版。');
    if(doc.ReadOnly || Number(doc.ProtectionType)!==-1) throw new Error('文档为只读或受保护状态，未开始排版。');
    if(doc.TrackRevisions) throw new Error('请先关闭修订模式，再进行一键排版。');
    var config=Config.normalize(count);
    var targets=plan(readParagraphs(doc),config).filter(function(t){return t.enabled;});
    var pages=pageProperties(doc,config.page);
    var furniture=Furniture.plan(doc,config.furniture);
    var available=fonts(app), missing=targets.map(function(t){return t.font;}).concat(Object.keys(config.furniture).filter(function(k){return config.furniture[k].enabled;}).map(function(k){return config.furniture[k].font;})).filter(function(n,i,a){return n!==null&&a.indexOf(n)===i&&available.indexOf(n)<0;});
    if(missing.length) throw new Error('WPS 缺少字体：'+missing.join('、')+'。未开始排版。');

    var newKeys={LeftIndent:true,RightIndent:true,AutoAdjustRightIndent:true,DisableLineHeightGrid:true,WordWrap:true};
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
        if(JSON.stringify(keepValues(t))!==keep[i]) throw new Error('原有加粗、首行缩进或段间距发生变化。');
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
  return {plan:plan,apply:apply,readParagraphs:readParagraphs,fonts:fonts};
}));
