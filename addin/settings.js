(function(){
'use strict';
var state=null,token='',busy=false,templateDraft=null,importPayload=null;
var labels={title:['标题','按识别规则判断，可在文档结构中纠正'],body:['正文','普通正文段落'],addressee:['称谓','可在文档结构中指定称谓段落'],signature:['落款','文末指定数量的非空普通段落'],page:['页面','应用到文档的每一节；选区排版时停用']};
var headingLevel=0;
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
 if(key!=='page')panel.appendChild(el('button',{type:'button',class:'capture-action','data-capture':key},'从当前段落提取格式'));
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
 panel.appendChild(el('p',{class:'hint'},key==='page'?'关闭后保留原有纸张和页边距。选区模式下页面、页眉页脚和页码均不修改。':'留空保留该项。关闭此部分保留字体、字号、对齐和首行缩进；全篇段落设置独立生效。'));
 document.getElementById('panels').appendChild(panel);
});
var paragraphPanel=el('section',{class:'panel',id:'panel-paragraph','aria-label':'全篇段落'});paragraphPanel.hidden=true;
paragraphPanel.appendChild(el('h2',{},'全篇段落'));
paragraphPanel.appendChild(el('p',{class:'replacement-note'},'仅处理本次范围内的普通段落。“保持原样”的段落完全跳过；各角色的首行缩进规则仍生效。'));
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
var headingsPanel=el('section',{class:'panel',id:'panel-headings','aria-label':'多级标题'});headingsPanel.hidden=true;
headingsPanel.appendChild(el('h2',{},'多级标题'));headingsPanel.appendChild(el('p',{},'分别设置一级至九级标题，不替换原有 WPS 样式。'));
var levelPicker=el('div',{class:'heading-picker'});levelPicker.appendChild(el('label',{for:'headingLevel'},'标题级别'));var levelSelect=el('select',{id:'headingLevel'});
for(var level=0;level<9;level++)levelSelect.appendChild(el('option',{value:String(level)},(level+1)+' 级标题'));levelPicker.appendChild(levelSelect);headingsPanel.appendChild(levelPicker);
for(var i=0;i<9;i++){
 var group=el('section',{class:'heading-fields',id:'heading-group-'+i});group.hidden=i!==0;var key='headings.'+i;
 var toggle=el('label',{class:'toggle'});toggle.appendChild(el('input',{type:'checkbox','data-key':key+'.enabled',id:'headings-'+i+'-enabled'}));toggle.appendChild(document.createTextNode('启用 '+(i+1)+' 级标题格式'));group.appendChild(toggle);
 group.appendChild(el('button',{type:'button',class:'capture-action','data-capture':'heading'+(i+1)},'从当前段落提取格式'));
 var note=el('div',{class:'uniform-note',id:'headings-'+i+'-uniform-note',hidden:''});note.appendChild(el('p',{},'全篇段落已启用：提取或填写的行距、段前段后将被覆盖。'));group.appendChild(note);
 var fields=el('fieldset',{class:'fields',id:'headings-'+i+'-fields'});fields.appendChild(el('legend',{class:'sr-only'},(i+1)+'级标题格式'));
 field(fields,key+'.font','字体','text');field(fields,key+'.size','字号（磅）','number');field(fields,key+'.alignment','对齐方式','select',[['','保持原样'],['0','左对齐'],['1','居中'],['2','右对齐'],['3','两端对齐']]);field(fields,key+'.indent','首行缩进（字符）','number');
 field(fields,key+'.line.mode','行距','select',[['','保持原样'],['single','单倍'],['oneHalf','1.5 倍'],['double','双倍'],['multiple','多倍'],['exact','固定值'],['atLeast','最小值']]);field(fields,key+'.line.value','行距数值（多倍填倍数，其余填磅）','number');field(fields,key+'.before','段前间距（磅）','number');field(fields,key+'.after','段后间距（磅）','number');group.appendChild(fields);headingsPanel.appendChild(group);
}
headingsPanel.appendChild(el('p',{class:'hint'},'已有样式和大纲层级优先识别；未识别段落回退到首尾规则。可在“文档结构”中人工纠正。'));document.getElementById('panels').appendChild(headingsPanel);
function setHeadingLevel(value){headingLevel=Math.max(0,Math.min(8,value));levelSelect.value=String(headingLevel);document.querySelectorAll('.heading-fields').forEach(function(n,i){n.hidden=i!==headingLevel;});}
levelSelect.onchange=function(){setHeadingLevel(Number(this.value));};
var rulesPanel=el('section',{class:'panel',id:'panel-rules','aria-label':'识别与分页'});rulesPanel.hidden=true;rulesPanel.appendChild(el('h2',{},'识别与分页'));
var rulesFields=el('div',{class:'fields'});field(rulesFields,'recognition','段落识别方式','select',[['position','沿用首尾判断'],['styles','优先样式和大纲层级']]);rulesPanel.appendChild(rulesFields);
var listToggle=el('label',{class:'toggle paragraph-option'});listToggle.appendChild(el('input',{type:'checkbox','data-key':'lists.protect',id:'lists-protect'}));listToggle.appendChild(document.createTextNode('保留列表编号、级别、重启规则和悬挂缩进'));rulesPanel.appendChild(listToggle);
var paginationFields=el('div',{class:'fields pagination-fields'});
[['headingFollow','标题跟随下一段'],['keepTogether','段内尽量不分页'],['bodyWidow','正文孤行控制'],['signatureTogether','连续落款尽量同页']].forEach(function(item){field(paginationFields,'pagination.'+item[0],item[1],'select',[['','保持原样'],['true','启用'],['false','关闭']]);});rulesPanel.appendChild(paginationFields);
rulesPanel.appendChild(el('p',{class:'hint'},'遇表格、手动分页、分节或“保持原样”的段落即停止分页链接。超过一页的长段或落款可能仍会跨页，不额外插入空行或分页符。'));document.getElementById('panels').appendChild(rulesPanel);
var icons={save:'<path d="m4 10 4 4 8-8"/>',newTemplate:'<path d="M10 3v14M3 10h14"/>',cancel:'<path d="m6 6 8 8m0-8-8 8"/>',confirmTemplate:'<path d="m4 10 4 4 8-8"/>',cancelTemplate:'<path d="m9 4-6 6 6 6m-6-6h14"/>'};
Object.keys(icons).forEach(function(id){var b=document.getElementById(id),icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 20 20');icon.setAttribute('aria-hidden','true');icon.setAttribute('class','button-icon');icon.innerHTML=icons[id];b.insertBefore(icon,b.firstChild);});
function access(obj,key,value,set){var parts=key.split('.'),last=parts.pop(),target=obj;parts.forEach(function(p){if(target&&target[p]!==undefined)target=target[p];else if(set){target[p]={};target=target[p];}else target=undefined;});if(set)target[last]=value;else return target&&target[last];}
function message(text,failure){var n=document.getElementById('feedback');n.textContent=text;n.className=failure?'failure':'';}
function locked(value){busy=value;['save','newTemplate','duplicateTemplate','confirmTemplate','exportTemplate','importTemplate'].forEach(function(id){document.getElementById(id).disabled=value||!state||(id==='save'&&templateDraft!==null);});document.querySelectorAll('[data-capture]').forEach(function(n){n.disabled=value||!state;});document.querySelectorAll('#templateSelect button').forEach(function(n){n.disabled=value||!state;});}
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
 });for(var i=0;i<9;i++){var prefix='headings-'+i;document.getElementById(prefix+'-fields').disabled=!document.getElementById(prefix+'-enabled').checked;var mode=document.getElementById(prefix+'-line-mode').value;document.getElementById(prefix+'-line-mode').disabled=common;document.getElementById(prefix+'-line-value').disabled=common||['multiple','exact','atLeast'].indexOf(mode)<0;document.getElementById(prefix+'-before').disabled=common;document.getElementById(prefix+'-after').disabled=common;document.getElementById(prefix+'-uniform-note').hidden=!common;}updateSignatureCount();}
function fill(config){document.querySelectorAll('[data-key]').forEach(function(n){var v=access(config,n.dataset.key);if(n.type==='checkbox')n.checked=v===true;else if(v===null||v===undefined)n.value='';else n.value=String(v);});updateDisabled();}
function show(stateValue){state=stateValue;var picker=document.getElementById('templateSelect');picker.textContent='';state.templates.forEach(function(t){picker.appendChild(el('button',{type:'button','data-template':t.id,'aria-pressed':String(t.id===state.activeTemplateID)},t.name));});fill(FormatterConfig.normalize(state.current));var template=state.templates.filter(function(t){return t.id===state.activeTemplateID;})[0];document.getElementById('templateLabel').textContent=template.name+(JSON.stringify(template.config)!==JSON.stringify(state.current)?' · 已调整':'');updateDisabled();locked(false);}
function draft(){var config=FormatterConfig.normalize(state.current);document.querySelectorAll('[data-key]').forEach(function(n){var key=n.dataset.key,value=n.value;if(n.type==='checkbox')value=n.checked;else if(n.type==='number'&&n.validity.badInput)value=NaN;else if(value===''&&!key.endsWith('.text'))value=null;else if(key.indexOf('pagination.')===0)value=value==='true';else if(n.type==='number'||key.endsWith('.alignment')||key==='page.orientation')value=Number(value);access(config,key,value,true);});return config;}
function validated(){var result=FormatterConfig.validate(draft());document.querySelectorAll('.error').forEach(function(n){n.textContent='';});document.querySelectorAll('[aria-invalid]').forEach(function(n){n.removeAttribute('aria-invalid');});Object.keys(result.errors).forEach(function(key){var id=key.replace(/\./g,'-'),n=document.getElementById(id),e=document.getElementById(id+'-error');if(n)n.setAttribute('aria-invalid','true');if(e)e.textContent=result.errors[key];});var keys=Object.keys(result.errors);if(keys.length){var area=keys[0]==='signatureCount'?'signature':keys[0].split('.')[0];if(area==='pagination'||area==='recognition'||area==='lists')area='rules';if(area==='headings')setHeadingLevel(Number(keys[0].split('.')[1])||0);var radio=document.querySelector('input[name=area][value='+area+']');if(radio){radio.checked=true;selectArea(area);}message('请修正标出的设置。',true);return null;}message('',false);return result.config;}
function selectArea(area){document.querySelectorAll('#panels>.panel').forEach(function(n){n.hidden=n.id!=='panel-'+area;});}
function api(path,data){
 var controller=new AbortController(),timer=setTimeout(function(){controller.abort();},8000);
 return fetch(path,{method:data===undefined?'GET':'POST',signal:controller.signal,headers:{'Content-Type':'application/json','X-Formatter-Token':token},body:data===undefined?undefined:JSON.stringify(data)}).then(function(r){return r.json().then(function(d){if(!r.ok||d.error){var e=new Error(r.status===403?'服务已更新，请关闭后重新打开设置。':d.error||'本地服务无法连接');e.knownResponse=true;throw e;}return d;});}).catch(function(e){if(!e.knownResponse){e=new Error('本地服务连接中断，请重新打开设置。');e.uncertain=data!==undefined;}throw e;}).finally(function(){clearTimeout(timer);});
}
function save(template){if(busy||!state)return;var config=validated();if(!config)return;var name=document.getElementById('templateName').value.trim();if(template&&(!name||name.length>40)){document.getElementById('nameError').textContent='请输入 1～40 个字符的模板名称。';return;}locked(true);api(template?'/templates':'/settings/save',{revision:state.revision,config:config,name:name}).then(function(next){templateDraft=null;show(next);document.getElementById('templateNaming').hidden=true;message(template?'模板已保存并选中。回到文档点击“一键排版”应用。':'设置已保存。回到文档点击“一键排版”应用。',false);}).catch(function(e){if(e.uncertain){state=null;message('保存结果暂时无法确认，请关闭并重新打开设置核对。',true);}else message('未保存：'+e.message,true);if(template)document.getElementById('nameError').textContent=e.message;}).then(function(){locked(false);});}
document.getElementById('templateSelect').onclick=function(event){
 var id=event.target.getAttribute('data-template');if(busy||!state||!id||id===state.activeTemplateID)return;templateDraft=null;document.getElementById('templateNaming').hidden=true;locked(true);
 api('/templates/select',{revision:state.revision,id:id}).then(function(next){show(next);message('已载入模板。回到文档点击“一键排版”应用。',false);}).catch(function(e){if(e.uncertain)state=null;message(e.message,true);}).finally(function(){locked(false);});
};
document.getElementById('settingsForm').addEventListener('submit',function(e){e.preventDefault();save(false);});
document.getElementById('settingsForm').addEventListener('change',function(e){if(e.target.name==='area')selectArea(e.target.value);else updateDisabled();});
document.getElementById('signatureCount').addEventListener('input',updateSignatureCount);
document.querySelector('.signature-presets').onclick=function(event){var value=event.target.getAttribute('data-signature-count');if(value===null)return;document.getElementById('signatureCount').value=value;updateSignatureCount();};
document.querySelectorAll('[data-area]').forEach(function(n){n.onclick=function(){document.querySelector('input[name=area][value=paragraph]').checked=true;selectArea('paragraph');document.getElementById('paragraph-enabled').focus();};});
document.getElementById('duplicateTemplate').onclick=function(){if(!validated())return;templateDraft='copy';document.getElementById('templateNaming').hidden=false;document.getElementById('templateName').value='';locked(false);document.getElementById('templateName').focus();};
document.getElementById('newTemplate').onclick=function(){templateDraft=JSON.parse(JSON.stringify(draft()));fill(FormatterConfig.modernDefaults());document.getElementById('templateNaming').hidden=false;document.getElementById('templateName').value='';locked(false);document.getElementById('templateName').focus();message('新模板使用样式识别，并保留列表编号。填写名称后保存。',false);};
document.getElementById('confirmTemplate').onclick=function(){save(true);};
document.getElementById('cancelTemplate').onclick=function(){if(templateDraft&&typeof templateDraft==='object')fill(templateDraft);templateDraft=null;document.getElementById('templateNaming').hidden=true;locked(false);message('',false);};
document.getElementById('cancel').onclick=function(){if(!busy)window.close();};
function command(payload){
 return api('/environment').then(function(environment){var status=environment.wps||environment.status||{};if(!status.docID)throw new Error('请先在 WPS 中打开需要操作的文档。');payload.docID=String(status.docID);return api('/request',payload);}).then(function(request){if(!request.id)throw new Error('请求未取得编号，请重新打开设置。');var end=Date.now()+30000;
  function poll(){return api('/state').then(function(snapshot){var result=snapshot.result||{};if(String(result.id)===String(request.id)){if(result.ok===false)throw new Error(result.message||result.error||'WPS 未完成请求。');return result;}if(Date.now()>end)throw new Error('等待 WPS 超时。请在 WPS 内重新打开插件并重试。');return new Promise(function(resolve){setTimeout(resolve,400);}).then(poll);});}return poll();
 });
}
document.querySelectorAll('[data-capture]').forEach(function(button){button.onclick=function(){if(busy||!state)return;var role=button.dataset.capture;locked(true);message('正在读取 WPS 当前段落…',false);command({op:'extract',role:role}).then(function(result){var data=result.extracted||{},format=data.format;if(!format)throw new Error('WPS 未返回可提取的段落格式。');var config=draft(),key=role.indexOf('heading')===0?'headings.'+(Number(role.slice(7))-1):role;['font','size','alignment','indent','line','before','after'].forEach(function(property){if(Object.prototype.hasOwnProperty.call(format,property))access(config,key+'.'+property,format[property],true);});fill(config);var warnings=data.warnings||[];message('格式已填入草稿，尚未保存。'+(config.paragraph.enabled?' 全篇段落仍会覆盖行距和段距。':'')+(warnings.length?' '+warnings.join('；'):''),false);}).catch(function(error){message('未提取：'+error.message,true);}).finally(function(){locked(false);});};});
function shareMessage(text,failure){var n=document.getElementById('shareStatus');n.textContent=text;n.className=failure?'error':'hint';}
document.getElementById('exportTemplate').onclick=function(){if(busy||!state)return;locked(true);shareMessage('正在准备模板…',false);api('/templates/export',{id:state.activeTemplateID,includeFurniture:document.getElementById('includeFurniture').checked}).then(function(payload){payload=payload.payload||payload;var blob=new Blob([JSON.stringify(payload,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=el('a',{href:url,download:(payload.name||'排版模板').replace(/[\/\\:\x00-\x1f]/g,'-')+'.json'});document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},2000);shareMessage('已导出保存的模板。'+(document.getElementById('includeFurniture').checked?'文件包含页眉页脚文字，请确认可以分享。':'页眉页脚文字已移除，并关闭对应开关。'),false);}).catch(function(error){shareMessage('未导出：'+error.message,true);}).finally(function(){locked(false);});};
document.getElementById('importFile').onchange=function(){var file=this.files&&this.files[0];if(!file)return;importPayload=null;document.getElementById('importDraft').hidden=true;document.getElementById('importError').textContent='';if(file.size>262144){shareMessage('模板文件过大，请选择小于 256 KB 的单模板 JSON。',true);this.value='';return;}file.text().then(function(text){var payload=JSON.parse(text);if(!payload||payload.format!=='wps-local-formatter-template'||payload.fileVersion!==1||typeof payload.name!=='string')throw new Error('请选择 WPS 一键排版导出的单模板文件。');FormatterConfig.normalize(payload.config);importPayload=payload;document.getElementById('importName').value=payload.name;document.getElementById('importDraft').hidden=false;document.getElementById('importName').focus();shareMessage('已读取模板。确认名称后点击“追加模板”。',false);}).catch(function(error){shareMessage('无法读取模板：'+error.message,true);});};
document.getElementById('importTemplate').onclick=function(){if(busy||!state||!importPayload)return;var name=document.getElementById('importName').value.trim(),error=document.getElementById('importError');error.textContent='';if(!name||name.length>40||/[\x00-\x1f]/.test(name)){error.textContent='请输入 1～40 个字符的模板名称。';return;}if(state.templates.some(function(t){return t.name===name;})){error.textContent='已有同名模板，请更换名称。';document.getElementById('importName').focus();return;}var preserved=draft();locked(true);api('/templates/import',{revision:state.revision,payload:importPayload,name:name}).then(function(next){show(next);fill(preserved);importPayload=null;document.getElementById('importDraft').hidden=true;document.getElementById('importFile').value='';shareMessage('模板已追加。当前模板与排版草稿保持原有选择，未执行排版。',false);}).catch(function(e){if(e.uncertain){state=null;shareMessage('导入结果暂时无法确认，请重新打开设置核对。',true);}else error.textContent=e.message;}).finally(function(){locked(false);});};
document.getElementById('cancelImport').onclick=function(){importPayload=null;document.getElementById('importDraft').hidden=true;document.getElementById('importFile').value='';shareMessage('',false);};
locked(true);
fetch('/session').then(function(r){return r.json();}).then(function(s){token=s.token;return api('/settings');}).then(function(s){show(s);return api('/fonts');}).then(function(data){var list=document.getElementById('fontOptions');(data.fonts||[]).forEach(function(font){list.appendChild(el('option',{value:font}));});}).catch(function(e){message('无法加载设置：'+e.message,true);locked(false);});
}());
