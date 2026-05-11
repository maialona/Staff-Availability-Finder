import test from "node:test";
import assert from "node:assert/strict";

import { buildMovePlans } from "../src/utils/move-plans.js";

const createTime = (dateStr, timeStr) => {
  const [hours, minutes] = timeStr.split(":").map(Number);
  const date = new Date(dateStr);
  date.setHours(hours, minutes, 0, 0);
  return date;
};

const createBusy = (dateStr, start, end, caseName) => ({
  start: createTime(dateStr, start),
  end: createTime(dateStr, end),
  caseName,
});

const createPersonAvailability = ({
  name,
  orgId = "org-a",
  org = "機構A",
  busyRaw = [],
}) => ({
  staff: {
    name,
    orgId,
    org,
    staffKey: `${orgId}::${name}`,
  },
  busyRaw,
  blocked: [],
  free: [],
});

test("buildMovePlans creates an early move suggestion for a single overlapping case", () => {
  const plans = buildMovePlans({
    dateStr: "2026-05-20",
    targetStartTime: "10:00",
    targetEndTime: "11:00",
    dayAvailability: [
      createPersonAvailability({
        name: "Alice",
        busyRaw: [createBusy("2026-05-20", "09:30", "10:30", "王小明")],
      }),
    ],
    bufferMinutes: 0,
    caseSettings: {
      王小明: { early: 30, late: 0, isFixed: false },
    },
  });

  assert.equal(plans.length, 1);
  assert.equal(plans[0].direction, "early");
  assert.equal(plans[0].moveMinutes, 30);
  assert.equal(plans[0].movedCaseName, "王小明");
  assert.equal(plans[0].proposedStart.getHours(), 9);
  assert.equal(plans[0].proposedStart.getMinutes(), 0);
  assert.match(plans[0].explanation, /可騰出 5\/20 10:00-11:00/);
});

test("buildMovePlans creates a late move suggestion for a single overlapping case", () => {
  const plans = buildMovePlans({
    dateStr: "2026-05-20",
    targetStartTime: "09:00",
    targetEndTime: "10:00",
    dayAvailability: [
      createPersonAvailability({
        name: "Alice",
        busyRaw: [createBusy("2026-05-20", "09:30", "10:30", "王小明")],
      }),
    ],
    bufferMinutes: 0,
    caseSettings: {
      王小明: { early: 0, late: 30, isFixed: false },
    },
  });

  assert.equal(plans.length, 1);
  assert.equal(plans[0].direction, "late");
  assert.equal(plans[0].moveMinutes, 30);
  assert.equal(plans[0].proposedEnd.getHours(), 11);
  assert.equal(plans[0].proposedEnd.getMinutes(), 0);
});

test("buildMovePlans ranks the lower-disturbance direction first when both moves are possible", () => {
  const plans = buildMovePlans({
    dateStr: "2026-05-20",
    targetStartTime: "10:15",
    targetEndTime: "10:30",
    dayAvailability: [
      createPersonAvailability({
        name: "Alice",
        busyRaw: [createBusy("2026-05-20", "10:00", "10:30", "王小明")],
      }),
    ],
    bufferMinutes: 0,
    caseSettings: {
      王小明: { early: 15, late: 30, isFixed: false },
    },
  });

  assert.equal(plans.length, 2);
  assert.equal(plans[0].direction, "early");
  assert.equal(plans[0].moveMinutes, 15);
  assert.equal(plans[1].direction, "late");
  assert.equal(plans[1].moveMinutes, 30);
});

test("buildMovePlans excludes fixed cases", () => {
  const plans = buildMovePlans({
    dateStr: "2026-05-20",
    targetStartTime: "10:00",
    targetEndTime: "11:00",
    dayAvailability: [
      createPersonAvailability({
        name: "Alice",
        busyRaw: [createBusy("2026-05-20", "09:30", "10:30", "王小明")],
      }),
    ],
    bufferMinutes: 0,
    caseSettings: {
      王小明: { early: 60, late: 60, isFixed: true },
    },
  });

  assert.deepEqual(plans, []);
});

test("buildMovePlans excludes plans when flex allowance is insufficient", () => {
  const plans = buildMovePlans({
    dateStr: "2026-05-20",
    targetStartTime: "10:00",
    targetEndTime: "11:00",
    dayAvailability: [
      createPersonAvailability({
        name: "Alice",
        busyRaw: [createBusy("2026-05-20", "09:30", "10:30", "王小明")],
      }),
    ],
    bufferMinutes: 0,
    caseSettings: {
      王小明: { early: 20, late: 0, isFixed: false },
    },
  });

  assert.deepEqual(plans, []);
});

test("buildMovePlans excludes plans that would collide with neighboring work after buffer", () => {
  const plans = buildMovePlans({
    dateStr: "2026-05-20",
    targetStartTime: "10:00",
    targetEndTime: "11:00",
    dayAvailability: [
      createPersonAvailability({
        name: "Alice",
        busyRaw: [
          createBusy("2026-05-20", "08:45", "09:15", "前一案"),
          createBusy("2026-05-20", "09:30", "10:30", "王小明"),
        ],
      }),
    ],
    bufferMinutes: 15,
    caseSettings: {
      王小明: { early: 45, late: 0, isFixed: false },
    },
  });

  assert.deepEqual(plans, []);
});

test("buildMovePlans excludes targets blocked by multiple overlapping cases", () => {
  const plans = buildMovePlans({
    dateStr: "2026-05-20",
    targetStartTime: "10:00",
    targetEndTime: "11:00",
    dayAvailability: [
      createPersonAvailability({
        name: "Alice",
        busyRaw: [
          createBusy("2026-05-20", "09:00", "10:15", "案主A"),
          createBusy("2026-05-20", "10:15", "11:00", "案主B"),
        ],
      }),
    ],
    bufferMinutes: 0,
    caseSettings: {
      案主A: { early: 60, late: 60, isFixed: false },
      案主B: { early: 60, late: 60, isFixed: false },
    },
  });

  assert.deepEqual(plans, []);
});

test("buildMovePlans sorts multiple staff by least total movement first", () => {
  const plans = buildMovePlans({
    dateStr: "2026-05-20",
    targetStartTime: "10:00",
    targetEndTime: "11:00",
    dayAvailability: [
      createPersonAvailability({
        name: "Alice",
        orgId: "org-a",
        busyRaw: [createBusy("2026-05-20", "09:40", "10:40", "案主A")],
      }),
      createPersonAvailability({
        name: "Bob",
        orgId: "org-b",
        busyRaw: [createBusy("2026-05-20", "09:20", "10:20", "案主B")],
      }),
    ],
    bufferMinutes: 0,
    caseSettings: {
      案主A: { early: 40, late: 0, isFixed: false },
      案主B: { early: 20, late: 0, isFixed: false },
    },
  });

  assert.equal(plans.length, 2);
  assert.equal(plans[0].staff.name, "Bob");
  assert.equal(plans[0].moveMinutes, 20);
  assert.equal(plans[1].staff.name, "Alice");
  assert.equal(plans[1].moveMinutes, 40);
});

test("buildMovePlans keeps same-name staff separated by orgId", () => {
  const plans = buildMovePlans({
    dateStr: "2026-05-20",
    targetStartTime: "10:00",
    targetEndTime: "11:00",
    dayAvailability: [
      createPersonAvailability({
        name: "Alex",
        orgId: "org-a",
        busyRaw: [createBusy("2026-05-20", "09:30", "10:30", "案主A")],
      }),
      createPersonAvailability({
        name: "Alex",
        orgId: "org-b",
        busyRaw: [createBusy("2026-05-20", "09:40", "10:40", "案主B")],
      }),
    ],
    bufferMinutes: 0,
    caseSettings: {
      案主A: { early: 30, late: 0, isFixed: false },
      案主B: { early: 40, late: 0, isFixed: false },
    },
  });

  assert.equal(plans.length, 2);
  assert.notEqual(plans[0].orgId, plans[1].orgId);
  assert.deepEqual(
    plans.map((plan) => plan.orgId).sort(),
    ["org-a", "org-b"],
  );
});
