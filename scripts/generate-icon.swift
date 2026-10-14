import AppKit
let target = CommandLine.arguments[1]
let size = 512
let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
NSColor(calibratedWhite: 0.14, alpha: 1).setFill()
NSBezierPath(roundedRect: NSRect(x: 20, y: 20, width: 472, height: 472), xRadius: 112, yRadius: 112).fill()
let path = NSBezierPath(); path.lineWidth = 18; path.lineCapStyle = .round; path.lineJoinStyle = .round
let points: [(Double, Double)] = [(100,256),(154,256),(180,206),(208,342),(242,144),(278,370),(312,206),(338,282),(358,256),(412,256)]
path.move(to: NSPoint(x: points[0].0, y: points[0].1))
for point in points.dropFirst() { path.line(to: NSPoint(x: point.0, y: point.1)) }
NSColor(calibratedWhite: 0.94, alpha: 1).setStroke(); path.stroke()
NSGraphicsContext.restoreGraphicsState()
try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: target))
