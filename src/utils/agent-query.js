import { eachDayOfInterval, format, isValid } from "date-fns";
import { calculateDailyAvailability, applyServiceFilter } from "./availability.js";
import { applyTimeFilter } from "./filtering.js";

const DAY_START = "06:00";
const DAY_END = "22:00";

export const SUPPORTED_AGENT_INTENTS = [
  "find_staff_for_dates",
  "find_staff_for_weekly_pattern",
  "check_person_availability",
];

const STATUS_LABEL = {
  available: "可排班",
  potential: "可彈性調整",
  offDuty: "休假 / 休息日",
  unavailable: "無空檔",
};

const DATE_KEY_CANDIDATES = ["日期", "date", "???交?"];

const getStaffKey = (staff) => staff.staffKey || staff.id || staff.name;

const findScheduleDateValue = (record = {}) => {
  for (const key of DATE_KEY_CANDIDATES) {
    if (key in record) return record[key];
  }

  return Object.entries(record).find(([, value]) => {
    if (value instanceof Date) return true;
    if (typeof value !== "string") return false;
    return /\d{4}-\d{1,2}-\d{1,2}/.test(value) || /\d{1,2}\/\d{1,2}/.test(value);
  })?.[1];
};

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

export const buildDateContext = (scheduleData = []) => {
  const dates = scheduleData
    .map((record) => formatDateValue(findScheduleDateValue(record)))
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
      return `${labelPrefix}${STATUS_LABEL.available}，在 ${formatTimeRange(
        timeWindowStart,
        timeWindowEnd,
      )} 內至少有 ${requiredMinutes} 分鐘空檔`;
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
      return `${labelPrefix}${STATUS_LABEL.potential}，可透過調整「${firstFlex.caseName}」騰出時間`;
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
  text: `找不到 ${date} 的排班資料。${
    minDate && maxDate ? `目前資料區間是 ${minDate} ~ ${maxDate}。` : ""
  }`,
});

const buildExactStaffMatches = (staffData, staffName) => {
  const normalized = String(staffName || "").trim();
  if (!normalized) return [];
  return staffData.filter((staff) => String(staff.name || "").trim() === normalized);
};

const buildExactMultiStaffMatches = (staffData, staffNames = []) => {
  const normalizedNames = [
    ...new Set((staffNames || []).map((name) => String(name || "").trim()).filter(Boolean)),
  ];

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

  return [
    ...new Set(
      staffData
        .map((staff) => staff.name)
        .filter(
          (name) =>
            String(name).includes(normalized) || normalized.includes(String(name)),
        ),
    ),
  ].slice(0, 5);
};

const buildAnswerPayload = (title, lines, extra = {}) => {
  const text = [title, ...lines].join("\n");
  return { status: "ok", text, copyText: text, ...extra };
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

const buildNoMatchText = (dates, dateMatchMode, minMatchingDays) => {
  if (minMatchingDays) {
    return `沒有找到在 ${dates.join("、")} 之中至少 ${minMatchingDays} 天符合條件的人。`;
  }

  return dateMatchMode === "any"
    ? `沒有找到在 ${dates.join("、")} 之中任一天符合條件的人。`
    : `沒有找到在 ${dates.join("、")} 每一天都符合條件的人。`;
};

const buildTimeSummary = ({ timeWindowStart, timeWindowEnd, requiredMinutes }) => {
  if (timeWindowStart && timeWindowEnd && requiredMinutes) {
    return `${formatTimeRange(timeWindowStart, timeWindowEnd)} 內至少 ${requiredMinutes} 分鐘空檔`;
  }

  if (timeWindowStart && timeWindowEnd) {
    return `完整涵蓋 ${formatTimeRange(timeWindowStart, timeWindowEnd)}`;
  }

  return "不限特定時段";
};

const buildStaffCard = (staff, details, group) => ({
  staffKey: getStaffKey(staff),
  name: staff.name,
  org: staff.org || "",
  matchCount: details.reasons.length,
  hasPotential: Boolean(details.hasPotential),
  reasons: details.reasons,
  group,
});

const buildFindStaffStructuredResult = ({
  title,
  dates,
  dateMatchMode,
  minMatchingDays,
  includeOffDuty,
  timeWindowStart,
  timeWindowEnd,
  requiredMinutes,
  availabilityCandidates,
  offDutyCandidates,
}) => {
  const staffCards = [
    ...availabilityCandidates.map((candidate) =>
      buildStaffCard(candidate.staff, candidate.availability, "available"),
    ),
    ...offDutyCandidates.map((candidate) =>
      buildStaffCard(candidate.staff, candidate.offDuty, "offDuty"),
    ),
  ];

  return {
    title,
    resultType: "staff_match",
    summary: {
      totalMatches: availabilityCandidates.length,
      offDutyMatches: offDutyCandidates.length,
      dateCount: dates.length,
      dates,
      dateMatchMode,
      minMatchingDays: minMatchingDays || null,
      includeOffDuty,
      timeSummary: buildTimeSummary({
        timeWindowStart,
        timeWindowEnd,
        requiredMinutes,
      }),
      headline:
        minMatchingDays
          ? `共 ${availabilityCandidates.length} 位人員在指定日期中至少 ${minMatchingDays} 天符合條件`
          : dateMatchMode === "any"
          ? `共 ${availabilityCandidates.length} 位人員在指定日期中至少一天符合條件`
          : `共 ${availabilityCandidates.length} 位人員符合全部 ${dates.length} 天條件`,
    },
    staffCards,
  };
};

const expandDateRange = (start, end) => {
  if (!start || !end) return [];

  return eachDayOfInterval({
    start: new Date(start),
    end: new Date(end),
  }).map((date) => format(date, "yyyy-MM-dd"));
};

export const executeFindStaffForDates = ({
  query,
  scheduleData,
  staffData,
  bufferBuffer,
  caseSettings,
}) => {
  const { availableDates, minDate, maxDate } = buildDateContext(scheduleData);
  const explicitDates = (query.dates || []).map(formatDateValue).filter(Boolean);
  const rangeDates =
    explicitDates.length === 0 && query.dateRangeStart && query.dateRangeEnd
      ? expandDateRange(
          formatDateValue(query.dateRangeStart),
          formatDateValue(query.dateRangeEnd),
        )
      : [];
  const dates = [...new Set([...explicitDates, ...rangeDates].filter(Boolean))];
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
  const minMatchingDays = Number.isInteger(query.minMatchingDays) && query.minMatchingDays > 0
    ? Math.min(query.minMatchingDays, dates.length)
    : null;
  const includeOffDuty = Boolean(query.includeOffDuty);
  const resultStaffMap = collectResultStaffMap(perDate);
  const candidateStaffList =
    requestedNames.length > 0
      ? scopedStaffData
      : [
          ...new Map([
            ...scopedStaffData.map((staff) => [getStaffKey(staff), staff]),
            ...resultStaffMap.entries(),
          ]).values(),
        ];

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
      const matchesMinDays = minMatchingDays ? matchedStatuses.length >= minMatchingDays : false;
      const offDutyMinDays = minMatchingDays ? offDutyStatuses.length >= minMatchingDays : false;

      const matchesAvailability = minMatchingDays
        ? matchesMinDays
        : dateMatchMode === "all"
          ? matchesEveryDate
          : matchesAnyDate;
      const matchesOffDuty = minMatchingDays
        ? offDutyMinDays
        : dateMatchMode === "all"
          ? offDutyEveryDate
          : offDutyAnyDate;

      if (!matchesAvailability && !(includeOffDuty && matchesOffDuty)) return null;

      const relevantAvailabilityStatuses = minMatchingDays || dateMatchMode === "any"
        ? matchedStatuses
        : statuses;
      const relevantOffDutyStatuses = minMatchingDays || dateMatchMode === "any"
        ? offDutyStatuses
        : statuses;

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
      text: buildNoMatchText(dates, dateMatchMode, minMatchingDays),
      copyText: buildNoMatchText(dates, dateMatchMode, minMatchingDays),
    };
  }

  const lines = [];

  if (availabilityCandidates.length > 0) {
    lines.push(
      minMatchingDays
        ? `可出勤人員：共 ${availabilityCandidates.length} 位在 ${dates.join("、")} 之中至少 ${minMatchingDays} 天符合條件。`
        : dateMatchMode === "any"
        ? `可出勤人員：共 ${availabilityCandidates.length} 位在 ${dates.join("、")} 之中至少一天符合條件。`
        : `可出勤人員：共 ${availabilityCandidates.length} 位符合全部 ${dates.length} 天條件。`,
    );
    lines.push(
      ...availabilityCandidates.flatMap((candidate) => {
        const label = `${candidate.staff.name}${candidate.staff.org ? `（${candidate.staff.org}）` : ""}`;
        return [
          "",
          `${label}${candidate.availability.hasPotential ? "｜含可彈性調整" : ""}`,
          ...candidate.availability.reasons,
        ];
      }),
    );
  }

  if (offDutyCandidates.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(
      minMatchingDays
        ? `休假 / 休息日：共 ${offDutyCandidates.length} 位在 ${dates.join("、")} 之中至少 ${minMatchingDays} 天不出勤。`
        : dateMatchMode === "any"
        ? `休假 / 休息日：共 ${offDutyCandidates.length} 位在 ${dates.join("、")} 之中至少一天不出勤。`
        : `休假 / 休息日：共 ${offDutyCandidates.length} 位在全部 ${dates.length} 天都不出勤。`,
    );
    lines.push(
      ...offDutyCandidates.flatMap((candidate) => {
        const label = `${candidate.staff.name}${candidate.staff.org ? `（${candidate.staff.org}）` : ""}`;
        return ["", label, ...candidate.offDuty.reasons];
      }),
    );
  }

  return buildAnswerPayload("查詢結果", lines, {
    structuredResult: buildFindStaffStructuredResult({
      title: "查詢結果",
      dates,
      dateMatchMode,
      minMatchingDays,
      includeOffDuty,
      timeWindowStart: query.timeWindowStart,
      timeWindowEnd: query.timeWindowEnd,
      requiredMinutes: query.requiredMinutes,
      availabilityCandidates,
      offDutyCandidates,
    }),
  });
};

export const executeFindStaffForWeeklyPattern = ({
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
      text: `在 ${start} ~ ${end} 之內沒有符合指定星期的排班資料。${
        minDate && maxDate ? `目前資料區間是 ${minDate} ~ ${maxDate}。` : ""
      }`,
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

export const executeCheckPersonAvailability = ({
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
          ? `找不到「${fallbackName}」，你是不是想查：${suggestions.join("、")}？`
          : `找不到員工「${fallbackName}」。`,
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
    `查詢 ${staffMatches.length} 位員工在 ${dates.join("、")} 的排班：`,
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

  return buildAnswerPayload("員工空檔查詢", lines);
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

  if (
    !Array.isArray(staffData) ||
    staffData.length === 0 ||
    !Array.isArray(scheduleData) ||
    scheduleData.length === 0
  ) {
    return { status: "error", text: "目前沒有可供 AI 查詢的排班或員工資料。" };
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
