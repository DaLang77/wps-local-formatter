(function(){
'use strict';
var view=document.getElementById('resultView'),templateName=document.getElementById('templateName'),
    status=document.getElementById('resultStatus'),message=document.getElementById('resultMessage');
document.getElementById('close').onclick=function(){window.close();};
function read(path,token){
 var controller=new AbortController(),timer=setTimeout(function(){controller.abort();},8000);
 return fetch(path,{method:'GET',signal:controller.signal,headers:token?{'X-Formatter-Token':token}:{}})
  .then(function(response){return response.json().then(function(data){
   if(!response.ok||data.error)throw new Error(response.status===403?'服务已更新，请关闭后重新打开结果窗口。':data.error||'本地服务无法连接。');
   return data;
  });}).finally(function(){clearTimeout(timer);});
}
function show(settings,snapshot){
 var result=snapshot.result||{},detail=typeof result.message==='string'?result.message:'',name=result.template;
 if(typeof name==='string'&&name.trim())name=name.replace(/^当前模板：/,'');
 else{
  var templates=settings&&Array.isArray(settings.templates)?settings.templates:[],selected=templates.filter(function(template){return template.id===settings.activeTemplateID;})[0];
  name=selected?selected.name:settings?'自定义':'未能读取模板';
 }
 templateName.textContent=name;
 var kind=result.kind,label='尚未排版',state='idle';
 if(kind==='busy'||snapshot.busy){label='正在排版';state='busy';}
 else if(result.ok===false||kind==='error'){label=detail.indexOf('自动撤销未成功')>=0?'撤销失败':'排版错误';state='error';}
 else if(kind==='idle'||!detail){label='尚未排版';}
 else if(kind==='info'){label='排版提示';}
 else if(result.ok===true){label=result.changed===0||detail.indexOf('无需修改')>=0?'无需修改':'排版完成';state='success';}
 else{label='排版提示';}
 status.textContent=label;view.dataset.state=state;
 message.textContent=detail||(state==='busy'?'正在处理，请稍候。':'回到文档点击「一键排版」。');
}
read('/session').then(function(session){
 if(typeof session.token!=='string'||!session.token)throw new Error('本地服务未连接，请重新打开结果窗口。');
 return Promise.all([read('/settings',session.token).catch(function(){return null;}),read('/state',session.token)]);
}).then(function(data){show(data[0],data[1]);}).catch(function(error){
 view.dataset.state='error';status.textContent='无法读取结果';templateName.textContent='未能读取模板';
 message.textContent=error&&error.message&&error.name!=='AbortError'?error.message:'本地服务连接中断，请重新打开结果窗口。';
});
}());
