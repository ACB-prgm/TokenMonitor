import XCTest
@testable import MonitorCore

final class APIPricingTests: XCTestCase {
    func sample(model: String = "gpt-6.1-sol", input: Int = 100000, cached: Int = 60000, write: Int = 10000, output: Int = 10000, reasoning: Int = 4000, tier: String? = nil) -> TokenUsageSample {
        var s = TokenUsageSample(timestamp: Date(), input: input, cached: cached, cacheWrite: write, output: output, reasoning: reasoning, total: nil, ordinal: nil)
        s.model = model; s.serviceTier = tier; s.outputRecorded = true; s.reasoningRecorded = true; s.cachedRecorded = true; s.cacheWriteRecorded = true
        return s
    }
    func event(_ stamp: String, input: Int = 100000, model: String? = nil) throws -> Data {
        let info: [String: Any] = ["last_token_usage": ["input_tokens": input, "cached_input_tokens": 60000, "cache_write_input_tokens": 10000, "output_tokens": 10000, "reasoning_output_tokens": 4000]]
        return try JSONSerialization.data(withJSONObject: ["type":"event_msg", "timestamp":stamp,"payload":["type":"token_count","info":info]])
    }
    func model(_ name: String) -> Data { Data("{\"type\":\"turn_context\",\"payload\":{\"model\":\"\(name)\"}}".utf8) }
    func testExclusiveCategoriesAndSavings() throws {
        let p = APIPricing.price(sample())
        // 30k ordinary * $2 + 60k read * $.10 + 10k write * $2.50 + 10k output * $10.
        XCTAssertEqual(try XCTUnwrap(p.total), 0.191, accuracy: 1e-12)
        XCTAssertEqual(p.categories!.reduce(0,+), p.total!)
        XCTAssertEqual(p.categories![3], 0.04, accuracy: 1e-12)
        XCTAssertEqual(p.categories![4], 0.06, accuracy: 1e-12)
        XCTAssertEqual(p.cacheSavings!, 0.109, accuracy: 1e-12)
        XCTAssertTrue(p.assumedTier)
        let premium = APIPricing.price(sample(cached: 0, write: 100000))
        XCTAssertLessThan(premium.cacheSavings!, 0)
    }
    func testThresholdAndTierApplyToWholeCall() throws {
        let short = APIPricing.rates(model: "gpt-6.1-sol", tier:nil,input:272000)!
        let long = APIPricing.rates(model:"gpt-6.1-sol",tier:"priority",input:272001)!
        XCTAssertEqual(short.input, 2); XCTAssertEqual(long.input, 8); XCTAssertEqual(long.cached, 0.4); XCTAssertEqual(long.output, 30)
        XCTAssertEqual(APIPricing.rates(model:"gpt-6.1-sol",tier:"ultrafast",input:10)!.input, 12)
        XCTAssertEqual(APIPricing.rates(model:"gpt-6-sol",tier:"flex",input:10)!.input, 1)
        XCTAssertNil(APIPricing.rates(model:"gpt-5.5",tier:"fast",input:300000))
        XCTAssertEqual(APIPricing.rates(model:"gpt-6.1-sol",tier:nil,input:10,regional:true)!.input, 2.2)
    }
    func testUnknownAndMissingNeverPricedAsZero() {
        XCTAssertNil(APIPricing.price(sample(model:"unknown")).total)
        XCTAssertNil(APIPricing.price(sample(tier:"unknown")).total)
        var s = sample(); s.cacheWriteRecorded = false
        XCTAssertNil(APIPricing.price(s).total)
        s = sample(); s.outputRecorded = false
        XCTAssertNil(APIPricing.price(s).total)
        s = sample(write: 50000)
        XCTAssertNil(APIPricing.price(s).total)
        s = sample(); s.reasoningRecorded = false
        let p = APIPricing.price(s)
        XCTAssertNotNil(p.total); XCTAssertEqual(p.categories![3], 0); XCTAssertEqual(p.categories![5], 0.1)
    }
    func testMixedModelsReplayCompactionAndHistoryCap() throws {
        let p = CodexTelemetryParser()
        p.consume(model("gpt-6.1-sol")); p.consume(try event("2026-10-19T00:00:00Z"))
        p.consume(model("gpt-6-astra")); p.consume(try event("2026-10-19T00:00:01Z"))
        let original = p.usage.cost
        p.consume(try event("2026-10-19T00:00:00Z")) // non-adjacent replay
        XCTAssertEqual(p.callCount, 2); XCTAssertEqual(p.usage.cost, original)
        p.consume(Data(#"{"type":"compacted","timestamp":"2026-10-19T00:00:02Z","payload":{}}"#.utf8))
        XCTAssertEqual(p.usage.cost, original)
        for i in 2..<130 { p.consume(try event("2026-10-19T01:\(String(format:"%02d",i/60)):\(String(format:"%02d",i%60))Z")) }
        XCTAssertEqual(p.samples.count,120); XCTAssertEqual(p.usage.pricedCalls,130)
        XCTAssertEqual(p.usage.input,13000000); XCTAssertEqual(p.usage.output,1300000)
        XCTAssertEqual(p.usage.models,["gpt-6.1-sol","gpt-6-astra"])
    }
    func testRepeatedCumulativeAtNewTimestampIsNotANewCall() throws {
        let p = CodexTelemetryParser(); p.consume(model("gpt-6.1-sol"))
        var r = try JSONSerialization.jsonObject(with: event("2026-10-19T00:00:00Z")) as! [String: Any]
        var payload = r["payload"] as! [String: Any]
        var info = payload["info"] as! [String: Any]
        info["total_token_usage"] = ["input_tokens": 100000, "output_tokens": 10000]
        payload["info"] = info; r["payload"] = payload
        p.consume(try JSONSerialization.data(withJSONObject:r))
        let cost = p.usage.cost
        r["timestamp"] = "2026-10-19T00:00:01Z"
        p.consume(try JSONSerialization.data(withJSONObject:r))
        XCTAssertEqual(p.callCount,1); XCTAssertEqual(p.usage.cost,cost)
        XCTAssertFalse(p.usage.cumulativeMismatch)
        // An incomplete cumulative dictionary cannot identify distinct calls.
        info["total_token_usage"] = ["output_tokens": 10000]
        payload["info"] = info; r["payload"] = payload
        r["timestamp"] = "2026-10-19T00:00:02Z"
        p.consume(try JSONSerialization.data(withJSONObject:r))
        r["timestamp"] = "2026-10-19T00:00:03Z"
        p.consume(try JSONSerialization.data(withJSONObject:r))
        XCTAssertEqual(p.callCount,3)
    }
    func testCumulativeIsCoverageCheckNotAdditionalCost() throws {
        let p = CodexTelemetryParser(); p.consume(model("gpt-6.1-sol"))
        p.consume(try event("2026-10-19T00:00:00Z"))
        let cost = p.usage.cost
        p.consume(Data(#"{"type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":900000,"output_tokens":90000}}}}"#.utf8))
        XCTAssertEqual(p.usage.cost,cost); XCTAssertEqual(p.usage.output,10000)
        XCTAssertEqual(p.outputTotals.total,90000)
        XCTAssertNotNil(APIPricing.compactionBreakEven(input:200000,model:"gpt-6.1-sol",tier:nil))
        XCTAssertNil(APIPricing.compactionBreakEven(input:200000,model:"unknown",tier:nil))
    }
}
