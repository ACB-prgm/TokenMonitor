import Foundation
import CoreGraphics

/// Distances use macOS screen points, independent of display pixel density.
public enum CornerSnap {
    public static let dragThreshold: CGFloat = 20
    public static let snapRadius: CGFloat = 25
    public static let corners = ["Top left", "Top right", "Bottom left", "Bottom right"]

    public static func origin(_ corner: String, size: CGSize, screen: CGRect) -> CGPoint {
        CGPoint(x: corner.contains("right") ? screen.maxX - size.width - 16 : screen.minX + 16,
                y: corner.contains("Top") ? screen.maxY - size.height - 16 : screen.minY + 16)
    }

    public static func distance(_ a: CGPoint, _ b: CGPoint) -> CGFloat {
        hypot(a.x - b.x, a.y - b.y)
    }

    public static func nearest(frame: CGRect, screen: CGRect) -> String? {
        let nearest = corners.min {
            distance(frame.origin, origin($0, size: frame.size, screen: screen)) <
            distance(frame.origin, origin($1, size: frame.size, screen: screen))
        }!
        return distance(frame.origin, origin(nearest, size: frame.size, screen: screen)) <= snapRadius ? nearest : nil
    }
}
