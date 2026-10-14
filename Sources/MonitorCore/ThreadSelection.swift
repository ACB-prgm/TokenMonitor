/// Manual inspection does not disable automatic following. Only the lock button does.
public struct ThreadSelection {
    public private(set) var currentID: String?
    public private(set) var isLocked = false
    public init() {}
    public mutating func select(_ id: String) { currentID = id }
    public mutating func toggleLock() {
        guard currentID != nil else { return }
        isLocked.toggle()
    }
    @discardableResult public mutating func receiveHook(_ id: String) -> Bool {
        guard !isLocked || currentID == id else { return false }
        currentID = id
        return true
    }
}
