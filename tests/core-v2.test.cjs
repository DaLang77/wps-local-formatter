const test=require('node:test');
const assert=require('node:assert/strict');
const core=require('../addin/core.js');
const config=require('../addin/config.js');

function fixture(items=['标题','正文','落款','日期']){
  const ranges=items.map((item,i)=>{
    item=typeof item==='string'?{text:item}:item;
    return {Start:i*10,End:i*10+10,Text:item.text,StoryType:item.story||1,Style:item.style||'正文',Information:()=>!!item.table,
      Font:{Name:'旧字体',NameFarEast:'旧字体',Size:12,Bold:0,Italic:0,Color:0},
      ListFormat:{ListType:item.list?3:0,ListLevelNumber:item.list?2:0,ListValue:item.list?7:0,ListString:item.list?'7.':''},
      ParagraphFormat:{OutlineLevel:item.outline||10,PageBreakBefore:!!item.pageBreak,CharacterUnitLeftIndent:2,CharacterUnitRightIndent:1,
        CharacterUnitFirstLineIndent:2,LeftIndent:24,RightIndent:12,FirstLineIndent:24,Alignment:3,LineSpacingRule:0,LineSpacing:12,
        AutoAdjustRightIndent:true,DisableLineHeightGrid:false,WordWrap:false,SpaceBefore:6,SpaceAfter:8,SpaceBeforeAuto:false,SpaceAfterAuto:false,
        KeepWithNext:true,KeepTogether:false,WidowControl:false}};
  });
  const undo={starts:0,ends:0,undos:0};
  const doc={DocID:7,Name:'验证.docx',ReadOnly:false,ProtectionType:-1,TrackRevisions:false,
    Content:{get Text(){return ranges.map(r=>r.Text).join('\r');},Paragraphs:{Count:ranges.length,Item:i=>({Range:ranges[i-1]})}},
    Undo:n=>{undo.undos+=n;return true;}};
  const app={ActiveDocument:doc,Selection:{Range:{Start:10,End:20,StoryType:1,Information:()=>false}},
    FontNames:{Count:2,Item:i=>['华文中宋','仿宋_GB2312'][i-1]},
    UndoRecord:{IsRecordingCustomRecord:false,StartCustomRecord:()=>undo.starts++,EndCustomRecord:()=>undo.ends++}};
  return {app,doc,ranges,undo};
}
function modern(count=2){const c=config.modernDefaults();c.signatureCount=count;return c;}
function read(f){return core.readParagraphs(f.doc);}

test('样式与大纲层级优先、未识别首尾回退；手工角色最高优先且支持九级',()=>{
  const f=fixture([{text:'一级标题',style:'Heading 1'},{text:'正文'},{text:'第二级',outline:2},{text:'第九级',style:'标题 9'},'署名','日期']);
  const rows=core.analyze(read(f),modern());assert.deepEqual(rows.map(r=>r.role),['heading1','body','heading2','heading9','signature','signature']);
  const manual=core.analyze(read(f),modern(),{1:'title',2:'addressee',3:'preserve',6:'body'});
  assert.deepEqual(manual.map(r=>r.role),['title','addressee','preserve','heading9','signature','body']);
  assert.throws(()=>core.analyze(read(f),modern(),{2:'invalid'}),/角色无效/);
});
test('冒号称谓只在标题后首个正文段生效，英文冒号和冒号后文字不触发',()=>{
  for(const text of ['某某公司：\r','某某公司:','某某公司：具体说明']){
    const f=fixture(['标题',text,'后续：','署名','日期']);const rows=core.analyze(read(f),modern());
    assert.equal(rows[1].role,text==='某某公司：\r'?'addressee':'body');assert.equal(rows[2].role,'body');
    const plans=core.plan(read(f),modern());assert.equal(plans[1].indent,text==='某某公司：\r'?0:2);assert.equal(plans[2].indent,2);
  }
  const f=fixture(['标题','称谓：','正文','署名','日期']),c=modern();c.addressee.indent=null;
  assert.equal(core.plan(read(f),c)[1].indent,null);
});
test('手工保持原样彻底排除全篇段落和分页设置',()=>{
  const f=fixture();const before=JSON.stringify(f.ranges[1]);const context=core.captureContext(f.app,'document');context.overrides={2:'preserve'};
  const c=modern();c.pagination.keepTogether=true;core.apply(f.app,c,'7',context);
  assert.equal(JSON.stringify(f.ranges[1]),before);assert.equal(f.ranges[0].ParagraphFormat.KeepWithNext,false);
});
test('选区使用整篇角色和捕获范围；不运行页面及页眉页脚，也不取当前新选区',()=>{
  const f=fixture(['标题','正文','正文二','落款','日期']);const c=modern();c.page.enabled=true;c.furniture.header.enabled=true;c.furniture.header.font='未安装';
  const context=core.captureContext(f.app,'selection');f.app.Selection.Range={Start:0,End:50,StoryType:1,Information:()=>false};
  const before=f.ranges.map(r=>JSON.stringify(r));const result=core.apply(f.app,c,'7',context);
  assert.equal(result.changed,1);assert.equal(f.ranges[1].Font.Size,14);assert.equal(f.ranges[1].ParagraphFormat.Alignment,3);
  for(const i of [0,2,3,4])assert.equal(JSON.stringify(f.ranges[i]),before[i]);assert.equal(result.changedSections,0);
});
test('空选区、非正文和纯表格选区拒绝；跨表格加普通正文选区允许',()=>{
  const f=fixture(['标题',{text:'表格',table:true},'正文','落款','日期']);
  for(const range of [{Start:20,End:20,StoryType:1},{Start:20,End:30,StoryType:7},{Start:10,End:20,StoryType:1}]){
    f.app.Selection.Range={...range,Information:()=>true};assert.throws(()=>core.captureContext(f.app,'selection'),/选区/);
  }
  f.app.Selection.Range={Start:10,End:30,StoryType:1,Information:()=>true};const context=core.captureContext(f.app,'selection');
  const table=JSON.stringify(f.ranges[1]);assert.equal(core.apply(f.app,modern(),'7',context).changed,1);assert.equal(JSON.stringify(f.ranges[1]),table);
});
test('结构指纹无文本泄露，内容变化或文档切换在任何写入前停止',()=>{
  for(const kind of ['text','structure','switch']){
    const f=fixture();const context=core.captureContext(f.app,'document');assert.ok(!JSON.stringify(context).includes('标题'));
    context.overrides={2:'signature'};
    if(kind==='text')f.ranges[1].Text+='变更';if(kind==='structure')f.ranges[1].End++;if(kind==='switch')f.doc.DocID=8;
    const before=JSON.stringify(f.ranges);assert.throws(()=>core.apply(f.app,modern(),'7',context),/切换|结构已变化/);
    assert.equal(JSON.stringify(f.ranges),before);assert.equal(f.undo.starts,0);
  }
});
test('预览可序列化且不改文档、不建撤销；选区跳过数量和人工角色准确',()=>{
  const f=fixture();const context=core.captureContext(f.app,'selection');context.overrides={2:'heading2'};const before=JSON.stringify(f.ranges);
  const result=core.preview(f.app,modern(),context);assert.equal(result.rows[1].role,'heading2');
  assert.equal(result.counts.change,1);assert.equal(result.counts.skip,3);assert.equal(result.scope,'selection');
  assert.equal(result.targetCount,1);assert.doesNotThrow(()=>JSON.stringify(result));assert.equal(JSON.stringify(f.ranges),before);assert.equal(f.undo.starts,0);
});
test('标题跟随和连续落款不越过表格、保持原样、手动分页、节分隔或选区末尾',()=>{
  const cases=[{item:{text:'表格',table:true}},{item:{text:'保持'},override:true},{item:{text:'分页\f'}},{item:{text:'新页',pageBreak:true}}];
  for(const example of cases){
    const f=fixture([{text:'标题一',style:'Heading 1'},example.item,'正文','落款','日期']);const context=core.captureContext(f.app,'document');
    if(example.override)context.overrides={2:'preserve'};const c=modern();c.pagination.signatureTogether=true;
    core.apply(f.app,c,'7',context);assert.equal(f.ranges[0].ParagraphFormat.KeepWithNext,false);
    assert.equal(f.ranges[3].ParagraphFormat.KeepWithNext,true);assert.equal(f.ranges[4].ParagraphFormat.KeepWithNext,false);
  }
  const f=fixture([{text:'标题一',style:'Heading 1'},'正文','落款','日期']);f.app.Selection.Range={Start:0,End:10,StoryType:1,Information:()=>false};
  core.apply(f.app,modern(),'7',core.captureContext(f.app,'selection'));assert.equal(f.ranges[0].ParagraphFormat.KeepWithNext,false);
});
test('分页按正文/标题角色应用、支持 Office 数字布尔值且重复无写入',()=>{
  const f=fixture(),c=modern();c.pagination.keepTogether=true;c.pagination.signatureTogether=true;
  for(const range of f.ranges)for(const key of ['KeepWithNext','KeepTogether','WidowControl']){
    let v=range.ParagraphFormat[key]?-1:0;Object.defineProperty(range.ParagraphFormat,key,{enumerable:true,get:()=>v,set:value=>{v=value?-1:0;}});
  }
  core.apply(f.app,c,'7');assert.equal(f.ranges[1].ParagraphFormat.WidowControl,-1);assert.equal(f.ranges[0].ParagraphFormat.KeepTogether,-1);
  assert.equal(core.apply(f.app,c,'7').changed,0);assert.equal(f.undo.starts,1);
  const g=fixture();delete g.ranges[0].ParagraphFormat.KeepWithNext;assert.throws(()=>core.apply(g.app,modern(),'7'),/KeepWithNext.*未开始/);assert.equal(g.undo.starts,0);
});
test('列表保护保留编号元数据和两种缩进单位且不重建列表',()=>{
  const f=fixture(['标题',{text:'编号正文',list:true},'署名','日期']);const range=f.ranges[1],list=JSON.stringify(range.ListFormat);
  const keys=['CharacterUnitLeftIndent','CharacterUnitRightIndent','CharacterUnitFirstLineIndent','LeftIndent','RightIndent','FirstLineIndent'];
  const before=keys.map(k=>range.ParagraphFormat[k]);core.apply(f.app,modern(),'7');
  assert.equal(JSON.stringify(range.ListFormat),list);assert.deepEqual(keys.map(k=>range.ParagraphFormat[k]),before);
  assert.equal(range.Font.Size,14);assert.equal(range.ParagraphFormat.SpaceBefore,0);assert.equal(core.apply(f.app,modern(),'7').changed,0);
});
test('列表保护字段缺失写入前停；字体写入联动改变编号或缩进严格回滚一次',()=>{
  const f=fixture(['标题',{text:'编号正文',list:true},'署名','日期']);delete f.ranges[1].ListFormat.ListString;
  assert.throws(()=>core.apply(f.app,modern(),'7'),/编号保护属性/);assert.equal(f.undo.starts,0);
  for(const kind of ['number','indent']){
    const g=fixture(['标题',{text:'编号正文',list:true},'署名','日期']),r=g.ranges[1];let size=12;
    Object.defineProperty(r.Font,'Size',{enumerable:true,get:()=>size,set:value=>{size=value;if(kind==='number')r.ListFormat.ListValue++;else r.ParagraphFormat.LeftIndent=0;}});
    assert.throws(()=>core.apply(g.app,modern(),'7'),/编号缩进.*已撤销/);assert.equal(g.undo.undos,1);assert.equal(g.undo.ends,1);
  }
});
test('读取当前格式返回可填入模板的混合值警告且不写入',()=>{
  const f=fixture();f.app.Selection.Range=f.ranges[1];const r=f.ranges[1];r.Font.NameFarEast='仿宋_GB2312';r.ParagraphFormat.LineSpacingRule=5;r.ParagraphFormat.LineSpacing=15;
  const before=JSON.stringify(f.ranges);const extracted=core.extract(f.app);assert.equal(extracted.format.font,'仿宋_GB2312');
  assert.deepEqual(extracted.format.line,{mode:'multiple',value:1.25});assert.equal(JSON.stringify(f.ranges),before);assert.equal(f.undo.starts,0);
  r.Font.Size=9999999;r.ParagraphFormat.CharacterUnitFirstLineIndent=-2;r.ParagraphFormat.LineSpacingRule=9999999;
  const mixed=core.extract(f.app);assert.equal(mixed.format.size,null);assert.equal(mixed.format.indent,null);assert.equal(mixed.format.line.mode,null);assert.ok(mixed.warnings.length>=3);
});
test('标题跨普通空段跟随正文，连续落款跨空段同页；空段只写最短分页链',()=>{
  const f=fixture(['标题','\r','正文','署名','\r','日期']);const c=modern();c.pagination.signatureTogether=true;
  const blank=f.ranges[1],before={...blank.ParagraphFormat};blank.ParagraphFormat.KeepWithNext=false;
  const lastBlank=f.ranges[4];lastBlank.ParagraphFormat.KeepWithNext=false;
  const result=core.apply(f.app,c,'7');assert.equal(result.changed,6);
  assert.equal(f.ranges[0].ParagraphFormat.KeepWithNext,true);assert.equal(blank.ParagraphFormat.KeepWithNext,true);
  assert.equal(f.ranges[3].ParagraphFormat.KeepWithNext,true);assert.equal(lastBlank.ParagraphFormat.KeepWithNext,true);
  assert.equal(f.ranges[5].ParagraphFormat.KeepWithNext,false);
  for(const key of Object.keys(before))if(key!=='KeepWithNext')assert.equal(blank.ParagraphFormat[key],before[key]);
  assert.equal(blank.Font.Size,12);assert.equal(core.apply(f.app,c,'7').changed,0);
  const g=fixture(['标题','\r','正文','署名','日期']);const context=core.captureContext(g.app,'document');context.overrides={2:'preserve'};
  const preserved=JSON.stringify(g.ranges[1]);core.apply(g.app,modern(),'7',context);
  assert.equal(g.ranges[0].ParagraphFormat.KeepWithNext,false);assert.equal(JSON.stringify(g.ranges[1]),preserved);
});
test('标题不会跟随完全停用的下一角色，多级标题写大纲级别且不替换样式',()=>{
  const f=fixture(['标题','正文','署名','日期']);const c=modern();c.paragraph.enabled=false;c.paragraph.westernWrap=false;c.body.enabled=false;c.pagination.bodyWidow=null;
  core.apply(f.app,c,'7');assert.equal(f.ranges[0].ParagraphFormat.KeepWithNext,false);
  const g=fixture();const context=core.captureContext(g.app,'document');context.overrides={2:'heading9'};
  const style=g.ranges[1].Style;core.apply(g.app,modern(),'7',context);assert.equal(g.ranges[1].ParagraphFormat.OutlineLevel,9);assert.equal(g.ranges[1].Style,style);
  assert.equal(core.apply(g.app,modern(),'7',context).changed,0);
  const h=fixture();delete h.ranges[1].ParagraphFormat.OutlineLevel;const hContext=core.captureContext(h.app,'document');hContext.overrides={2:'heading2'};
  assert.throws(()=>core.apply(h.app,modern(),'7',hContext),/OutlineLevel.*未开始/);assert.equal(h.undo.starts,0);
});
test('提取完整单段而非选中文字，跨段/表格/非正文拒绝，磅值独立缩进不误取为零',()=>{
  const f=fixture(['标题','正文',{text:'表格',table:true},'署名','日期']);
  f.app.Selection.Range={Start:12,End:15,StoryType:1,Font:{NameFarEast:'部分文字字体',Size:99}};
  const result=core.extract(f.app);assert.equal(result.format.font,'旧字体');assert.equal(result.format.size,12);
  for(const range of [{Start:12,End:31,StoryType:1},{Start:20,End:30,StoryType:1},{Start:10,End:20,StoryType:7}]){
    f.app.Selection.Range=range;assert.throws(()=>core.extract(f.app),/普通正文段落|正文区域/);
  }
  f.app.Selection.Range={Start:12,End:12,StoryType:1};f.ranges[1].ParagraphFormat.CharacterUnitFirstLineIndent=0;
  for(const point of [28,-14]){f.ranges[1].ParagraphFormat.FirstLineIndent=point;const extracted=core.extract(f.app);assert.equal(extracted.format.indent,null);assert.ok(extracted.warnings.some(w=>w.includes('字符和磅值不一致')));}
});
test('普通空段与完全排除角色区分，分页预览说明空段仅链接分页',()=>{
  const f=fixture(['标题','\r','正文',{text:'表格空段',table:true},{text:'文本框',story:5},'署名','日期']);
  const rows=core.analyze(read(f),modern());
  assert.equal(rows[1].role,'blank');assert.equal(rows[1].reason,'空段落');assert.equal(rows[1].eligible,false);assert.equal(rows[1].assignable,true);
  assert.equal(rows[3].role,'preserve');assert.equal(rows[3].assignable,false);assert.equal(rows[4].assignable,false);
  f.ranges[1].ParagraphFormat.KeepWithNext=false;const preview=core.preview(f.app,modern(),core.captureContext(f.app,'document'));
  assert.equal(preview.rows[1].role,'blank');assert.equal(preview.rows[1].reason,'空段：仅链接分页');assert.equal(preview.rows[1].change,true);assert.equal(preview.rows[1].skip,false);
  const context=core.captureContext(f.app,'document');context.overrides={2:'preserve'};
  const preserved=core.preview(f.app,modern(),context).rows[1];assert.equal(preserved.role,'preserve');assert.equal(preserved.reason,'人工指定');assert.equal(preserved.skip,true);
  const before=JSON.stringify(f.ranges[1]);core.apply(f.app,modern(),'7',context);assert.equal(JSON.stringify(f.ranges[1]),before);
  assert.throws(()=>core.analyze(read(f),modern(),{2:'body'}),/空段落仅支持/);
  f.app.Selection.Range={Start:10,End:20,StoryType:1,Information:()=>false};assert.throws(()=>core.captureContext(f.app,'selection'),/没有可排版的普通正文/);
});
