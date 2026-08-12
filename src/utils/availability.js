import {
  addMinutes,
  areIntervalsOverlapping,
  format,
  isValid,
  subMinutes,
} from "date-fns";

const getRecordStaffKey = (record) => record.__staffKey || record["服務人員"];

const getStaffKey = (staff) => staff.staffKey || staff.id || staff.name;

export const assignIntervalLanes = (intervals = []) => {
  const laneEnds = [];
  const assignments = new Map();

  [...intervals]
    .map((interval, originalIndex) => ({ interval, originalIndex }))
    .sort((a, b) => {
      const startDiff = a.interval.start - b.interval.start;
      if (startDiff !== 0) return startDiff;
      return a.interval.end - b.interval.end;
    })
    .forEach(({ interval, originalIndex }) => {
      let lane = laneEnds.findIndex((laneEnd) => laneEnd <= interval.start);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = interval.end;
      assignments.set(originalIndex, lane);
    });

  return {
    laneCount: Math.max(1, laneEnds.length),
    intervals: intervals.map((interval, originalIndex) => ({
      ...interval,
      lane: assignments.get(originalIndex) ?? 0,
      originalIndex,
    })),
  };
};

/**
 * Find staff with enough contiguous free time within a period (AM/PM).
 * Returns same shape as applyTimeFilter: { available, potential, offDuty }
 */
export const applyServiceFilter = (
  dayAvailability,
  dateStr,
  periodStartStr,
  periodEndStr,
  requiredMinutes,
  bufferBuffer,
  caseSettings = {},
) => {
  const available = [];
  const potential = [];
  const offDuty = [];

  const periodStart = new Date(dateStr);
  const [psh, psm] = periodStartStr.split(":").map(Number);
  periodStart.setHours(psh, psm, 0, 0);

  const periodEnd = new Date(dateStr);
  const [peh, pem] = periodEndStr.split(":").map(Number);
  periodEnd.setHours(peh, pem, 0, 0);

  const requiredMs = requiredMinutes * 60000;
  const latestCandidateStart = periodEnd.getTime() - requiredMs;

  dayAvailability.forEach((personAvailability) => {
    if (personAvailability.isOff) {
      offDuty.push(personAvailability);
      return;
    }

    const hasFreeSlot = personAvailability.free.some((freeInterval) => {
      const clippedStart = new Date(
        Math.max(freeInterval.start.getTime(), periodStart.getTime()),
      );
      const clippedEnd = new Date(
        Math.min(freeInterval.end.getTime(), periodEnd.getTime()),
      );
      const duration = clippedEnd.getTime() - clippedStart.getTime();
      return duration >= requiredMs;
    });

    if (hasFreeSlot) {
      available.push(personAvailability);
      return;
    }

    if (latestCandidateStart < periodStart.getTime()) {
      return;
    }

    const flexContextMap = new Map();
    let hasFlexibleSlot = false;

    for (
      let candidateStartMs = periodStart.getTime();
      candidateStartMs <= latestCandidateStart;
      candidateStartMs += 60000
    ) {
      const candidateStart = new Date(candidateStartMs);
      const candidateEnd = new Date(candidateStartMs + requiredMs);
      const candidateWithBuffer = {
        start: subMinutes(candidateStart, bufferBuffer),
        end: addMinutes(candidateEnd, bufferBuffer),
      };

      const overlapping = personAvailability.busyRaw.filter((busy) =>
        areIntervalsOverlapping(busy, candidateWithBuffer),
      );

      if (overlapping.length === 0) {
        continue;
      }

      let allFlex = true;
      const slotContexts = [];

      for (const busy of overlapping) {
        const settings = caseSettings[busy.caseName] || {
          early: 0,
          late: 0,
          isFixed: false,
        };

        if (settings.isFixed) {
          allFlex = false;
          break;
        }

        const canMoveEarly =
          busy.end.getTime() - settings.early * 60000 <=
          candidateWithBuffer.start.getTime();
        const canMoveLate =
          busy.start.getTime() + settings.late * 60000 >=
          candidateWithBuffer.end.getTime();

        if (!canMoveEarly && !canMoveLate) {
          allFlex = false;
          break;
        }

        slotContexts.push({
          caseName: busy.caseName,
          early: settings.early,
          late: settings.late,
          canMoveEarly,
          canMoveLate,
        });
      }

      if (!allFlex) {
        continue;
      }

      slotContexts.forEach((context) => {
        const key = `${context.caseName}__${context.early}__${context.late}`;
        const existing = flexContextMap.get(key);

        if (existing) {
          existing.canMoveEarly = existing.canMoveEarly || context.canMoveEarly;
          existing.canMoveLate = existing.canMoveLate || context.canMoveLate;
        } else {
          flexContextMap.set(key, context);
        }
      });

      hasFlexibleSlot = true;
      break;
    }

    if (hasFlexibleSlot) {
      potential.push({
        ...personAvailability,
        flexContexts: [...flexContextMap.values()],
      });
    }
  });

  return { available, potential, offDuty };
};

// Constants
const START_OF_DAY = 6; // 06:00
const END_OF_DAY = 22; // 22:00

export const calculateDailyAvailability = (
  dateStr,
  scheduleData,
  staffData,
  bufferBuffer,
) => {
  if (!dateStr || !scheduleData) return [];

  try {
    const dailyRecords = scheduleData.filter((record) => {
      const recDate = record["服務日期"];
      if (!recDate) return false;

      if (recDate instanceof Date) {
        return format(recDate, "yyyy-MM-dd") === dateStr;
      }

      try {
        if (
          typeof recDate === "string" &&
          (recDate.includes(dateStr) || recDate === dateStr)
        ) {
          return true;
        }

        const parsed = new Date(recDate);
        if (!Number.isNaN(parsed.getTime())) {
          return format(parsed, "yyyy-MM-dd") === dateStr;
        }
      } catch {
        return false;
      }

      return false;
    });

    const recordsByStaffKey = new Map();
    dailyRecords.forEach((record) => {
      const staffKey = getRecordStaffKey(record);
      if (!staffKey) return;

      if (!recordsByStaffKey.has(staffKey)) {
        recordsByStaffKey.set(staffKey, []);
      }
      recordsByStaffKey.get(staffKey).push(record);
    });

    return staffData.map((staff) => {
      const members = staff.members?.length ? staff.members : [staff];
      const memberByStaffKey = new Map(
        members.map((member) => [getStaffKey(member), member]),
      );
      const memberStaffKeys = staff.memberStaffKeys?.length
        ? staff.memberStaffKeys
        : [getStaffKey(staff)];
      const staffRecords = memberStaffKeys.flatMap(
        (staffKey) => recordsByStaffKey.get(staffKey) || [],
      );
      const offRecords = staffRecords.filter(
        (record) =>
          record["服務時間"] === "例" || record["服務時間"] === "休",
      );

      const busyIntervals = [];
      staffRecords.forEach((record) => {
        const timeRange = record["服務時間"];
        if (!timeRange || typeof timeRange !== "string") return;

        const matches = timeRange.match(/(\d{1,2}:\d{2})/g);
        if (!matches || matches.length < 2) return;

        const [startStr, endStr] = matches;
        const dayStart = new Date(dateStr);

        const parseTime = (timeString) => {
          const [hours, minutes] = timeString.trim().split(":").map(Number);
          const parsedDate = new Date(dayStart);
          parsedDate.setHours(hours, minutes, 0, 0);
          return parsedDate;
        };

        const startTime = parseTime(startStr);
        const endTime = parseTime(endStr);
        const caseMatch = timeRange.match(
          /\d{1,2}:\d{2}\s*[~～-]\s*\d{1,2}:\d{2}\s+(.+)$/,
        );
        const caseName = caseMatch ? caseMatch[1].trim() : "";

        if (isValid(startTime) && isValid(endTime)) {
          const sourceStaffKey = getRecordStaffKey(record);
          const sourceStaff = memberByStaffKey.get(sourceStaffKey) || staff;
          busyIntervals.push({
            start: startTime,
            end: endTime,
            caseName,
            orgId: sourceStaff.orgId || record.__orgId,
            orgName: sourceStaff.org || "",
            orgIdx: sourceStaff.orgIdx ?? 0,
            originalStaffName: sourceStaff.name || record["服務人員"] || "",
            sourceStaffKey,
          });
        }
      });

      const bufferedBusy = busyIntervals.map((interval) => ({
        start: subMinutes(interval.start, bufferBuffer),
        end: addMinutes(interval.end, bufferBuffer),
        type: "buffered_busy",
        originalStart: interval.start,
        originalEnd: interval.end,
        orgId: interval.orgId,
        orgName: interval.orgName,
        orgIdx: interval.orgIdx,
        originalStaffName: interval.originalStaffName,
        sourceStaffKey: interval.sourceStaffKey,
      }));

      const rawBlocked = bufferedBusy
        .map((block) => ({ ...block }))
        .sort((a, b) => a.start - b.start);

      const mergedBlocked = [];
      if (rawBlocked.length > 0) {
        let current = rawBlocked[0];
        for (let i = 1; i < rawBlocked.length; i += 1) {
          const next = rawBlocked[i];
          if (current.end >= next.start) {
            current.end = new Date(Math.max(current.end, next.end));
          } else {
            mergedBlocked.push(current);
            current = next;
          }
        }
        mergedBlocked.push(current);
      }

      const dayStartBoundary = new Date(dateStr);
      dayStartBoundary.setHours(START_OF_DAY, 0, 0, 0);

      const dayEndBoundary = new Date(dateStr);
      dayEndBoundary.setHours(END_OF_DAY, 0, 0, 0);

      const freeIntervals = [];
      let cursor = dayStartBoundary;

      mergedBlocked.forEach((block) => {
        if (block.start > cursor) {
          const actualEnd = new Date(Math.min(block.start, dayEndBoundary));
          if (actualEnd > cursor) {
            freeIntervals.push({ start: new Date(cursor), end: actualEnd });
          }
        }
        cursor = new Date(Math.max(cursor, block.end));
      });

      if (cursor < dayEndBoundary) {
        freeIntervals.push({ start: new Date(cursor), end: dayEndBoundary });
      }

      const offDayTypes = [...new Set(offRecords.map((record) => record["服務時間"]))];
      const isOff = busyIntervals.length === 0 && offDayTypes.length > 0;
      const dayType = offDayTypes.length > 1 ? "例/休" : offDayTypes[0];
      const offSources = offRecords.map((record) => {
        const sourceStaffKey = getRecordStaffKey(record);
        const sourceStaff = memberByStaffKey.get(sourceStaffKey) || staff;
        return {
          dayType: record["服務時間"],
          orgId: sourceStaff.orgId || record.__orgId,
          orgName: sourceStaff.org || "",
          orgIdx: sourceStaff.orgIdx ?? 0,
          originalStaffName: sourceStaff.name || record["服務人員"] || "",
          sourceStaffKey,
        };
      });

      return {
        staff,
        busyRaw: busyIntervals,
        bufferedBusy,
        blocked: mergedBlocked,
        free: freeIntervals,
        isFullyFree: busyIntervals.length === 0,
        ...(isOff ? { isOff: true, dayType, offSources } : {}),
      };
    });
  } catch (error) {
    console.error("Availability Calc Error:", error);
    return [];
  }
};
