import AppKit
import Foundation
import Network
import JavaScriptCore

private let port: UInt16 = 38941
private let pluginName = "local-wps-formatter"

final class LocalServer {
    let token = UUID().uuidString + UUID().uuidString
    var listener: NWListener?
    var route: ((String, String, [String:String], Data) -> (Int, String, Data))?
    var failure: ((String) -> Void)?
    func start() throws {
        let params = NWParameters.tcp
        params.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: NWEndpoint.Port(rawValue: port)!)
        listener = try NWListener(using: params)
        listener?.stateUpdateHandler = { [weak self] state in
            if case .failed(let error) = state { DispatchQueue.main.async { self?.failure?(error.localizedDescription) } }
        }
        listener?.newConnectionHandler = { [weak self] connection in
            connection.start(queue: .global(qos: .userInitiated))
            self?.read(connection, Data())
        }
        listener?.start(queue: .global(qos: .userInitiated))
    }
    private func read(_ connection: NWConnection, _ existing: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] bytes, _, complete, error in
            guard let self else { connection.cancel(); return }
            var data = existing
            if let bytes { data.append(bytes) }
            guard data.count <= 4_000_000 else { connection.cancel(); return }
            if let boundary = data.range(of: Data("\r\n\r\n".utf8)) {
                guard boundary.lowerBound < 16384,
                      let header = String(data: data[..<boundary.lowerBound], encoding: .utf8) else { connection.cancel(); return }
                let lines = header.components(separatedBy: "\r\n")
                let request = lines[0].split(separator: " ")
                guard request.count == 3 else { connection.cancel(); return }
                var headers: [String:String] = [:]
                for line in lines.dropFirst() {
                    if let sep = line.firstIndex(of: ":") {
                        headers[String(line[..<sep]).lowercased()] = line[line.index(after: sep)...].trimmingCharacters(in: .whitespaces)
                    }
                }
                let length = Int(headers["content-length"] ?? "0") ?? -1
                guard length >= 0 && length <= 3_900_000 && headers["transfer-encoding"] == nil else { connection.cancel(); return }
                let end = boundary.upperBound + length
                if data.count >= end {
                    let body = data.subdata(in: boundary.upperBound..<end)
                    let method = String(request[0]), path = String(request[1])
                    DispatchQueue.main.async {
                        let result = self.route?(method, path, headers, body) ?? (404, "text/plain", Data())
                        self.respond(connection, result, headerOnly: method == "HEAD")
                    }
                    return
                }
            } else if data.count > 16384 { connection.cancel(); return }
            if complete || error != nil { connection.cancel() } else { self.read(connection, data) }
        }
    }
    private func respond(_ connection: NWConnection, _ response: (Int,String,Data), headerOnly: Bool) {
        let reason = response.0 == 200 ? "OK" : "Error"
        let header = "HTTP/1.1 \(response.0) \(reason)\r\nContent-Type: \(response.1)\r\nContent-Length: \(response.2.count)\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n"
        var out = Data(header.utf8); if !headerOnly { out.append(response.2) }
        connection.send(content: out, completion: .contentProcessed { _ in connection.cancel() })
    }
}

final class SettingsStore {
    private let context = JSContext()!
    private let file: URL
    init(fileURL: URL? = nil, configURL: URL? = nil) {
        file=fileURL ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/WPSLocalFormatter/settings.json")
        if let url=configURL ?? Bundle.main.resourceURL?.appendingPathComponent("addin/config.js"),let source=try? String(contentsOf:url,encoding:.utf8) { context.evaluateScript(source) }
    }
    private func error(_ text:String)->NSError { NSError(domain:"FormatterSettings",code:1,userInfo:[NSLocalizedDescriptionKey:text]) }
    private func normalized(_ value:Any)throws->[String:Any] {
        context.exception=nil
        guard let function=context.objectForKeyedSubscript("FormatterConfig")?.forProperty("normalize"), !function.isUndefined,
              let result=function.call(withArguments:[value]),context.exception==nil,let config=result.toDictionary() as? [String:Any] else {
            throw error(context.exception?.toString() ?? "设置校验模块无法加载。")
        }
        return config
    }
    func load()throws->[String:Any] {
        if !FileManager.default.fileExists(atPath:file.path) {
            guard let d=context.objectForKeyedSubscript("FormatterConfig")?.invokeMethod("defaults",withArguments:[])?.toDictionary() as? [String:Any] else { throw error("默认设置无法加载。") }
            return ["version":1,"revision":0,"activeTemplateID":"builtin","current":d,"templates":[["id":"builtin","name":"默认文书","config":d]]]
        }
        do {
            let raw=try Data(contentsOf:file)
            guard var state=try JSONSerialization.jsonObject(with:raw) as? [String:Any],state["version"] as? Int==1,
                  let revision=state["revision"] as? Int,revision>=0,let current=state["current"],
                  let templates=state["templates"] as? [[String:Any]],!templates.isEmpty,
                  let active=state["activeTemplateID"] as? String else { throw error("模板数据结构无效。") }
            state["current"]=try normalized(current)
            var ids=Set<String>(),names=Set<String>()
            let clean=try templates.map { template -> [String:Any] in
                guard let id=template["id"] as? String,!id.isEmpty,let name=template["name"] as? String,!name.isEmpty,
                      let config=template["config"],ids.insert(id).inserted,names.insert(name).inserted else { throw error("模板记录无效。") }
                return ["id":id,"name":name,"config":try normalized(config)]
            }
            guard ids.contains("builtin"),ids.contains(active) else { throw error("当前模板不存在。") }
            state["templates"]=clean
            return state
        } catch { throw self.error("本地设置读取失败，原文件已保留：\(error.localizedDescription)") }
    }
    func mutate(_ path:String,_ data:[String:Any])throws->[String:Any] {
        var state=try load()
        guard data["revision"] as? Int==state["revision"] as? Int else { throw error("设置已被其他窗口更新，请关闭后重新打开。") }
        var templates=state["templates"] as! [[String:Any]]
        if path=="/templates/select" {
            guard let id=data["id"] as? String,let item=templates.first(where:{$0["id"] as? String==id}) else { throw error("模板不存在。") }
            state["activeTemplateID"]=id;state["current"]=item["config"]
        } else {
            guard let raw=data["config"] else { throw error("缺少排版设置。") }
            let config=try normalized(raw)
            if path=="/templates" {
                let name=(data["name"] as? String ?? "").trimmingCharacters(in:.whitespacesAndNewlines)
                guard !name.isEmpty,name.count<=40,!name.unicodeScalars.contains(where:{CharacterSet.controlCharacters.contains($0)}) else { throw error("模板名称请输入 1～40 个字符。") }
                guard !templates.contains(where:{$0["name"] as? String==name}) else { throw error("已有同名模板，请更换名称。") }
                guard templates.count<200 else { throw error("最多保存 199 个自定义模板。") }
                let id=UUID().uuidString
                templates.append(["id":id,"name":name,"config":config]);state["templates"]=templates;state["activeTemplateID"]=id
            }
            state["current"]=config
        }
        state["revision"]=(state["revision"] as! Int)+1
        let encoded=try JSONSerialization.data(withJSONObject:state,options:[.prettyPrinted,.sortedKeys])
        try FileManager.default.createDirectory(at:file.deletingLastPathComponent(),withIntermediateDirectories:true)
        try encoded.write(to:file,options:.atomic)
        return state
    }
}

final class FormatterDelegate: NSObject, NSApplicationDelegate {
    let instanceBuildID=(try? Data(contentsOf:Bundle.main.resourceURL!.appendingPathComponent("build-id"))) ?? Data()
    let server = LocalServer()
    let settings = SettingsStore()
    let diagnostics = CommandLine.arguments.contains("--diagnostics")
    let background = CommandLine.arguments.contains("--background")
    var window: NSWindow!
    let countField = NSTextField(string: "2")
    let stepper = NSStepper()
    let documentLabel = NSTextField(labelWithString: "等待 WPS 连接…")
    let message = NSTextField(wrappingLabelWithString: "打开 WPS 文档后即可排版。首次安装需要重新打开 WPS。")
    let button = NSButton(title: "一键排版", target: nil, action: nil)
    var latest: [String:Any] = [:]
    var lastPulse = Date.distantPast
    var pending: [String:Any]?
    var pendingDate = Date.distantPast
    var busyID: String?
    var lastResult: [String:Any] = [:]
    var timer: Timer?
    var installed = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(background ? .accessory : .regular)
        if !background { FormatterInstaller.show(); NSApp.terminate(nil); return }
        buildUI()
        do {
            if !background { try registerPlugin() }
            installed = true
            server.route = { [weak self] method,path,headers,body in
                guard let self else { return (500,"text/plain",Data()) }
                return self.route(method,path,headers,body)
            }
            server.failure = { [weak self] error in
                self?.button.isEnabled = false
                self?.message.stringValue = "本地服务启动失败：\(error)。请关闭重复打开的排版工具后重试。"
            }
            try server.start()
        } catch { message.stringValue = "启动失败：\(error.localizedDescription)" }
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in self?.refreshConnection() }
    }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !background { window.makeKeyAndOrderFront(nil) }; return true
    }
    func applicationShouldTerminate(_ sender:NSApplication)->NSApplication.TerminateReply { FormatterInstaller.inProgress ? .terminateCancel : .terminateNow }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
    func applicationWillTerminate(_ notification: Notification) { server.listener?.cancel() }

    func buildUI() {
        let menu = NSMenu(), item = NSMenuItem(), submenu = NSMenu()
        submenu.addItem(withTitle: "退出一键排版", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        item.submenu=submenu;menu.addItem(item);NSApp.mainMenu=menu
        window = NSWindow(contentRect: NSRect(x:0,y:0,width:470,height:300), styleMask:[.titled,.closable,.miniaturizable], backing:.buffered, defer:false)
        window.title="WPS 一键排版";window.center();window.isReleasedWhenClosed=false
        let title = NSTextField(labelWithString:"文书一键排版")
        title.font = .systemFont(ofSize:22,weight:.semibold)
        documentLabel.font = .systemFont(ofSize:12);documentLabel.textColor = .secondaryLabelColor
        documentLabel.lineBreakMode = .byTruncatingMiddle
        let saved = UserDefaults.standard.object(forKey:"signatureCount") as? Int ?? 2
        countField.stringValue=String(saved);countField.alignment = .center
        countField.setAccessibilityLabel("落款段数")
        countField.widthAnchor.constraint(equalToConstant:58).isActive=true
        stepper.minValue=0;stepper.maxValue=99;stepper.integerValue=saved
        stepper.target=self;stepper.action = #selector(stepCount)
        stepper.setAccessibilityLabel("调整落款段数")
        let row=NSStackView(views:[NSTextField(labelWithString:"末尾落款"),countField,stepper,NSTextField(labelWithString:"个非空段落")])
        row.orientation = .horizontal;row.spacing=8
        button.target=self;button.action = #selector(formatClicked);button.bezelStyle = .rounded
        button.controlSize = .large;button.keyEquivalent="\r";button.isEnabled=false
        button.widthAnchor.constraint(equalToConstant:410).isActive=true
        let rules=NSTextField(wrappingLabelWithString:"标题：华文中宋二号居中\n正文：仿宋_GB2312 四号 · 首行缩进 2 字符\n落款右对齐 · 全文 1.5 倍行距")
        rules.font = .systemFont(ofSize:12);rules.textColor = .secondaryLabelColor
        message.font = .systemFont(ofSize:12);message.maximumNumberOfLines=3
        let stack=NSStackView(views:[title,documentLabel,row,button,rules,message])
        stack.orientation = .vertical;stack.alignment = .leading;stack.spacing=13
        stack.translatesAutoresizingMaskIntoConstraints=false
        window.contentView!.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo:window.contentView!.leadingAnchor,constant:28),
            stack.trailingAnchor.constraint(equalTo:window.contentView!.trailingAnchor,constant:-28),
            stack.topAnchor.constraint(equalTo:window.contentView!.topAnchor,constant:24),
            documentLabel.widthAnchor.constraint(equalTo:stack.widthAnchor),
            message.widthAnchor.constraint(equalTo:stack.widthAnchor)])
        if !background { window.makeKeyAndOrderFront(nil);NSApp.activate(ignoringOtherApps:true) }
    }
    @objc func stepCount() { countField.stringValue=String(stepper.integerValue);saveCount() }
    func saveCount() {
        if let count=Int(countField.stringValue), count>=0 && count<=99 { UserDefaults.standard.set(count,forKey:"signatureCount") }
    }
    @objc func formatClicked() {
        window.makeFirstResponder(nil)
        do { _ = try enqueue(op:"format", docID:latest["docID"] as? String, count:nil) }
        catch { message.stringValue=error.localizedDescription }
    }
    func fail(_ text:String) -> NSError { NSError(domain:"LocalFormatter",code:1,userInfo:[NSLocalizedDescriptionKey:text]) }
    func enqueue(op:String,docID:String?,count:Int?,config:[String:Any]? = nil) throws -> String {
        guard busyID == nil else { throw fail("正在排版，请等待当前操作完成。") }
        guard Date().timeIntervalSince(lastPulse)<4, let active=latest["docID"] as? String,
              active==docID else { throw fail("WPS 文档已切换或尚未连接，请稍后重试。") }
        let chosen=count ?? Int(countField.stringValue) ?? -1
        guard chosen>=0 && chosen<=99 else { throw fail("落款段数请输入 0～99 的整数。") }
        if op != "format" && !diagnostics { throw fail("诊断模式未启用。") }
        guard ["format","inspect","undo"].contains(op) else { throw fail("未知操作。") }
        let id=UUID().uuidString
        pending=["id":id,"op":op,"docID":active,"count":chosen,"diagnostic":diagnostics]
        if op=="format" {
            if let config { pending?["config"]=config }
            else if count==nil { pending?["config"]=try settings.load()["current"] }
        }
        pendingDate=Date();busyID=id;button.isEnabled=false
        saveCount();message.stringValue=op=="format" ? "正在排版，请暂时不要切换文档…" : "正在检查测试文档…"
        return id
    }
    func refreshConnection() {
        let connected=Date().timeIntervalSince(lastPulse)<4
        documentLabel.stringValue=connected ? ((latest["title"] as? String).map{"当前文档："+$0} ?? "WPS 已连接，请打开 Word 文档") : "等待 WPS 连接…"
        if pending != nil && Date().timeIntervalSince(pendingDate)>10 {
            pending=nil;busyID=nil;message.stringValue="WPS 未接收操作，本次没有执行。请检查文档后重试。"
        }
        button.isEnabled=installed && connected && latest["docID"] != nil && busyID == nil
    }
    func json(_ value:Any,_ status:Int=200) -> (Int,String,Data) {
        (status,"application/json; charset=utf-8",(try? JSONSerialization.data(withJSONObject:value,options:[.sortedKeys])) ?? Data("{}".utf8))
    }
    func route(_ method:String,_ path:String,_ headers:[String:String],_ body:Data) -> (Int,String,Data) {
        let localHost="127.0.0.1:\(port)"
        guard headers["host"]==localHost else { return json(["error":"invalid host"],403) }
        if let origin=headers["origin"], origin != "http://\(localHost)" { return json(["error":"invalid origin"],403) }
        if method=="GET", path=="/build-id" { return (200,"text/plain",instanceBuildID) }
        if method=="GET", path=="/session" { return json(["token":server.token]) }
        let resources:[String:String] = ["/":"index.html","/index.html":"index.html","/furniture.js":"furniture.js","/core.js":"core.js","/main.js":"main.js","/ribbon.xml":"ribbon.xml","/manifest.xml":"manifest.xml","/format.png":"format.png","/icons/format.svg":"icons/format.svg","/icons/settings.svg":"icons/settings.svg","/icons/result.svg":"icons/result.svg","/settings.html":"settings.html","/config.js":"config.js","/settings.js":"settings.js","/settings.css":"settings.css","/result.html":"result.html","/result.js":"result.js","/result.css":"result.css"]
        if (method=="GET" || method=="HEAD"), let file=resources[path], let base=Bundle.main.resourceURL,
           let data=try? Data(contentsOf:base.appendingPathComponent("addin/"+file)) {
            let mime=file.hasSuffix(".svg") ? "image/svg+xml" : file.hasSuffix(".css") ? "text/css; charset=utf-8" : file.hasSuffix(".png") ? "image/png" : file.hasSuffix(".js") ? "application/javascript; charset=utf-8" : file.hasSuffix(".xml") ? "application/xml; charset=utf-8" : "text/html; charset=utf-8"
            return (200,mime,data)
        }
        guard headers["x-formatter-token"]==server.token else { return json(["error":"invalid token"],403) }
        if method=="GET" && path=="/settings" {
            do { return json(try settings.load()) } catch { return json(["error":error.localizedDescription],500) }
        }
        if method=="GET" && path=="/fonts" { return json(["fonts":latest["fonts"] ?? []]) }
        if method=="GET" && path=="/state" { return json(["status":latest,"busy":busyID ?? "","result":lastResult]) }
        guard method=="POST", headers["content-type"]?.hasPrefix("application/json")==true,
              let data=(try? JSONSerialization.jsonObject(with:body)) as? [String:Any] else { return json(["error":"invalid request"],400) }
        switch path {
        case "/settings/save", "/templates", "/templates/select":
            do { return json(try settings.mutate(path,data)) } catch { return json(["error":error.localizedDescription],409) }
        case "/ui-result":
            lastResult=data;return json(["accepted":true])
        case "/poll":
            let previousDocument=latest["docID"] as? String
            latest=data;lastPulse=Date();refreshConnection()
            if busyID == nil, let current=data["docID"] as? String, previousDocument != current {
                message.stringValue="已连接。点击一键排版后，可在 WPS 按 ⌘Z 撤销。"
            }
            if let command=pending { pending=nil;return json(["command":command]) }
            return json([:])
        case "/request":
            do { return json(["id":try enqueue(op:data["op"] as? String ?? "format",docID:data["docID"] as? String,count:data["count"] as? Int,config:data["config"] as? [String:Any])]) }
            catch { return json(["error":error.localizedDescription],409) }
        case "/result":
            guard let id=data["id"] as? String, id==busyID else { return json(["error":"stale result"],409) }
            lastResult=data;busyID=nil;pending=nil
            message.stringValue=data["message"] as? String ?? ((data["ok"] as? Bool)==true ? "检查完成。" : "操作未完成，请检查 WPS。")
            refreshConnection();return json(["accepted":true])
        default: return json(["error":"not found"],404)
        }
    }
    func registerPlugin() throws {
        let dir=FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Containers/com.kingsoft.wpsoffice.mac/Data/.kingsoft/wps/jsaddons")
        try FileManager.default.createDirectory(at:dir,withIntermediateDirectories:true)
        let file=dir.appendingPathComponent("publish.xml")
        let existing=try? Data(contentsOf:file)
        let xml:XMLDocument
        if let existing {
            xml=try XMLDocument(data:existing,options:.nodePreserveAll)
            guard xml.rootElement()?.name=="jsplugins" else { throw fail("WPS 加载项配置结构未知，未修改配置。") }
        } else { xml=XMLDocument(rootElement:XMLElement(name:"jsplugins"));xml.characterEncoding="UTF-8" }
        let root=xml.rootElement()!
        let previous=root.children?.compactMap{$0 as? XMLElement}.filter{$0.attribute(forName:"name")?.stringValue==pluginName} ?? []
        if previous.count==1, previous[0].name=="jspluginonline", previous[0].attribute(forName:"url")?.stringValue=="http://127.0.0.1:\(port)/", previous[0].attribute(forName:"enable")?.stringValue=="enable_dev" { return }
        if let existing { try existing.write(to:dir.appendingPathComponent("publish.xml.backup-\(UUID().uuidString)"),options:.atomic) }
        previous.forEach{$0.detach()}
        let entry=XMLElement(name:"jspluginonline")
        for (name,value) in ["name":pluginName,"type":"wps","url":"http://127.0.0.1:\(port)/","enable":"enable_dev","install":"null","version":"1.0.0"] {
            entry.addAttribute(XMLNode.attribute(withName:name,stringValue:value) as! XMLNode)
        }
        root.addChild(entry)
        try xml.xmlData(options:.nodePrettyPrint).write(to:file,options:.atomic)
    }
}
