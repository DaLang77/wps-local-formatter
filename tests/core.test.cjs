const test=require('node:test');
const assert=require('node:assert/strict');
const core=require('../addin/core.js');
const p=(text,extra={})=>({text,story:1,table:false,...extra});
test('首个非空标题与最后两段落款；跳过表格、文本框、页眉和空行',()=>{
  const a=[p(' '),p('标题'),p('表格',{table:true}),p('正文\n换行仍为同一段'),p('\u0001\u0015\r'),p('文本框',{story:5}),p('页眉',{story:7}),p('署名'),p('日期'),p('\r')];
  const plan=core.plan(a,2);
  assert.deepEqual(plan.map(x=>x.role),['title','body','signature','signature']);
  assert.equal(plan[0].font,'华文中宋');assert.equal(plan[1].size,14);
  assert.equal(plan[1].alignment,null);assert.equal(plan[1].indent,2);
});
test('落款段数验证与无落款',()=>{
  for(const n of [-1,1.5,NaN]) assert.throws(()=>core.plan([p('a'),p('b')],n));
  assert.throws(()=>core.plan([p('title'),p('sig')],2),/重叠/);
  assert.throws(()=>core.plan([p(' ')],0),/没有/);
  assert.deepEqual(core.plan([p('title'),p('body')],0).map(x=>x.role),['title','body']);
});
test('标题后首个非空正文段为中文冒号标签时不缩进，其他正文仍按设置缩进',()=>{
  const texts=['标题','\r','某某公司：\r',' 某某单位 ：  \r','某某公司：后续正文\r','正文包含：说明\r','署名','日期'];
  const plan=core.plan(texts.map(x=>p(x)),2);
  assert.deepEqual(plan.map(x=>x.indent),[0,0,2,2,2,0,0]);
});
test('全篇段落设置统一截图参数但保留各部分特殊缩进',()=>{
  const c=config.defaults();c.title.before=18;c.body.after=12;c.signature.line={mode:'double',value:null};
  const plan=core.plan(['标题','某某公司：','正文','署名','日期'].map(x=>p(x)),c);
  assert.deepEqual(plan.map(x=>x.indent),[0,0,2,0,0]);
  for(const item of plan){
    assert.equal(item.leftIndent,0);assert.equal(item.rightIndent,0);
    assert.equal(item.before,0);assert.equal(item.after,0);
    assert.equal(item.line.mode,'oneHalf');assert.equal(item.wordWrap,true);
    assert.equal(item.autoAdjustRightIndent,false);assert.equal(item.disableLineHeightGrid,true);
  }
});
function fixture() {
  let ranges=['标题','正文','表格','署名','日期'].map((text,i)=>({Start:i*10,End:i*10+10,Text:text,StoryType:1,
    Information:()=>i===2,Font:{Name:'原字体',NameFarEast:'原字体',Size:12,Bold:i===1?-1:0,Italic:0},
    ParagraphFormat:{FirstLineIndent:0,CharacterUnitFirstLineIndent:0,LeftIndent:12,RightIndent:9,
      AutoAdjustRightIndent:true,DisableLineHeightGrid:false,WordWrap:false,Alignment:3,LineSpacingRule:0,
      SpaceBefore:6,SpaceAfter:8,SpaceBeforeAuto:false,SpaceAfterAuto:false}}));
  const doc={DocID:7,ReadOnly:false,ProtectionType:-1,TrackRevisions:false,
    Content:{Text:'文字内容',Paragraphs:{Count:ranges.length,Item:i=>({Range:ranges[i-1]})}},Undo:()=>true};
  let starts=0,ends=0;
  const app={ActiveDocument:doc,FontNames:{Count:2,Item:i=>['华文中宋','仿宋_GB2312'][i-1]},
    UndoRecord:{IsRecordingCustomRecord:false,StartCustomRecord:()=>starts++,EndCustomRecord:()=>ends++}};
  return {app,doc,ranges,records:()=>[starts,ends]};
}
test('只修改目标属性；保留表格、加粗、对齐与段间距；重复执行无修改',()=>{
  const {app,ranges,records}=fixture();const table=JSON.stringify(ranges[2]);
  assert.equal(core.apply(app,2,'7').changed,4);
  assert.equal(JSON.stringify(ranges[2]),table);
  assert.equal(ranges[1].Font.Bold,-1);assert.equal(ranges[1].ParagraphFormat.Alignment,3);
  assert.equal(ranges[1].ParagraphFormat.SpaceBefore,0);
  assert.equal(ranges[4].ParagraphFormat.Alignment,2);
  assert.equal(ranges[1].ParagraphFormat.LineSpacingRule,1);
  assert.equal(ranges[1].ParagraphFormat.LeftIndent,0);assert.equal(ranges[1].ParagraphFormat.RightIndent,0);
  assert.equal(ranges[1].ParagraphFormat.AutoAdjustRightIndent,false);
  assert.equal(ranges[1].ParagraphFormat.DisableLineHeightGrid,true);
  assert.equal(ranges[1].ParagraphFormat.WordWrap,true);
  assert.equal(core.apply(app,2,'7').changed,0);assert.deepEqual(records(),[1,1]);
});
test('WPS 缺少新段落属性时在任何写入前停止',()=>{
  for(const key of ['LeftIndent','AutoAdjustRightIndent','DisableLineHeightGrid','WordWrap']){
    const f=fixture();delete f.ranges[1].ParagraphFormat[key];
    const prepared=JSON.stringify(f.ranges);
    assert.throws(()=>core.apply(f.app,2,'7'),new RegExp(key+'，未开始排版'));
    assert.equal(JSON.stringify(f.ranges),prepared);assert.deepEqual(f.records(),[0,0]);
  }
});
test('全篇左右缩进若意外改变保留原样的首行缩进，则回滚',()=>{
  const f=fixture(),c=config.defaults(),pf=f.ranges[1].ParagraphFormat;
  c.body.indent=null;pf.CharacterUnitFirstLineIndent=2;
  let left=12,undos=0;Object.defineProperty(pf,'LeftIndent',{get:()=>left,set:v=>{left=v;pf.CharacterUnitFirstLineIndent=0;},enumerable:true});
  f.doc.Undo=()=>{undos++;return true;};
  assert.throws(()=>core.apply(f.app,c,'7'),/首行缩进.*已撤销/);
  assert.equal(undos,1);
});
function characterIndentFixture(range,{resetFirst=false,reject=null}={}){
  const pf=range.ParagraphFormat,calls=[],chars={Left:2,Right:1},points={Left:22,Right:11};
  let grid=false,firstChars=2,firstPoints=22;
  function clearFirst(){if(resetFirst){firstChars=0;firstPoints=0;}}
  for(const side of ['Left','Right']){
    const charKey='CharacterUnit'+side+'Indent',pointKey=side+'Indent';
    Object.defineProperty(pf,charKey,{enumerable:true,get:()=>chars[side],set:value=>{
      calls.push(charKey);if(reject!==charKey)chars[side]=value;clearFirst();
    }});
    Object.defineProperty(pf,pointKey,{enumerable:true,get:()=>points[side],set:value=>{
      calls.push(pointKey);if(reject!==pointKey)points[side]=value;clearFirst();
    }});
  }
  // WPS can retain the character-unit value after a point-only write and
  // restore the nonzero point indent during a later layout-property write.
  Object.defineProperty(pf,'DisableLineHeightGrid',{enumerable:true,get:()=>grid,set:value=>{
    grid=value;for(const side of ['Left','Right'])if(chars[side]!==0)points[side]=chars[side]*11;
    clearFirst();
  }});
  Object.defineProperty(pf,'CharacterUnitFirstLineIndent',{enumerable:true,get:()=>firstChars,set:value=>{
    calls.push('CharacterUnitFirstLineIndent');firstChars=value;firstPoints=value*range.Font.Size;
  }});
  Object.defineProperty(pf,'FirstLineIndent',{enumerable:true,get:()=>firstPoints,set:value=>{
    calls.push('FirstLineIndent');firstPoints=value;if(value===0)firstChars=0;
  }});
  return {pf,calls};
}
test('字符左右缩进残留会在网格写入后恢复磅值，排版必须清零两种单位',()=>{
  const f=fixture(),{pf}=characterIndentFixture(f.ranges[1]);
  assert.equal(pf.CharacterUnitLeftIndent,2);assert.equal(pf.LeftIndent,22);
  core.apply(f.app,2,'7');
  for(const side of ['Left','Right']){
    assert.equal(pf['CharacterUnit'+side+'Indent'],0);assert.equal(pf[side+'Indent'],0);
  }
  assert.equal(pf.CharacterUnitFirstLineIndent,2);
  assert.equal(core.apply(f.app,2,'7').changed,0);assert.deepEqual(f.records(),[1,1]);
});
test('字符左右缩进和网格调整后仍正确应用正文、冒号标签、标题及落款首行',()=>{
  for(const text of ['正文','某某公司：\r']){
    const f=fixture();f.ranges[1].Text=text;
    for(const i of [0,1,3,4])characterIndentFixture(f.ranges[i],{resetFirst:true});
    core.apply(f.app,2,'7');
    assert.deepEqual([0,1,3,4].map(i=>f.ranges[i].ParagraphFormat.CharacterUnitFirstLineIndent),
      [0,text==='正文'?2:0,0,0]);
    for(const i of [0,1,3,4]){
      const pf=f.ranges[i].ParagraphFormat;
      assert.equal(pf.LeftIndent,0);assert.equal(pf.RightIndent,0);
      if(i!==1||text!=='正文')assert.equal(pf.FirstLineIndent,0);
    }
    assert.equal(core.apply(f.app,2,'7').changed,0);
  }
});
test('关闭全篇段落设置时不写入字符或磅值左右缩进',()=>{
  const f=fixture(),c=config.defaults(),{pf,calls}=characterIndentFixture(f.ranges[1]);
  c.paragraph.enabled=false;c.paragraph.westernWrap=false;
  core.apply(f.app,c,'7');
  assert.equal(pf.CharacterUnitLeftIndent,2);assert.equal(pf.LeftIndent,22);
  assert.equal(pf.CharacterUnitRightIndent,1);assert.equal(pf.RightIndent,11);
  assert.ok(!calls.some(key=>/^(CharacterUnit)?(Left|Right)Indent$/.test(key)));
});
test('清零字符左右缩进时首行保持原样设置仍保留原字符和磅值',()=>{
  const f=fixture(),c=config.defaults(),{pf,calls}=characterIndentFixture(f.ranges[1]);
  c.body.indent=null;core.apply(f.app,c,'7');
  assert.equal(pf.LeftIndent,0);assert.equal(pf.RightIndent,0);
  assert.equal(pf.CharacterUnitFirstLineIndent,2);assert.equal(pf.FirstLineIndent,22);
  assert.ok(!calls.some(key=>/FirstLineIndent$/.test(key)));
});
test('字符左右API缺失时仍清零磅值，静默拒写磅值则严格失败并撤销',()=>{
  for(const unavailable of [undefined,null]){
    const f=fixture(),pf=f.ranges[1].ParagraphFormat;
    for(const side of ['Left','Right'])Object.defineProperty(pf,'CharacterUnit'+side+'Indent',{
      enumerable:true,get:()=>unavailable,set:()=>{throw Error('不应写入不支持的字符左右API');}
    });
    core.apply(f.app,2,'7');assert.equal(pf.LeftIndent,0);assert.equal(pf.RightIndent,0);
    assert.equal(core.apply(f.app,2,'7').changed,0);
  }
  const g=fixture();let undone=0;g.doc.Undo=()=>{undone++;return true;};
  Object.defineProperty(g.ranges[1].ParagraphFormat,'LeftIndent',{enumerable:true,get:()=>22,set:()=>{}});
  assert.throws(()=>core.apply(g.app,2,'7'),/LeftIndent.*已撤销/);
  assert.equal(undone,1);assert.deepEqual(g.records(),[1,1]);
});
test('字符或磅值左右缩进静默拒写时不得报告成功，整组只撤销一次',()=>{
  for(const reject of ['CharacterUnitLeftIndent','CharacterUnitRightIndent','LeftIndent','RightIndent']){
    const f=fixture();characterIndentFixture(f.ranges[1],{reject});
    let undone=0;f.doc.Undo=()=>{undone++;return true;};
    assert.throws(()=>core.apply(f.app,2,'7'),/(LeftIndent|RightIndent).*已撤销/);
    assert.equal(undone,1);assert.deepEqual(f.records(),[1,1]);
  }
});
test('已有缩进的标签行会清零，保持原样设置不会修改缩进',()=>{
  const f=fixture();f.ranges[1].Text='某某公司：\r';
  f.ranges[1].ParagraphFormat.CharacterUnitFirstLineIndent=2;
  assert.equal(core.apply(f.app,2,'7').changed,4);
  assert.equal(f.ranges[1].ParagraphFormat.CharacterUnitFirstLineIndent,0);
  assert.equal(core.apply(f.app,2,'7').changed,0);
  const g=fixture(),c=config.defaults();g.ranges[1].Text='某某公司：\r';
  g.ranges[1].ParagraphFormat.CharacterUnitFirstLineIndent=2;c.body.indent=null;
  core.apply(g.app,c,'7');assert.equal(g.ranges[1].ParagraphFormat.CharacterUnitFirstLineIndent,2);
});
test('只读、字体缺失、文档切换均在写入前停止',()=>{
  for(const kind of ['readonly','fonts','switch','protected','revision']) {
    const {app,doc,ranges,records}=fixture();const original=JSON.stringify(ranges);
    if(kind==='readonly')doc.ReadOnly=true;
    if(kind==='fonts')app.FontNames.Count=0;
    if(kind==='protected')doc.ProtectionType=2;
    if(kind==='revision')doc.TrackRevisions=true;
    assert.throws(()=>core.apply(app,2,kind==='switch'?'8':'7'));
    assert.equal(JSON.stringify(ranges),original);assert.deepEqual(records(),[0,0]);
  }
});
test('写入失败结束撤销分组并只撤销本次操作',()=>{
  const {app,doc,ranges,records}=fixture();let undos=0;doc.Undo=n=>{undos+=n;return true;};
  Object.defineProperty(ranges[1].Font,'Size',{get:()=>12,set:()=>{throw new Error('模拟写入失败');},enumerable:true});
  assert.throws(()=>core.apply(app,2,'7'),/已撤销本次修改/);
  assert.deepEqual(records(),[1,1]);assert.equal(undos,1);
});
test('WPS 从正文改为落款时先清字符缩进再清磅值缩进',()=>{
  const {app,ranges}=fixture();const pf=ranges[3].ParagraphFormat;let chars=2,points=28;
  Object.defineProperty(pf,'FirstLineIndent',{get:()=>points,set:v=>{points=v;},enumerable:true});
  Object.defineProperty(pf,'CharacterUnitFirstLineIndent',{get:()=>chars,set:v=>{chars=v;if(v===0)points=28;},enumerable:true});
  core.apply(app,2,'7');assert.equal(chars,0);assert.equal(points,0);
});
const config=require('../addin/config.js');
test('禁用落款仍应用全篇段落设置，但保留落款字体、缩进和对齐',()=>{
 const {app,ranges}=fixture(),c=config.defaults();c.signature.enabled=false;c.signature.font='不存在的字体';
 const old=ranges[3].Font.Name,indent=ranges[3].ParagraphFormat.CharacterUnitFirstLineIndent;
 core.apply(app,c,'7');assert.equal(ranges[3].Font.Name,old);
 assert.equal(ranges[3].ParagraphFormat.CharacterUnitFirstLineIndent,indent);
 assert.equal(ranges[3].ParagraphFormat.Alignment,3);
 assert.equal(ranges[3].ParagraphFormat.LeftIndent,0);
});
test('保持原样及自定义行距、段间距',()=>{
 const {app,ranges}=fixture(),c=config.defaults();c.title.enabled=false;c.signature.enabled=false;
 c.paragraph.enabled=false;c.paragraph.westernWrap=false;
 Object.assign(c.body,{font:null,size:18,indent:null,alignment:null,before:0,after:12,line:{mode:'multiple',value:1.25}});
 const title=JSON.stringify(ranges[0]);core.apply(app,c,'7');
 assert.equal(JSON.stringify(ranges[0]),title);assert.equal(ranges[1].Font.Name,'原字体');
 assert.equal(ranges[1].Font.Size,18);assert.equal(ranges[1].ParagraphFormat.LineSpacing,15);
 assert.equal(ranges[1].ParagraphFormat.SpaceBefore,0);assert.equal(ranges[1].ParagraphFormat.SpaceAfter,12);
 assert.equal(core.apply(app,c,'7').changed,0);
});
function pages(f){const ps=[0,1].map(()=>({Orientation:0,PageWidth:612,PageHeight:792,TopMargin:72,BottomMargin:72,LeftMargin:72,RightMargin:72}));f.doc.Sections={Count:2,Item:i=>({PageSetup:ps[i-1]})};return ps;}
test('页面设置应用所有节且重复无写入，与段落共用一次撤销',()=>{
 const f=fixture(),ps=pages(f),c=config.defaults();c.page.enabled=true;c.page.orientation=1;
 const r=core.apply(f.app,c,'7');assert.equal(r.changedSections,2);assert.deepEqual(f.records(),[1,1]);
 assert.equal(ps[0].Orientation,1);assert.ok(ps[0].PageWidth>ps[0].PageHeight);assert.deepEqual(ps[0],ps[1]);
 assert.equal(core.apply(f.app,c,'7').changed,0);assert.deepEqual(f.records(),[1,1]);
});
test('非法页边距在任何写入前拒绝',()=>{
 const f=fixture();pages(f);const c=config.defaults();c.page.enabled=true;c.page.left=20;c.page.right=20;
 const before=JSON.stringify(f.ranges);assert.throws(()=>core.apply(f.app,c,'7'),/页边距/);assert.equal(JSON.stringify(f.ranges),before);assert.deepEqual(f.records(),[0,0]);
});
test('页面写入失败也撤销已经修改的段落',()=>{
 const f=fixture(),ps=pages(f),c=config.defaults();c.page.enabled=true;let undone=0;f.doc.Undo=()=>{undone++;return true;};
 Object.defineProperty(ps[1],'PageWidth',{get:()=>612,set:()=>{throw Error('模拟页面写入失败');}});
 assert.throws(()=>core.apply(f.app,c,'7'),/已撤销/);assert.equal(undone,1);assert.deepEqual(f.records(),[1,1]);
});
test('配置字段校验拒绝未知版本、非法数字及行距',()=>{
 const c=config.defaults();c.body.size=-1;c.page.orientation=4;c.signature.line={mode:'multiple',value:0};
 const result=config.validate(c);assert.ok(result.errors['body.size']);assert.ok(result.errors['page.orientation']);assert.ok(result.errors['signature.line.value']);assert.throws(()=>config.normalize({version:9}));
});
test('旧模板补齐全篇段落设置，两个开关可以分别关闭',()=>{
 const old=config.defaults();delete old.paragraph;
 assert.deepEqual(config.normalize(old).paragraph,{enabled:true,westernWrap:true});
 const c=config.defaults();c.paragraph.enabled=false;c.paragraph.westernWrap=false;
 const plan=core.plan(['标题','正文','署名','日期'].map(x=>p(x)),c);
 assert.equal(plan[1].leftIndent,null);assert.equal(plan[1].wordWrap,null);
 c.paragraph.westernWrap=true;assert.equal(core.plan(['标题','正文','署名','日期'].map(x=>p(x)),c)[1].wordWrap,true);
});
test('WPS 自动段距使用 0/-1 回读时可写入、校验且重复无修改',()=>{
 const f=fixture(),c=config.defaults();
 for(const role of ['title','body','signature'])Object.assign(c[role],{before:0,after:0});
 for(const r of f.ranges)for(const key of ['SpaceBeforeAuto','SpaceAfterAuto']){
  let v=-1;Object.defineProperty(r.ParagraphFormat,key,{get:()=>v,set:x=>{v=x?-1:0;},enumerable:true});
 }
 assert.equal(core.apply(f.app,c,'7').changed,4);
 assert.equal(f.ranges[1].ParagraphFormat.SpaceBeforeAuto,0);
 assert.equal(core.apply(f.app,c,'7').changed,0);
});
test('无法应用自动段距时仍拒绝成功并撤销',()=>{
 for(const value of [undefined,null,9999999,-1]){
  const f=fixture(),c=config.defaults();c.body.before=0;let undone=0;f.doc.Undo=()=>{undone++;return true;};
  Object.defineProperty(f.ranges[1].ParagraphFormat,'SpaceBeforeAuto',{get:()=>value,set:()=>{},enumerable:true});
  assert.throws(()=>core.apply(f.app,c,'7'),/SpaceBeforeAuto.*已撤销/);assert.equal(undone,1);
 }
});
test('Mac WPS 页面磅值整数截断不误报失败，重复排版不再写入',()=>{
 const f=fixture(),ps=pages(f),c=config.defaults();c.page.enabled=true;
 for(const page of ps)for(const key of ['PageWidth','PageHeight','TopMargin','BottomMargin','LeftMargin','RightMargin']){
  let value=page[key];Object.defineProperty(page,key,{get:()=>Math.floor(value),set:v=>{value=v;},enumerable:true});
 }
 assert.equal(core.apply(f.app,c,'7').changedSections,2);
 assert.equal(ps[0].PageWidth,595);assert.equal(ps[0].PageHeight,841);
 assert.equal(core.apply(f.app,c,'7').changed,0);assert.deepEqual(f.records(),[1,1]);
});
test('页面真实尺寸不匹配仍失败回滚，包含期望和实际值',()=>{
 const f=fixture(),ps=pages(f),c=config.defaults();c.page.enabled=true;let undone=0;
 f.doc.Undo=()=>{undone++;return true;};
 Object.defineProperty(ps[0],'PageWidth',{get:()=>594,set:()=>{}});
 assert.throws(()=>core.apply(f.app,c,'7'),/PageWidth（预期 .*实际 594.*已撤销/);
 assert.equal(undone,1);
});
