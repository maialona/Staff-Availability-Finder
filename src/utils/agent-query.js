import { eachDayOfInterval, format, isValid } from "date-fns";
import { calculateDailyAvailability, applyServiceFilter } from "./availability";
import { applyTimeFilter } from "./filtering";

const DAY_START = "06:00";
const DAY_END = "22:00";

export const SUPPORTED_AGENT_INTENTS = [
  "find_staff_for_dates",
  "find_staff_for_weekly_pattern",
  "check_person_availability",
];

const STATUS_LABEL = {
  available: "完全空閒",
  potential: "可彈性調整",
  offDuty: "休假 / 例假",
  unavailable: "無空檔",
};

const getStaffKey = (staff) => staff.staffKey || staff.id || staff.name;

const formatDateValue = (value) => {
  if (value === null || value === undefined) return null;

  if (value instanceof Date) {
    return isValid(value) ? format(value, "yyyy-MM-dd") : null;
  }

  const normalized = String(value).trim();
  if (!normalized) return null;

  const parsed = new Date(normalized);
  return isValid(parsed) ? format(parsed, "yyyy-MM-dd") : null;
};

const formatTimeRange = (start, end) => `${start}~${end}`;

const buildDateContext = (scheduleData = []) => {
  const dates = scheduleData
    .map((record) => formatDateValue(record["服務日期"]))
    .filter(Boolean);

  const uniqueDates = [...new Set(dates)].sort();

  return {
    availableDates: new Set(uniqueDates),
    minDate: uniqueDates[0] || null,
    maxDate: uniqueDates[uniqueDates.length - 1] || null,
  };
};

const parseDateTimeForFilter = (dateStr, timeStr) => {
  if (!dateStr || !timeStr) return null;
  const [hours, minutes] = String(timeStr).split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  const parsed = new Date(dateStr);
  parsed.setHours(hours, minutes, 0, 0);
  return parsed;
};

const clipInterval = (interval, rangeStart, rangeEnd) => {
  const start = new Date(Math.max(interval.start.getTime(), rangeStart.getTime()));
  const end = new Date(Math.min(interval.end.getTime(), rangeEnd.getTime()));
  if (end <= start) return null;
  return { start, end };
};

const getMatchingFreeIntervals = ({
  freeIntervals,
  date,
  timeWindowStart,
  timeWindowEnd,
  requiredMinutes,
}) => {
  if (!Array.isArray(freeIntervals) || freeIntervals.length === 0) return [];
  if (!timeWindowStart || !timeWindowEnd) return freeIntervals;

  const rangeStart = parseDateTimeForFilter(date, timeWindowStart);
  const rangeEnd = parseDateTimeForFilter(date, timeWindowEnd);
  if (!rangeStart || !rangeEnd || rangeEnd <= rangeStart) return [];

  return freeIntervals
    .map((interval) => clipInterval(interval, rangeStart, rangeEnd))
    .filter(Boolean)
    .filter((interval) => {
      if (!requiredMinutes) return true;
      return interval.end.getTime() - interval.start.getTime() >= requiredMinutes * 60000;
    });
};

const formatSlotList = (slots) => {
  if (!slots || slots.length === 0) return "無可用空檔";
  return slots
    .map((slot) => `${format(slot.start, "HH:mm")}-${format(slot.end, "HH:mm")}`)
    .join("、");
};

const getStaffResultMap = (dayResult) => {
  const resultMap = new Map();

  dayResult.available.forEach((person) => {
    resultMap.set(getStaffKey(person.staff), {
      status: "available",
      person,
    });
  });

  dayResult.potential.forEach((person) => {
    const key = getStaffKey(person.staff);
    if (!resultMap.has(key)) {
      resultMap.set(key, {
        status: "potential",
        person,
      });
    }
  });

  dayResult.offDuty.forEach((person) => {
    const key = getStaffKey(person.staff);
    if (!resultMap.has(key)) {
      resultMap.set(key, {
        status: "offDuty",
        person,
      });
    }
  });

  return resultMap;
};

const buildResultReason = ({
  date,
  entry,
  timeWindowStart,
  timeWindowEnd,
  requiredMinutes,
}) => {
  const labelPrefix = `${date}：`;

  if (!entry) {
    return `${labelPrefix}${STATUS_LABEL.unavailable}`;
  }

  if (entry.status === "available") {
    const matchingSlots = getMatchingFreeIntervals({
      freeIntervals: entry.person.free || [],
      date,
      timeWindowStart,
      timeWindowEnd,
      requiredMinutes,
    });

    if (timeWindowStart && timeWindowEnd && requiredMinutes) {
      return `${labelPrefix}${STATUS_LABEL.available}，${formatTimeRange(
        timeWindowStart,
        timeWindowEnd,
      )} 內有至少 ${requiredMinutes} 分鐘空檔`;
    }

    if (timeWindowStart && timeWindowEnd) {
      return `${labelPrefix}${STATUS_LABEL.available}，完整涵蓋 ${formatTimeRange(
        timeWindowStart,
        timeWindowEnd,
      )}`;
    }

    return `${labelPrefix}${STATUS_LABEL.available}，空檔：${formatSlotList(matchingSlots)}`;
  }

  if (entry.status === "potential") {
    const firstFlex = entry.person.flexContexts?.[0];
    if (firstFlex) {
      return `${labelPrefix}${STATUS_LABEL.potential}，需調整「${firstFlex.caseName}」${
        firstFlex.canMoveEarly ? `提早 ${firstFlex.early} 分鐘` : `延後 ${firstFlex.late} 分鐘`
      }`;
    }

    return `${labelPrefix}${STATUS_LABEL.potential}`;
  }

  if (entry.status === "offDuty") {
    return `${labelPrefix}${STATUS_LABEL.offDuty}`;
  }

  return `${labelPrefix}${STATUS_LABEL.unavailable}`;
};

const buildNoDataError = (date, minDate, maxDate) => ({
  status: "error",
  text: `資料中沒有 ${date} 的排班資料。${minDate && maxDate ? `目前資料區間是 ${minDate} ~ ${maxDate}。` : ""}`,
});

const buildExactStaffMatches = (staffData, staffName) => {
  const normalized = String(staffName || "").trim();
  if (!normalized) return [];
  return staffData.filter((staff) => String(staff.name || "").trim() === normalized);
};

const buildExactMultiStaffMatches = (staffData, staffNames = []) => {
  const normalizedNames = [...new Set(
    (staffNames || []).map((name) => String(name || "").trim()).filter(Boolean),
  )];

  if (normalizedNames.length === 0) return [];

  return normalizedNames.flatMap((name) => buildExactStaffMatches(staffData, name));
};

const getRequestedStaffNames = (query) => {
  const requestedNames = [
    ...(Array.isArray(query?.staffNames) ? query.staffNames : []),
    ...(query?.staffName ? [query.staffName] : []),
  ]
    .map((name) => String(name || "").trim())
    .filter(Boolean);

  return [...new Set(requestedNames)];
};

const getScopedStaffData = (staffData, query) => {
  const multiStaffMatches = buildExactMultiStaffMatches(staffData, query?.staffNames);
  if (multiStaffMatches.length > 0) {
    return multiStaffMatches;
  }

  const singleStaffMatches = buildExactStaffMatches(staffData, query?.staffName);
  if (singleStaffMatches.length > 0) {
    return singleStaffMatches;
  }

  return staffData;
};

const buildStaffSuggestions = (staffData, staffName) => {
  const normalized = String(staffName || "").trim();
  if (!normalized) return [];

  return [...new Set(
    staffData
      .map((staff) => staff.name)
      .filter(
        (name) =>
          String(name).includes(normalized) || normalized.includes(String(name)),
      ),
  )].slice(0, 5);
};

const buildAnswerPayload = (title, lines) => {
  const text = [title, ...lines].join("\n");
  return { status: "ok", text, copyText: text };
};

const isMatchedStatus = (status) => status === "available" || status === "potential";
const isOffDutyStatus = (status) => status === "offDuty";

const collectResultStaffMap = (perDate = []) => {
  const resultStaffMap = new Map();

  perDate.forEach(({ result }) => {
    ["available", "potential", "offDuty"].forEach((bucket) => {
      (result?.[bucket] || []).forEach((person) => {
        const key = getStaffKey(person.staff);
        if (!resultStaffMap.has(key)) {
          resultStaffMap.set(key, person.staff);
        }
      });
    });
  });

  return resultStaffMap;
};

const runSingleDateFilter = ({
  date,
  scheduleData,
  staffData,
  bufferBuffer,
  caseSettings,
  timeWindowStart,
  timeWindowEnd,
  requiredMinutes,
}) => {
  const dayAvailability = calculateDailyAvailability(
    date,
    scheduleData,
    staffData,
    bufferBuffer,
  );

  if (timeWindowStart && timeWindowEnd && requiredMinutes) {
    return applyServiceFilter(
      dayAvailability,
      date,
      timeWindowStart,
      timeWindowEnd,
      requiredMinutes,
      bufferBuffer,
      caseSettings,
    );
  }

  if (timeWindowStart && timeWindowEnd) {
    return applyTimeFilter(
      dayAvailability,
      date,
      timeWindowStart,
      timeWindowEnd,
      bufferBuffer,
      caseSettings,
    );
  }

  return {
    available: dayAvailability.filter((person) => !person.isOff && person.free.length > 0),
    potential: [],
    offDuty: dayAvailability.filter((person) => person.isOff),
  };
};

const executeFindStaffForDates = ({
  query,
  scheduleData,
  staffData,
  bufferBuffer,
  caseSettings,
}) => {
  const { availableDates, minDate, maxDate } = buildDateContext(scheduleData);
  const dates = [...new Set((query.dates || []).map(formatDateValue).filter(Boolean))];
  const requestedNames = getRequestedStaffNames(query);
  const scopedStaffData = getScopedStaffData(staffData, query);

  if (dates.length === 0) {
    return { status: "error", text: "AI 沒有解析出任何有效日期。" };
  }

  if (requestedNames.length > 0 && scopedStaffData.length === 0) {
    return {
      status: "error",
      text: `找不到指定員工：${requestedNames.join("、")}。`,
    };
  }

  const missingDate = dates.find((date) => !availableDates.has(date));
  if (missingDate) {
    return buildNoDataError(missingDate, minDate, maxDate);
  }

  const perDate = dates.map((date) => ({
    date,
    result: runSingleDateFilter({
      date,
      scheduleData,
      staffData: scopedStaffData,
      bufferBuffer,
      caseSettings,
      timeWindowStart: query.timeWindowStart,
      timeWindowEnd: query.timeWindowEnd,
      requiredMinutes: query.requiredMinutes,
    }),
  }));

  const dateMatchMode = query.dateMatchMode === "any" ? "any" : "all";
  const includeOffDuty = Boolean(query.includeOffDuty);
  const resultStaffMap = collectResultStaffMap(perDate);
  const candidateStaffList =
    requestedNames.length > 0
      ? scopedStaffData
      : [...new Map([
          ...scopedStaffData.map((staff) => [getStaffKey(staff), staff]),
          ...resultStaffMap.entries(),
        ]).values()];

  const evaluatedCandidates = candidateStaffList
    .map((staff) => {
      const key = getStaffKey(staff);
      const statuses = perDate.map(({ date, result }) => {
        const entry = getStaffResultMap(result).get(key);
        return {
          date,
          entry,
          status: entry?.status || "unavailable",
        };
      });

      const matchedStatuses = statuses.filter(({ status }) => isMatchedStatus(status));
      const offDutyStatuses = statuses.filter(({ status }) => isOffDutyStatus(status));
      const matchesEveryDate = statuses.every(({ status }) => isMatchedStatus(status));
      const matchesAnyDate = matchedStatuses.length > 0;
      const offDutyEveryDate = statuses.every(({ status }) => isOffDutyStatus(status));
      const offDutyAnyDate = offDutyStatuses.length > 0;

      const matchesAvailability =
        dateMatchMode === "all" ? matchesEveryDate : matchesAnyDate;
      const matchesOffDuty =
        dateMatchMode === "all" ? offDutyEveryDate : offDutyAnyDate;

      if (!matchesAvailability && !(includeOffDuty && matchesOffDuty)) return null;

      const relevantAvailabilityStatuses = dateMatchMode === "any" ? matchedStatuses : statuses;
      const relevantOffDutyStatuses = dateMatchMode === "any" ? offDutyStatuses : statuses;

      return {
        staff,
        availability: matchesAvailability
          ? {
              hasPotential: relevantAvailabilityStatuses.some(
                ({ status }) => status === "potential",
              ),
              reasons: relevantAvailabilityStatuses.map(({ date, entry }) =>
                buildResultReason({
                  date,
                  entry,
                  timeWindowStart: query.timeWindowStart,
                  timeWindowEnd: query.timeWindowEnd,
                  requiredMinutes: query.requiredMinutes,
                }),
              ),
            }
          : null,
        offDuty: includeOffDuty && matchesOffDuty
          ? {
              reasons: relevantOffDutyStatuses.map(({ date, entry }) =>
                buildResultReason({
                  date,
                  entry,
                  timeWindowStart: query.timeWindowStart,
                  timeWindowEnd: query.timeWindowEnd,
                  requiredMinutes: query.requiredMinutes,
                }),
              ),
            }
          : null,
      };
    })
    .filter(Boolean);

  const availabilityCandidates = evaluatedCandidates.filter(
    (candidate) => candidate.availability,
  );
  const offDutyCandidates = evaluatedCandidates.filter((candidate) => candidate.offDuty);

  if (availabilityCandidates.length === 0 && offDutyCandidates.length === 0) {
    return {
      status: "ok",
      text:
        dateMatchMode === "any"
          ? `沒有任何人在 ${dates.join("、")} 之中任一天符合條件。`
          : `沒有任何人同時符合 ${dates.join("、")} 的條件。`,
      copyText:
        dateMatchMode === "any"
          ? `沒有任何人在 ${dates.join("、")} 之中任一天符合條件。`
          : `沒有任何人同時符合 ${dates.join("、")} 的條件。`,
    };
  }

  const lines = [];

  if (availabilityCandidates.length > 0) {
    lines.push(
      dateMatchMode === "any"
        ? `可出勤人員：共 ${availabilityCandidates.length} 位在 ${dates.join("、")} 之中至少一天符合條件。`
        : `可出勤人員：共 ${availabilityCandidates.length} 位符合 ${dates.length} 天條件。`,
    );
    lines.push(
      ...availabilityCandidates.flatMap((candidate) => {
        const label = `${candidate.staff.name}${candidate.staff.org ? `（${candidate.staff.org}）` : ""}`;
        return [
          ``,
          `${label}${candidate.availability.hasPotential ? "｜含可彈性調整" : ""}`,
          ...candidate.availability.reasons,
        ];
      }),
    );
  }

  if (offDutyCandidates.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(
      dateMatchMode === "any"
        ? `休假 / 例假人員：共 ${offDutyCandidates.length} 位在 ${dates.join("、")} 之中至少一天為休假。`
        : `休假 / 例假人員：共 ${offDutyCandidates.length} 位在 ${dates.length} 天皆為休假。`,
    );
    lines.push(
      ...offDutyCandidates.flatMap((candidate) => {
        const label = `${candidate.staff.name}${candidate.staff.org ? `（${candidate.staff.org}）` : ""}`;
        return ["", label, ...candidate.offDuty.reasons];
      }),
    );
  }

  return buildAnswerPayload("查詢結果", lines);
};

const executeFindStaffForWeeklyPattern = ({
  query,
  scheduleData,
  staffData,
  bufferBuffer,
  caseSettings,
}) => {
  const { availableDates, minDate, maxDate } = buildDateContext(scheduleData);
  const start = formatDateValue(query.dateRangeStart) || minDate;
  const end = formatDateValue(query.dateRangeEnd) || maxDate;

  if (!start || !end) {
    return { status: "error", text: "AI 沒有解析出有效的日期範圍。" };
  }

  const intervalDates = eachDayOfInterval({
    start: new Date(start),
    end: new Date(end),
  })
    .map((date) => format(date, "yyyy-MM-dd"))
    .filter((date) => (query.weekdayValues || []).includes(new Date(date).getDay()))
    .filter((date) => availableDates.has(date));

  if (intervalDates.length === 0) {
    return {
      status: "error",
      text: `在 ${start} ~ ${end} 之間找不到可用資料。${minDate && maxDate ? `目前資料區間是 ${minDate} ~ ${maxDate}。` : ""}`,
    };
  }

  return executeFindStaffForDates({
    query: {
      ...query,
      dates: intervalDates,
      timeWindowStart: query.timeWindowStart || DAY_START,
      timeWindowEnd: query.timeWindowEnd || DAY_END,
    },
    scheduleData,
    staffData,
    bufferBuffer,
    caseSettings,
  });
};

const executeCheckPersonAvailability = ({
  query,
  scheduleData,
  staffData,
  bufferBuffer,
  caseSettings,
}) => {
  const { availableDates, minDate, maxDate } = buildDateContext(scheduleData);
  const multiStaffMatches = buildExactMultiStaffMatches(staffData, query.staffNames);
  const staffMatches =
    multiStaffMatches.length > 0
      ? multiStaffMatches
      : buildExactStaffMatches(staffData, query.staffName);

  if (staffMatches.length === 0) {
    const fallbackName =
      query.staffName || (Array.isArray(query.staffNames) ? query.staffNames[0] : "");
    const suggestions = buildStaffSuggestions(staffData, fallbackName);
    return {
      status: "error",
      text:
        suggestions.length > 0
          ? `找不到「${fallbackName}」。你是不是想找：${suggestions.join("、")}？`
          : `找不到「${fallbackName}」。`,
    };
  }

  const dates = [...new Set((query.dates || []).map(formatDateValue).filter(Boolean))];
  if (dates.length === 0) {
    return { status: "error", text: "AI 沒有解析出任何有效日期。" };
  }

  const missingDate = dates.find((date) => !availableDates.has(date));
  if (missingDate) {
    return buildNoDataError(missingDate, minDate, maxDate);
  }

  const lines = [
    `共查詢 ${staffMatches.length} 位同名員工，日期：${dates.join("、")}`,
  ];

  staffMatches.forEach((staff) => {
    lines.push("");
    lines.push(`${staff.name}${staff.org ? `（${staff.org}）` : ""}`);

    dates.forEach((date) => {
      const dayResult = runSingleDateFilter({
        date,
        scheduleData,
        staffData: [staff],
        bufferBuffer,
        caseSettings,
        timeWindowStart: query.timeWindowStart,
        timeWindowEnd: query.timeWindowEnd,
        requiredMinutes: query.requiredMinutes,
      });

      const entry = getStaffResultMap(dayResult).get(getStaffKey(staff));
      lines.push(
        buildResultReason({
          date,
          entry,
          timeWindowStart: query.timeWindowStart,
          timeWindowEnd: query.timeWindowEnd,
          requiredMinutes: query.requiredMinutes,
        }),
      );

      if (!query.timeWindowStart && !query.timeWindowEnd && entry?.person?.free?.length) {
        lines.push(`空檔：${formatSlotList(entry.person.free)}`);
      }
    });
  });

  return buildAnswerPayload("指定員工查詢", lines);
};

export function executeAgentQuery({
  parsedQuery,
  scheduleData,
  staffData,
  bufferBuffer,
  caseSettings,
}) {
  if (!parsedQuery || !parsedQuery.intent) {
    return { status: "error", text: "AI 沒有回傳可執行的查詢。" };
  }

  if (!Array.isArray(staffData) || staffData.length === 0 || !Array.isArray(scheduleData) || scheduleData.length === 0) {
    return { status: "error", text: "目前還沒有可查詢的班表資料，請先上傳資料。" };
  }

  switch (parsedQuery.intent) {
    case "find_staff_for_dates":
      return executeFindStaffForDates({
        query: parsedQuery.query || {},
        scheduleData,
        staffData,
        bufferBuffer,
        caseSettings,
      });
    case "find_staff_for_weekly_pattern":
      return executeFindStaffForWeeklyPattern({
        query: parsedQuery.query || {},
        scheduleData,
        staffData,
        bufferBuffer,
        caseSettings,
      });
    case "check_person_availability":
      return executeCheckPersonAvailability({
        query: parsedQuery.query || {},
        scheduleData,
        staffData,
        bufferBuffer,
        caseSettings,
      });
    default:
      return { status: "error", text: "AI 回傳了不支援的查詢類型。" };
  }
}
