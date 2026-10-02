(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FormatterFurniture=api;}(typeof window!=='undefined'?window:this,function(){
'use strict';
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function body(xml){var m=String(xml).match(/<w:body[^>]*>([\s\S]*?)<\/w:body>/);if(!m)throw new Error('WPS 无法读取页眉页脚，未开始排版。');return m[1].replace(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g,'');}
function paragraphs(xml){var b=body(xml);if(/<w:(tbl|drawing|pict|object|sdt|hyperlink|altChunk)\b/.test(b))throw new Error('页眉页脚含表格、图片或复杂对象，暂不支持替换。');return b.match(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>|<w:p\s*\/>/g)||[];}
function text(s){return '<w:r><w:t xml:space="preserve">'+esc(s)+'</w:t></w:r>';}
function field(code){return '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> '+code+' </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>';}
function paragraph(c,isNumber,hidden){var content=hidden?'':isNumber?(c.format==='plain'?field('PAGE'):text('第')+field('PAGE')+text(c.format==='total'?'页/共':'页')+(c.format==='total'?field('NUMPAGES')+text('页'):'')):text(c.text);
 var props='<w:rPr>'+(c.font?'<w:rFonts w:ascii="'+esc(c.font)+'" w:hAnsi="'+esc(c.font)+'" w:eastAsia="'+esc(c.font)+'"/>':'')+'<w:sz w:val="'+c.size*2+'"/><w:szCs w:val="'+c.size*2+'"/></w:rPr>';
 content=content.replace(/<w:r>/g,'<w:r>'+props);
 return '<w:p><w:pPr><w:jc w:val="'+['left','center','right'][c.alignment]+'"/><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>'+props+'</w:pPr>'+content+'</w:p>';}
function packageXML(parts){return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><?mso-application progid="Word.Document"?><pkg:package xmlns:pkg="http://schemas.microsoft.com/office/2006/xmlPackage"><pkg:part pkg:name="/_rels/.rels" pkg:contentType="application/vnd.openxmlformats-package.relationships+xml"><pkg:xmlData><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships></pkg:xmlData></pkg:part><pkg:part pkg:name="/word/document.xml" pkg:contentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"><pkg:xmlData><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"><w:body>'+parts.join('')+'</w:body></w:document></pkg:xmlData></pkg:part></pkg:package>';}
function isNumber(p){return /<w:instrText\b[^>]*>\s*(?:PAGE|NUMPAGES)\b/.test(p);}
function split(xml){var p=paragraphs(xml),numbers=[],words=[];p.forEach(function(s){if(/<w:fldSimple\b/.test(s)||(/<w:pStyle\b/.test(s)&&/<w:t[ >]/.test(s)))throw new Error('页脚包含样式或简式域，无法安全拆分，请同时启用页脚和页码。');
 var fieldCodes=s.match(/<w:instrText\b[^>]*>[\s\S]*?<\/w:instrText>/g)||[];if(fieldCodes.some(function(x){return !/^\s*(PAGE|NUMPAGES)(\s+\\\*\s+MERGEFORMAT)?\s*$/.test(x.replace(/<[^>]+>/g,''));}))throw new Error('页脚包含其他域，无法单独替换，请同时启用页脚和页码。');
 if(isNumber(s)){
 var stripped=s.replace(/<w:instrText\b[^>]*>[\s\S]*?<\/w:instrText>/g,'').replace(/<[^>]+>/g,'');
 if(!/^[\s\d第页共/\-–—]*$/.test(stripped))throw new Error('页脚文字与页码混在同一段，无法单独保留。请同时启用页脚与页码，或先在 WPS 中分行。');numbers.push(s);
 }else words.push(s);});return {words:words,numbers:numbers};}
// Compare semantic content, not field results (which change with pagination).
function signature(xml){var p=paragraphs(xml);return p.map(function(s){
 var codes=[],inField=false,parts=[];var tokens=s.match(/<[^>]+>|[^<]+/g)||[];var capture='';
 tokens.forEach(function(t){if(/<w:fldChar\b[^>]*w:fldCharType="begin"/.test(t))inField=true;if(/<w:instrText\b/.test(t))capture='code';else if(/<w:t(?:\s|>)/.test(t))capture='text';else if(t[0]==='<')capture='';else if(capture==='code')codes.push(t.trim().replace(/\s+/g,' '));else if(capture==='text'&&!inField)parts.push(t);if(/<w:fldChar\b[^>]*w:fldCharType="end"/.test(t))inField=false;});
 var jc=(s.match(/<w:jc\b[^>]*w:val="([^"]+)"/)||[])[1]||'left';
 var sizes=(s.match(/<w:sz\b[^>]*w:val="([^"]+)"/)||[])[1]||'';
 var font=(s.match(/<w:rFonts\b[^>]*w:eastAsia="([^"]+)"/)||[])[1]||'';
 if(!parts.join('')&&!codes.length)return 'empty';
 return JSON.stringify([parts.join(''),codes,jc,sizes,font]);}).join('|');}
function truth(v){return v===true||v===-1||v===1;}
function empty(r){return !String(r.Text).trim()&&Number(r.Fields.Count)===0;}
function plan(doc,c){if(!c.header.enabled&&!c.footer.enabled&&!c.number.enabled)return {operations:[],properties:[]};
 var ops=[],props=[];
 function property(o,k,v){if(o[k]===undefined||o[k]===null)throw new Error('WPS 不支持页眉页脚属性：'+k);if(typeof v==='boolean'?truth(o[k])!==v:Math.abs(Number(o[k])-v)>.15)props.push({object:o,key:k,value:v});}
 for(var i=1;i<=doc.Sections.Count;i++){
 var s=doc.Sections.Item(i),ps=s.PageSetup;
 if(truth(ps.OddAndEvenPagesHeaderFooter))throw new Error('文档启用了奇偶页不同，请先在 WPS 中统一后再排版。');
 var first=truth(ps.DifferentFirstPageHeaderFooter),wantFirst=i===1&&(c.header.enabled&&c.header.hideFirst||c.footer.enabled&&c.footer.hideFirst||c.number.enabled&&c.number.hideFirst);
 // Keep existing first-page variants when disabled components may depend on them.
 var newFirst=first||wantFirst;
 if(!first&&newFirst){
 if(!c.header.enabled&&!empty(s.Headers.Item(1).Range))throw new Error('首页设置会影响未启用的已有页眉，请同时启用页眉或保留首页显示。');
 if((!c.footer.enabled||!c.number.enabled)&&!empty(s.Footers.Item(1).Range))throw new Error('首页设置会影响未启用的已有页脚，请同时启用页脚和页码或保留首页显示。');
 property(ps,'DifferentFirstPageHeaderFooter',true);
 }
 ['header','footer'].forEach(function(kind){var isHeader=kind==='header',setting=c[kind],active=isHeader?setting.enabled:setting.enabled||c.number.enabled;if(!active)return;
 if(setting.enabled)property(ps,isHeader?'HeaderDistance':'FooterDistance',setting.distance*72/2.54);
 [1,2].forEach(function(variant){if(variant===2&&!newFirst)return;var h=(isHeader?s.Headers:s.Footers).Item(variant),r=h.Range;
 if(typeof r.InsertXML!=='function')throw new Error('此 WPS 不支持页眉页脚写入。');
 var old=String(r.WordOpenXML),pieces=[],hide=i===1&&variant===2;
 var effective=Object.assign({},setting),number=Object.assign({},c.number);
 var originalFont=String(r.Font.NameFarEast||r.Font.Name||'');if(!effective.font)effective.font=originalFont||null;if(!number.font)number.font=originalFont||null;
 if(isHeader){paragraphs(old);pieces=[paragraph(effective,false,hide&&setting.hideFirst)];}
 else {var preserved=c.footer.enabled&&c.number.enabled?{words:[],numbers:[]}:split(old);paragraphs(old);
 pieces=(setting.enabled?[paragraph(effective,false,hide&&setting.hideFirst)]:preserved.words).concat(c.number.enabled?[paragraph(number,true,hide&&c.number.hideFirst)]:preserved.numbers);
 }
 var xml=packageXML(pieces.length?pieces:['<w:p/>']);
 if(signature(old)!==signature(xml))ops.push({header:h,xml:xml,signature:signature(xml),label:'第 '+i+' 节'+(isHeader?'页眉':'页脚')});
 });
 });
 if(c.number.enabled){var nums=s.Footers.Item(1).PageNumbers;property(nums,'NumberStyle',0);property(nums,'RestartNumberingAtSection',i===1);if(i===1)property(nums,'StartingNumber',c.number.start);}
 }
 return {operations:ops,properties:props};
}
function apply(plan,onWrite){plan.properties.forEach(function(p){onWrite();p.object[p.key]=p.value;});plan.operations.forEach(function(op){onWrite();op.header.LinkToPrevious=false;op.header.Range.InsertXML(op.xml);
 var all=op.header.Range,ps=all.Paragraphs,expected=paragraphs(op.xml).length;
 if(ps.Count===expected+1&&String(ps.Item(ps.Count).Range.Text)==='\r'){var last=ps.Item(ps.Count-1).Range.Duplicate;last.SetRange(last.End-1,last.End);last.Delete();}
 op.header.Range.Fields.Update();});}
function verify(plan){plan.properties.forEach(function(p){if(typeof p.value==='boolean'?truth(p.object[p.key])!==p.value:Math.abs(Number(p.object[p.key])-p.value)>.15)throw new Error('页眉页脚属性回读失败：'+p.key);});plan.operations.forEach(function(op){if(signature(op.header.Range.WordOpenXML)!==op.signature)throw new Error(op.label+'回读校验失败。');});}
return {plan:plan,apply:apply,verify:verify,signature:signature,paragraph:paragraph,packageXML:packageXML,split:split};
}));
