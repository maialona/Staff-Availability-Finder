import {
  addMinutes,
  areIntervalsOverlapping,
  differenceInMinutes,
  format,
  subMinutes,
} from "date-fns";

const WORKDAY_START_HOUR = 6;
const WORKDAY_END_HOUR = 22;

const DEFAULT_CASE_SETTINGS = {
  early: 0,
  late: 0,
  isFixed: false,
};

const parseDateTime = (dateStr, timeStr) => {
  if (!dateStr || !timeStr) return null;
  const [hours, minutes] = String(timeStr).split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;

  const parsed = new Date(dateStr);
  parsed.setHours(hours, minutes, 0, 0);
  return parsed;
};

const buildBufferedInterval = (start, end, bufferMinutes) => ({
  start: subMinutes(start, bufferMinutes),
  end: addMinutes(end, bufferMinutes),
});

const formatTimeRange = (start, end) => `${format(start, "HH:mm")}-${format(end, "HH:mm")}`;

const formatTargetLabel = (dateStr, start, end) => {
  const parsedDate = new Date(dateStr);
  return `${format(parsedDate, "M/d")} ${formatTimeRange(start, end)}`;
};

const computeSafetyClearanceMinutes = ({
  candidateBuffered,
  otherBusyIntervals,
  bufferMinutes,
  dayStartBoundary,
  dayEndBoundary,
}) => {
  const otherBuffered = otherBusyIntervals
    .map((interval) => buildBufferedInterval(interval.start, interval.end, bufferMinutes))
    .sort((a, b) => a.start - b.start);

  let previousEnd = dayStartBoundary;
  let nextStart = dayEndBoundary;

  otherBuffered.forEach((interval) => {
    if (interval.end <= candidateBuffered.start && interval.end > previousEnd) {
      previousEnd = interval.end;
    }
    if (interval.start >= candidateBuffered.end && interval.start < nextStart) {
      nextStart = interval.start;
    }
  });

  const beforeGap = Math.max(0, differenceInMinutes(candidateBuffered.start, previousEnd));
  const afterGap = Math.max(0, differenceInMinutes(nextStart, candidateBuffered.end));

  return Math.min(beforeGap, afterGap);
};

const buildExplanation = ({
  dateStr,
  caseName,
  originalStart,
  originalEnd,
  proposedStart,
  proposedEnd,
  direction,
  moveMinutes,
  targetStart,
  targetEnd,
}) => {
  const actionLabel = direction === "early" ? "提早" : "延後";
  return `將「${caseName}」由 ${formatTimeRange(
    originalStart,
    originalEnd,
  )} ${actionLabel} ${moveMinutes} 分鐘至 ${formatTimeRange(
    proposedStart,
    proposedEnd,
  )}，可騰出 ${formatTargetLabel(dateStr, targetStart, targetEnd)}`;
};

const sortMovePlans = (a, b) => {
  if (a.movedCaseCount !== b.movedCaseCount) {
    return a.movedCaseCount - b.movedCaseCount;
  }

  if (a.moveMinutes !== b.moveMinutes) {
    return a.moveMinutes - b.moveMinutes;
  }

  if (a.safetyClearanceMinutes !== b.safetyClearanceMinutes) {
    return b.safetyClearanceMinutes - a.safetyClearanceMinutes;
  }

  if (a.direction !== b.direction) {
    return a.direction === "early" ? -1 : 1;
  }

  if (a.originalDistanceToTargetMinutes !== b.originalDistanceToTargetMinutes) {
    return a.originalDistanceToTargetMinutes - b.originalDistanceToTargetMinutes;
  }

  return (a.staff?.name || "").localeCompare(b.staff?.name || "", "zh-Hant");
};

export function buildMovePlans({
  dateStr,
  targetStartTime,
  targetEndTime,
  dayAvailability,
  bufferMinutes,
  caseSettings = {},
}) {
  if (!dateStr || !targetStartTime || !targetEndTime || !Array.isArray(dayAvailability)) {
    return [];
  }

  const targetStart = parseDateTime(dateStr, targetStartTime);
  const targetEnd = parseDateTime(dateStr, targetEndTime);

  if (!targetStart || !targetEnd || targetEnd <= targetStart) {
    return [];
  }

  const targetBuffered = buildBufferedInterval(targetStart, targetEnd, bufferMinutes);
  const dayStartBoundary = new Date(dateStr);
  dayStartBoundary.setHours(WORKDAY_START_HOUR, 0, 0, 0);

  const dayEndBoundary = new Date(dateStr);
  dayEndBoundary.setHours(WORKDAY_END_HOUR, 0, 0, 0);

  const candidates = [];

  dayAvailability.forEach((personAvailability) => {
    if (!personAvailability || personAvailability.isOff) return;

    const busyRaw = Array.isArray(personAvailability.busyRaw)
      ? [...personAvailability.busyRaw].sort((a, b) => a.start - b.start)
      : [];

    if (busyRaw.length === 0) return;

    const overlapping = busyRaw.filter((interval) =>
      areIntervalsOverlapping(
        buildBufferedInterval(interval.start, interval.end, bufferMinutes),
        targetBuffered,
      ),
    );

    if (overlapping.length !== 1) return;

    const busy = overlapping[0];
    const caseName = String(busy.caseName || "").trim();
    if (!caseName) return;

    const settings = caseSettings[caseName] || DEFAULT_CASE_SETTINGS;
    if (settings.isFixed) return;

    const otherBusyIntervals = busyRaw.filter((interval) => interval !== busy);
    const durationMinutes = Math.max(0, differenceInMinutes(busy.end, busy.start));
    if (durationMinutes <= 0) return;

    const originalDistanceToTargetMinutes = Math.abs(
      differenceInMinutes(busy.start, targetStart),
    );

    const directionConfigs = [
      {
        direction: "early",
        minimumRequiredOffset: differenceInMinutes(targetBuffered.start, busy.end),
        maximumAllowedOffset: -Math.max(0, Number(settings.early) || 0),
      },
      {
        direction: "late",
        minimumRequiredOffset: differenceInMinutes(targetBuffered.end, busy.start),
        maximumAllowedOffset: Math.max(0, Number(settings.late) || 0),
      },
    ];

    directionConfigs.forEach(({ direction, minimumRequiredOffset, maximumAllowedOffset }) => {
      let bestCandidate = null;

      const tryOffset = (minuteOffset) => {
        if (bestCandidate || minuteOffset === 0) return;

        const proposedStart = addMinutes(busy.start, minuteOffset);
        const proposedEnd = addMinutes(busy.end, minuteOffset);

        if (proposedStart < dayStartBoundary || proposedEnd > dayEndBoundary) {
          return;
        }

        const candidateBuffered = buildBufferedInterval(
          proposedStart,
          proposedEnd,
          bufferMinutes,
        );

        if (areIntervalsOverlapping(candidateBuffered, targetBuffered)) {
          return;
        }

        const collidesWithOthers = otherBusyIntervals.some((interval) =>
          areIntervalsOverlapping(
            candidateBuffered,
            buildBufferedInterval(interval.start, interval.end, bufferMinutes),
          ),
        );

        if (collidesWithOthers) {
          return;
        }

        const moveMinutes = Math.abs(minuteOffset);
        if (moveMinutes === 0) return;

        const safetyClearanceMinutes = computeSafetyClearanceMinutes({
          candidateBuffered,
          otherBusyIntervals,
          bufferMinutes,
          dayStartBoundary,
          dayEndBoundary,
        });

        bestCandidate = {
          staff: personAvailability.staff,
          orgId: personAvailability.staff?.orgId || null,
          movedCaseName: caseName,
          originalStart: busy.start,
          originalEnd: busy.end,
          proposedStart,
          proposedEnd,
          direction,
          moveMinutes,
          movedCaseCount: 1,
          safetyClearanceMinutes,
          originalDistanceToTargetMinutes,
        };
      };

      if (direction === "early") {
        if (minimumRequiredOffset >= 0 || maximumAllowedOffset >= 0) return;
        const startOffset = minimumRequiredOffset;
        const endOffset = maximumAllowedOffset;
        if (startOffset < endOffset) return;

        for (let minuteOffset = startOffset; minuteOffset >= endOffset; minuteOffset -= 1) {
          tryOffset(minuteOffset);
          if (bestCandidate) break;
        }
      } else {
        if (minimumRequiredOffset <= 0 || maximumAllowedOffset <= 0) return;
        const startOffset = minimumRequiredOffset;
        const endOffset = maximumAllowedOffset;
        if (startOffset > endOffset) return;

        for (let minuteOffset = startOffset; minuteOffset <= endOffset; minuteOffset += 1) {
          tryOffset(minuteOffset);
          if (bestCandidate) break;
        }
      }

      if (!bestCandidate) return;

      candidates.push({
        ...bestCandidate,
        explanation: buildExplanation({
          dateStr,
          caseName,
          originalStart: bestCandidate.originalStart,
          originalEnd: bestCandidate.originalEnd,
          proposedStart: bestCandidate.proposedStart,
          proposedEnd: bestCandidate.proposedEnd,
          direction: bestCandidate.direction,
          moveMinutes: bestCandidate.moveMinutes,
          targetStart,
          targetEnd,
        }),
      });
    });
  });

  return candidates
    .sort(sortMovePlans)
    .map((candidate, index) => ({
      ...candidate,
      score: index + 1,
    }));
}
