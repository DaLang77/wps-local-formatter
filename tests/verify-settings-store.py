"""Exercise the production Swift store against an isolated temporary directory."""
from pathlib import Path
import subprocess,tempfile
root=Path(__file__).resolve().parents[1]
source=(root/'Sources/FormatterApp.swift').read_text()
store=source[source.index('final class SettingsStore {'):source.index('final class FormatterDelegate:')]
test=r'''
let dir=URL(fileURLWithPath:CommandLine.arguments[1])
let js=URL(fileURLWithPath:CommandLine.arguments[2])
let file=dir.appendingPathComponent("settings.json")
let store=SettingsStore(fileURL:file,configURL:js)
func rejected(_ label:String,_ action:()throws->Void){do{try action();fatalError("unexpected success: "+label)}catch{print("PASS: "+label)}}
let initial=try store.load()
assert(initial["revision"] as? Int==0)
var config=initial["current"] as! [String:Any]
var furniture=config["furniture"] as! [String:Any]
var header=furniture["header"] as! [String:Any]
header["enabled"]=true;header["text"]="测试页眉"
furniture["header"]=header;config["furniture"]=furniture
let saved=try store.mutate("/templates",["revision":0,"config":config,"name":"测试模板"])
assert((saved["templates"] as! [[String:Any]]).count==2)
let data=try Data(contentsOf:file)
rejected("duplicate template preserves file"){_ = try store.mutate("/templates",["revision":1,"config":config,"name":"测试模板"])}
assert(try Data(contentsOf:file)==data)
rejected("stale settings rejected"){_ = try store.mutate("/settings/save",["revision":0,"config":config])}
rejected("invalid config rejected"){_ = try store.mutate("/settings/save",["revision":1,"config":["version":99]])}
let reopened=try SettingsStore(fileURL:file,configURL:js).load()
assert(reopened["activeTemplateID"] as? String==saved["activeTemplateID"] as? String)
let loadedCurrent=reopened["current"] as! [String:Any]
let loadedFurniture=loadedCurrent["furniture"] as! [String:Any]
assert((loadedFurniture["header"] as! [String:Any])["text"] as? String=="测试页眉")
print("PASS furniture settings persist in templates")
let selected=try store.mutate("/templates/select",["revision":1,"id":"builtin"])
assert(selected["activeTemplateID"] as? String=="builtin")
print("PASS: template creation, persistence and selection")
try Data("not json".utf8).write(to:file)
rejected("corrupt state retained"){_ = try store.load()}
assert(try String(contentsOf:file)=="not json")
let obstruction=dir.appendingPathComponent("file-parent")
try Data().write(to:obstruction)
let failing=SettingsStore(fileURL:obstruction.appendingPathComponent("settings.json"),configURL:js)
rejected("write failure is reported"){_ = try failing.mutate("/settings/save",["revision":0,"config":config])}
'''
# Swift assert autoclosures cannot throw.
test=test.replace('assert(try Data(contentsOf:file)==data)','let unchanged=try Data(contentsOf:file);assert(unchanged==data)').replace('assert(try String(contentsOf:file)=="not json")','let corrupt=try String(contentsOf:file,encoding:.utf8);assert(corrupt=="not json")')
with tempfile.TemporaryDirectory(prefix='wps-store-test-') as d:
    script=Path(d)/'main.swift'
    script.write_text('import Foundation\nimport JavaScriptCore\n'+store+test)
    subprocess.run(['swift',str(script),d,str(root/'addin/config.js')],check=True)
