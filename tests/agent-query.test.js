import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDeterministicQueryHint,
  postProcessAgentQuery,
} from "../server/index.mjs";
import {
  executeCheckPersonAvailability,
  executeFindStaffForDates,
  executeFindStaffForWeeklyPattern,
} from "../src/utils/agent-query.js";

const DATE_KEY = "???交?";
const STAFF_KEY = "??鈭箏";
const TIME_KEY = "????";

const createScheduleRow = (date, staffName, staffKey, timeRange) => ({
  [DATE_KEY]: date,
  [STAFF_KEY]: staffName,
  [TIME_KEY]: timeRange,
  __staffKey: staffKey,
});

test("deterministic parser resolves current-day afternoon query", () => {
  const hint = buildDeterministicQueryHint("現在誰下午有空班30分鐘", {
    today: "2026-04-29",
  });

  assert.equal(hint.intent, "find_staff_for_dates");
  assert.deepEqual(hint.query.dates, ["2026-04-29"]);
  assert.equal(hint.query.timeWindowStart, "12:00");
  assert.equal(hint.query.timeWindowEnd, "18:00");
  assert.equal(hint.query.requiredMinutes, 30);
});

test("deterministic parser treats 30分 the same as 30分鐘", () => {
  const shortForm = buildDeterministicQueryHint("今天下午誰有30分的空檔", {
    today: "2026-04-29",
  });
  const longForm = buildDeterministicQueryHint("今天下午誰有30分鐘的空檔", {
    today: "2026-04-29",
  });

  assert.equal(shortForm.intent, "find_staff_for_dates");
  assert.equal(shortForm.query.requiredMinutes, 30);
  assert.deepEqual(shortForm.query, longForm.query);
});

test("deterministic parser resolves compact weekday pattern", () => {
  const hint = buildDeterministicQueryHint("二三五下午有30分鐘的空班", {
    today: "2026-04-29",
  });

  assert.equal(hint.intent, "find_staff_for_weekly_pattern");
  assert.deepEqual(hint.query.weekdayValues, [2, 3, 5]);
  assert.equal(hint.query.timeWindowStart, "12:00");
  assert.equal(hint.query.timeWindowEnd, "18:00");
  assert.equal(hint.query.requiredMinutes, 30);
});

test("deterministic parser resolves current week range for weekly pattern", () => {
  const hint = buildDeterministicQueryHint("本周一三五下午有30分鐘空檔的有誰", {
    today: "2026-04-29",
  });

  assert.equal(hint.intent, "find_staff_for_weekly_pattern");
  assert.deepEqual(hint.query.weekdayValues, [1, 3, 5]);
  assert.equal(hint.query.dateRangeStart, "2026-04-27");
  assert.equal(hint.query.dateRangeEnd, "2026-05-03");
  assert.equal(hint.query.timeWindowStart, "12:00");
  assert.equal(hint.query.timeWindowEnd, "18:00");
  assert.equal(hint.query.requiredMinutes, 30);
});

test("deterministic parser resolves weekly range with minimum matching days", () => {
  const hint = buildDeterministicQueryHint("列出本周有至少三天下午都是空班的人", {
    today: "2026-04-29",
  });

  assert.equal(hint.intent, "find_staff_for_dates");
  assert.equal(hint.query.dateRangeStart, "2026-04-27");
  assert.equal(hint.query.dateRangeEnd, "2026-05-03");
  assert.equal(hint.query.timeWindowStart, "12:00");
  assert.equal(hint.query.timeWindowEnd, "18:00");
  assert.equal(hint.query.minMatchingDays, 3);
});

test("deterministic parser resolves weekday range inside current week", () => {
  const hint = buildDeterministicQueryHint("這週二到四下午誰有空", {
    today: "2026-04-29",
  });

  assert.equal(hint.intent, "find_staff_for_weekly_pattern");
  assert.deepEqual(hint.query.weekdayValues, [2, 3, 4]);
  assert.equal(hint.query.dateRangeStart, "2026-04-27");
  assert.equal(hint.query.dateRangeEnd, "2026-05-03");
});

test("deterministic parser resolves next week single weekday", () => {
  const hint = buildDeterministicQueryHint("下週五下午有30分鐘空檔的有誰", {
    today: "2026-04-29",
  });

  assert.equal(hint.intent, "find_staff_for_weekly_pattern");
  assert.deepEqual(hint.query.weekdayValues, [5]);
  assert.equal(hint.query.dateRangeStart, "2026-05-04");
  assert.equal(hint.query.dateRangeEnd, "2026-05-10");
  assert.equal(hint.query.requiredMinutes, 30);
});

test("deterministic parser resolves current month weekly pattern", () => {
  const hint = buildDeterministicQueryHint("本月每週一三五下午有空的人", {
    today: "2026-04-29",
  });

  assert.equal(hint.intent, "find_staff_for_weekly_pattern");
  assert.deepEqual(hint.query.weekdayValues, [1, 3, 5]);
  assert.equal(hint.query.dateRangeStart, "2026-04-01");
  assert.equal(hint.query.dateRangeEnd, "2026-04-30");
});

test("deterministic parser resolves weekend query", () => {
  const hint = buildDeterministicQueryHint("這週末下午誰有空", {
    today: "2026-04-29",
  });

  assert.equal(hint.intent, "find_staff_for_weekly_pattern");
  assert.deepEqual([...hint.query.weekdayValues].sort((a, b) => a - b), [0, 6]);
  assert.equal(hint.query.dateRangeStart, "2026-04-27");
  assert.equal(hint.query.dateRangeEnd, "2026-05-03");
});

test("deterministic parser resolves weekday workdays query", () => {
  const hint = buildDeterministicQueryHint("下週平日下午有空的人", {
    today: "2026-04-29",
  });

  assert.equal(hint.intent, "find_staff_for_weekly_pattern");
  assert.deepEqual(hint.query.weekdayValues, [1, 2, 3, 4, 5]);
  assert.equal(hint.query.dateRangeStart, "2026-05-04");
  assert.equal(hint.query.dateRangeEnd, "2026-05-10");
});

test("deterministic parser resolves end-of-month deadline query", () => {
  const hint = buildDeterministicQueryHint("月底前下午誰有空", {
    today: "2026-04-29",
  });

  assert.equal(hint.intent, "find_staff_for_dates");
  assert.equal(hint.query.dateRangeStart, "2026-04-29");
  assert.equal(hint.query.dateRangeEnd, "2026-04-30");
  assert.equal(hint.query.timeWindowStart, "12:00");
  assert.equal(hint.query.timeWindowEnd, "18:00");
});

test("deterministic parser resolves tomorrow query", () => {
  const hint = buildDeterministicQueryHint("明天下午誰有空", {
    today: "2026-04-29",
  });

  assert.equal(hint.intent, "find_staff_for_dates");
  assert.equal(hint.query.dateRangeStart, "2026-04-30");
  assert.equal(hint.query.dateRangeEnd, "2026-04-30");
});

test("deterministic parser resolves day-after-tomorrow query", () => {
  const hint = buildDeterministicQueryHint("後天下午誰有空", {
    today: "2026-04-29",
  });

  assert.equal(hint.intent, "find_staff_for_dates");
  assert.equal(hint.query.dateRangeStart, "2026-05-01");
  assert.equal(hint.query.dateRangeEnd, "2026-05-01");
});

test("deterministic parser resolves future one-week query", () => {
  const hint = buildDeterministicQueryHint("未來一週下午有空的人", {
    today: "2026-04-29",
  });

  assert.equal(hint.intent, "find_staff_for_dates");
  assert.equal(hint.query.dateRangeStart, "2026-04-29");
  assert.equal(hint.query.dateRangeEnd, "2026-05-05");
});

test("deterministic parser resolves today to weekday range", () => {
  const hint = buildDeterministicQueryHint("今天到週五下午誰有空", {
    today: "2026-04-29",
  });

  assert.equal(hint.intent, "find_staff_for_dates");
  assert.equal(hint.query.dateRangeStart, "2026-04-29");
  assert.equal(hint.query.dateRangeEnd, "2026-05-01");
  assert.equal(hint.query.timeWindowStart, "12:00");
  assert.equal(hint.query.timeWindowEnd, "18:00");
});

test("deterministic parser resolves week-after-next range", () => {
  const hint = buildDeterministicQueryHint("下下週二下午誰有空", {
    today: "2026-04-29",
  });

  assert.equal(hint.intent, "find_staff_for_weekly_pattern");
  assert.deepEqual(hint.query.weekdayValues, [2]);
  assert.equal(hint.query.dateRangeStart, "2026-05-11");
  assert.equal(hint.query.dateRangeEnd, "2026-05-17");
});

test("deterministic parser resolves last week of current month", () => {
  const hint = buildDeterministicQueryHint("本月最後一週下午誰有空", {
    today: "2026-04-15",
  });

  assert.equal(hint.intent, "find_staff_for_dates");
  assert.equal(hint.query.dateRangeStart, "2026-04-27");
  assert.equal(hint.query.dateRangeEnd, "2026-04-30");
  assert.equal(hint.query.timeWindowStart, "12:00");
  assert.equal(hint.query.timeWindowEnd, "18:00");
});

test("postProcessAgentQuery fills weekly defaults from data range", () => {
  const parsed = {
    status: "needs_clarification",
    intent: "none",
    explanation: "",
    clarification: "",
    pendingIntent: null,
    query: {},
    partialQuery: {},
    missingFields: null,
  };

  const result = postProcessAgentQuery(parsed, {
    today: "2026-04-29",
    dateRangeStart: "2026-04-01",
    dateRangeEnd: "2026-04-30",
    deterministicIntent: "find_staff_for_weekly_pattern",
    deterministicQuery: {
      weekdayValues: [2, 3, 5],
      timeWindowStart: "12:00",
      timeWindowEnd: "18:00",
      requiredMinutes: 30,
    },
  });

  assert.equal(result.status, "ok");
  assert.equal(result.intent, "find_staff_for_weekly_pattern");
  assert.equal(result.query.dateRangeStart, "2026-04-01");
  assert.equal(result.query.dateRangeEnd, "2026-04-30");
});

test("postProcessAgentQuery merges fill_missing_fields replies", () => {
  const parsed = {
    status: "ok",
    intent: "none",
    explanation: "",
    clarification: "",
    pendingIntent: null,
    query: {},
    partialQuery: {},
    missingFields: null,
  };

  const result = postProcessAgentQuery(parsed, {
    agentMode: "fill_missing_fields",
    pendingIntent: "find_staff_for_weekly_pattern",
    pendingQuery: {
      timeWindowStart: "12:00",
      timeWindowEnd: "18:00",
      requiredMinutes: 30,
    },
    dateRangeStart: "2026-04-01",
    dateRangeEnd: "2026-04-30",
    deterministicIntent: "find_staff_for_weekly_pattern",
    deterministicQuery: {
      weekdayValues: [2, 3, 5],
    },
  });

  assert.equal(result.status, "ok");
  assert.deepEqual(result.query.weekdayValues, [2, 3, 5]);
  assert.equal(result.query.timeWindowStart, "12:00");
  assert.equal(result.query.timeWindowEnd, "18:00");
  assert.equal(result.query.requiredMinutes, 30);
});

test("weekly pattern execution uses full data range defaults and finds afternoon matches", () => {
  const staffData = [
    { id: "1", name: "Alice", staffKey: "alice" },
    { id: "2", name: "Bob", staffKey: "bob" },
  ];

  const scheduleData = [
    createScheduleRow("2026-04-07", "Alice", "alice", "12:00~18:00 個案A"),
    createScheduleRow("2026-04-08", "Alice", "alice", "12:00~18:00 個案A"),
    createScheduleRow("2026-04-10", "Alice", "alice", "12:00~18:00 個案A"),
    createScheduleRow("2026-04-07", "Bob", "bob", "09:00~10:00 個案B"),
    createScheduleRow("2026-04-08", "Bob", "bob", "09:00~10:00 個案B"),
    createScheduleRow("2026-04-10", "Bob", "bob", "09:00~10:00 個案B"),
  ];

  const result = executeFindStaffForWeeklyPattern({
    query: {
      weekdayValues: [2, 3, 5],
      timeWindowStart: "12:00",
      timeWindowEnd: "18:00",
      requiredMinutes: 30,
      dateRangeStart: null,
      dateRangeEnd: null,
      dateMatchMode: "all",
    },
    scheduleData,
    staffData,
    bufferBuffer: 0,
    caseSettings: {},
  });

  assert.equal(result.status, "ok");
  assert.match(result.text, /Bob/);
  assert.match(result.text, /查詢結果/);
  assert.match(result.text, /2026-04-07/);
  assert.match(result.text, /至少有 30 分鐘空檔/);
  assert.equal(result.structuredResult.title, "查詢結果");
  assert.equal(result.structuredResult.summary.totalMatches, 2);
  assert.equal(result.structuredResult.summary.dateCount, 3);
  assert.equal(result.structuredResult.summary.dateMatchMode, "all");
  assert.equal(result.structuredResult.staffCards.some((card) => card.name === "Bob"), true);
  assert.equal(result.structuredResult.staffCards[0].matchCount, 3);
  assert.equal(result.structuredResult.staffCards[0].hasPotential, false);
});

test("date query supports minimum matching days across a date range", () => {
  const staffData = [
    { id: "1", name: "Alice", staffKey: "alice" },
    { id: "2", name: "Bob", staffKey: "bob" },
  ];

  const scheduleData = [
    createScheduleRow("2026-04-27", "Alice", "alice", "12:00~18:00 個案A"),
    createScheduleRow("2026-04-28", "Alice", "alice", "12:00~18:00 個案A"),
    createScheduleRow("2026-04-29", "Alice", "alice", "12:00~18:00 個案A"),
    createScheduleRow("2026-04-30", "Alice", "alice", "09:00~10:00 個案A"),
    createScheduleRow("2026-05-01", "Bob", "bob", "12:00~18:00 個案B"),
    createScheduleRow("2026-05-02", "Bob", "bob", "12:00~18:00 個案B"),
  ];

  const result = executeFindStaffForDates({
    query: {
      dateRangeStart: "2026-04-27",
      dateRangeEnd: "2026-05-02",
      timeWindowStart: "12:00",
      timeWindowEnd: "18:00",
      minMatchingDays: 3,
    },
    scheduleData,
    staffData,
    bufferBuffer: 0,
    caseSettings: {},
  });

  assert.equal(result.status, "ok");
  assert.match(result.text, /至少 3 天符合條件/);
  assert.equal(result.structuredResult.summary.minMatchingDays, 3);
  assert.equal(result.structuredResult.summary.totalMatches >= 1, true);
  const aliceCard = result.structuredResult.staffCards.find((card) => card.name === "Alice");
  assert.equal(Boolean(aliceCard), true);
  assert.equal(aliceCard.matchCount >= 3, true);
});

test("date query builds structured result for any-match with potential staff", () => {
  const staffData = [{ id: "1", name: "Alice", staffKey: "alice", org: "機構A" }];
  const scheduleData = [
    createScheduleRow("2026-04-07", "Alice", "alice", "09:00~12:00 個案A"),
    createScheduleRow("2026-04-08", "Alice", "alice", "12:00~15:00 個案B"),
  ];

  const result = executeFindStaffForDates({
    query: {
      dates: ["2026-04-07", "2026-04-08"],
      timeWindowStart: "10:00",
      timeWindowEnd: "14:00",
      dateMatchMode: "any",
    },
    scheduleData,
    staffData,
    bufferBuffer: 0,
    caseSettings: {},
  });

  assert.equal(result.status, "ok");
  assert.equal(result.structuredResult.summary.dateMatchMode, "any");
  assert.equal(result.structuredResult.summary.dateCount, 2);
  assert.equal(result.structuredResult.summary.timeSummary, "完整涵蓋 10:00~14:00");
  assert.equal(result.structuredResult.staffCards.length, 1);
  assert.equal(result.structuredResult.staffCards[0].name, "Alice");
  assert.equal(result.structuredResult.staffCards[0].matchCount >= 1, true);
  assert.equal(result.structuredResult.staffCards[0].group, "available");
  assert.match(result.copyText, /Alice/);
});

test("person availability query remains plain text without structured result", () => {
  const staffData = [{ id: "1", name: "Alice", staffKey: "alice" }];
  const scheduleData = [createScheduleRow("2026-04-07", "Alice", "alice", "09:00~12:00 個案A")];

  const result = executeCheckPersonAvailability({
    query: {
      staffName: "Alice",
      dates: ["2026-04-07"],
    },
    scheduleData,
    staffData,
    bufferBuffer: 0,
    caseSettings: {},
  });

  assert.equal(result.status, "ok");
  assert.equal(result.structuredResult, undefined);
  assert.match(result.text, /員工空檔查詢/);
  assert.match(result.text, /Alice/);
});
