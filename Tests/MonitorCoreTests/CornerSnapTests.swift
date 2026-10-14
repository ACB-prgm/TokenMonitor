import XCTest
import CoreGraphics
@testable import MonitorCore

final class CornerSnapTests: XCTestCase {
    func testSnapRadiusAndCornerGeometryOnOffsetDisplay() {
        let screen = CGRect(x: -1440, y: 120, width: 1440, height: 900)
        for size in [CGSize(width: 340, height: 145), CGSize(width: 506, height: 650)] {
            for corner in CornerSnap.corners {
                let origin = CornerSnap.origin(corner, size: size, screen: screen)
                var frame = CGRect(origin: origin, size: size)
                XCTAssertTrue(screen.contains(frame))
                XCTAssertEqual(CornerSnap.nearest(frame: frame, screen: screen), corner)
                frame.origin.x += 15; frame.origin.y += 20
                XCTAssertEqual(CornerSnap.nearest(frame: frame, screen: screen), corner)
                frame.origin.y += 0.1
                XCTAssertNil(CornerSnap.nearest(frame: frame, screen: screen))
            }
        }
    }

    func testDragDistanceUsesBothAxes() {
        XCTAssertEqual(CornerSnap.distance(.zero, CGPoint(x: 12, y: 16)), CornerSnap.dragThreshold)
        XCTAssertGreaterThan(CornerSnap.distance(.zero, CGPoint(x: 15, y: 15)), CornerSnap.dragThreshold)
    }
}
