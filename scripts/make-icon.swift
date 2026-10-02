import AppKit
let directory=URL(fileURLWithPath:CommandLine.arguments[1])
try FileManager.default.createDirectory(at:directory,withIntermediateDirectories:true)
func render(_ size:Int,_ url:URL) throws {
 let image=NSImage(size:NSSize(width:size,height:size));image.lockFocus()
 let scale=CGFloat(size)/1024
 let t=NSAffineTransform();t.scale(by:scale);t.concat()
 NSColor(calibratedRed:0.12,green:0.35,blue:0.72,alpha:1).setFill()
 NSBezierPath(roundedRect:NSRect(x:32,y:32,width:960,height:960),xRadius:216,yRadius:216).fill()
 NSColor.white.setFill();NSBezierPath(roundedRect:NSRect(x:275,y:196,width:474,height:636),xRadius:46,yRadius:46).fill()
 NSColor(calibratedRed:0.12,green:0.35,blue:0.72,alpha:1).setStroke()
 for (y,w) in [(680,300),(594,300),(508,204)] {let p=NSBezierPath();p.lineWidth=25;p.lineCapStyle = .round;p.move(to:NSPoint(x:355,y:y));p.line(to:NSPoint(x:355+w,y:y));p.stroke()}
 let check=NSBezierPath();check.lineWidth=32;check.lineCapStyle = .round;check.lineJoinStyle = .round;check.move(to:NSPoint(x:455,y:342));check.line(to:NSPoint(x:516,y:286));check.line(to:NSPoint(x:655,y:413));check.stroke()
 image.unlockFocus();let bitmap=NSBitmapImageRep(data:image.tiffRepresentation!)!;try bitmap.representation(using:.png,properties:[:])!.write(to:url)
}
for size in [16,32,128,256,512] {try render(size,directory.appendingPathComponent("icon_\(size)x\(size).png"));try render(size*2,directory.appendingPathComponent("icon_\(size)x\(size)@2x.png"))}
