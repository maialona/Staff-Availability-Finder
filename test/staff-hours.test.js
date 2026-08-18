import test from "node:test";
import assert from "node:assert/strict";

import { mergeStaffHoursStatsRows } from "../src/utils/staff-hours.js";

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
  org: "機構A",
  orgIdx: 0,
});

const linB = createStaff({
  id: "B-1",
  name: "林秀燕(機構A)",
  orgId: "org-b",
  org: "機構B",
  orgIdx: 1,
});

test("merges cross-organization staff hours and recalculates daily overtime tiers", () => {
  const statsRows = [
    {
      staff: linA,
      totalMinutes: 360,
      restDayMinutes: 0,
      holidayMinutes: 0,
      nationalHolidayMinutes: 0,
      transitHours: 0,
      sessions: 1,
      days: 1,
      dailyNormal: { "2026-08-12": 360 },
      dailyRestDay: {},
      dailyHoliday: {},
      dailyNationalHoliday: {},
    },
    {
      staff: linB,
      totalMinutes: 240,
      restDayMinutes: 0,
      holidayMinutes: 0,
      nationalHolidayMinutes: 0,
      transitHours: 0,
      sessions: 1,
      days: 1,
      dailyNormal: { "2026-08-12": 240 },
      dailyRestDay: {},
      dailyHoliday: {},
      dailyNationalHoliday: {},
    },
  ];

  const stats = mergeStaffHoursStatsRows(statsRows, [linA, linB]);

  assert.equal(stats.length, 1);
  assert.equal(stats[0].staff.name, "林秀燕");
  assert.equal(stats[0].staff.isCrossOrg, true);
  assert.equal(stats[0].sessions, 2);
  assert.equal(stats[0].days, 1);
  assert.equal(stats[0].totalHours, 10);
  assert.equal(stats[0].normal_1_8, 8);
  assert.equal(stats[0].normal_8_10, 2);
});
