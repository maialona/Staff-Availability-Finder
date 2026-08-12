import test from "node:test";
import assert from "node:assert/strict";

import {
  assignIntervalLanes,
  calculateDailyAvailability,
} from "../src/utils/availability.js";
import {
  buildAvailabilityStaffGroups,
  normalizeCrossOrgStaffName,
} from "../src/utils/staff-grouping.js";

const createStaff = ({ id, name, orgId, org, orgIdx }) => ({
  id,
  sourceStaffId: id,
  staffKey: `${orgId}::${id}`,
  name,
  orgId,
  org,
  orgIdx,
});

const linA = createStaff({
  id: "A-1",
  name: "林秀燕",
  orgId: "org-a",
  org: "主謙",
  orgIdx: 0,
});
const linB = createStaff({
  id: "B-1",
  name: "林秀燕(主謙)",
  orgId: "org-b",
  org: "機構B",
  orgIdx: 1,
});

test("normalizes full-width and half-width trailing organization suffixes", () => {
  assert.equal(normalizeCrossOrgStaffName("林秀燕(主謙)"), "林秀燕");
  assert.equal(normalizeCrossOrgStaffName("林秀燕（主謙） "), "林秀燕");
});

test("merges a suffixed cross-organization identity once", () => {
  const grouped = buildAvailabilityStaffGroups([linA, linB]);

  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].name, "林秀燕");
  assert.equal(grouped[0].isCrossOrg, true);
  assert.deepEqual(grouped[0].memberStaffKeys, [linA.staffKey, linB.staffKey]);
  assert.deepEqual(
    grouped[0].orgMemberships.map((membership) => membership.orgName),
    ["主謙", "機構B"],
  );
});

test("does not merge plain duplicate names or ambiguous duplicates in one organization", () => {
  const plainB = { ...linB, name: "林秀燕" };
  assert.equal(buildAvailabilityStaffGroups([linA, plainB]).length, 2);

  const duplicateA = { ...linA, id: "A-2", staffKey: "org-a::A-2" };
  assert.equal(
    buildAvailabilityStaffGroups([linA, duplicateA, linB]).length,
    3,
  );
});

test("combines busy intervals and preserves source organizations", () => {
  const grouped = buildAvailabilityStaffGroups([linA, linB]);
  const schedule = [
    {
      服務日期: "2026-08-12",
      服務時間: "08:00~10:00 王小姐",
      服務人員: linA.name,
      __orgId: linA.orgId,
      __staffKey: linA.staffKey,
    },
    {
      服務日期: "2026-08-12",
      服務時間: "13:00~15:00 李先生",
      服務人員: linB.name,
      __orgId: linB.orgId,
      __staffKey: linB.staffKey,
    },
  ];

  const [availability] = calculateDailyAvailability(
    "2026-08-12",
    schedule,
    grouped,
    0,
  );

  assert.equal(availability.busyRaw.length, 2);
  assert.deepEqual(
    availability.busyRaw.map((interval) => interval.orgName),
    ["主謙", "機構B"],
  );
  assert.deepEqual(
    availability.free.map((interval) => [
      interval.start.getHours(),
      interval.end.getHours(),
    ]),
    [[6, 8], [10, 13], [15, 22]],
  );
});

test("actual work wins over leave, while mixed leave remains unavailable without work", () => {
  const grouped = buildAvailabilityStaffGroups([linA, linB]);
  const workAndLeave = [
    {
      服務日期: "2026-08-12",
      服務時間: "休",
      服務人員: linA.name,
      __orgId: linA.orgId,
      __staffKey: linA.staffKey,
    },
    {
      服務日期: "2026-08-12",
      服務時間: "09:00~10:00 李先生",
      服務人員: linB.name,
      __orgId: linB.orgId,
      __staffKey: linB.staffKey,
    },
  ];
  const [working] = calculateDailyAvailability(
    "2026-08-12",
    workAndLeave,
    grouped,
    0,
  );
  assert.equal(working.isOff, undefined);
  assert.equal(working.busyRaw.length, 1);

  const mixedLeave = workAndLeave.map((record, index) => ({
    ...record,
    服務時間: index === 0 ? "例" : "休",
  }));
  const [off] = calculateDailyAvailability(
    "2026-08-12",
    mixedLeave,
    grouped,
    0,
  );
  assert.equal(off.isOff, true);
  assert.equal(off.dayType, "例/休");
});

test("assigns overlapping intervals to separate lanes and reuses free lanes", () => {
  const at = (hour, minute = 0) => new Date(2026, 7, 12, hour, minute);
  const result = assignIntervalLanes([
    { start: at(8), end: at(10) },
    { start: at(9), end: at(11) },
    { start: at(11), end: at(12) },
  ]);

  assert.equal(result.laneCount, 2);
  assert.deepEqual(
    result.intervals.map((interval) => interval.lane),
    [0, 1, 0],
  );
});
