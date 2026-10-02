const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(){
 const calls=[],notices=[],app={ActiveDocument:{DocID:12}},state={revision:1,activeTemplateID:'builtin',templates:[{id:'builtin',name:'默认文书',config:{version:1}}],current:{version:1}};
 const c={window:{},wps:{WpsApplication:()=>app,ShowDialog:(...a)=>calls.push(['dialog',...a])},FormatterCore:{apply:(...args)=>{calls.push(['apply',...args]);return {ok:true,message:'已排版'};}}};
 vm.createContext(c);vm.runInContext(fs.readFileSync('addin/main.js','utf8'),c);c.request=(path,data,cb)=>{calls.push([path,data]);cb(null,path==='/session'?{token:'test'}:state,200);};const notify=c.notify;c.notify=t=>notices.push(t);c.settingsState=state;return {c,calls,app,state,notices,notify};
}
test('一键排版使用保存的配置且没有确认弹窗',()=>{const {c,calls,state,notices}=fixture();c.OnFormat();assert.equal(calls.find(x=>x[0]==='apply')[2],state.current);assert.ok(notices.includes('已排版'));assert.equal(c.bridgeBusy,false);});
test('设置入口使用 WPS 对话框',()=>{const {c,calls}=fixture();c.OnSettings();assert.equal(calls[0][0],'dialog');assert.match(calls[0][1],/settings.html$/);});
test('文档切换保护传递点击时的 DocID',()=>{const {c,calls}=fixture();c.OnFormat();assert.equal(calls.find(x=>x[0]==='apply')[3],'12');});
test('长结果与模板名称完整可读，成功仍不弹窗',()=>{
 const {c,calls,app,state,notify}=fixture();c.notify=notify;
 const result='已排版 19 段，调整 1 节页面，更新页眉页脚 · ⌘Z 撤销';
 state.templates[0].name='适合多种文书的完整长名称模板';
 c.FormatterCore.apply=()=>({ok:true,message:result});c.OnFormat();
 assert.equal(c.GetStatus(),'排版完成');assert.equal(app.StatusBar,result);
 assert.ok(!calls.some(x=>x[0]==='dialog'));
 c.OnStatus();const detail=calls.filter(x=>x[0]==='/ui-result').at(-1)[1];
 assert.equal(detail.message,result);assert.ok(detail.template.includes(state.templates[0].name));
 assert.match(calls.at(-1)[1],/result.html$/);
});
test('缺字体和撤销失败均显示错误，详情不丢失',()=>{
 const {c,calls,notify}=fixture();c.notify=notify;
 for(const message of ['WPS 缺少字体：仿宋。未开始排版。','文字内容校验失败。 自动撤销未成功，请在 WPS 检查并手动撤销。']){
  c.FormatterCore.apply=()=>{throw new Error(message);};c.OnFormat();
  assert.equal(c.GetStatus(),message.includes('自动撤销未成功')?'撤销失败':'查看错误');
  c.OnStatus();const detail=calls.filter(x=>x[0]==='/ui-result').at(-1)[1];
  assert.equal(detail.message,message);assert.equal(detail.ok,false);assert.match(calls.at(-1)[1],/result.html$/);
 }
});
