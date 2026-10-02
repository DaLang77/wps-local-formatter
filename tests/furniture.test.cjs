const test=require('node:test'),assert=require('node:assert/strict');
const F=require('../addin/furniture.js'),C=require('../addin/config.js');
const wrap=F.packageXML;
function header(xml=wrap(['<w:p/>'])){let value=xml;return {LinkToPrevious:false,Range:{Text:'\r',Font:{Name:'仿宋',NameFarEast:'仿宋'},Fields:{Count:0,Update(){}},get WordOpenXML(){return value},InsertXML(x){value=x},Paragraphs:{Count:0}},PageNumbers:{NumberStyle:0,RestartNumberingAtSection:false,StartingNumber:0}};}
function fixture(n=1){const sections=Array.from({length:n},()=>{let hs=[header(),header(),header()],fs=[header(),header(),header()];return {PageSetup:{DifferentFirstPageHeaderFooter:0,OddAndEvenPagesHeaderFooter:0,HeaderDistance:36,FooterDistance:36},Headers:{Item:i=>hs[i-1]},Footers:{Item:i=>fs[i-1]}}});return {Sections:{Count:n,Item:i=>sections[i-1]}};}
test('old configuration migrates to disabled furniture without mutating source',()=>{const c=C.defaults();delete c.furniture;const migrated=C.normalize(c);assert.equal(migrated.furniture.number.enabled,false);assert.equal(c.furniture,undefined)});
test('invalid text, page format, start and flags rejected',()=>{for(const [k,v] of [['start',0],['format','roman'],['hideFirst',1]]){let c=C.defaults();c.furniture.number[k]=v;assert.throws(()=>C.normalize(c))}let c=C.defaults();c.furniture.header.text='<safe>\nnot single line';assert.throws(()=>C.normalize(c))});
test('all disabled never accesses sections',()=>{assert.deepEqual(F.plan({},C.defaults().furniture),{operations:[],properties:[]})});
test('escaped text and dynamic PAGE NUMPAGES survive signature ignoring results',()=>{let c=C.defaults().furniture;c.header.text='<合同&>';let xml=wrap([F.paragraph(c.header,false,false),F.paragraph({...c.number,format:'total'},true,false)]);assert.ok(xml.includes('&lt;合同&amp;&gt;'));assert.equal(F.signature(xml),F.signature(xml.replace(/<w:t>1<\/w:t>/g,'<w:t>99</w:t>')));assert.ok(F.signature(xml).includes('NUMPAGES'))});
test('separate footer text and numbers, reject mixed paragraph or complex objects',()=>{const c=C.defaults().furniture;const xml=wrap([F.paragraph({...c.footer,text:'合同'},false,false),F.paragraph(c.number,true,false)]);let p=F.split(xml);assert.equal(p.words.length,1);assert.equal(p.numbers.length,1);assert.throws(()=>F.split(wrap(['<w:p><w:r><w:t>公司</w:t></w:r><w:r><w:instrText> PAGE </w:instrText></w:r></w:p>'])));assert.throws(()=>F.split(wrap(['<w:tbl/>'])))});
test('enabled header changes only header, repeat is no-op',()=>{const d=fixture(),c=C.defaults().furniture;c.header.enabled=true;c.header.text='验收';c.header.font='仿宋';const before=d.Sections.Item(1).Footers.Item(1).Range.WordOpenXML;let p=F.plan(d,c);F.apply(p,()=>{});F.verify(p);assert.equal(d.Sections.Item(1).Footers.Item(1).Range.WordOpenXML,before);assert.equal(F.plan(d,c).operations.length,0)});
test('configured header detects run font/size and paragraph spacing even when paragraph-mark format matches',()=>{
 const c=C.defaults().furniture;c.header.enabled=true;c.header.text='验收';c.header.font='仿宋';
 const expected=wrap([F.paragraph(c.header,false,false)]);
 const variants=[
  expected.replace(/(<\/w:pPr><w:r><w:rPr>[\s\S]*?<w:sz w:val=")[^"]+/,'$199'),
  expected.replace(/(<\/w:pPr><w:r><w:rPr><w:rFonts[^>]*w:eastAsia=")[^"]+/,'$1其他字体'),
  expected.replace('w:before="0"','w:before="120"'),
  expected.replace('w:after="0"','w:after="160"'),
  expected.replace('w:line="240"','w:line="480"'),
  expected.replace('w:lineRule="auto"','w:lineRule="exact"')
 ];
 for(const xml of variants){
  assert.notEqual(F.signature(xml),F.signature(expected));const d=fixture();
  // Keep one stable range for plan, apply and readback.
  const h=header(xml);d.Sections.Item(1).Headers={Item:()=>h};const p=F.plan(d,c);
  assert.equal(p.operations.length,1);F.apply(p,()=>{});F.verify(p);assert.equal(F.plan(d,c).operations.length,0);
 }
});
test('uniform run splitting and omitted redundant paragraph-mark formatting remain semantically identical',()=>{
 const c=C.defaults().furniture.header;c.text='验收';c.font='仿宋';const paragraph=F.paragraph(c,false,false),expected=wrap([paragraph]);
 const run=paragraph.match(/<w:r>[\s\S]*?<\/w:r>/)[0];
 const split=paragraph.replace(run,run.replace('>验收<','>验<')+run.replace('>验收<','>收<'));
 assert.equal(F.signature(wrap([split])),F.signature(expected));
 const ppr=paragraph.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)[0];
 const noMark=paragraph.replace(ppr,ppr.replace(/<w:rPr>[\s\S]*?<\/w:rPr>/,''));
 assert.equal(F.signature(wrap([noMark])),F.signature(expected));
});
test('multi-section numbering restarts only first and hides only document first page',()=>{const d=fixture(2),c=C.defaults().furniture;c.number.enabled=true;c.number.hideFirst=true;c.number.start=5;let p=F.plan(d,c);assert.equal(p.operations.length,3);F.apply(p,()=>{});F.verify(p);assert.equal(d.Sections.Item(1).Footers.Item(1).PageNumbers.StartingNumber,5);assert.equal(d.Sections.Item(2).Footers.Item(1).PageNumbers.RestartNumberingAtSection,false);assert.equal(d.Sections.Item(2).PageSetup.DifferentFirstPageHeaderFooter,0)});
test('first-page changes that would affect disabled content rejected before mutation',()=>{const d=fixture(),c=C.defaults().furniture;c.number.enabled=true;c.number.hideFirst=true;d.Sections.Item(1).Headers.Item(1).Range.Text='existing';assert.throws(()=>F.plan(d,c));assert.equal(d.Sections.Item(1).PageSetup.DifferentFirstPageHeaderFooter,0)});
test('odd/even variants rejected before mutation',()=>{const d=fixture(),c=C.defaults().furniture;c.header.enabled=true;d.Sections.Item(1).PageSetup.OddAndEvenPagesHeaderFooter=-1;assert.throws(()=>F.plan(d,c))});
