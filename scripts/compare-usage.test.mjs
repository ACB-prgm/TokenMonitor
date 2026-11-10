import test from 'node:test';
import assert from 'node:assert/strict';
import {compare,comparable,known} from './compare-usage.mjs';
const window={usedPercent:13,windowDurationMins:300,resetsAt:123};
const value={accountId:'private',ordinaryUsageAllowed:true,rateLimitsByLimitId:{codex:{primary:window}}};
test('comparison preserves unknown values and authoritative buckets without storing identity',()=>{
 assert.equal(compare(value,structuredClone(value)),true);
 assert.equal(JSON.stringify(comparable(value)).includes('private'),false);
 for(const patch of [{usedPercent:14},{resetsAt:124},{windowDurationMins:10080}])assert.equal(compare(value,{...value,rateLimitsByLimitId:{codex:{primary:{...window,...patch}}}}),false);
 assert.equal(compare(value,{...value,ordinaryUsageAllowed:false}),false);
 assert.equal(compare(value,{...value,rateLimitsByLimitId:null}),false);
 assert.equal(compare({rateLimits:{}},{rateLimits:{primary:{usedPercent:0}}}),false);
});

test('unknown snapshots cannot satisfy the live acceptance gate',()=>{
 assert.equal(known({}),false);assert.equal(known({...value,ordinaryUsageAllowed:undefined}),false);
 assert.equal(known(value),true);assert.equal(known({...value,rateLimitsByLimitId:{codex:{primary:{...window,resetsAt:null}}}}),false);
});
