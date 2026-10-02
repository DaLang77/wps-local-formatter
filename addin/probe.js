/* Local read-only capability probe. No document text is sent or changed. */
function application() {
  if (typeof wps !== 'undefined' && typeof wps.WpsApplication === 'function') return wps.WpsApplication();
  return window.Application;
}
function attempt(fn) { try { return fn(); } catch (e) { return {error: String(e.message || e)}; } }
function ProbeConnection() {
  var app = application();
  var d = app && attempt(function() { return app.ActiveDocument; });
  var result = {time: new Date().toISOString(), api: !!app, build: attempt(function() { return app.Build; }), document: !!d};
  if (d) {
    result.paragraphs = attempt(function() { return d.Paragraphs.Count; });
    result.tables = attempt(function() { return d.Tables.Count; });
    result.readOnly = attempt(function() { return d.ReadOnly; });
    result.protection = attempt(function() { return d.ProtectionType; });
    result.storyType = attempt(function() { return d.Content.StoryType; });
    result.docID = attempt(function() { return d.DocID; });
    result.undoRecord = attempt(function() { return !!app.UndoRecord; });
    result.fonts = attempt(function() {
      var out=[]; var fs=app.FontNames;
      for(var i=1;i<=fs.Count;i++){var name=String(fs.Item(i));if(/仿宋|中宋|fangsong|zhongsong/i.test(name))out.push(name);}
      return out;
    });
    result.ranges = attempt(function() {
      var out=[];
      for(var i=1;i<=d.Paragraphs.Count;i++) {
        var r=d.Paragraphs.Item(i).Range;
        out.push({start:r.Start,end:r.End,story:r.StoryType,table:attempt(function(){return r.Information(12);}),
          font:attempt(function(){return r.Font.NameFarEast;}),size:r.Font.Size});
      }
      return out;
    });
  }
  var xhr = new XMLHttpRequest(); xhr.open('POST','/event',true);xhr.setRequestHeader('Content-Type','application/json');xhr.send(JSON.stringify(result));
  return true;
}
function OnAddinLoad() { setTimeout(ProbeConnection,1500); return true; }
