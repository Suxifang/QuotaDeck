// Appended to the installed Expo WidgetsStorage implementation by check-widget-storage.ts.
let fixtures = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))) as! [String: Any]
precondition(!PropertyListSerialization.propertyList(fixtures["legacy"]!, isValidFor: .binary),
             "The old null-containing timeline should be rejected by Foundation")

// An ordinary temporary preference suite tests persistence without requesting App Group access.
let suite = "app.quotadeck.widget-storage-test.\(UUID().uuidString)"
WidgetsStorage.appGroupIdentifier = suite
defer { UserDefaults.standard.removePersistentDomain(forName: suite) }
var checked = 0
for fixture in ["timeline", "empty"] {
  let entries = fixtures[fixture] as! [[String: Any]]
  precondition(PropertyListSerialization.propertyList(entries, isValidFor: .binary))
  for kind in ["QuotaFocus", "QuotaOverview"] {
    let key = "__expo_widgets_\(kind)_timeline"
    WidgetsStorage.set(entries, forKey: key)
    guard let readback = WidgetsStorage.getArray(forKey: key) else {
      fatalError("\(fixture)/\(kind): no stored entries")
    }
    precondition((readback as NSArray).isEqual(to: entries), "Timeline data changed during storage")
    checked += 1
  }
}
let populated = fixtures["timeline"] as! [[String: Any]]
let accounts = (populated[0]["props"] as! [String: Any])["accounts"] as! [[String: Any]]
let zero = accounts.first { $0["id"] as? String == "zero" }!
let metric = (zero["metrics"] as! [[String: Any]])[0]
precondition((metric["percent"] as? NSNumber)?.intValue == 0, "Real zero must remain zero")
print("Native storage: rejected legacy null props; \(checked) Expo UserDefaults roundtrips passed.")
