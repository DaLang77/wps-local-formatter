const test=require('node:test');
const assert=require('node:assert/strict');
const config=require('../addin/config.js');

test('v1 迁移 v2 保留旧角色和规则，不修改输入或共享标题对象',()=>{
  const old=config.defaults();old.body.size=17;old.signatureCount=0;
  delete old.paragraph;delete old.furniture;const before=JSON.stringify(old);
  const migrated=config.normalize(old);
  assert.equal(migrated.version,2);assert.equal(migrated.recognition,'position');
  assert.equal(migrated.signatureCount,0);assert.equal(migrated.body.size,17);
  assert.deepEqual(migrated.addressee,migrated.body);assert.equal(migrated.headings.length,9);
  assert.deepEqual(migrated.pagination,{headingFollow:null,keepTogether:null,bodyWidow:null,signatureTogether:null});
  assert.deepEqual(migrated.lists,{protect:false});assert.deepEqual(migrated.paragraph,{enabled:true,westernWrap:true});
  migrated.headings[0].size=19;assert.equal(migrated.headings[1].size,17);assert.equal(migrated.body.size,17);
  assert.equal(JSON.stringify(old),before);
});
test('新默认模板启用样式识别、标题跟随、正文孤行和编号保护；数字输入保持旧规则',()=>{
  const modern=config.modernDefaults();assert.deepEqual(config.validate(modern).errors,{});
  assert.equal(modern.recognition,'styles');assert.equal(modern.lists.protect,true);
  assert.equal(modern.pagination.headingFollow,true);assert.equal(modern.pagination.bodyWidow,true);
  assert.equal(config.normalize(3).recognition,'position');assert.equal(config.normalize(3).signatureCount,3);
});
test('v2 新字段严格校验，九级标题格式和分页可保持原样',()=>{
  const c=config.modernDefaults();c.recognition='any';c.headings[8].size=-1;c.pagination.headingFollow='true';c.lists.protect=1;
  const r=config.validate(c);assert.ok(r.errors.recognition);assert.ok(r.errors['headings.8.size']);
  assert.ok(r.errors['pagination.headingFollow']);assert.ok(r.errors['lists.protect']);
  const d=config.modernDefaults();d.headings.pop();assert.ok(config.validate(d).errors.headings);
  d.headings.push(config.modernDefaults().headings[8]);d.headings[8].font=null;d.pagination.headingFollow=null;
  assert.deepEqual(config.validate(d).errors,{});assert.throws(()=>config.normalize({version:99}));
});
test('旧版非有限数字不能被迁移为合法的保持原样',()=>{
  const c=config.defaults();c.body.size=NaN;c.signature.indent=Infinity;
  const r=config.validate(c);assert.ok(r.errors['body.size']);assert.ok(r.errors['signature.indent']);
});
