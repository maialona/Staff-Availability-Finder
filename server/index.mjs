import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCrossRegionDistancesWithFileCache } from "./cross-region.mjs";

const loadEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, "utf8");
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) return;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  });
};

loadEnvFile(path.resolve(process.cwd(), ".env"));
loadEnvFile(path.resolve(process.cwd(), ".env.local"));

const PORT = Number(process.env.PORT || process.env.AGENT_API_PORT || 8787);
const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DIST_DIR = path.resolve(PROJECT_ROOT, "dist");
const INDEX_FILE = path.join(DIST_DIR, "index.html");

const STATIC_FILE_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const DAY_PART_WINDOWS = Object.freeze({
  morning: { start: "08:00", end: "12:00" },
  afternoon: { start: "12:00", end: "18:00" },
  evening: { start: "18:00", end: "22:00" },
});

const QUERY_OBJECT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    staffName: {
      type: ["string", "null"],
    },
    staffNames: {
      type: ["array", "null"],
      items: { type: "string" },
    },
    dates: {
      type: ["array", "null"],
      items: { type: "string" },
    },
    weekdayValues: {
      type: ["array", "null"],
      items: {
        type: "integer",
        enum: [0, 1, 2, 3, 4, 5, 6],
      },
    },
    dateRangeStart: {
      type: ["string", "null"],
    },
    dateRangeEnd: {
      type: ["string", "null"],
    },
    timeWindowStart: {
      type: ["string", "null"],
    },
    timeWindowEnd: {
      type: ["string", "null"],
    },
    requiredMinutes: {
      type: ["integer", "null"],
    },
    minMatchingDays: {
      type: ["integer", "null"],
    },
    dateMatchMode: {
      type: ["string", "null"],
      enum: ["all", "any", null],
    },
    includeOffDuty: {
      type: ["boolean", "null"],
    },
    includePotential: {
      type: ["boolean", "null"],
    },
  },
  required: [
    "staffName",
    "staffNames",
    "dates",
    "weekdayValues",
    "dateRangeStart",
    "dateRangeEnd",
    "timeWindowStart",
    "timeWindowEnd",
    "requiredMinutes",
    "minMatchingDays",
    "dateMatchMode",
    "includeOffDuty",
    "includePotential",
  ],
};

const QUERY_KEYS = QUERY_OBJECT_SCHEMA.required;
const EMPTY_QUERY = Object.freeze(
  Object.fromEntries(QUERY_KEYS.map((key) => [key, null])),
);

const QUERY_SCHEMA = {
  name: "agent_query",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      status: {
        type: "string",
        enum: ["ok", "needs_clarification", "error"],
      },
      intent: {
        type: "string",
        enum: [
          "find_staff_for_dates",
          "find_staff_for_weekly_pattern",
          "check_person_availability",
          "none",
        ],
      },
      explanation: {
        type: "string",
      },
      clarification: {
        type: "string",
      },
      pendingIntent: {
        type: ["string", "null"],
        enum: [
          "find_staff_for_dates",
          "find_staff_for_weekly_pattern",
          "check_person_availability",
          "none",
          null,
        ],
      },
      query: QUERY_OBJECT_SCHEMA,
      partialQuery: QUERY_OBJECT_SCHEMA,
      missingFields: {
        type: ["array", "null"],
        items: { type: "string" },
      },
    },
    required: [
      "status",
      "intent",
      "explanation",
      "clarification",
      "pendingIntent",
      "query",
      "partialQuery",
      "missingFields",
    ],
  },
};

export const normalizeQueryShape = (query = {}) =>
  QUERY_KEYS.reduce((acc, key) => {
    acc[key] = key in (query || {}) ? query[key] : EMPTY_QUERY[key];
    return acc;
  }, {});

const isMeaningfulQueryValue = (value) => {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number" || typeof value === "boolean") return true;
  return value !== null && value !== undefined;
};

const mergePendingQuery = (baseQuery = {}, incomingQuery = {}) => {
  const normalizedBase = normalizeQueryShape(baseQuery);
  const normalizedIncoming = normalizeQueryShape(incomingQuery);

  return QUERY_KEYS.reduce((acc, key) => {
    const nextValue = normalizedIncoming[key];
    acc[key] = isMeaningfulQueryValue(nextValue) ? nextValue : normalizedBase[key];
    return acc;
  }, {});
};

const toHalfWidthDigits = (value = "") =>
  String(value).replace(/[０-９]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0xfee0),
  );

const normalizeMessageText = (value = "") =>
  toHalfWidthDigits(value)
    .replace(/[，、]/g, " ")
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")")
    .replace(/[：]/g, ":")
    .replace(/[～—–－]/g, "~")
    .replace(/\s+/g, " ")
    .trim();

const padTimePart = (value) => String(value).padStart(2, "0");
const formatTimeValue = (hours, minutes) => `${padTimePart(hours)}:${padTimePart(minutes)}`;

const isValidDateString = (value) =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

const parseSlashDate = (value, today) => {
  const match = String(value).match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (!match) return null;

  const [, monthStr, dayStr, yearStr] = match;
  const baseYear = yearStr
    ? Number(yearStr.length === 2 ? `20${yearStr}` : yearStr)
    : Number(String(today || "").slice(0, 4));
  const month = Number(monthStr);
  const day = Number(dayStr);
  const date = new Date(baseYear, month - 1, day);

  if (Number.isNaN(date.getTime())) return null;

  return `${date.getFullYear()}-${padTimePart(date.getMonth() + 1)}-${padTimePart(date.getDate())}`;
};

const unique = (values = []) =>
  [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ""))];

const parseIsoDateString = (value) => {
  if (!isValidDateString(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
};

const shiftDateByDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const formatDateString = (date) =>
  `${date.getFullYear()}-${padTimePart(date.getMonth() + 1)}-${padTimePart(date.getDate())}`;

const getMondayBasedWeekRange = (baseDate, weekOffset = 0) => {
  const shiftedDate = shiftDateByDays(baseDate, weekOffset * 7);
  const day = shiftedDate.getDay();
  const offsetToMonday = day === 0 ? -6 : 1 - day;
  const start = shiftDateByDays(shiftedDate, offsetToMonday);
  const end = shiftDateByDays(start, 6);

  return {
    start: formatDateString(start),
    end: formatDateString(end),
  };
};

const extractRelativeWeekRange = (message, context = {}) => {
  const normalized = normalizeMessageText(message);
  const baseDate =
    parseIsoDateString(context.selectedDate) ||
    parseIsoDateString(context.today);

  if (!baseDate) return null;

  if (/(?:本周|本週|這周|這週)/.test(normalized)) {
    return getMondayBasedWeekRange(baseDate, 0);
  }

  if (/(?:下周|下週)/.test(normalized)) {
    return getMondayBasedWeekRange(baseDate, 1);
  }

  if (/(?:上周|上週)/.test(normalized)) {
    return getMondayBasedWeekRange(baseDate, -1);
  }

  return null;
};

const getMonthRange = (baseDate, monthOffset = 0) => {
  const shiftedDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + monthOffset, 1);
  const start = new Date(shiftedDate.getFullYear(), shiftedDate.getMonth(), 1);
  const end = new Date(shiftedDate.getFullYear(), shiftedDate.getMonth() + 1, 0);

  return {
    start: formatDateString(start),
    end: formatDateString(end),
  };
};

const getMonthEdges = (baseDate, monthOffset = 0) => {
  const shiftedDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + monthOffset, 1);
  const monthStart = new Date(shiftedDate.getFullYear(), shiftedDate.getMonth(), 1);
  const monthEnd = new Date(shiftedDate.getFullYear(), shiftedDate.getMonth() + 1, 0);

  return { monthStart, monthEnd };
};

const extractRelativeMonthRange = (message, context = {}) => {
  const normalized = normalizeMessageText(message);
  const baseDate =
    parseIsoDateString(context.selectedDate) ||
    parseIsoDateString(context.today);

  if (!baseDate) return null;

  if (/(?:本月|這個月|这个月)/.test(normalized)) {
    return getMonthRange(baseDate, 0);
  }

  if (/(?:下個月|下个月|下月)/.test(normalized)) {
    return getMonthRange(baseDate, 1);
  }

  if (/(?:上個月|上个月|上月)/.test(normalized)) {
    return getMonthRange(baseDate, -1);
  }

  return null;
};

const extractRelativeDateRange = (message, context = {}) => {
  const normalized = normalizeMessageText(message);
  const baseDate =
    parseIsoDateString(context.selectedDate) ||
    parseIsoDateString(context.today);

  if (!baseDate) return null;

  if (/(?:明天|翌日)/.test(normalized)) {
    const target = shiftDateByDays(baseDate, 1);
    return { start: formatDateString(target), end: formatDateString(target) };
  }

  if (/(?:後天)/.test(normalized)) {
    const target = shiftDateByDays(baseDate, 2);
    return { start: formatDateString(target), end: formatDateString(target) };
  }

  if (/(?:這三天|这三天)/.test(normalized)) {
    return {
      start: formatDateString(baseDate),
      end: formatDateString(shiftDateByDays(baseDate, 2)),
    };
  }

  if (/(?:未來一週|未来一周)/.test(normalized)) {
    return {
      start: formatDateString(baseDate),
      end: formatDateString(shiftDateByDays(baseDate, 6)),
    };
  }

  if (/(?:月底前|本月底前)/.test(normalized)) {
    const { monthEnd } = getMonthEdges(baseDate, 0);
    return {
      start: formatDateString(baseDate),
      end: formatDateString(monthEnd),
    };
  }

  if (/(?:月初)/.test(normalized)) {
    const { monthStart } = getMonthEdges(baseDate, 0);
    return {
      start: formatDateString(monthStart),
      end: formatDateString(shiftDateByDays(monthStart, 9)),
    };
  }

  if (/(?:月中)/.test(normalized)) {
    const middleStart = new Date(baseDate.getFullYear(), baseDate.getMonth(), 11);
    const middleEnd = new Date(baseDate.getFullYear(), baseDate.getMonth(), 20);
    return {
      start: formatDateString(middleStart),
      end: formatDateString(middleEnd),
    };
  }

  if (/(?:月底)/.test(normalized)) {
    const { monthEnd } = getMonthEdges(baseDate, 0);
    const monthEndStart = new Date(baseDate.getFullYear(), baseDate.getMonth(), 21);
    return {
      start: formatDateString(monthEndStart),
      end: formatDateString(monthEnd),
    };
  }

  return null;
};

const extractExplicitDates = (message, context = {}) => {
  const normalized = normalizeMessageText(message);
  const dates = [];

  const isoMatches = normalized.match(/\d{4}-\d{1,2}-\d{1,2}/g) || [];
  isoMatches.forEach((value) => {
    const [year, month, day] = value.split("-").map(Number);
    dates.push(
      `${year}-${padTimePart(month)}-${padTimePart(day)}`,
    );
  });

  const slashMatches = normalized.match(/\d{1,2}\/\d{1,2}(?:\/\d{2,4})?/g) || [];
  slashMatches.forEach((value) => {
    const parsed = parseSlashDate(value, context.today);
    if (parsed) dates.push(parsed);
  });

  if (/(?:現在|今天|今日|today|now)/i.test(normalized) && isValidDateString(context.today)) {
    dates.push(context.today);
  }

  return unique(dates);
};

const extractExplicitTimeWindow = (message) => {
  const normalized = normalizeMessageText(message);
  const match = normalized.match(
    /(\d{1,2}:\d{2})\s*(?:到|至|~|-)\s*(\d{1,2}:\d{2})/,
  );

  if (!match) return null;

  const [, start, end] = match;
  return {
    start: start.padStart(5, "0"),
    end: end.padStart(5, "0"),
    source: "explicit",
  };
};

const extractDayPartWindow = (message) => {
  const normalized = normalizeMessageText(message);

  if (/(上午|早上|早班)/.test(normalized)) {
    return { ...DAY_PART_WINDOWS.morning, source: "daypart" };
  }

  if (/(下午|午后|午後)/.test(normalized)) {
    return { ...DAY_PART_WINDOWS.afternoon, source: "daypart" };
  }

  if (/(晚上|晚班|夜間|夜晚)/.test(normalized)) {
    return { ...DAY_PART_WINDOWS.evening, source: "daypart" };
  }

  return null;
};

const WEEKDAY_MAP = Object.freeze({
  0: 0,
  7: 0,
  日: 0,
  天: 0,
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
});

const parseWeekdayToken = (token) =>
  token
    .split("")
    .map((char) => WEEKDAY_MAP[char] ?? null)
    .filter((value) => value !== null);

const extractWeekdayValues = (message) => {
  const normalized = normalizeMessageText(message);
  const matches = [];

  if (/(?:週末|周末)/.test(normalized)) {
    matches.push(0, 6);
  }

  if (/(?:平日)/.test(normalized)) {
    matches.push(1, 2, 3, 4, 5);
  }

  const prefixRegex = /(?:週|周|星期|禮拜|礼拜)\s*([一二三四五六日天0-7]+)/g;
  let match;
  while ((match = prefixRegex.exec(normalized)) !== null) {
    matches.push(...parseWeekdayToken(match[1]));
  }

  const compactRegex =
    /(?:^|[\s,，、])([一二三四五六日天]{1,7})(?=(?:[^\u4e00-\u9fff]|上午|下午|晚上|有空|空班|可排|分鐘|分鍾|mins?|minutes?|半小時|半個小時|半个小时|$))/g;
  while ((match = compactRegex.exec(normalized)) !== null) {
    const token = match[1];
    if (![...token].every((char) => char in WEEKDAY_MAP)) continue;
    matches.push(...parseWeekdayToken(token));
  }

  const rangeRegex = /([一二三四五六日天])\s*(?:到|至|-|~)\s*([一二三四五六日天])/g;
  while ((match = rangeRegex.exec(normalized)) !== null) {
    const start = WEEKDAY_MAP[match[1]];
    const end = WEEKDAY_MAP[match[2]];
    if (start === null || start === undefined || end === null || end === undefined) continue;
    if (start <= end) {
      for (let day = start; day <= end; day += 1) {
        matches.push(day);
      }
      continue;
    }
    for (let day = start; day <= 6; day += 1) {
      matches.push(day);
    }
    for (let day = 0; day <= end; day += 1) {
      matches.push(day);
    }
  }

  return unique(matches);
};

const parseWeekdayChars = (text = "") =>
  [...String(text)]
    .map((char) => WEEKDAY_MAP[char] ?? null)
    .filter((value) => value !== null);

const resolveRelativeWeekRange = (message, context = {}) => {
  const normalized = normalizeMessageText(message);
  const baseDate =
    parseIsoDateString(context.selectedDate) ||
    parseIsoDateString(context.today);

  if (!baseDate) return null;

  if (/(?:本周|本週|這周|這週)/.test(normalized)) {
    return getMondayBasedWeekRange(baseDate, 0);
  }

  if (/(?:下下周|下下週)/.test(normalized)) {
    return getMondayBasedWeekRange(baseDate, 2);
  }

  if (/(?:下周|下週)/.test(normalized)) {
    return getMondayBasedWeekRange(baseDate, 1);
  }

  if (/(?:上周|上週)/.test(normalized)) {
    return getMondayBasedWeekRange(baseDate, -1);
  }

  return null;
};

const resolveRelativeMonthRange = (message, context = {}) => {
  const normalized = normalizeMessageText(message);
  const baseDate =
    parseIsoDateString(context.selectedDate) ||
    parseIsoDateString(context.today);

  if (!baseDate) return null;

  if (/(?:本月|這個月|这个月)/.test(normalized)) {
    return getMonthRange(baseDate, 0);
  }

  if (/(?:下個月|下个月|下月)/.test(normalized)) {
    return getMonthRange(baseDate, 1);
  }

  if (/(?:上個月|上个月|上月)/.test(normalized)) {
    return getMonthRange(baseDate, -1);
  }

  return null;
};

const resolveRelativeDateRange = (message, context = {}) => {
  const normalized = normalizeMessageText(message);
  const baseDate =
    parseIsoDateString(context.selectedDate) ||
    parseIsoDateString(context.today);

  if (!baseDate) return null;

  if (/(?:明天|翌日)/.test(normalized)) {
    const target = shiftDateByDays(baseDate, 1);
    return { start: formatDateString(target), end: formatDateString(target) };
  }

  if (/(?:後天)/.test(normalized)) {
    const target = shiftDateByDays(baseDate, 2);
    return { start: formatDateString(target), end: formatDateString(target) };
  }

  if (/(?:這三天|这三天)/.test(normalized)) {
    return {
      start: formatDateString(baseDate),
      end: formatDateString(shiftDateByDays(baseDate, 2)),
    };
  }

  if (/(?:未來一週|未来一周)/.test(normalized)) {
    return {
      start: formatDateString(baseDate),
      end: formatDateString(shiftDateByDays(baseDate, 6)),
    };
  }

  if (/(?:月底前|本月底前)/.test(normalized)) {
    const { monthEnd } = getMonthEdges(baseDate, 0);
    return {
      start: formatDateString(baseDate),
      end: formatDateString(monthEnd),
    };
  }

  if (/(?:月初)/.test(normalized)) {
    const { monthStart } = getMonthEdges(baseDate, 0);
    return {
      start: formatDateString(monthStart),
      end: formatDateString(shiftDateByDays(monthStart, 9)),
    };
  }

  if (/(?:月中)/.test(normalized)) {
    const middleStart = new Date(baseDate.getFullYear(), baseDate.getMonth(), 11);
    const middleEnd = new Date(baseDate.getFullYear(), baseDate.getMonth(), 20);
    return {
      start: formatDateString(middleStart),
      end: formatDateString(middleEnd),
    };
  }

  if (/(?:本月最後一週|本月最后一周)/.test(normalized)) {
    const { monthStart, monthEnd } = getMonthEdges(baseDate, 0);
    const lastWeekStart = shiftDateByDays(
      monthEnd,
      monthEnd.getDay() === 0 ? -6 : 1 - monthEnd.getDay(),
    );
    return {
      start: formatDateString(lastWeekStart < monthStart ? monthStart : lastWeekStart),
      end: formatDateString(monthEnd),
    };
  }

  if (/(?:月底)/.test(normalized)) {
    const { monthEnd } = getMonthEdges(baseDate, 0);
    const monthEndStart = new Date(baseDate.getFullYear(), baseDate.getMonth(), 21);
    return {
      start: formatDateString(monthEndStart),
      end: formatDateString(monthEnd),
    };
  }

  const dayToWeekdayMatch = normalized.match(
    /(?:今天|今日)\s*(?:到|至|-|~)\s*(?:週|周|星期|禮拜)?([一二三四五六日天])/,
  );
  if (dayToWeekdayMatch) {
    const targetWeekday = WEEKDAY_MAP[dayToWeekdayMatch[1]];
    const currentWeekday = baseDate.getDay();
    const diff = targetWeekday - currentWeekday;
    if (diff >= 0) {
      return {
        start: formatDateString(baseDate),
        end: formatDateString(shiftDateByDays(baseDate, diff)),
      };
    }
  }

  return null;
};

const resolveWeekdayValues = (message) => {
  const normalized = normalizeMessageText(message);
  const matches = [...extractWeekdayValues(message)];

  if (/(?:週末|周末)/.test(normalized)) {
    matches.push(0, 6);
  }

  if (/(?:平日)/.test(normalized)) {
    matches.push(1, 2, 3, 4, 5);
  }

  const compactRangeMatch = normalized.match(/([一二三四五六日天])\s*(?:到|至|-|~)\s*([一二三四五六日天])/);
  if (compactRangeMatch) {
    const start = WEEKDAY_MAP[compactRangeMatch[1]];
    const end = WEEKDAY_MAP[compactRangeMatch[2]];
    if (start !== undefined && start !== null && end !== undefined && end !== null) {
      if (start <= end) {
        for (let day = start; day <= end; day += 1) {
          matches.push(day);
        }
      } else {
        for (let day = start; day <= 6; day += 1) {
          matches.push(day);
        }
        for (let day = 0; day <= end; day += 1) {
          matches.push(day);
        }
      }
    }
  }

  const perWeekMatch = normalized.match(/(?:每週|每周)([一二三四五六日天]+)/);
  if (perWeekMatch) {
    matches.push(...parseWeekdayChars(perWeekMatch[1]));
  }

  return unique(matches);
};

const extractRequiredMinutes = (message) => {
  const normalized = normalizeMessageText(message);

  if (/(半小時|半个小时|半個小時)/i.test(normalized)) {
    return 30;
  }

  const minuteMatch = normalized.match(
    /(\d+)\s*(?:分鐘|分鍾|分钟|分(?!頁|號|組|之)|mins?|minutes?)/i,
  );
  if (minuteMatch) return Number(minuteMatch[1]);

  const hourMatch = normalized.match(/(\d+)\s*(?:小時|小时|hrs?|hours?)/i);
  if (hourMatch) return Number(hourMatch[1]) * 60;

  return null;
};

const CHINESE_NUMBER_MAP = Object.freeze({
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
});

const parseSimpleChineseNumber = (value = "") => {
  const normalized = String(value).trim();
  if (!normalized) return null;
  if (/^\d+$/.test(normalized)) return Number(normalized);
  if (normalized === "十") return 10;
  if (/^十[一二三四五六七八九]$/.test(normalized)) {
    return 10 + CHINESE_NUMBER_MAP[normalized.slice(1)];
  }
  if (/^[一二三四五六七八九]十$/.test(normalized)) {
    return CHINESE_NUMBER_MAP[normalized[0]] * 10;
  }
  if (/^[一二三四五六七八九]十[一二三四五六七八九]$/.test(normalized)) {
    return CHINESE_NUMBER_MAP[normalized[0]] * 10 + CHINESE_NUMBER_MAP[normalized[2]];
  }
  return CHINESE_NUMBER_MAP[normalized] ?? null;
};

const extractMinMatchingDays = (message) => {
  const normalized = normalizeMessageText(message);
  const match = normalized.match(/至少\s*([一二三四五六七八九十\d]+)\s*天/);
  if (!match) return null;
  return parseSimpleChineseNumber(match[1]);
};

const inferDateMatchMode = (message) => {
  const normalized = normalizeMessageText(message);

  if (/(其中一天|任一天|任一日|至少一天|任何一天|有一天|其中一日)/.test(normalized)) {
    return "any";
  }

  if (/(都要|每一天|每天都|同時|全部都|都符合|皆可)/.test(normalized)) {
    return "all";
  }

  return null;
};

const inferIncludeOffDuty = (message) =>
  /(休假|休息|例假|休息日|放假)/.test(normalizeMessageText(message)) || null;

const inferIntentFromDeterministicQuery = (query) => {
  const normalized = normalizeQueryShape(query);
  const hasDates = Array.isArray(normalized.dates) && normalized.dates.length > 0;
  const hasDateRange =
    Boolean(normalized.dateRangeStart) && Boolean(normalized.dateRangeEnd);
  const hasWeekdays =
    Array.isArray(normalized.weekdayValues) && normalized.weekdayValues.length > 0;

  if (hasWeekdays) return "find_staff_for_weekly_pattern";
  if (hasDates || hasDateRange) return "find_staff_for_dates";
  return null;
};

export const buildDeterministicQueryHint = (message, context = {}) => {
  const explicitTimeWindow = extractExplicitTimeWindow(message);
  const dayPartWindow = explicitTimeWindow ? null : extractDayPartWindow(message);
  const dates = extractExplicitDates(message, context);
  const weekdayValues = resolveWeekdayValues(message);
  const relativeWeekRange = resolveRelativeWeekRange(message, context);
  const relativeMonthRange = resolveRelativeMonthRange(message, context);
  const relativeDateRange = resolveRelativeDateRange(message, context);
  const requiredMinutes = extractRequiredMinutes(message);
  const minMatchingDays = extractMinMatchingDays(message);
  const dateMatchMode = inferDateMatchMode(message);
  const includeOffDuty = inferIncludeOffDuty(message);
  const inferredDateRange =
    relativeDateRange || relativeWeekRange || relativeMonthRange;
  const treatAsDateRangeOnly =
    /(?:今天|今日)\s*(?:到|至|-|~)\s*(?:週|周|星期|禮拜)?[一二三四五六日天]/.test(
      normalizeMessageText(message),
    );

  const query = normalizeQueryShape({
    dates: dates.length > 0 ? dates : null,
    weekdayValues:
      !treatAsDateRangeOnly && weekdayValues.length > 0 ? weekdayValues : null,
    dateRangeStart: inferredDateRange?.start || null,
    dateRangeEnd: inferredDateRange?.end || null,
    timeWindowStart: explicitTimeWindow?.start || dayPartWindow?.start || null,
    timeWindowEnd: explicitTimeWindow?.end || dayPartWindow?.end || null,
    requiredMinutes,
    minMatchingDays,
    dateMatchMode,
    includeOffDuty,
  });

  const intent = inferIntentFromDeterministicQuery(query);
  const notes = [];

  if (dates.length > 0 && /(?:現在|今天|今日|today|now)/i.test(normalizeMessageText(message))) {
    notes.push("將「現在/今天」解析為今天日期");
  }

  if (dayPartWindow) {
    notes.push(
      `將時段詞解析為 ${dayPartWindow.start}-${dayPartWindow.end}`,
    );
  }

  if (explicitTimeWindow) {
    notes.push(
      `將明確時間區間解析為 ${explicitTimeWindow.start}-${explicitTimeWindow.end}`,
    );
  }

  if (requiredMinutes) {
    notes.push(`將時長解析為 ${requiredMinutes} 分鐘`);
  }

  if (minMatchingDays) {
    notes.push(`將至少符合天數解析為 ${minMatchingDays} 天`);
  }

  if (weekdayValues.length > 0) {
    notes.push(`將星期條件解析為 ${weekdayValues.join(",")}`);
  }

  if (relativeWeekRange) {
    notes.push(`relative week: ${relativeWeekRange.start} ~ ${relativeWeekRange.end}`);
  }

  if (relativeMonthRange) {
    notes.push(`relative month: ${relativeMonthRange.start} ~ ${relativeMonthRange.end}`);
  }

  if (relativeDateRange) {
    notes.push(`relative date range: ${relativeDateRange.start} ~ ${relativeDateRange.end}`);
  }

  return {
    intent,
    query,
    explanation: notes.join("；"),
    shouldShortCircuit:
      Boolean(intent) &&
      ((intent === "find_staff_for_dates" &&
        ((Array.isArray(query.dates) && query.dates.length > 0) ||
          (query.dateRangeStart && query.dateRangeEnd)) &&
        query.timeWindowStart &&
        query.timeWindowEnd) ||
        (intent === "find_staff_for_weekly_pattern" &&
          Array.isArray(query.weekdayValues) &&
          query.weekdayValues.length > 0)),
  };
};

const applyQueryDefaults = (intent, query, context = {}) => {
  const normalized = normalizeQueryShape(query);

  if (intent === "find_staff_for_weekly_pattern") {
    if (!normalized.dateRangeStart && isValidDateString(context.dateRangeStart)) {
      normalized.dateRangeStart = context.dateRangeStart;
    }
    if (!normalized.dateRangeEnd && isValidDateString(context.dateRangeEnd)) {
      normalized.dateRangeEnd = context.dateRangeEnd;
    }
    if (!normalized.dateMatchMode) {
      normalized.dateMatchMode = "all";
    }
  }

  if (intent === "find_staff_for_dates" && !normalized.dateMatchMode) {
    normalized.dateMatchMode = "all";
  }

  return normalized;
};

const getMissingFields = (intent, query) => {
  const normalized = normalizeQueryShape(query);
  const hasDates = Array.isArray(normalized.dates) && normalized.dates.length > 0;
  const hasDateRange =
    Boolean(normalized.dateRangeStart) && Boolean(normalized.dateRangeEnd);
  const hasWeekdays =
    Array.isArray(normalized.weekdayValues) && normalized.weekdayValues.length > 0;
  const hasStaff =
    Boolean(normalized.staffName) ||
    (Array.isArray(normalized.staffNames) && normalized.staffNames.length > 0);
  const hasTimeRange = Boolean(normalized.timeWindowStart && normalized.timeWindowEnd);

  if (intent === "find_staff_for_dates") {
    const missing = [];
    if (!hasDates && !hasDateRange) missing.push("dates");
    if (!hasTimeRange) missing.push("timeWindow");
    return missing;
  }

  if (intent === "find_staff_for_weekly_pattern") {
    return hasWeekdays ? [] : ["weekdayValues"];
  }

  if (intent === "check_person_availability") {
    const missing = [];
    if (!hasStaff) missing.push("staff");
    if (!hasDates) missing.push("dates");
    return missing;
  }

  return [];
};

const buildFallbackClarification = (intent, missingFields = []) => {
  if (intent === "check_person_availability") {
    if (missingFields.includes("staff")) {
      return "請告訴我要查哪位員工。";
    }
    if (missingFields.includes("dates")) {
      return "請告訴我要查哪一天或哪幾天。";
    }
  }

  if (intent === "find_staff_for_dates") {
    if (missingFields.includes("dates") && missingFields.includes("timeWindow")) {
      return "請補充日期與時間區間，例如 4/25 下午 2:00 到 4:00。";
    }
    if (missingFields.includes("dates")) {
      return "請補充要查哪一天或哪幾天。";
    }
    if (missingFields.includes("timeWindow")) {
      return "請補充要查的時間區間，例如上午、下午或 14:00 到 15:00。";
    }
  }

  if (intent === "find_staff_for_weekly_pattern") {
    return "請補充要查星期幾，例如星期二、三、五。";
  }

  return "請再補充一點查詢條件，我才能幫你排班。";
};

export const postProcessAgentQuery = (parsed, context = {}) => {
  const agentMode = context.agentMode || "new_query";
  const pendingIntent =
    context.pendingIntent && context.pendingIntent !== "none"
      ? context.pendingIntent
      : null;
  const deterministicIntent =
    context.deterministicIntent && context.deterministicIntent !== "none"
      ? context.deterministicIntent
      : null;
  const deterministicQuery = normalizeQueryShape(context.deterministicQuery || {});
  const llmQuery = normalizeQueryShape(parsed.partialQuery || parsed.query || {});
  const baseQuery = mergePendingQuery(deterministicQuery, llmQuery);
  const effectiveIntent =
    parsed.intent && parsed.intent !== "none"
      ? parsed.intent
      : deterministicIntent ||
        (agentMode === "fill_missing_fields" && pendingIntent ? pendingIntent : "none");
  const mergedQuery =
    agentMode === "fill_missing_fields" && pendingIntent
      ? mergePendingQuery(context.pendingQuery || {}, baseQuery)
      : baseQuery;
  const normalizedMergedQuery = applyQueryDefaults(effectiveIntent, mergedQuery, context);

  if (parsed.status === "error") {
    return {
      ...parsed,
      pendingIntent: null,
      query: normalizeQueryShape(parsed.query || {}),
      partialQuery: normalizeQueryShape(parsed.partialQuery || {}),
      missingFields: null,
    };
  }

  const missingFields = getMissingFields(effectiveIntent, normalizedMergedQuery);

  if (missingFields.length > 0) {
    return {
      status: "needs_clarification",
      intent: effectiveIntent,
      explanation: parsed.explanation || context.deterministicExplanation || "",
      clarification:
        parsed.clarification || buildFallbackClarification(effectiveIntent, missingFields),
      pendingIntent: effectiveIntent,
      query: normalizeQueryShape(parsed.query || {}),
      partialQuery: normalizedMergedQuery,
      missingFields,
    };
  }

  return {
    status: "ok",
    intent: effectiveIntent,
    explanation: parsed.explanation || context.deterministicExplanation || "",
    clarification: "",
    pendingIntent: null,
    query: normalizedMergedQuery,
    partialQuery: normalizeQueryShape(parsed.partialQuery || {}),
    missingFields: null,
  };
};

const buildPrompt = ({ message, context, deterministicHint }) => `
你是一個「排班查詢語意解析器」，只負責把使用者問題轉成 JSON，不要回答排班結果。

目前模式：${context.agentMode === "fill_missing_fields" ? "fill_missing_fields（補完上一題）" : "new_query（新查詢）"}

請遵守以下規則：
1. 只能輸出符合 schema 的 JSON。
2. 日期一律用 YYYY-MM-DD。
3. 時間一律用 24 小時制 HH:MM。
4. 如果資訊不足，請回傳 status = "needs_clarification" 並用 clarification 提出最少且最精準的追問。
5. intent 僅能是：
   - "find_staff_for_dates"：找符合日期與時間條件的人
   - "find_staff_for_weekly_pattern"：找某些星期幾固定符合條件的人
   - "check_person_availability"：查特定員工在哪些日期有空
   - "none"
6. 若語意明顯在查特定員工，而且出現多個人名，請優先填 query.staffNames；單一人名填 query.staffName。
7. 如果使用者問的是「誰有空／哪些人有空」，不要填 staffName 或 staffNames。
8. 「現在」或「今天」視為今天日期。
9. 時段詞對應如下：
   - 上午 = 08:00-12:00
   - 下午 = 12:00-18:00
   - 晚上 = 18:00-22:00
10. 若沒給週期型查詢的日期範圍，使用目前資料區間：
   - query.dateRangeStart = ${context.dateRangeStart || "null"}
   - query.dateRangeEnd = ${context.dateRangeEnd || "null"}
11. 「二三五 / 週二週三週五 / 星期二三五 / 禮拜二三五」優先解析為 weekdayValues，而不是具體日期列表。
12. 若語意是「每一天都要符合 / 同時符合 / 都有空」，query.dateMatchMode = "all"。
13. 若語意是「其中一天即可 / 任一天可以 / 有一天有空」，query.dateMatchMode = "any"。
14. 若語意提到休假、休息日也要列出，可設定 query.includeOffDuty = true。
14.5. 若語意是「至少三天 / 至少 N 天符合」，請填 query.minMatchingDays。
15. 在 fill_missing_fields 模式下：
   - 你要沿用上一題的 intent 與已知欄位。
   - 使用者這一句通常只是在補缺欄位，不要把它硬判成全新查詢。
16. 請參考 deterministic hint。它是規則解析出的高信心欄位，可以延續、補完，但不要隨意推翻。

Few-shot 例子：
- 「現在誰下午有空班30分鐘」
  intent = "find_staff_for_dates"
  query.dates = ["${context.today}"]
  query.timeWindowStart = "12:00"
  query.timeWindowEnd = "18:00"
  query.requiredMinutes = 30
- 「二三五下午有30分鐘的空班」
  intent = "find_staff_for_weekly_pattern"
  query.weekdayValues = [2,3,5]
  query.timeWindowStart = "12:00"
  query.timeWindowEnd = "18:00"
  query.requiredMinutes = 30
  query.dateRangeStart = "${context.dateRangeStart || ""}"
  query.dateRangeEnd = "${context.dateRangeEnd || ""}"
- 「這週哪三天下午有人有30分鐘空班」
  若無法可靠解析「哪三天」的最終運算方式，至少不要誤判成人員查詢；可回 needs_clarification，確認要列日期還是列人員。

今天日期：${context.today}
時區：${context.timezone}
目前資料區間：${context.dateRange || "未知"}
資料區間起訖：${context.dateRangeStart || "未知"} ~ ${context.dateRangeEnd || "未知"}
目前可查詢機構：${(context.orgNames || []).join("、") || "未載入"}
目前範圍說明：${context.scopeSummary || "全部機構"}
支援意圖：${(context.supportedIntents || []).join(", ")}

規則預解析結果：
${JSON.stringify(deterministicHint, null, 2)}

最近對話：
${Array.isArray(context.conversationHistory) && context.conversationHistory.length > 0
    ? context.conversationHistory
        .map((item) => `${item.role === "assistant" ? "助手" : "使用者"}：${item.content}`)
        .join("\n")
    : "無"}

待補完資訊：
- pendingIntent：${context.pendingIntent || "無"}
- missingFields：${Array.isArray(context.missingFields) && context.missingFields.length > 0 ? context.missingFields.join(", ") : "無"}
- pendingQuery：${context.pendingQuery ? JSON.stringify(normalizeQueryShape(context.pendingQuery), null, 2) : "無"}

使用者訊息：
${message}
`;

const extractResponseText = (payload) => {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  if (Array.isArray(payload?.output)) {
    const chunks = [];

    payload.output.forEach((item) => {
      if (!Array.isArray(item?.content)) return;

      item.content.forEach((contentItem) => {
        if (typeof contentItem?.text === "string" && contentItem.text.trim()) {
          chunks.push(contentItem.text);
          return;
        }

        if (
          typeof contentItem?.output_text === "string" &&
          contentItem.output_text.trim()
        ) {
          chunks.push(contentItem.output_text);
        }
      });
    });

    if (chunks.length > 0) {
      return chunks.join("\n").trim();
    }
  }

  return null;
};

const sendJson = (res, statusCode, payload) => {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  });
  res.end(JSON.stringify(payload));
};

const sendSseHeaders = (res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "X-Accel-Buffering": "no",
  });
};

const sendStaticFile = (res, filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = STATIC_FILE_TYPES[ext] || "application/octet-stream";

  try {
    const stat = fs.statSync(filePath);
    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": stat.size,
    });
    fs.createReadStream(filePath).pipe(res);
    return true;
  } catch {
    return false;
  }
};

const tryServeFrontendAsset = (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  if (!fs.existsSync(DIST_DIR)) return false;

  const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathname = decodeURIComponent(requestUrl.pathname);

  if (pathname.startsWith("/api/")) return false;

  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const requestedFilePath = path.resolve(DIST_DIR, relativePath);

  if (!requestedFilePath.startsWith(DIST_DIR)) {
    sendJson(res, 403, { status: "error", error: "Forbidden" });
    return true;
  }

  if (fs.existsSync(requestedFilePath) && fs.statSync(requestedFilePath).isFile()) {
    return sendStaticFile(res, requestedFilePath);
  }

  if (fs.existsSync(INDEX_FILE)) {
    return sendStaticFile(res, INDEX_FILE);
  }

  return false;
};

const writeSseEvent = (res, event, payload) => {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
};

const readJsonBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
};

export const parseAgentQuery = async (body) => {
  const deterministicHint = buildDeterministicQueryHint(body.message, body.context || {});
  const enrichedContext = {
    ...(body.context || {}),
    deterministicIntent: deterministicHint.intent || null,
    deterministicQuery: deterministicHint.query,
    deterministicExplanation: deterministicHint.explanation,
  };

  if (deterministicHint.shouldShortCircuit && deterministicHint.intent) {
    return postProcessAgentQuery(
      {
        status: "ok",
        intent: deterministicHint.intent,
        explanation: deterministicHint.explanation,
        clarification: "",
        pendingIntent: null,
        query: deterministicHint.query,
        partialQuery: deterministicHint.query,
        missingFields: null,
      },
      enrichedContext,
    );
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      instructions: "你是查詢解析器。只輸出符合 schema 的 JSON，不要輸出任何額外文字。",
      input: buildPrompt({
        message: body.message,
        context: enrichedContext,
        deterministicHint,
      }),
      text: {
        format: {
          type: "json_schema",
          ...QUERY_SCHEMA,
        },
      },
    }),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error?.message || "OpenAI API request failed");
  }

  const responseText = extractResponseText(payload);

  if (!responseText) {
    throw new Error(
      `OpenAI API returned no text output. Response keys: ${Object.keys(payload || {}).join(", ")}`,
    );
  }

  return postProcessAgentQuery(JSON.parse(responseText), enrichedContext);
};

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  if (req.method === "GET" && req.url === "/api/health") {
    sendJson(res, 200, { ok: true, model: MODEL });
    return;
  }

  if (req.method === "POST" && req.url === "/api/agent-query") {
    try {
      const body = await readJsonBody(req);

      if (!body?.message || !body?.context) {
        sendJson(res, 400, {
          status: "error",
          error: "Missing message or context",
        });
        return;
      }

      const parsed = await parseAgentQuery(body);
      sendJson(res, 200, parsed);
    } catch (error) {
      sendJson(res, 500, {
        status: "error",
        error: error.message || "Unknown server error",
      });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/agent-query/stream") {
    sendSseHeaders(res);

    try {
      const body = await readJsonBody(req);

      if (!body?.message || !body?.context) {
        writeSseEvent(res, "error", {
          error: "Missing message or context",
        });
        res.end();
        return;
      }

      writeSseEvent(res, "status", {
        message: "正在解析排班查詢...",
      });

      const parsed = await parseAgentQuery(body);

      writeSseEvent(res, "parsed", {
        parsed,
      });

      writeSseEvent(res, "done", {
        ok: true,
      });
    } catch (error) {
      writeSseEvent(res, "error", {
        error: error.message || "Unknown server error",
      });
    } finally {
      res.end();
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/cross-region/distances") {
    try {
      const body = await readJsonBody(req);
      const addresses = Array.isArray(body?.addresses) ? body.addresses : [];
      const pairs = Array.isArray(body?.pairs) ? body.pairs : [];

      if (addresses.length === 0 || pairs.length === 0) {
        sendJson(res, 400, {
          status: "error",
          error: "Missing addresses or pairs",
        });
        return;
      }

      const result = await resolveCrossRegionDistancesWithFileCache({
        addresses,
        pairs,
      });

      sendJson(res, 200, {
        status: "ok",
        results: result.results,
        geocodes: result.geocodes,
      });
    } catch (error) {
      sendJson(res, 500, {
        status: "error",
        error: error.message || "Unknown distance server error",
      });
    }
    return;
  }

  if (tryServeFrontendAsset(req, res)) {
    return;
  }

  sendJson(res, 404, { status: "error", error: "Not found" });
});

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  server.listen(PORT, () => {
    console.log(`AI agent API listening on http://localhost:${PORT}`);
  });
}

export { DAY_PART_WINDOWS, server };
