(function(){
'use strict';
var state=null,token='',busy=false;
var labels={title:['标题','首个非空普通段落'],body:['正文','标题与落款之间的普通段落'],signature:['落款','文末指定数量的非空普通段落'],page:['页面','应用到文档的每一节，不改变分节结构']};
function el(tag,props,text){var n=document.createElement(tag);Object.keys(props||{}).forEach(function(k){n.setAttribute(k,props[k]);});if(text!==undefined)n.textContent=text;return n;}
function field(parent,key,label,type,options){var wrap=el('div',{class:'field'}),id=key.replace(/\./g,'-');wrap.appendChild(el('label',{for:id},label));var input;
 if(type==='select'){input=el('select',{id:id,'data-key':key});options.forEach(function(o){input.appendChild(el('option',{value:o[0]},o[1]));});}
 else{input=el('input',{id:id,type:type,'data-key':key,placeholder:'保持原样'});if(type==='number'){input.step='any';input.min='0';}if(key.endsWith('.font'))input.setAttribute('list','fontOptions');if(key.endsWith('.size'))input.setAttribute('list','sizeOptions');}
 input.setAttribute('aria-describedby',id+'-error');wrap.appendChild(input);wrap.appendChild(el('p',{id:id+'-error',class:'error'}));parent.appendChild(wrap);return input;
}
Object.keys(labels).forEach(function(key){
 var panel=el('section',{class:'panel',id:'panel-'+key,'aria-label':labels[key][0]});panel.hidden=key!=='title';
 var head=el('div',{class:'section-head'}),description=el('div');description.appendChild(el('h2',{},labels[key][0]));description.appendChild(el('p',{},labels[key][1]));head.appendChild(description);
 var toggle=el('label',{class:'toggle'}),check=el('input',{type:'checkbox','data-key':key+'.enabled',id:key+'-enabled'});toggle.appendChild(check);toggle.appendChild(document.createTextNode('启用此部分'));head.appendChild(toggle);panel.appendChild(head);
 if(key==='signature'){
  var scope=el('div',{class:'signature-scope'}),count=field(scope,'signatureCount','文末落款段数（0＝无落款）','number');count.step='1';count.max='99';count.placeholder='0～99';
  count.setAttribute('aria-describedby','signatureCount-error signatureCount-help');
  var presets=el('div',{class:'signature-presets',role:'group','aria-label':'常用落款段数'});
  [0,1,2,3].forEach(function(n){presets.appendChild(el('button',{type:'button','data-signature-count':String(n),'aria-pressed':'false'},n===0?'无落款':n+' 段'));});
  scope.appendChild(presets);scope.appendChild(el('p',{id:'signatureCount-summary',class:'scope-summary',role:'status','aria-live':'polite'}));
  scope.appendChild(el('p',{id:'signatureCount-help',class:'hint'},'按回车形成的非空段落计数；自动换行和空行不计。'));panel.appendChild(scope);
 }
 if(key!=='page'){
  var commonNote=el('div',{class:'uniform-note',id:key+'-uniform-note',hidden:''});
  commonNote.appendChild(el('p',{},'全篇段落已启用：行距 1.5 倍，段前段后 0。'));
  commonNote.appendChild(el('button',{type:'button',class:'text-button','data-area':'paragraph'},'修改全篇段落'));panel.appendChild(commonNote);
 }
 var fields=el('fieldset',{class:'fields',id:key+'-fields'});fields.appendChild(el('legend',{class:'sr-only'},labels[key][0]+'格式'));panel.appendChild(fields);
 if(key!=='page'){
  field(fields,key+'.font','字体','text');field(fields,key+'.size','字号（磅）','number');
  field(fields,key+'.alignment','对齐方式','select',[['','保持原样'],['0','左对齐'],['1','居中'],['2','右对齐'],['3','两端对齐']]);
  field(fields,key+'.indent','首行缩进（字符）','number');
  field(fields,key+'.line.mode','行距','select',[['','保持原样'],['single','单倍'],['oneHalf','1.5 倍'],['double','双倍'],['multiple','多倍'],['exact','固定值'],['atLeast','最小值']]);
  field(fields,key+'.line.value','行距数值（多倍填倍数，其余填磅）','number');
  field(fields,key+'.before','段前间距（磅）','number');field(fields,key+'.after','段后间距（磅）','number');
 }else{
  field(fields,'page.paper','纸张大小','select',[['','保持原样'],['A4','A4'],['A3','A3'],['A5','A5'],['Letter','Letter'],['Legal','Legal']]);
  field(fields,'page.orientation','纸张方向','select',[['','保持原样'],['0','纵向'],['1','横向']]);
  [['top','上'],['bottom','下'],['left','左'],['right','右']].forEach(function(m){field(fields,'page.'+m[0],m[1]+'页边距（厘米）','number');});
 }
 if(key==='body')panel.appendChild(el('p',{class:'hint'},'标题后首个正文段以中文冒号结尾时不缩进；选“保持原样”时不改。'));
 panel.appendChild(el('p',{class:'hint'},key==='page'?'关闭后保留原有纸张和页边距。':'留空保留该项。关闭此部分保留字体、字号、对齐和首行缩进；全篇段落设置独立生效。'));
 document.getElementById('panels').appendChild(panel);
});
var paragraphPanel=el('section',{class:'panel',id:'panel-paragraph','aria-label':'全篇段落'});paragraphPanel.hidden=true;
paragraphPanel.appendChild(el('h2',{},'全篇段落'));
paragraphPanel.appendChild(el('p',{class:'replacement-note'},'仅处理正文区的标题、正文和落款。保留各部分的首行缩进规则。'));
var uniform=el('label',{class:'toggle paragraph-option'});
uniform.appendChild(el('input',{type:'checkbox','data-key':'paragraph.enabled',id:'paragraph-enabled'}));
uniform.appendChild(document.createTextNode('统一段落格式：左右缩进 0、段前段后 0、1.5 倍行距；关闭网格相关选项'));
paragraphPanel.appendChild(uniform);
var wrap=el('label',{class:'toggle paragraph-option'});
wrap.appendChild(el('input',{type:'checkbox','data-key':'paragraph.westernWrap',id:'paragraph-westernWrap'}));
wrap.appendChild(document.createTextNode('允许西文在单词中间换行'));
paragraphPanel.appendChild(wrap);
document.getElementById('panels').appendChild(paragraphPanel);
var furniturePanel=el('section',{class:'panel',id:'panel-furniture','aria-label':'页眉页脚'});furniturePanel.hidden=true;
furniturePanel.appendChild(el('h2',{},'页眉、页脚与页码'));
furniturePanel.appendChild(el('p',{class:'replacement-note'},'启用的部分将替换文档已有内容；关闭的部分保持原样。'));
[['header','页眉文字'],['footer','页脚文字'],['number','页码']].forEach(function(item){
 var key='furniture.'+item[0],section=el('section',{class:'decoration-section'}),head=el('div',{class:'section-head'}),toggle=el('label',{class:'toggle'});
 head.appendChild(el('h3',{},item[1]));toggle.appendChild(el('input',{type:'checkbox','data-key':key+'.enabled',id:'furniture-'+item[0]+'-enabled'}));toggle.appendChild(document.createTextNode('启用'));head.appendChild(toggle);section.appendChild(head);
 var fields=el('fieldset',{class:'fields',id:'furniture-'+item[0]+'-fields'});fields.appendChild(el('legend',{class:'sr-only'},item[1]));
 if(item[0]!=='number'){var t=field(fields,key+'.text','显示文字','text');t.maxLength=500;t.placeholder='留空表示清空此部分文字';t.parentNode.classList.add('full-width');}
 else{field(fields,key+'.format','页码样式','select',[['plain','1'],['page','第1页'],['total','第1页/共N页']]);field(fields,key+'.start','起始数字','number');}
 field(fields,key+'.font','字体','text');field(fields,key+'.size','字号（磅）','number');field(fields,key+'.alignment','对齐方式','select',[['0','左对齐'],['1','居中'],['2','右对齐']]);
 if(item[0]!=='number')field(fields,key+'.distance',item[0]==='header'?'距顶部（厘米）':'距底部（厘米）','number');
 var hide=el('label',{class:'toggle full-width'});hide.appendChild(el('input',{type:'checkbox','data-key':key+'.hideFirst',id:'furniture-'+item[0]+'-hideFirst'}));hide.appendChild(document.createTextNode('首页不显示'));fields.appendChild(hide);section.appendChild(fields);furniturePanel.appendChild(section);
});
furniturePanel.appendChild(el('p',{class:'hint'},'首页仍计入页数；从1开始时，第二页显示2。页脚文字与页码分两行，跨节连续编号。'));
document.getElementById('panels').appendChild(furniturePanel);
var icons={save:'<path d="m4 10 4 4 8-8"/>',newTemplate:'<path d="M10 3v14M3 10h14"/>',cancel:'<path d="m6 6 8 8m0-8-8 8"/>',confirmTemplate:'<path d="m4 10 4 4 8-8"/>',cancelTemplate:'<path d="m9 4-6 6 6 6m-6-6h14"/>'};
Object.keys(icons).forEach(function(id){var b=document.getElementById(id),icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 20 20');icon.setAttribute('aria-hidden','true');icon.setAttribute('class','button-icon');icon.innerHTML=icons[id];b.insertBefore(icon,b.firstChild);});
function access(obj,key,value,set){var parts=key.split('.'),last=parts.pop(),target=obj;parts.forEach(function(p){target=target[p];});if(set)target[last]=value;else return target[last];}
function message(text,failure){var n=document.getElementById('feedback');n.textContent=text;n.className=failure?'failure':'';}
function locked(value){busy=value;['save','newTemplate','confirmTemplate'].forEach(function(id){document.getElementById(id).disabled=value||!state;});document.querySelectorAll('#templateSelect button').forEach(function(n){n.disabled=value||!state;});}
function updateSignatureCount(){
 var input=document.getElementById('signatureCount'),value=Number(input.value),valid=input.value!==''&&!input.validity.badInput&&Number.isInteger(value)&&value>=0&&value<=99;
 document.querySelectorAll('[data-signature-count]').forEach(function(n){n.setAttribute('aria-pressed',String(valid&&Number(n.getAttribute('data-signature-count'))===value));});
 document.getElementById('signatureCount-summary').textContent=valid?(value===0?'已选：无落款':'已选：末尾 '+value+' 段'):'请输入 0～99 的整数';
}
function updateDisabled(){
 var common=document.getElementById('paragraph-enabled').checked;
 ['header','footer','number'].forEach(function(k){document.getElementById('furniture-'+k+'-fields').disabled=!document.getElementById('furniture-'+k+'-enabled').checked;});
 Object.keys(labels).forEach(function(key){
  document.getElementById(key+'-fields').disabled=!document.getElementById(key+'-enabled').checked;
  if(key!=='page'){
   var mode=document.getElementById(key+'-line-mode').value;
   document.getElementById(key+'-line-mode').disabled=common;
   document.getElementById(key+'-line-value').disabled=common||['multiple','exact','atLeast'].indexOf(mode)<0;
   document.getElementById(key+'-before').disabled=common;document.getElementById(key+'-after').disabled=common;
   document.getElementById(key+'-uniform-note').hidden=!common;
  }
 });updateSignatureCount();}
function show(stateValue){state=stateValue;var picker=document.getElementById('templateSelect');picker.textContent='';state.templates.forEach(function(t){picker.appendChild(el('button',{type:'button','data-template':t.id,'aria-pressed':String(t.id===state.activeTemplateID)},t.name));});document.querySelectorAll('[data-key]').forEach(function(n){var v=access(state.current,n.dataset.key);if(n.type==='checkbox')n.checked=v;else n.value=v===null?'':String(v);});var template=state.templates.filter(function(t){return t.id===state.activeTemplateID;})[0];document.getElementById('templateLabel').textContent=template.name+(JSON.stringify(template.config)!==JSON.stringify(state.current)?' · 已调整':'');updateDisabled();locked(false);}
function draft(){var config=FormatterConfig.defaults();document.querySelectorAll('[data-key]').forEach(function(n){var key=n.dataset.key,value=n.value;if(n.type==='checkbox')value=n.checked;else if(n.type==='number'&&n.validity.badInput)value=NaN;else if(value===''&&!key.endsWith('.text'))value=null;else if(n.type==='number'||key.endsWith('.alignment')||key==='page.orientation')value=Number(value);access(config,key,value,true);});return config;}
function validated(){var result=FormatterConfig.validate(draft());document.querySelectorAll('.error').forEach(function(n){n.textContent='';});document.querySelectorAll('[aria-invalid]').forEach(function(n){n.removeAttribute('aria-invalid');});Object.keys(result.errors).forEach(function(key){var id=key.replace(/\./g,'-'),n=document.getElementById(id),e=document.getElementById(id+'-error');if(n)n.setAttribute('aria-invalid','true');if(e)e.textContent=result.errors[key];});var keys=Object.keys(result.errors);if(keys.length){var area=keys[0]==='signatureCount'?'signature':keys[0].split('.')[0];var radio=document.querySelector('input[name=area][value='+area+']');if(radio){radio.checked=true;selectArea(area);}message('请修正标出的设置。',true);return null;}message('',false);return result.config;}
function selectArea(area){document.getElementById('panel-furniture').hidden=area!=='furniture';paragraphPanel.hidden=area!=='paragraph';Object.keys(labels).forEach(function(k){document.getElementById('panel-'+k).hidden=k!==area;});}
function api(path,data){
 var controller=new AbortController(),timer=setTimeout(function(){controller.abort();},8000);
 return fetch(path,{method:data===undefined?'GET':'POST',signal:controller.signal,headers:{'Content-Type':'application/json','X-Formatter-Token':token},body:data===undefined?undefined:JSON.stringify(data)}).then(function(r){return r.json().then(function(d){if(!r.ok||d.error){var e=new Error(r.status===403?'服务已更新，请关闭后重新打开设置。':d.error||'本地服务无法连接');e.knownResponse=true;throw e;}return d;});}).catch(function(e){if(!e.knownResponse){e=new Error('本地服务连接中断，请重新打开设置。');e.uncertain=data!==undefined;}throw e;}).finally(function(){clearTimeout(timer);});
}
function save(template){if(busy||!state)return;var config=validated();if(!config)return;var name=document.getElementById('templateName').value.trim();if(template&&(!name||name.length>40)){document.getElementById('nameError').textContent='请输入 1～40 个字符的模板名称。';return;}locked(true);api(template?'/templates':'/settings/save',{revision:state.revision,config:config,name:name}).then(function(next){show(next);document.getElementById('cancel').lastChild.textContent='关闭';document.getElementById('templateNaming').hidden=true;message(template?'模板已保存并选中。回到文档点击“一键排版”应用。':'设置已保存。回到文档点击“一键排版”应用。',false);}).catch(function(e){if(e.uncertain){state=null;message('保存结果暂时无法确认，请关闭并重新打开设置核对。',true);}else message('未保存：'+e.message,true);if(template)document.getElementById('nameError').textContent=e.message;}).then(function(){locked(false);});}
document.getElementById('templateSelect').onclick=function(event){
 var id=event.target.getAttribute('data-template');if(busy||!state||!id||id===state.activeTemplateID)return;locked(true);
 api('/templates/select',{revision:state.revision,id:id}).then(function(next){show(next);message('已载入模板。回到文档点击“一键排版”应用。',false);}).catch(function(e){if(e.uncertain)state=null;message(e.message,true);}).finally(function(){locked(false);});
};
document.getElementById('settingsForm').addEventListener('submit',function(e){e.preventDefault();save(false);});
document.getElementById('settingsForm').addEventListener('change',function(e){if(e.target.name==='area')selectArea(e.target.value);else updateDisabled();});
document.getElementById('signatureCount').addEventListener('input',updateSignatureCount);
document.querySelector('.signature-presets').onclick=function(event){var value=event.target.getAttribute('data-signature-count');if(value===null)return;document.getElementById('signatureCount').value=value;updateSignatureCount();};
document.querySelectorAll('[data-area]').forEach(function(n){n.onclick=function(){document.querySelector('input[name=area][value=paragraph]').checked=true;selectArea('paragraph');document.getElementById('paragraph-enabled').focus();};});
document.getElementById('newTemplate').onclick=function(){if(!validated())return;document.getElementById('templateNaming').hidden=false;document.getElementById('templateName').focus();};
document.getElementById('confirmTemplate').onclick=function(){save(true);};
document.getElementById('cancelTemplate').onclick=function(){document.getElementById('templateNaming').hidden=true;};
document.getElementById('cancel').onclick=function(){if(!busy)window.close();};
locked(true);
fetch('/session').then(function(r){return r.json();}).then(function(s){token=s.token;return api('/settings');}).then(function(s){show(s);return api('/fonts');}).then(function(data){var list=document.getElementById('fontOptions');(data.fonts||[]).forEach(function(font){list.appendChild(el('option',{value:font}));});}).catch(function(e){message('无法加载设置：'+e.message,true);locked(false);});
}());
