import AppKit
import Foundation

/// Per-user install transaction. The settings directory is never removed.
final class FormatterInstaller {
    let fm = FileManager.default
    let home: URL
    let source: URL
    let run: (String,[String]) throws -> Int32
    let health: (URL) throws -> Void
    var base: URL { home.appendingPathComponent("Library/Application Support/WPSLocalFormatter") }
    var installed: URL { base.appendingPathComponent("WPS一键排版.app") }
    var agent: URL { home.appendingPathComponent("Library/LaunchAgents/local.wps.formatter.background.plist") }
    var registration: URL { home.appendingPathComponent("Library/Containers/com.kingsoft.wpsoffice.mac/Data/.kingsoft/wps/jsaddons/publish.xml") }
    var domain: String { "gui/\(getuid())" }
    let label = "local.wps.formatter.background"
    init(home: URL = FileManager.default.homeDirectoryForCurrentUser, source: URL = Bundle.main.bundleURL,
         run: @escaping (String,[String]) throws -> Int32 = FormatterInstaller.process,
         health: @escaping (URL) throws -> Void = FormatterInstaller.checkHealth) {
        self.home=home; self.source=source; self.run=run; self.health=health
    }
    static func failure(_ text: String) -> NSError { NSError(domain:"FormatterInstaller",code:1,userInfo:[NSLocalizedDescriptionKey:text]) }
    static func process(_ executable:String,_ args:[String]) throws -> Int32 {
        let p=Process();p.executableURL=URL(fileURLWithPath:executable);p.arguments=args
        p.standardOutput=FileHandle.nullDevice;p.standardError=FileHandle.nullDevice
        try p.run();p.waitUntilExit();return p.terminationStatus
    }
    static func checkHealth(_ source:URL) throws {
        for file in ["build-id","ribbon.xml","config.js","furniture.js"] {
            let expected=try Data(contentsOf:source.appendingPathComponent(file == "build-id" ? "Contents/Resources/build-id" : "Contents/Resources/addin/"+file))
            var valid=false
            for _ in 0..<20 {
                let signal=DispatchSemaphore(value:0)
                var actual:Data?
                var request=URLRequest(url:URL(string:"http://127.0.0.1:38941/"+file)!);request.timeoutInterval=1;request.cachePolicy = .reloadIgnoringLocalCacheData
                let task=URLSession.shared.dataTask(with:request){ data,response,_ in
                    if (response as? HTTPURLResponse)?.statusCode==200 { actual=data };signal.signal()
                };task.resume();_ = signal.wait(timeout:.now()+2)
                if actual==expected {valid=true;break};Thread.sleep(forTimeInterval:0.25)
            }
            if !valid {throw failure("本地服务未就绪或端口 38941 被其他程序占用。")}
        }
    }
    func checked(_ executable:String,_ args:[String]) throws {
        let status=try run(executable,args)
        guard status==0 else {throw Self.failure("操作失败：\(URL(fileURLWithPath:executable).lastPathComponent) \(args.first ?? "")（退出码 \(status)）")}
    }
    func stopLoadedService() throws {
        try checked("/bin/launchctl",["bootout",domain+"/"+label])
        for _ in 0..<50 {
            if try run("/bin/launchctl",["print",domain+"/"+label]) != 0 {return}
            Thread.sleep(forTimeInterval:0.1)
        }
        throw Self.failure("旧服务尚未停止，未开始替换。请稍后重试。")
    }
    func write(_ data:Data,_ file:URL) throws {try fm.createDirectory(at:file.deletingLastPathComponent(),withIntermediateDirectories:true);try data.write(to:file,options:.atomic)}
    func registrationData(removing:Bool) throws -> Data {
        let xml:XMLDocument
        if fm.fileExists(atPath:registration.path) {xml=try XMLDocument(data:Data(contentsOf:registration),options:.nodePreserveAll)}
        else {xml=XMLDocument(rootElement:XMLElement(name:"jsplugins"))}
        guard let root=xml.rootElement(),root.name=="jsplugins" else {throw Self.failure("WPS 插件注册文件结构未知，未修改。")}
        root.children?.compactMap{$0 as? XMLElement}.filter{$0.attribute(forName:"name")?.stringValue=="local-wps-formatter"}.forEach{$0.detach()}
        if !removing {
            let entry=XMLElement(name:"jspluginonline")
            for (k,v) in ["name":"local-wps-formatter","type":"wps","url":"http://127.0.0.1:38941/","enable":"enable_dev","install":"null","version":"1.1.0"] {entry.addAttribute(XMLNode.attribute(withName:k,stringValue:v) as! XMLNode)}
            root.addChild(entry)
        }
        return xml.xmlData(options:.nodePrettyPrint)
    }
    func restore(_ data:Data?,_ file:URL) throws {if let data {try write(data,file)}else if fm.fileExists(atPath:file.path){try fm.removeItem(at:file)}}
    func install() throws {
        // Validate before stopping the working service or changing registration.
        let newRegistration=try registrationData(removing:false)
        try checked("/usr/bin/codesign",["--verify","--deep","--strict",source.path])
        let previousAgent=try fm.fileExists(atPath:agent.path) ? Data(contentsOf:agent) : nil
        let previousRegistration=try fm.fileExists(atPath:registration.path) ? Data(contentsOf:registration) : nil
        let wasLoaded=try run("/bin/launchctl",["print",domain+"/"+label])==0
        try fm.createDirectory(at:base,withIntermediateDirectories:true)
        let stage=base.appendingPathComponent(".staged-\(UUID().uuidString).app")
        let backup=base.appendingPathComponent("previous-\(UUID().uuidString).app")
        try fm.copyItem(at:source,to:stage)
        defer {try? fm.removeItem(at:stage)}
        try checked("/usr/bin/codesign",["--verify","--deep","--strict",stage.path])
        var moved=false,newInstalled=false
        do {
            if wasLoaded {try stopLoadedService()}
            if fm.fileExists(atPath:installed.path) {try fm.moveItem(at:installed,to:backup);moved=true}
            try fm.moveItem(at:stage,to:installed);newInstalled=true
            let plist:[String:Any] = ["Label":label,"ProgramArguments":[installed.appendingPathComponent("Contents/MacOS/WPSFormatter").path,"--background"],"RunAtLoad":true,"KeepAlive":true,"ThrottleInterval":10,"StandardOutPath":base.appendingPathComponent("service.log").path,"StandardErrorPath":base.appendingPathComponent("service-error.log").path]
            try write(newRegistration,registration)
            try write(PropertyListSerialization.data(fromPropertyList:plist,format:.xml,options:0),agent)
            try checked("/bin/launchctl",["bootstrap",domain,agent.path])
            try health(installed)
        } catch {
            let original=error
            do {
                _ = try run("/bin/launchctl",["bootout",domain+"/"+label])
                if newInstalled {try fm.removeItem(at:installed)}
                if moved {try fm.moveItem(at:backup,to:installed)}
                try restore(previousAgent,agent);try restore(previousRegistration,registration)
                if wasLoaded {try checked("/bin/launchctl",["bootstrap",domain,agent.path])}
            } catch {throw Self.failure("安装未完成：\(original.localizedDescription)。恢复旧版本也失败：\(error.localizedDescription)。备份位于 \(backup.path)")}
            throw Self.failure("安装未完成，已恢复原安装状态：\(original.localizedDescription)")
        }
    }
    func uninstall() throws {
        let exists=fm.fileExists(atPath:registration.path)
        let replacement=try exists ? registrationData(removing:true) : nil
        let oldRegistration=try exists ? Data(contentsOf:registration) : nil
        let oldAgent=try fm.fileExists(atPath:agent.path) ? Data(contentsOf:agent) : nil
        let wasLoaded=try run("/bin/launchctl",["print",domain+"/"+label])==0
        do {
            if wasLoaded {try stopLoadedService()}
            if let replacement {try write(replacement,registration)}
            if oldAgent != nil {try fm.removeItem(at:agent)}
        } catch {
            let original=error
            try restore(oldRegistration,registration);try restore(oldAgent,agent)
            if wasLoaded {try checked("/bin/launchctl",["bootstrap",domain,agent.path])}
            throw original
        }
    }
    static var inProgress=false
    static func performWithProgress(_ action:@escaping ()throws->Void) throws {
        let progress=NSWindow(contentRect:NSRect(x:0,y:0,width:440,height:170),styleMask:[.titled],backing:.buffered,defer:false)
        progress.title="正在处理安装";progress.center();progress.isReleasedWhenClosed=false
        let message=NSTextField(wrappingLabelWithString:"正在检查插件注册和本地服务…\n\n如 macOS 提示访问其他应用数据，请在系统提示中自行决定是否允许。完成前请勿强制退出。")
        message.frame=NSRect(x:24,y:34,width:392,height:112);progress.contentView?.addSubview(message)
        let spinner=NSProgressIndicator(frame:NSRect(x:24,y:14,width:18,height:18));spinner.style = .spinning;spinner.startAnimation(nil);progress.contentView?.addSubview(spinner)
        var failure:Error?
        inProgress=true;progress.makeKeyAndOrderFront(nil)
        DispatchQueue.global(qos:.userInitiated).async {
            let result:Error?
            do {try action();result=nil} catch {result=error}
            DispatchQueue.main.async {failure=result;NSApp.stopModal()}
        }
        NSApp.runModal(for:progress);progress.orderOut(nil);inProgress=false
        if let failure {throw failure}
    }
    static func show() {
        let alert=NSAlert();alert.messageText="WPS 一键排版";alert.informativeText="安装到当前 Mac 用户，无需管理员密码。\n文档和模板保存在本机。安装或更新前请退出 WPS。\n\n支持 Apple 芯片 Mac · macOS 13 及以上";alert.addButton(withTitle:"安装 / 更新");alert.addButton(withTitle:"卸载插件");alert.addButton(withTitle:"取消")
        NSApp.activate(ignoringOtherApps:true)
        let choice=alert.runModal();if choice == .alertThirdButtonReturn {return}
        let result=NSAlert()
        do {
            guard NSWorkspace.shared.urlForApplication(withBundleIdentifier:"com.kingsoft.wpsoffice.mac") != nil else {throw failure("请先安装 Mac 版 WPS Office。")}
            guard NSRunningApplication.runningApplications(withBundleIdentifier:"com.kingsoft.wpsoffice.mac").isEmpty else {throw failure("WPS 仍在运行。请保存文档并退出 WPS，然后重新打开安装程序。")}
            let installer=FormatterInstaller()
            if choice == .alertFirstButtonReturn {try performWithProgress {try installer.install()};result.messageText="安装完成";result.informativeText="重新打开 WPS 文档，即可看到「一键排版」标签。更新时已保留你的模板。"}
            else {try performWithProgress {try installer.uninstall()};result.messageText="已卸载插件";result.informativeText="已移除插件注册和登录服务，模板及应用副本保留在本机。"}
        } catch {result.messageText="操作未完成";result.informativeText=error.localizedDescription;result.alertStyle = .warning}
        result.addButton(withTitle:"好");result.runModal()
    }
}
