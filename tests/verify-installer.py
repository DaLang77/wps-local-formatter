"""Exercise the native transaction in an isolated filesystem with injected OS calls."""
from pathlib import Path
import tempfile,subprocess
root=Path(__file__).resolve().parents[1]
test=r'''
let root=URL(fileURLWithPath:CommandLine.arguments[1])
let fm=FileManager.default
let source=root.appendingPathComponent("Source.app")
try fm.createDirectory(at:source,withIntermediateDirectories:true)
try Data("new".utf8).write(to:source.appendingPathComponent("version"))
var loaded=false,failHealth=false
let installer=FormatterInstaller(home:root.appendingPathComponent("user"),source:source,run:{ executable,args in
 if executable.hasSuffix("launchctl") {if args[0]=="print" {return loaded ? 0:113};if args[0]=="bootstrap" {loaded=true};if args[0]=="bootout" {loaded=false}}
 return 0
},health:{_ in if failHealth {throw FormatterInstaller.failure("injected health failure")}})
try installer.write(Data("<jsplugins><jspluginonline name=\"other-plugin\" url=\"http://example.invalid/\"/></jsplugins>".utf8),installer.registration)
let settings=installer.base.appendingPathComponent("settings.json")
try installer.write(Data("personal templates".utf8),settings)
try installer.install();assert(loaded)
assert(fm.fileExists(atPath:installer.agent.path))
let first=try Data(contentsOf:installer.registration)
assert(String(data:first,encoding:.utf8)!.contains("other-plugin"))
try installer.install();assert(loaded)
let xml=try XMLDocument(data:Data(contentsOf:installer.registration));assert(try xml.nodes(forXPath:"//jspluginonline[@name='local-wps-formatter']").count==1)
print("PASS fresh install, repeated update, other registration preserved")
let old=try Data(contentsOf:installer.installed.appendingPathComponent("version"))
try Data("changed".utf8).write(to:source.appendingPathComponent("version"))
let beforeFailure=try Data(contentsOf:installer.registration)
failHealth=true
do {try installer.install();fatalError("expected failure")}catch{}
assert(loaded)
let restored=try Data(contentsOf:installer.installed.appendingPathComponent("version"));assert(restored==old)
let registration=try Data(contentsOf:installer.registration);assert(registration==beforeFailure)
print("PASS failed update restores app, registration, launch agent")
try installer.uninstall();assert(!loaded);assert(!fm.fileExists(atPath:installer.agent.path))
let kept=try String(contentsOf:settings,encoding:.utf8);assert(kept=="personal templates")
let remaining=try String(contentsOf:installer.registration,encoding:.utf8);assert(remaining.contains("other-plugin"));assert(!remaining.contains("local-wps-formatter"))
try installer.uninstall()
print("PASS uninstall, repeated uninstall, settings retained")
failHealth=false
try installer.install();assert(loaded)
try installer.write(Data("broken XML".utf8),installer.registration)
do {try installer.install();fatalError("expected malformed XML failure")}catch{}
assert(loaded)
print("PASS invalid registration rejected before stopping service")
'''.replace('assert(try xml.nodes(forXPath:"//jspluginonline[@name=\'local-wps-formatter\']").count==1)','let nodes=try xml.nodes(forXPath:"//jspluginonline[@name=\'local-wps-formatter\']");assert(nodes.count==1)')
with tempfile.TemporaryDirectory(prefix='wps-installer-test-') as d:
 p=Path(d)/'main.swift';p.write_text((root/'Sources/Installer.swift').read_text()+test)
 subprocess.run(['swift',str(p),d],check=True)
