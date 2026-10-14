import AppKit
import SwiftUI
import MonitorCore

/// Resolve the system text color in the view's current appearance before blending.
func healthColor(_ level: Double, scheme: ColorScheme) -> Color {
    guard level > 0 else { return .primary }
    let appearance = NSAppearance(named: scheme == .dark ? .darkAqua : .aqua)!
    var neutral = TokenHealth.RGB(0, 0, 0)
    appearance.performAsCurrentDrawingAppearance {
        if let rgb = NSColor.labelColor.usingColorSpace(.sRGB) {
            neutral = TokenHealth.RGB(rgb.redComponent, rgb.greenComponent, rgb.blueComponent)
        }
    }
    let rgb = TokenHealth.color(level: level, dark: scheme == .dark, neutral: neutral)
    return Color(.sRGB, red: rgb.red, green: rgb.green, blue: rgb.blue, opacity: 1)
}
