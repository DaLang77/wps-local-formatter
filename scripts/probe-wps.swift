import AppKit
import ApplicationServices

let fonts = NSFontManager.shared.availableFontFamilies
for (label, aliases) in [("华文中宋", ["华文中宋", "STZhongsong"]), ("仿宋", ["仿宋", "FangSong", "STFangsong", "华文仿宋"])] {
    print("FONT \(label): \(fonts.filter { f in aliases.contains { f.caseInsensitiveCompare($0) == .orderedSame } })")
}
print("AX_TRUSTED: \(AXIsProcessTrusted())")
let apps = NSRunningApplication.runningApplications(withBundleIdentifier: "com.kingsoft.wpsoffice.mac")
print("WPS_PROCESS_COUNT: \(apps.count)")
func get(_ e: AXUIElement, _ name: String) -> CFTypeRef? {
    var value: CFTypeRef?
    let err = AXUIElementCopyAttributeValue(e, name as CFString, &value)
    return err == .success ? value : nil
}
for app in apps {
    print("PID: \(app.processIdentifier)")
    let root = AXUIElementCreateApplication(app.processIdentifier)
    AXUIElementSetMessagingTimeout(root, 2)
    if let focused = get(root, "AXFocusedUIElement"), CFGetTypeID(focused) == AXUIElementGetTypeID() {
        let element = focused as! AXUIElement
        var names: CFArray?
        AXUIElementCopyAttributeNames(element, &names)
        print("FOCUSED_ROLE: \(get(element, "AXRole") as? String ?? "unknown")")
        print("FOCUSED_ATTRIBUTES: \(names as? [String] ?? [])")
    }
    var stack: [(AXUIElement, Int)] = [(root, 0)]
    var counts: [String:Int] = [:]
    var seen = Set<CFHashCode>()
    while let (element, depth) = stack.popLast(), seen.count < 3000 {
        if depth > 35 || seen.contains(CFHash(element)) { continue }
        seen.insert(CFHash(element))
        let role = get(element, "AXRole") as? String ?? "unknown"
        counts[role, default:0] += 1
        if ["AXTextArea", "AXTextField", "AXTable", "AXWebArea"].contains(role) {
            var attributes: CFArray?
            AXUIElementCopyAttributeNames(element, &attributes)
            print("ELEMENT \(role) ATTRIBUTES \(attributes as? [String] ?? [])")
        }
        for relation in ["AXChildren", "AXContents", "AXVisibleChildren"] {
            if let children = get(element, relation) as? [AXUIElement] {
                stack += children.map { ($0, depth + 1) }
            }
        }
    }
    print("ROLE_COUNTS: \(counts)")
}
