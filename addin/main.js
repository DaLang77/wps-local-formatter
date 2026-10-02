/* Local-only WPS bridge. Document text never enters the heartbeat. */
var bridgeToken='', bridgeBusy=false, bridgeTimer=null;
var BRIDGE_VERSION='1.2.0-beta.1';
var documentSession={docID:'',scope:'document',fingerprint:null,overrides:{},needsReview:false};
var contentDirty=false,eventsRegistered=false,activationEventsRegistered=false,lastStructureCheck=0;
var sessionGeneration=0;
function hasOverrides(){return Object.keys(documentSession.overrides).length>0;}
function syncDocument(doc){
  var id=doc?String(doc.DocID):'';
  if(id!==documentSession.docID){
    sessionGeneration++;
    var marked=hasOverrides()||documentSession.needsReview;
    documentSession={docID:id,scope:'document',fingerprint:null,overrides:{},needsReview:marked};
    contentDirty=false;
    if(marked)notify('文档已切换，人工标记已失效。请在“文档结构”重新检查。','info');
  }
}
function operationContext(scope,allowReview){
  var app=application(),doc=app.ActiveDocument;syncDocument(doc);
  if(!doc)throw new Error('请先打开 Word 文档。');
  var context=typeof FormatterCore.captureContext==='function'?FormatterCore.captureContext(app,scope||documentSession.scope):{docID:String(doc.DocID),scope:scope||documentSession.scope};
  if(hasOverrides()&&context.fingerprint!==documentSession.fingerprint){
    sessionGeneration++;
    documentSession.overrides={};documentSession.needsReview=true;
    notify('文字或段落结构已变化，人工标记已失效。请重新检查文档结构。','info');
  }
  if(documentSession.needsReview&&!allowReview)throw new Error('人工标记已失效，请打开“文档结构”重新检查后再排版。');
  context.overrides=Object.assign({},documentSession.overrides);
  context.sessionGeneration=sessionGeneration;
  return context;
}
function assertSessionContext(context,allowReview){
  var doc=application().ActiveDocument;syncDocument(doc);
  if(!doc||String(doc.DocID)!==String(context.docID))throw new Error('当前文档已经切换，未开始排版。');
  if(documentSession.needsReview&&!allowReview)throw new Error('人工标记已失效，请打开“文档结构”重新检查后再排版。');
  if(context.sessionGeneration!==sessionGeneration)throw new Error('文档发生编辑或切换，未开始排版。请检查后重新点击排版。');
}
function onContentChange(){
  contentDirty=true;sessionGeneration++;
  // Check at the event, before a later Undo can restore the old fingerprint.
  // Pure formatting events leave matching role overrides intact.
  if(hasOverrides())try{operationContext('document',true);}catch(ignore){}
}
function application() {
  if(typeof wps!=='undefined' && typeof wps.WpsApplication==='function') return wps.WpsApplication();
  return window.Application;
}
function request(path, data, callback) {
  var xhr=new XMLHttpRequest(); xhr.open(data===null?'GET':'POST',path,true);
  xhr.timeout=5000;
  if(bridgeToken) xhr.setRequestHeader('X-Formatter-Token',bridgeToken);
  if(data!==null) xhr.setRequestHeader('Content-Type','application/json');
  xhr.onload=function(){try{callback(null,JSON.parse(xhr.responseText||'{}'),xhr.status);}catch(e){callback(e);}};
  xhr.onerror=xhr.ontimeout=function(){callback(new Error('本地排版工具未连接'));};
  xhr.send(data===null?null:JSON.stringify(data));
}
function status() {
  try {
    var app=application(),d=app.ActiveDocument;syncDocument(d);
    if(fontList===null)try{fontList=FormatterCore.fonts(app);}catch(ignore){}
    if(d&&hasOverrides()&&(contentDirty||!eventsRegistered&&Date.now()-lastStructureCheck>10000)){
      operationContext('document',true);contentDirty=false;lastStructureCheck=Date.now();
    }
    var out={connected:true,apiReady:true,documentOpen:!!d,bridgeVersion:BRIDGE_VERSION,fonts:fontList,scope:documentSession.scope,sessionInvalidated:documentSession.needsReview};
    try{if(app.Version!==undefined&&app.Version!==null)out.version=String(app.Version);}catch(ignore){}
    if(d){out.docID=String(d.DocID);out.title=String(d.Name);out.readOnly=!!d.ReadOnly;}
    return out;
  } catch(e) { syncDocument(null);return {connected:true,apiReady:false,documentOpen:false,bridgeVersion:BRIDGE_VERSION,fonts:null,error:String(e.message||e)}; }
}
function safe(fn) { try{return fn();}catch(e){return {error:String(e.message||e)};} }
function diagnostic(doc) {
  if(!/^WPS排版.*\.docx$/.test(String(doc.Name))) throw new Error('诊断仅允许本项目测试文档。');
  var compact=doc.Content.Paragraphs.Count>500;
  var data={name:doc.Name,docID:String(doc.DocID),compact:compact,bodyText:doc.Content.Text,
    fonts:FormatterCore.fonts(application()).filter(function(f){return /仿宋|中宋/i.test(f);}),
    paragraphs:FormatterCore.readParagraphs(doc).map(function(p){var r=p.range,f=r.Font,pf=r.ParagraphFormat;return {
      index:p.index,start:p.start,end:p.end,text:p.text,story:p.story,table:p.table,
      font:f.Name,farEast:f.NameFarEast,size:f.Size,bold:f.Bold,alignment:pf.Alignment,
      indent:pf.CharacterUnitFirstLineIndent,firstLine:pf.FirstLineIndent,left:pf.LeftIndent,right:pf.RightIndent,
      charLeft:pf.CharacterUnitLeftIndent,charRight:pf.CharacterUnitRightIndent,lineRule:pf.LineSpacingRule,
      style:safe(function(){var s=r.Style;return typeof s==='object'?{name:s.NameLocal||s.Name}:String(s);}),
      outline:pf.OutlineLevel,keepWithNext:pf.KeepWithNext,keepTogether:pf.KeepTogether,widowControl:pf.WidowControl,
      list:safe(function(){return {type:r.ListFormat.ListType,level:r.ListFormat.ListLevelNumber,value:r.ListFormat.ListValue,label:r.ListFormat.ListString};}),
      before:pf.SpaceBefore,after:pf.SpaceAfter,beforeAuto:pf.SpaceBeforeAuto,afterAuto:pf.SpaceAfterAuto};}),
    headerFooter:compact?{omitted:'大型文档诊断省略页眉页脚 XML。'}:safe(function(){var out=[];for(var i=1;i<=doc.Sections.Count;i++){var s=doc.Sections.Item(i),row={first:s.PageSetup.DifferentFirstPageHeaderFooter,odd:s.PageSetup.OddAndEvenPagesHeaderFooter,headerDistance:s.PageSetup.HeaderDistance,footerDistance:s.PageSetup.FooterDistance};['Headers','Footers'].forEach(function(k){row[k]=[];for(var j=1;j<=3;j++){var h=s[k].Item(j),r=h.Range;row[k].push({exists:h.Exists,linked:h.LinkToPrevious,text:r.Text,xml:safe(function(){return r.WordOpenXML;}),insertXML:typeof r.InsertXML,fields:typeof r.Fields.Add,pageNumbers:safe(function(){return {start:h.PageNumbers.StartingNumber,restart:h.PageNumbers.RestartNumberingAtSection};})});}});out.push(row);}return out;}),
    sections:safe(function(){var a=[];for(var i=1;i<=doc.Sections.Count;i++){var p=doc.Sections.Item(i).PageSetup;a.push({width:p.PageWidth,height:p.PageHeight,orientation:p.Orientation,top:p.TopMargin,bottom:p.BottomMargin,left:p.LeftMargin,right:p.RightMargin});}return a;}),
    shapes:safe(function(){var a=[];for(var i=1;i<=doc.Shapes.Count;i++){var s=doc.Shapes.Item(i);a.push({type:s.Type,anchor:s.Anchor.Start,text:safe(function(){return s.TextFrame.TextRange.Text;})});}return a;}),
    selection:safe(function(){var r=application().Selection.Range;return {start:r.Start,end:r.End,story:r.StoryType,table:r.Information(12)};}),
    saved:doc.Saved,
    xml:compact?{omitted:'大型文档诊断省略完整 XML。'}:safe(function(){return doc.WordOpenXML;})};
  return data;
}
function probeAPIs(app,doc){
  if(!/^WPS排版.*\.docx$/.test(String(doc.Name)))throw new Error('接口验证仅允许合成测试文档。');
  var p=FormatterCore.readParagraphs(doc).filter(function(p){return p.story===1&&!p.table;})[0];
  if(!p)throw new Error('测试文档没有普通段落。');
  var pf=p.range.ParagraphFormat,undo=app.UndoRecord,out={selection:safe(function(){return FormatterCore.captureContext(app,'selection');}),style:safe(function(){var s=p.range.Style;return typeof s==='object'?{name:s.NameLocal||s.Name}:String(s);}),properties:[]};
  var keys=['KeepWithNext','KeepTogether','WidowControl','OutlineLevel'],before=keys.map(function(k){return pf[k];}),started=false,wrote=false;
  try{
    undo.StartCustomRecord('排版接口合成验证');started=true;
    keys.forEach(function(k,i){
      if(before[i]===undefined||before[i]===null)throw new Error('API 不可用：'+k);
      var values=k==='OutlineLevel'?[1,9,10]:[true,false],row={key:k,before:before[i],samples:[]};
      values.forEach(function(value){pf[k]=value;wrote=true;row.samples.push({written:value,read:pf[k]});});out.properties.push(row);
    });
  }finally{
    if(started)undo.EndCustomRecord();
    if(wrote&&doc.Undo(1)===false)throw new Error('接口验证撤销失败，请检查测试文档。');
  }
  out.restored=keys.every(function(k,i){return pf[k]===before[i];});return out;
}
function analyzeDocument(config){
  var context=operationContext('document',true),paragraphs=FormatterCore.readParagraphs(application().ActiveDocument);
  // Analysis is also the user's way to acknowledge invalidated role markings.
  assertSessionContext(context,true);
  var rows=FormatterCore.analyze(paragraphs,config,context.overrides);
  var invalidated=documentSession.needsReview;
  documentSession.fingerprint=context.fingerprint;documentSession.needsReview=false;
  return {docID:context.docID,fingerprint:context.fingerprint,paragraphs:rows,scope:documentSession.scope,sessionInvalidated:invalidated,message:invalidated?'人工标记已清除，请检查下列识别结果。':''};
}
function execute(command) {
  bridgeBusy=true;
  var result={id:command.id};
  try {
    var app=application(),d=app.ActiveDocument;
    if(!d || String(d.DocID)!==String(command.docID)) throw new Error('当前文档已经切换，未开始操作。');
    syncDocument(d);
    if(command.op==='format'){
      var context=operationContext(command.scope||documentSession.scope,false);
      assertSessionContext(context);
      result=Object.assign(result,FormatterCore.apply(app,command.config||Number(command.count),command.docID,context));
    }
    else if(command.op==='analyze')result=Object.assign(result,{ok:true,analysis:analyzeDocument(command.config||settingsState.current)});
    else if(command.op==='preview'){
      var previewContext=operationContext(command.scope||documentSession.scope,false);assertSessionContext(previewContext);
      result=Object.assign(result,{ok:true,preview:FormatterCore.preview(app,command.config||settingsState.current,previewContext)});
    }
    else if(command.op==='extract'){
      var extracted=FormatterCore.extract(app);result=Object.assign(result,{ok:true,extracted:extracted.format?extracted:{format:extracted,warnings:[]}});
    }
    else if(command.op==='scope'){
      if(['document','selection'].indexOf(command.scope)<0)throw new Error('排版范围无效。');
      documentSession.scope=command.scope;invalidate();result=Object.assign(result,{ok:true,scope:documentSession.scope});
    }
    else if(command.op==='set-role'){
      var captured=operationContext('document',true);
      if(documentSession.needsReview)throw new Error('人工标记已失效，请重新读取文档结构后再指定角色。');
      if(command.fingerprint!==captured.fingerprint)throw new Error('文字或段落结构已变化，请重新读取文档结构。');
      if(!/^(title|body|addressee|signature|heading[1-9]|preserve|auto)$/.test(command.role))throw new Error('段落角色无效。');
      var paras=FormatterCore.readParagraphs(d),paragraph=paras.filter(function(p){return p.index===Number(command.index);})[0];
      if(!paragraph||paragraph.story!==1||paragraph.table)throw new Error('此段不属于可排版的正文区。');
      sessionGeneration++;
      if(command.role==='auto')delete documentSession.overrides[command.index];else documentSession.overrides[command.index]=command.role;
      documentSession.fingerprint=captured.fingerprint;documentSession.needsReview=false;
      result=Object.assign(result,{ok:true,analysis:analyzeDocument(command.config||settingsState.current)});
    }
    else if(command.diagnostic && command.op==='inspect') result=Object.assign(result,{ok:true,inspection:diagnostic(d)});
    else if(command.diagnostic && command.op==='probe')result=Object.assign(result,{ok:true,probe:probeAPIs(app,d),inspection:diagnostic(d)});
    else if(command.diagnostic && command.op==='undo' && /^WPS排版.*\.docx$/.test(String(d.Name))) {
      result.ok=d.Undo(1)!==false;result.inspection=diagnostic(d);
    } else throw new Error('未知操作。');
  }catch(e){result.ok=false;result.message=String(e.message||e);}
  request('/result',result,function(){bridgeBusy=false;});
}
function tick() {
  if(bridgeBusy) return;
  if(!bridgeToken) {
    request('/session',null,function(error,data){if(!error && data.token){bridgeToken=data.token;tick();}}); return;
  }
  request('/poll',status(),function(error,data,http){
    if(http===403){bridgeToken='';return;}
    if(!error && data.command && !bridgeBusy) execute(data.command);
  });
}
var ribbonUI=null, settingsState=null, statusText='尚未执行排版。',statusKind='idle',fontList=null,refreshing=false;
function invalidate() { try { if(ribbonUI)ribbonUI.Invalidate(); } catch(e) {} }
function notify(text,kind) { statusText=text;statusKind=kind||'info';invalidate();try{application().StatusBar=text;}catch(e){} }
function GetStatus(){
  if(statusKind==='busy')return '正在排版';
  if(statusKind==='error')return statusText.indexOf('自动撤销未成功')>=0?'撤销失败':'查看错误';
  if(statusKind==='success')return statusText.indexOf('无需修改')>=0?'无需修改':'排版完成';
  return '排版结果';
}
function GetStatusDetail(){return GetCurrentTemplate()+'\n\n'+statusText;}
function OnStatus(){
  api('/ui-result',{ok:statusKind!=='error',kind:statusKind,message:statusText,template:GetCurrentTemplate()},function(error){
    if(error){notify(error.message,'error');return;}
    try{
      var host=(typeof wps!=='undefined'&&typeof wps.ShowDialog==='function')?wps:application();
      host.ShowDialog('http://127.0.0.1:38941/result.html','排版结果',640,420,false);
    }catch(e){notify('结果窗口无法打开：'+String(e.message||e),'error');}
  });return true;
}
function GetCurrentTemplate(){
  if(!settingsState)return '模板加载中…';
  var t=settingsState.templates.filter(function(t){return t.id===settingsState.activeTemplateID;})[0];
  return '当前模板：'+(t?t.name:'自定义');
}
function GetFormatTip(){return GetCurrentTemplate()+'\n范围：'+(documentSession.scope==='selection'?'选中段落（部分文字按整段处理）':'整篇文档')+'。⌘Z 可整组撤销。';}
function GetSettingsTip(){return GetCurrentTemplate()+'\n选择或保存模板，设置标题、正文、落款、页面和页眉页脚。';}
function api(path,data,callback){
  function send(){request(path,data,function(error,result,http){
    if(http===403){bridgeToken='';callback(new Error('服务已更新，请稍后重试。'));return;}
    if(error||!result||http>=400||result.error){callback(error||new Error(result&&result.error||'本地服务无法连接'));return;}
    callback(null,result);
  });}
  if(bridgeToken){send();return;}
  request('/session',null,function(error,result){if(error||!result.token){callback(error||new Error('本地服务无法连接'));return;}bridgeToken=result.token;send();});
}
function refreshSettings(){
  if(refreshing)return;refreshing=true;
  api('/settings',null,function(error,state){refreshing=false;if(error){notify(error.message,'error');return;}
    if(!settingsState||state.revision!==settingsState.revision){settingsState=state;invalidate();}
  });
}
function OnAddinLoad(ribbon) {
  ribbonUI=ribbon;if(bridgeTimer)clearInterval(bridgeTimer);
  if(!eventsRegistered)try{
    var events=wps.ApiEvent;
    events.AddApiEventListener('ContentChange',onContentChange);
    events.AddApiEventListener('DocumentAfterClose',function(){syncDocument(null);});
    events.AddApiEventListener('DocumentOpen',function(doc){syncDocument(null);syncDocument(doc);});
    eventsRegistered=true;
  }catch(ignore){}
  // Optional activation events catch round trips between already-open documents.
  // Register independently so unsupported events cannot disable other listeners.
  if(!activationEventsRegistered)try{
    wps.ApiEvent.AddApiEventListener('WindowActivate',function(doc){
      try{syncDocument(doc&&doc.DocID!==undefined?doc:application().ActiveDocument);}catch(ignore){}
    });activationEventsRegistered=true;
  }catch(ignore){}
  bridgeTimer=setInterval(function(){tick();if(!bridgeBusy)refreshSettings();},1500);tick();refreshSettings();return true;
}
function GetScopeCount(){return 2;}
function GetScopeLabel(control,index){return Number(index)===1?'选中段落':'整篇文档';}
function GetScopeID(control,index){return Number(index)===1?'selection':'document';}
function GetSelectedScopeIndex(){try{syncDocument(application().ActiveDocument);}catch(ignore){}return documentSession.scope==='selection'?1:0;}
function OnSelectScope(control,id,index){
  try{syncDocument(application().ActiveDocument);}catch(ignore){}
  if(index===undefined&&control)index=control.SelectedItemIndex;
  documentSession.scope=id==='selection'||Number(index)===1?'selection':'document';invalidate();
  notify(documentSession.scope==='selection'?'范围：选中段落。部分文字按所在整段处理；页面、页眉页脚及页码不修改。':'范围：整篇文档。');return true;
}
function OnFormat(){
  if(bridgeBusy){notify('正在处理，请稍后再试。','busy');return true;}
  var context,id;try{context=operationContext();id=context.docID;}catch(e){notify(String(e.message||e),'error');return true;}
  bridgeBusy=true;notify('正在排版…','busy');
  api('/settings',null,function(error,state){
    if(error){bridgeBusy=false;notify(error.message,'error');return;}
    settingsState=state;
    try{assertSessionContext(context);var result=FormatterCore.apply(application(),state.current,id,context);notify(result.message,result.ok?'success':'error');request('/ui-result',result,function(){});}
    catch(e){notify(String(e.message||e),'error');request('/ui-result',{ok:false,message:String(e.message||e)},function(){});}
    finally{bridgeBusy=false;}
  });return true;
}
function OnSettings(){
  try{
    var host=(typeof wps!=='undefined'&&typeof wps.ShowDialog==='function')?wps:application();
    host.ShowDialog('http://127.0.0.1:38941/settings.html','排版设置',880,740,false);
  }catch(e){notify('设置窗口无法打开：'+String(e.message||e),'error');}
  return true;
}
function openPanel(file,title,width,height){
  try{var host=(typeof wps!=='undefined'&&typeof wps.ShowDialog==='function')?wps:application();host.ShowDialog('http://127.0.0.1:38941/'+file,title,width,height,false);}catch(e){notify(title+'无法打开：'+String(e.message||e),'error');}return true;
}
function OnStructure(){return openPanel('structure.html','文档结构与排版范围',960,760);}
function OnEnvironment(){return openPanel('environment.html','环境检查',820,720);}
function GetFormatImage(){return 'icons/format.svg';}
function GetSettingsImage(){return 'icons/settings.svg';}
function GetStatusImage(){return 'icons/result.svg';}
