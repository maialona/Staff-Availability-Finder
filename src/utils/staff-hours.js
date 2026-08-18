import { buildAvailabilityStaffGroups } from "./staff-grouping.js";

const NORMAL_DAILY_MINUTES = 8 * 60;

const getStaffKey = (staff) => staff.staffKey || staff.id || staff.name;

const createStaffBucket = (staff) => ({
  staff,
  totalMinutes: 0,
  restDayMinutes: 0,
  holidayMinutes: 0,
  nationalHolidayMinutes: 0,
  transitHours: 0,
  sessions: 0,
  days: new Set(),
  dailyNormal: {},
  dailyRestDay: {},
  dailyHoliday: {},
  dailyNationalHoliday: {},
});

const mergeDailyMinutes = (target, source) => {
  Object.entries(source).forEach(([date, minutes]) => {
    target[date] = (target[date] || 0) + minutes;
  });
};

const mergeStaffBuckets = (staff, buckets) => {
  const merged = createStaffBucket(staff);

  buckets.forEach((bucket) => {
    merged.totalMinutes += bucket.totalMinutes;
    merged.restDayMinutes += bucket.restDayMinutes;
    merged.holidayMinutes += bucket.holidayMinutes;
    merged.nationalHolidayMinutes += bucket.nationalHolidayMinutes;
    merged.transitHours += bucket.transitHours;
    merged.sessions += bucket.sessions;
    bucket.days.forEach((date) => merged.days.add(date));
    mergeDailyMinutes(merged.dailyNormal, bucket.dailyNormal);
    mergeDailyMinutes(merged.dailyRestDay, bucket.dailyRestDay);
    mergeDailyMinutes(merged.dailyHoliday, bucket.dailyHoliday);
    mergeDailyMinutes(
      merged.dailyNationalHoliday,
      bucket.dailyNationalHoliday,
    );
  });

  return merged;
};

const toHours = (minutes) => +(minutes / 60).toFixed(2);

const finalizeStaffBucket = (bucket) => {
  let normalMinutes = 0;
  let overtimeMinutes = 0;
  let normal_1_8 = 0;
  let normal_8_10 = 0;
  let normal_gt10 = 0;

  Object.values(bucket.dailyNormal).forEach((dayMinutes) => {
    normalMinutes += Math.min(dayMinutes, NORMAL_DAILY_MINUTES);
    overtimeMinutes += Math.max(0, dayMinutes - NORMAL_DAILY_MINUTES);
    normal_1_8 += Math.min(dayMinutes, 480);
    normal_8_10 += Math.max(0, Math.min(dayMinutes, 600) - 480);
    normal_gt10 += Math.max(0, dayMinutes - 600);
  });

  let rest_lte2 = 0;
  let rest_lte8 = 0;
  let rest_gt8 = 0;
  Object.values(bucket.dailyRestDay).forEach((dayMinutes) => {
    rest_lte2 += Math.min(dayMinutes, 120);
    rest_lte8 += Math.max(0, Math.min(dayMinutes, 480) - 120);
    rest_gt8 += Math.max(0, dayMinutes - 480);
  });

  let hol_lte8 = 0;
  let hol_gt8 = 0;
  Object.values(bucket.dailyHoliday).forEach((dayMinutes) => {
    hol_lte8 += Math.min(dayMinutes, 480);
    hol_gt8 += Math.max(0, dayMinutes - 480);
  });

  let nat_lte8 = 0;
  let nat_8_10 = 0;
  let nat_gt10 = 0;
  Object.values(bucket.dailyNationalHoliday).forEach((dayMinutes) => {
    nat_lte8 += Math.min(dayMinutes, 480);
    nat_8_10 += Math.max(0, Math.min(dayMinutes, 600) - 480);
    nat_gt10 += Math.max(0, dayMinutes - 600);
  });

  return {
    ...bucket,
    days: bucket.days.size,
    normalMinutes,
    overtimeMinutes,
    totalHours: +(bucket.totalMinutes / 60).toFixed(1),
    normalHours: +(normalMinutes / 60).toFixed(1),
    overtimeHours: +(overtimeMinutes / 60).toFixed(1),
    restDayHours: +(bucket.restDayMinutes / 60).toFixed(1),
    holidayHours: +(bucket.holidayMinutes / 60).toFixed(1),
    nationalHolidayHours: +(bucket.nationalHolidayMinutes / 60).toFixed(1),
    transitHoursTotal: +bucket.transitHours.toFixed(2),
    normal_1_8: toHours(normal_1_8),
    normal_8_10: toHours(normal_8_10),
    normal_gt10: toHours(normal_gt10),
    rest_lte2: toHours(rest_lte2),
    rest_lte8: toHours(rest_lte8),
    rest_gt8: toHours(rest_gt8),
    hol_lte8: toHours(hol_lte8),
    hol_gt8: toHours(hol_gt8),
    nat_lte8: toHours(nat_lte8),
    nat_8_10: toHours(nat_8_10),
    nat_gt10: toHours(nat_gt10),
    holDayCount: Object.keys(bucket.dailyHoliday).length,
    natDayCount: Object.keys(bucket.dailyNationalHoliday).length,
  };
};

const getServiceDates = (row) =>
  new Set(
    [
      row.dailyNormal || {},
      row.dailyRestDay || {},
      row.dailyHoliday || {},
      row.dailyNationalHoliday || {},
    ].flatMap((dailyMap) => Object.keys(dailyMap)),
  );

export const mergeStaffHoursStatsRows = (statsRows = [], staffData = []) => {
  if (!statsRows.length || !staffData.length) return statsRows;

  const rowsByStaffKey = new Map(
    statsRows.map((row) => [
      getStaffKey(row.staff),
      {
        ...row,
        days: getServiceDates(row),
        dailyNormal: row.dailyNormal || {},
        dailyRestDay: row.dailyRestDay || {},
        dailyHoliday: row.dailyHoliday || {},
        dailyNationalHoliday: row.dailyNationalHoliday || {},
        transitHours: row.transitHours ?? row.transitHoursTotal ?? 0,
      },
    ]),
  );

  return buildAvailabilityStaffGroups(staffData)
    .map((staff) => {
      const memberStaffKeys = staff.memberStaffKeys || [getStaffKey(staff)];
      const memberRows = memberStaffKeys
        .map((staffKey) => rowsByStaffKey.get(staffKey))
        .filter(Boolean);
      return finalizeStaffBucket(mergeStaffBuckets(staff, memberRows));
    })
    .sort((a, b) => b.totalMinutes - a.totalMinutes);
};
