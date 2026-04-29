import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  format,
  isValid,
  startOfWeek,
  addDays,
  isSameDay,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  addMonths,
  subMonths,
} from "date-fns";
import {
  Upload,
  Calendar,
  Clock,
  User,
  Users,
  FileSpreadsheet,
  XCircle,
  List,
  Search,
  BarChart2,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import { calculateDailyAvailability, applyServiceFilter } from "./utils/availability";
import { applyTimeFilter } from "./utils/filtering";
import {
  appStateService,
  caseScheduleService,
  orgService,
} from "./services/db";
import {
  DEFAULT_PERSISTED_STATE,
  normalizeOrgData,
  readLegacyPersistedState,
} from "./utils/persistence";
import {
  loadXLSX,
  parseCaseScheduleWorkbook,
  parseOrgWorkbook,
} from "./utils/workbook";
import { CaseScheduleView, StatsView } from "./components/dashboard-views";
import { AgentSidebar } from "./components/agent-sidebar";
import {
  TimelineBar,
  WeeklyAggregateFilterView,
  WeeklyFilterView,
  WeeklyMultiRuleFilterView,
  WeeklyView,
} from "./components/weekly-views";
import { executeAgentQuery, SUPPORTED_AGENT_INTENTS } from "./utils/agent-query";
import clsx from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const ORG_COLORS = [
  { bg: "bg-brand-coral/15", text: "text-brand-coral", dot: "bg-brand-coral" },
  { bg: "bg-blue-100", text: "text-blue-600", dot: "bg-blue-500" },
  { bg: "bg-emerald-100", text: "text-emerald-600", dot: "bg-emerald-500" },
  { bg: "bg-violet-100", text: "text-violet-600", dot: "bg-violet-500" },
  { bg: "bg-amber-100", text: "text-amber-600", dot: "bg-amber-500" },
  { bg: "bg-pink-100", text: "text-pink-600", dot: "bg-pink-500" },
];

const WEEKDAY_OPTIONS = [
  { value: 0, label: "日" },
  { value: 1, label: "一" },
  { value: 2, label: "二" },
  { value: 3, label: "三" },
  { value: 4, label: "四" },
  { value: 5, label: "五" },
  { value: 6, label: "六" },
];

const createAdvancedWeekRule = () => ({
  id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  weekdays: [],
  startTime: "",
  endTime: "",
  duration: null,
  includePotential: true,
});

const AGENT_WELCOME_MESSAGE = {
  id: "agent-welcome",
  role: "assistant",
  content:
    "可以直接問我找人問題，例如：\n- 4/25 早上 8:00 到 8:30 有誰有空\n- 4/19 到 4/21 下午 4:00 到 5:00，其中一天有空的人有哪些\n- 幫我看某位員工 4/30 整天有哪些空檔\n\n目前海底撈AI測試中...\n找人發生錯誤不要怪我嘿！",
  copyText:
    "可以直接問我找人問題，例如：\n- 4/25 早上 8:00 到 8:30 有誰有空\n- 4/19 到 4/21 下午 4:00 到 5:00，其中一天有空的人有哪些\n- 幫我看某位員工 4/30 整天有哪些空檔\n\n目前海底撈AI測試中...\n找人發生錯誤不要怪我嘿！",
};

const AGENT_STREAM_CHUNK_SIZE = 8;
const AGENT_STREAM_CHUNK_DELAY = 42;
const AGENT_API_BASE_URL = (import.meta.env.VITE_AGENT_API_BASE_URL || "").replace(/\/$/, "");
const AGENT_QUERY_KEYS = [
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
];

const normalizeCrossOrgStaffName = (name = "") =>
  String(name)
    .trim()
    .replace(/\s*[（(][^)）]+[)）]\s*$/, "")
    .trim();

const parseDateTimeForFilter = (dateStr, timeStr) => {
  if (!dateStr || !timeStr) return null;
  const [hours, minutes] = String(timeStr).split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  const parsed = new Date(dateStr);
  parsed.setHours(hours, minutes, 0, 0);
  return parsed;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const chunkAgentText = (text = "") => {
  const chunks = [];
  let buffer = "";

  for (const char of String(text)) {
    buffer += char;
    if (char === "\n" || buffer.length >= AGENT_STREAM_CHUNK_SIZE) {
      chunks.push(buffer);
      buffer = "";
    }
  }

  if (buffer) {
    chunks.push(buffer);
  }

  return chunks;
};

const parseSseEventBlocks = (buffer) => {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const parts = normalized.split("\n\n");
  const complete = parts.slice(0, -1);
  const remainder = parts[parts.length - 1] || "";
  const events = [];

  complete.forEach((part) => {
    const lines = part.split("\n");
    let eventName = "message";
    const dataLines = [];

    lines.forEach((line) => {
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trim());
      }
    });

    if (dataLines.length === 0) return;

    events.push({
      event: eventName,
      data: dataLines.join("\n"),
    });
  });

  return {
    events,
    remainder,
  };
};

const buildAgentApiUrl = (path) =>
  `${AGENT_API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;

const parseAgentApiResponse = async (response) => {
  const rawText = await response.text();
  const contentType = response.headers.get("content-type") || "";

  if (!rawText.trim()) {
    throw new Error("AI API 回傳空內容，請確認部署時前端是否正確連到後端 API。");
  }

  if (!contentType.includes("application/json")) {
    throw new Error(
      `AI API 沒有回傳 JSON（收到 ${contentType || "未知格式"}），請確認 VITE_AGENT_API_BASE_URL 是否正確。`,
    );
  }

  try {
    return JSON.parse(rawText);
  } catch {
    throw new Error("AI API 回傳格式異常，無法解析 JSON。");
  }
};

const normalizeAgentQuery = (query = {}) =>
  AGENT_QUERY_KEYS.reduce((acc, key) => {
    acc[key] = key in (query || {}) ? query[key] : null;
    return acc;
  }, {});

const buildAgentConversationHistory = (messages, currentMessage) => {
  const history = messages
    .filter((message) => message.id !== AGENT_WELCOME_MESSAGE.id)
    .filter((message) => message.role === "user" || message.role === "assistant")
    .filter((message) => String(message.content || "").trim())
    .slice(-6)
    .map((message) => ({
      role: message.role,
      content: String(message.content || "").trim(),
    }));

  if (currentMessage) {
    history.push({
      role: "user",
      content: currentMessage,
    });
  }

  return history;
};

const buildPendingAgentState = (parsedQuery, sourceMessage) => {
  if (parsedQuery?.status !== "needs_clarification") return null;

  const intent =
    parsedQuery.pendingIntent ||
    (parsedQuery.intent && parsedQuery.intent !== "none" ? parsedQuery.intent : null);

  if (!intent) return null;

  return {
    intent,
    query: normalizeAgentQuery(parsedQuery.partialQuery || parsedQuery.query || {}),
    missingFields: Array.isArray(parsedQuery.missingFields)
      ? parsedQuery.missingFields
      : [],
    clarification: parsedQuery.clarification || "",
    sourceMessage: sourceMessage || "",
  };
};

const shouldTreatAsNewAgentQuery = (message, pendingAgentQuery) => {
  if (!pendingAgentQuery) return false;

  const text = String(message || "").trim();
  if (!text) return false;

  const hasDate = /(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2})/.test(text);
  const hasTime =
    /\d{1,2}:\d{2}(?:\s*[~～\-－到至]\s*\d{1,2}:\d{2})?/.test(text);
  const hasStaffKeyword =
    /[\u4e00-\u9fff]{2,4}(?=\s*(?:\d{1,2}\/\d{1,2}|\d{4}-\d{1,2}-\d{1,2}|有空|空檔|空閒|班表))/.test(
      text,
    );
  const startsLikeNewQuery =
    /^(列出|查詢|幫我|找|誰|有哪些|請列出|查看|本月|每週|今天|明天)/.test(text);

  return (
    (hasDate && hasTime) ||
    (hasDate && hasStaffKeyword) ||
    (startsLikeNewQuery && (hasDate || hasTime || hasStaffKeyword))
  );
};

const clipInterval = (interval, rangeStart, rangeEnd) => {
  const start = new Date(Math.max(interval.start.getTime(), rangeStart.getTime()));
  const end = new Date(Math.min(interval.end.getTime(), rangeEnd.getTime()));
  if (end <= start) return null;
  return { start, end };
};

const subtractInterval = (interval, visibleInterval) => {
  if (!visibleInterval) return [{ start: interval.start, end: interval.end }];

  const remaining = [];

  if (visibleInterval.start > interval.start) {
    remaining.push({
      start: interval.start,
      end: visibleInterval.start,
    });
  }

  if (visibleInterval.end < interval.end) {
    remaining.push({
      start: visibleInterval.end,
      end: interval.end,
    });
  }

  return remaining;
};

const splitFreeIntervalsByFilter = ({
  freeIntervals,
  filterMode,
  selectedDate,
  filterStartTime,
  filterEndTime,
  servicePeriodStart,
  servicePeriodEnd,
  selectedDuration,
}) => {
  if (!Array.isArray(freeIntervals) || freeIntervals.length === 0) {
    return { matching: [], hidden: [] };
  }

  const isManualMode =
    filterMode !== "service" && filterStartTime && filterEndTime && selectedDate;
  const isServiceMode =
    filterMode === "service" &&
    servicePeriodStart &&
    servicePeriodEnd &&
    selectedDuration &&
    selectedDate;

  if (!isManualMode && !isServiceMode) {
    return { matching: freeIntervals, hidden: [] };
  }

  const rangeStart = parseDateTimeForFilter(
    selectedDate,
    isServiceMode ? servicePeriodStart : filterStartTime,
  );
  const rangeEnd = parseDateTimeForFilter(
    selectedDate,
    isServiceMode ? servicePeriodEnd : filterEndTime,
  );

  if (!rangeStart || !rangeEnd || rangeEnd <= rangeStart) {
    return { matching: freeIntervals, hidden: [] };
  }

  const requiredMs = isServiceMode ? Number(selectedDuration) * 60000 : 0;
  const matching = [];
  const hidden = [];

  freeIntervals.forEach((interval) => {
    const visibleInterval = clipInterval(interval, rangeStart, rangeEnd);

    if (
      visibleInterval &&
      (!isServiceMode ||
        visibleInterval.end.getTime() - visibleInterval.start.getTime() >= requiredMs)
    ) {
      matching.push(visibleInterval);
      hidden.push(...subtractInterval(interval, visibleInterval));
      return;
    }

    hidden.push(interval);
  });

  return { matching, hidden };
};

const OrgDot = ({ staff, orgs }) => {
  if (!orgs || orgs.length <= 1 || staff.orgIdx === undefined) return null;
  const color = ORG_COLORS[staff.orgIdx % ORG_COLORS.length];
  return (
    <span
      className={cn(
        "w-2 h-2 rounded-full shrink-0 inline-block mr-1",
        color.dot,
      )}
      title={staff.org}
    />
  );
};

const Button = ({
  className,
  variant = "default",
  size = "default",
  ...props
}) => {
  const variants = {
    default: "bg-primary text-primary-foreground hover:bg-primary/90",
    destructive:
      "bg-destructive text-destructive-foreground hover:bg-destructive/90",
    outline:
      "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
    secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
    ghost: "hover:bg-accent hover:text-accent-foreground",
    link: "text-primary underline-offset-4 hover:underline",
  };
  const sizes = {
    default: "h-10 px-4 py-2",
    sm: "h-9 rounded-md px-3",
    lg: "h-11 rounded-md px-8",
    icon: "h-10 w-10",
  };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
};

// Input Component
const Input = ({ className, ...props }) => {
  return (
    <input
      className={cn(
        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
};

// Label Component
const Label = ({ className, ...props }) => (
  <label
    className={cn(
      "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
      className,
    )}
    {...props}
  />
);

// Card Component
const Card = ({ className, ...props }) => (
  <div
    className={cn(
      "rounded-2xl border border-slate-100 bg-white text-card-foreground shadow-sm overflow-hidden",
      className,
    )}
    {...props}
  />
);

const Badge = ({ children, variant = "default" }) => {
  const variants = {
    default: "bg-brand-coral/10 text-brand-coral",
    success: "bg-emerald-100 text-emerald-700",
    outline: "border border-slate-200 text-slate-500",
  };
  return (
    <span
      className={cn(
        "px-2.5 py-0.5 rounded-full text-xs font-semibold",
        variants[variant],
      )}
    >
      {children}
    </span>
  );
};

// DatePicker Component
const DatePicker = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() =>
    value ? new Date(value) : new Date(),
  );

  const selected = value ? new Date(value) : null;
  const monthStart = startOfMonth(viewDate);
  const monthEnd = endOfMonth(viewDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPad = getDay(monthStart); // 0=Sun

  const handleSelect = (day) => {
    onChange(format(day, "yyyy-MM-dd"));
    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          className={cn(
            "flex h-10 w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm",
            "hover:border-brand-coral/40 hover:bg-white focus:outline-none focus:border-brand-coral focus:ring-2 focus:ring-brand-coral/20 transition-colors",
            !selected && "text-slate-400",
          )}
        >
          <span>{selected ? format(selected, "yyyy/MM/dd") : "選擇日期"}</span>
          <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="z-50 w-72 rounded-2xl bg-white border border-slate-100 shadow-xl p-4"
          align="start"
          sideOffset={6}
        >
          {/* Month Nav */}
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => setViewDate(subMonths(viewDate, 1))}
              className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <ChevronLeft className="w-4 h-4 text-slate-500" />
            </button>
            <span className="text-sm font-bold text-brand-slate">
              {format(viewDate, "yyyy年 MM月")}
            </span>
            <button
              onClick={() => setViewDate(addMonths(viewDate, 1))}
              className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </button>
          </div>
          {/* Weekday Headers */}
          <div className="grid grid-cols-7 mb-1">
            {["日", "一", "二", "三", "四", "五", "六"].map((d) => (
              <div
                key={d}
                className="text-center text-[11px] font-bold text-slate-400 py-1"
              >
                {d}
              </div>
            ))}
          </div>
          {/* Days */}
          <div className="grid grid-cols-7 gap-y-1">
            {Array.from({ length: startPad }).map((_, i) => (
              <div key={`pad-${i}`} />
            ))}
            {days.map((day) => {
              const isSelected = selected && isSameDay(day, selected);
              const isToday = isSameDay(day, new Date());
              return (
                <button
                  key={day.toISOString()}
                  onClick={() => handleSelect(day)}
                  className={cn(
                    "h-8 w-full rounded-lg text-sm font-medium transition-colors",
                    isSelected
                      ? "bg-brand-coral text-white font-bold shadow-sm"
                      : isToday
                        ? "bg-brand-coral/10 text-brand-coral font-bold"
                        : "text-slate-700 hover:bg-slate-100",
                  )}
                >
                  {format(day, "d")}
                </button>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};

// TimePicker Component
const TimePicker = ({ value, onChange, placeholder = "選擇時間" }) => {
  const [open, setOpen] = useState(false);
  const hours = Array.from({ length: 24 }, (_, i) =>
    String(i).padStart(2, "0"),
  );
  const minutes = ["00", "10", "20", "30", "40", "50"];
  const [selH, selM] = value ? value.split(":") : [null, null];
  const hourRef = useRef(null);
  const minuteRef = useRef(null);

  useEffect(() => {
    if (open && hourRef.current && selH) {
      const el = hourRef.current.querySelector(`[data-hour="${selH}"]`);
      if (el) el.scrollIntoView({ block: "center" });
    }

    if (open && minuteRef.current && selM) {
      const el = minuteRef.current.querySelector(`[data-minute="${selM}"]`);
      if (el) el.scrollIntoView({ block: "center" });
    }
  }, [open, selH, selM]);

  const handleSelect = (h, m) => {
    onChange(`${h}:${m}`);
    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          className={cn(
            "flex h-10 w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm",
            "hover:border-brand-coral/40 hover:bg-white focus:outline-none focus:border-brand-coral focus:ring-2 focus:ring-brand-coral/20 transition-colors",
            !value && "text-slate-400",
          )}
        >
          <span>{value || placeholder}</span>
          <Clock className="w-4 h-4 text-slate-400 shrink-0" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="z-50 rounded-2xl bg-white border border-slate-100 shadow-xl p-3"
          align="start"
          sideOffset={6}
        >
          <div className="flex gap-2">
            {/* Hours */}
            <div
              ref={hourRef}
              className="h-52 w-16 overflow-y-auto overscroll-contain scrollbar-none flex flex-col gap-0.5 pr-1"
            >
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center mb-1 sticky top-0 bg-white">
                時
              </p>
              {hours.map((h) => (
                <button
                  key={h}
                  data-hour={h}
                  onClick={() => handleSelect(h, selM || "00")}
                  className={cn(
                    "h-8 w-full rounded-lg text-sm font-medium transition-colors",
                    selH === h
                      ? "bg-brand-coral text-white font-bold"
                      : "text-slate-700 hover:bg-slate-100",
                  )}
                >
                  {h}
                </button>
              ))}
            </div>
            <div className="w-px bg-slate-100 self-stretch" />
            {/* Minutes */}
            <div
              ref={minuteRef}
              className="h-52 w-16 overflow-y-auto overscroll-contain scrollbar-none flex flex-col gap-0.5 pr-1"
            >
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center mb-1 sticky top-0 bg-white">
                分
              </p>
              {minutes.map((m) => (
                <button
                  key={m}
                  data-minute={m}
                  onClick={() => handleSelect(selH || "08", m)}
                  className={cn(
                    "h-8 w-full rounded-lg text-sm font-medium transition-colors",
                    selM === m
                      ? "bg-brand-coral text-white font-bold"
                      : "text-slate-700 hover:bg-slate-100",
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};

function App() {
  // Multi-org state
  const [orgs, setOrgs] = useState([]);
  const [pendingOrgName, setPendingOrgName] = useState("");
  const [showOrgManager, setShowOrgManager] = useState(false);
  const [selectedOrgIds, setSelectedOrgIds] = useState(new Set());
  const [isHydrated, setIsHydrated] = useState(false);
  const [isDraggingOrgFile, setIsDraggingOrgFile] = useState(false);
  const orgFileDragDepth = useRef(0);
  const [isAgentOpen, setIsAgentOpen] = useState(false);
  const [agentInput, setAgentInput] = useState("");
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentMessages, setAgentMessages] = useState([AGENT_WELCOME_MESSAGE]);
  const [agentSidebarWidth, setAgentSidebarWidth] = useState(440);
  const [pendingAgentQuery, setPendingAgentQuery] = useState(null);

  // Derived: step
  const step = orgs.length === 0 || showOrgManager ? "upload" : "dashboard";

  // Derived: merged staff (with org metadata)
  const allStaffData = useMemo(
    () =>
      orgs.flatMap((o, idx) =>
        o.staffData.map((s) => ({
          ...s,
          id: s.staffKey,
          staffKey: s.staffKey,
          sourceStaffId: s.sourceStaffId || s.id,
          org: o.name,
          orgId: o.id,
          orgIdx: idx,
        })),
      ),
    [orgs],
  );

  // Derived: merged schedule
  const allScheduleData = useMemo(
    () => orgs.flatMap((o) => o.scheduleData),
    [orgs],
  );

  // Derived: merged date range
  const dataDateRange = useMemo(() => {
    const ranges = [...new Set(orgs.map((o) => o.dateRange).filter(Boolean))];
    return ranges.join("  ·  ");
  }, [orgs]);

  // Active (filtered by org selection)
  const activeStaffData = useMemo(
    () =>
      selectedOrgIds.size === 0
        ? allStaffData
        : allStaffData.filter((s) => selectedOrgIds.has(s.orgId)),
    [allStaffData, selectedOrgIds],
  );

  const activeScheduleData = useMemo(() => {
    if (selectedOrgIds.size === 0) return allScheduleData;
    return allScheduleData.filter((record) => selectedOrgIds.has(record.__orgId));
  }, [allScheduleData, selectedOrgIds]);

  const dataDateBounds = useMemo(() => {
    const parsedDates = activeScheduleData
      .map((record) => {
        const value =
          record["日期"] ||
          record.date ||
          record["???交?"] ||
          Object.values(record).find(
            (item) =>
              item instanceof Date ||
              (typeof item === "string" &&
                (/^\d{4}-\d{1,2}-\d{1,2}$/.test(item) || /^\d{1,2}\/\d{1,2}/.test(item))),
          );

        if (!value) return null;
        const parsed = value instanceof Date ? value : new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
      })
      .filter(Boolean)
      .sort((a, b) => a.getTime() - b.getTime());

    if (parsedDates.length === 0) {
      return { start: null, end: null };
    }

    return {
      start: format(parsedDates[0], "yyyy-MM-dd"),
      end: format(parsedDates[parsedDates.length - 1], "yyyy-MM-dd"),
    };
  }, [activeScheduleData]);

  const activeOrgNames = useMemo(() => {
    if (selectedOrgIds.size === 0) return orgs.map((org) => org.name);
    return orgs
      .filter((org) => selectedOrgIds.has(org.id))
      .map((org) => org.name);
  }, [orgs, selectedOrgIds]);

  const agentContext = useMemo(
    () => ({
      today: format(new Date(), "yyyy-MM-dd"),
      timezone:
        Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Taipei",
      dateRange: dataDateRange,
      dateRangeStart: dataDateBounds.start,
      dateRangeEnd: dataDateBounds.end,
      orgNames: activeOrgNames,
      scopeSummary:
        selectedOrgIds.size === 0
          ? "全部已載入機構"
          : `目前僅查詢：${activeOrgNames.join("、")}`,
      supportedIntents: SUPPORTED_AGENT_INTENTS,
    }),
    [activeOrgNames, dataDateBounds.end, dataDateBounds.start, dataDateRange, selectedOrgIds.size],
  );

  const appendAgentMessage = (message) => {
    setAgentMessages((prev) => [
      ...prev,
      {
        id: `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ...message,
      },
    ]);
  };

  const clearAgentMessages = () => {
    setAgentMessages([AGENT_WELCOME_MESSAGE]);
    setPendingAgentQuery(null);
  };

  const updateAgentMessage = (messageId, patch) => {
    setAgentMessages((prev) =>
      prev.map((message) =>
        message.id === messageId
          ? {
              ...message,
              ...(typeof patch === "function" ? patch(message) : patch),
            }
          : message,
      ),
    );
  };

  const streamAgentMessageText = async (
    messageId,
    text,
    copyText = text,
    extraPatch = {},
  ) => {
    updateAgentMessage(messageId, {
      content: "",
      copyText: "",
      streaming: true,
      structuredResult: null,
    });

    for (const chunk of chunkAgentText(text)) {
      updateAgentMessage(messageId, (message) => ({
        content: `${message.content || ""}${chunk}`,
      }));
      await sleep(AGENT_STREAM_CHUNK_DELAY);
    }

    updateAgentMessage(messageId, {
      content: text,
      copyText: copyText || text,
      streaming: false,
      ...extraPatch,
    });
  };

  const streamAgentError = async (messageId, error) => {
    const text =
      error.message === "Missing OPENAI_API_KEY"
        ? "AI API 尚未設定 `OPENAI_API_KEY`，請先在專案根目錄建立 `.env.local`。"
        : `查詢失敗：${error.message}`;
    const copyText =
      error.message === "Missing OPENAI_API_KEY"
        ? "AI API 尚未設定 OPENAI_API_KEY，請先在專案根目錄建立 .env.local。"
        : `查詢失敗：${error.message}`;

    await streamAgentMessageText(messageId, text, copyText);
  };

  const buildAgentRequestContext = (message, pendingState) => ({
    ...agentContext,
    conversationHistory: buildAgentConversationHistory(agentMessages, message),
    agentMode: pendingState ? "fill_missing_fields" : "new_query",
    pendingIntent: pendingState?.intent || null,
    pendingQuery: pendingState?.query || null,
    missingFields: pendingState?.missingFields || null,
  });

  const fetchAgentQueryFallback = async (message, pendingState) => {
    const response = await fetch(buildAgentApiUrl("/api/agent-query"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
        context: buildAgentRequestContext(message, pendingState),
      }),
    });

    const parsed = await parseAgentApiResponse(response);

    if (!response.ok || parsed.status === "error") {
      throw new Error(parsed.error || parsed.text || "AI 查詢失敗");
    }

    return parsed;
  };

  const handleAgentSubmit = async (event) => {
    event.preventDefault();

    const message = agentInput.trim();
    if (!message || agentLoading) return;
    const treatAsNewQuery = shouldTreatAsNewAgentQuery(message, pendingAgentQuery);
    const activePendingQuery = treatAsNewQuery ? null : pendingAgentQuery;

    appendAgentMessage({
      role: "user",
      content: message,
    });
    setAgentInput("");

    if (activeStaffData.length === 0 || activeScheduleData.length === 0) {
      appendAgentMessage({
        role: "assistant",
        content: "目前還沒有可查詢的班表資料，請先上傳機構班表。",
        copyText: "目前還沒有可查詢的班表資料，請先上傳機構班表。",
        structuredResult: null,
      });
      return;
    }

    const assistantMessageId = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    if (treatAsNewQuery) {
      setPendingAgentQuery(null);
    }

    setAgentMessages((prev) => [
      ...prev,
      {
        id: assistantMessageId,
        role: "assistant",
        content: "正在理解你的問題...",
        copyText: "",
        streaming: true,
        structuredResult: null,
      },
    ]);

    setAgentLoading(true);

    try {
      let parsedQuery = null;

      try {
        const response = await fetch(buildAgentApiUrl("/api/agent-query/stream"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message,
            context: buildAgentRequestContext(message, activePendingQuery),
          }),
        });

        if (!response.ok || !response.body) {
          throw new Error("AI 串流連線失敗");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let sseBuffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          sseBuffer += decoder.decode(value, { stream: true });

          const { events, remainder } = parseSseEventBlocks(sseBuffer);
          sseBuffer = remainder;

          events.forEach((eventBlock) => {
            const payload = JSON.parse(eventBlock.data);

            if (eventBlock.event === "status") {
              updateAgentMessage(assistantMessageId, {
                content: payload.message || "正在處理中...",
                copyText: "",
                streaming: true,
                structuredResult: null,
              });
              return;
            }

            if (eventBlock.event === "parsed") {
              parsedQuery = payload.parsed;
              updateAgentMessage(assistantMessageId, {
                content: "已理解問題，正在比對本地排班資料...",
                copyText: "",
                streaming: true,
                structuredResult: null,
              });
              return;
            }

            if (eventBlock.event === "error") {
              throw new Error(payload.error || "AI 查詢失敗");
            }
          });
        }
      } catch {
        updateAgentMessage(assistantMessageId, {
          content: "目前改用一般模式處理，正在比對本地排班資料...",
          copyText: "",
          streaming: true,
          structuredResult: null,
        });
        parsedQuery = await fetchAgentQueryFallback(message, activePendingQuery);
      }

      if (!parsedQuery) {
        throw new Error("AI 沒有回傳有效查詢結果");
      }

      if (parsedQuery.status === "error") {
        throw new Error(parsedQuery.error || parsedQuery.text || "AI 查詢失敗");
      }

      if (parsedQuery.status === "needs_clarification") {
        setPendingAgentQuery(buildPendingAgentState(parsedQuery, message));
        await streamAgentMessageText(
          assistantMessageId,
          parsedQuery.clarification || "我還需要更多資訊才能完成這個查詢。",
          parsedQuery.clarification || "我還需要更多資訊才能完成這個查詢。",
        );
        return;
      }

      setPendingAgentQuery(null);

      const executed = executeAgentQuery({
        parsedQuery,
        scheduleData: activeScheduleData,
        staffData: activeStaffData,
        bufferBuffer,
        caseSettings,
      });

      await streamAgentMessageText(
        assistantMessageId,
        executed.text || "查詢完成。",
        executed.copyText || executed.text || "查詢完成。",
        {
          structuredResult: executed.structuredResult || null,
        },
      );
    } catch (error) {
      await streamAgentError(assistantMessageId, error);
    } finally {
      setAgentLoading(false);
    }
  };

  const toggleOrg = (orgId) => {
    setSelectedOrgIds((prev) => {
      if (prev.size === 0) {
        return new Set(orgs.map((org) => org.id).filter((id) => id !== orgId));
      }

      const next = new Set(prev);

      if (next.has(orgId)) {
        next.delete(orgId);
      } else {
        next.add(orgId);
      }

      // Keep the existing "empty set means all orgs" internal model.
      // When users clear the last active org or re-enable every org, fall back to all.
      if (next.size === 0 || next.size === orgs.length) return new Set();
      return next;
    });
  };

  const [viewMode, setViewMode] = useState("day"); // 'day' | 'week'
  const [selectedDate, setSelectedDate] = useState(
    format(new Date(), "yyyy-MM-dd"),
  );
  const [bufferBuffer, setBufferBuffer] = useState(
    DEFAULT_PERSISTED_STATE.bufferBuffer,
  );
  const [filterStartTime, setFilterStartTime] = useState(
    DEFAULT_PERSISTED_STATE.filterStartTime,
  );
  const [filterEndTime, setFilterEndTime] = useState(
    DEFAULT_PERSISTED_STATE.filterEndTime,
  );
  const [filterMode, setFilterMode] = useState(
    DEFAULT_PERSISTED_STATE.filterMode,
  ); // 'manual' | 'service'
  const [selectedDuration, setSelectedDuration] = useState(
    DEFAULT_PERSISTED_STATE.selectedDuration,
  ); // minutes
  const [servicePeriodStart, setServicePeriodStart] = useState(
    DEFAULT_PERSISTED_STATE.servicePeriodStart,
  ); // HH:MM
  const [servicePeriodEnd, setServicePeriodEnd] = useState(
    DEFAULT_PERSISTED_STATE.servicePeriodEnd,
  ); // HH:MM
  const [minMatchingDays, setMinMatchingDays] = useState(
    DEFAULT_PERSISTED_STATE.minMatchingDays,
  );
  const [weekRuleMode, setWeekRuleMode] = useState(
    DEFAULT_PERSISTED_STATE.weekRuleMode,
  );
  const [advancedWeekRules, setAdvancedWeekRules] = useState(
    DEFAULT_PERSISTED_STATE.advancedWeekRules,
  );

  const switchFilterMode = (mode) => {
    setFilterMode(mode);
    if (mode === "service") {
      setFilterStartTime("");
      setFilterEndTime("");
    } else {
      setSelectedDuration(null);
      setServicePeriodStart("");
      setServicePeriodEnd("");
    }
  };

  const clearServiceFilter = () => {
    setSelectedDuration(null);
    setServicePeriodStart("");
    setServicePeriodEnd("");
    setMinMatchingDays(null);
    setWeekRuleMode(DEFAULT_PERSISTED_STATE.weekRuleMode);
    setAdvancedWeekRules(DEFAULT_PERSISTED_STATE.advancedWeekRules);
  };

  const addAdvancedWeekRule = () => {
    setAdvancedWeekRules((prev) => [...prev, createAdvancedWeekRule()]);
  };

  const updateAdvancedWeekRule = (ruleId, updates) => {
    setAdvancedWeekRules((prev) =>
      prev.map((rule) => (rule.id === ruleId ? { ...rule, ...updates } : rule)),
    );
  };

  const removeAdvancedWeekRule = (ruleId) => {
    setAdvancedWeekRules((prev) => prev.filter((rule) => rule.id !== ruleId));
  };

  const toggleAdvancedWeekRuleDay = (ruleId, weekday) => {
    setAdvancedWeekRules((prev) =>
      prev.map((rule) => {
        if (rule.id !== ruleId) return rule;
        const weekdays = rule.weekdays.includes(weekday)
          ? rule.weekdays.filter((value) => value !== weekday)
          : [...rule.weekdays, weekday].sort((a, b) => a - b);
        return { ...rule, weekdays };
      }),
    );
  };

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [caseSettings, setCaseSettings] = useState(
    DEFAULT_PERSISTED_STATE.caseSettings,
  );
  const [caseScheduleData, setCaseScheduleData] = useState([]);
  const [caseScheduleLoading, setCaseScheduleLoading] = useState(false);
  const [caseScheduleError, setCaseScheduleError] = useState(null);
  const [caseScheduleFileName, setCaseScheduleFileName] = useState(
    DEFAULT_PERSISTED_STATE.caseScheduleFileName,
  );

  React.useEffect(() => {
    let isCancelled = false;

    const hydrate = async () => {
      try {
        const legacyState = readLegacyPersistedState();
        const dbOrgs = await orgService.getAll();
        const dbCaseScheduleData = await caseScheduleService.getAll();
        const persistedState = await appStateService.getMany(
          DEFAULT_PERSISTED_STATE,
        );

        const hasDbData =
          dbOrgs.length > 0 ||
          dbCaseScheduleData.length > 0 ||
          Object.values(persistedState).some((value) => {
            if (Array.isArray(value)) return value.length > 0;
            if (value && typeof value === "object") {
              return Object.keys(value).length > 0;
            }
            return value !== null && value !== "" && value !== 15 && value !== "manual";
          });

        const sourceState = hasDbData
          ? {
              ...DEFAULT_PERSISTED_STATE,
              ...persistedState,
              orgs: dbOrgs,
              caseScheduleData: dbCaseScheduleData,
            }
          : legacyState;

        const normalizedOrgs = normalizeOrgData(sourceState.orgs);

        if (!hasDbData) {
          await orgService.saveAll(normalizedOrgs);
          await caseScheduleService.saveAll(sourceState.caseScheduleData);
          await appStateService.setMany({
            selectedOrgIds: sourceState.selectedOrgIds || [],
            bufferBuffer: sourceState.bufferBuffer,
            filterStartTime: sourceState.filterStartTime,
            filterEndTime: sourceState.filterEndTime,
            filterMode: sourceState.filterMode,
            selectedDuration: sourceState.selectedDuration,
            servicePeriodStart: sourceState.servicePeriodStart,
            servicePeriodEnd: sourceState.servicePeriodEnd,
            minMatchingDays: sourceState.minMatchingDays,
            weekRuleMode: sourceState.weekRuleMode,
            advancedWeekRules: sourceState.advancedWeekRules,
            caseSettings: sourceState.caseSettings,
            caseScheduleFileName: sourceState.caseScheduleFileName,
          });
        }

        if (isCancelled) return;

        setOrgs(normalizedOrgs);
        setSelectedOrgIds(new Set(sourceState.selectedOrgIds || []));
        setBufferBuffer(sourceState.bufferBuffer ?? DEFAULT_PERSISTED_STATE.bufferBuffer);
        setFilterStartTime(sourceState.filterStartTime ?? "");
        setFilterEndTime(sourceState.filterEndTime ?? "");
        setFilterMode(sourceState.filterMode ?? DEFAULT_PERSISTED_STATE.filterMode);
        setSelectedDuration(
          sourceState.selectedDuration ?? DEFAULT_PERSISTED_STATE.selectedDuration,
        );
        setServicePeriodStart(sourceState.servicePeriodStart ?? "");
        setServicePeriodEnd(sourceState.servicePeriodEnd ?? "");
        setMinMatchingDays(
          sourceState.minMatchingDays ?? DEFAULT_PERSISTED_STATE.minMatchingDays,
        );
        setWeekRuleMode(
          sourceState.weekRuleMode ?? DEFAULT_PERSISTED_STATE.weekRuleMode,
        );
        setAdvancedWeekRules(
          sourceState.advancedWeekRules ?? DEFAULT_PERSISTED_STATE.advancedWeekRules,
        );
        setCaseSettings(sourceState.caseSettings ?? {});
        setCaseScheduleData(sourceState.caseScheduleData || []);
        setCaseScheduleFileName(sourceState.caseScheduleFileName ?? "");
      } catch (loadError) {
        console.error("App hydration failed:", loadError);
        if (!isCancelled) {
          setError("初始化資料失敗，請重新整理後再試一次。");
        }
      } finally {
        if (!isCancelled) {
          setIsHydrated(true);
        }
      }
    };

    hydrate();

    return () => {
      isCancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!isHydrated) return;

    orgService.saveAll(orgs).catch((saveError) => {
      console.error("Dexie 儲存機構資料失敗:", saveError);
      setError("班表資料儲存失敗，請稍後再試。");
    });
  }, [isHydrated, orgs]);

  React.useEffect(() => {
    if (!isHydrated) return;

    caseScheduleService.saveAll(caseScheduleData).catch((saveError) => {
      console.error("Dexie 儲存個案班表失敗:", saveError);
    });
  }, [isHydrated, caseScheduleData]);

  React.useEffect(() => {
    if (!isHydrated) return;

    appStateService
      .setMany({
        selectedOrgIds: [...selectedOrgIds],
        bufferBuffer,
        filterStartTime,
        filterEndTime,
        filterMode,
        selectedDuration,
        servicePeriodStart,
        servicePeriodEnd,
        minMatchingDays,
        weekRuleMode,
        advancedWeekRules,
        caseSettings,
        caseScheduleFileName,
      })
      .catch((saveError) => {
        console.error("Dexie 儲存偏好設定失敗:", saveError);
      });
  }, [
    isHydrated,
    selectedOrgIds,
    bufferBuffer,
    filterStartTime,
    filterEndTime,
    filterMode,
    selectedDuration,
    servicePeriodStart,
    servicePeriodEnd,
    minMatchingDays,
    weekRuleMode,
    advancedWeekRules,
    caseSettings,
    caseScheduleFileName,
  ]);

  // Constants
  const START_OF_DAY = 6; // 06:00
  const END_OF_DAY = 22; // 22:00

  const processOrgFile = (file) => {
    if (!file) return;

    setLoading(true);
    setError(null);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const xlsx = await loadXLSX();
        const bstr = evt.target.result;
        const workbook = xlsx.read(bstr, { type: "array", cellDates: true });
        const { newOrg, discoveredCases, suggestedDate } = parseOrgWorkbook({
          file,
          workbook,
          xlsx,
          pendingOrgName,
          orgCount: orgs.length,
        });
        setOrgs((prev) => [...prev, newOrg]);
        setPendingOrgName("");

        if (discoveredCases.length > 0) {
          setCaseSettings((prev) => {
            const next = { ...prev };
            let changed = false;
            discoveredCases.forEach((name) => {
              if (!next[name]) {
                next[name] = { early: 0, late: 0, isFixed: false };
                changed = true;
              }
            });
            return changed ? next : prev;
          });
        }

        setShowOrgManager(false); // Auto-transition to dashboard

        if (suggestedDate) {
          setSelectedDate(suggestedDate);
        }
      } catch (err) {
        console.error(err);
        setError("解析檔案失敗: " + err.message);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    processOrgFile(file);
    e.target.value = "";
  };

  const handleOrgFileDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    orgFileDragDepth.current += 1;
    setIsDraggingOrgFile(true);
  };

  const handleOrgFileDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingOrgFile) {
      setIsDraggingOrgFile(true);
    }
  };

  const handleOrgFileDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    orgFileDragDepth.current = Math.max(0, orgFileDragDepth.current - 1);
    if (orgFileDragDepth.current === 0) {
      setIsDraggingOrgFile(false);
    }
  };

  const handleOrgFileDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    orgFileDragDepth.current = 0;
    setIsDraggingOrgFile(false);

    const file = e.dataTransfer?.files?.[0];
    processOrgFile(file);
  };

  const handleCaseScheduleUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setCaseScheduleLoading(true);
    setCaseScheduleError(null);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const xlsx = await loadXLSX();
        const workbook = xlsx.read(evt.target.result, {
          type: "array",
          cellDates: true,
        });
        const clients = parseCaseScheduleWorkbook(workbook, xlsx);
        if (!clients.length)
          throw new Error("找不到任何個案資料，請確認工作表名稱為案主姓名。");
        setCaseScheduleData(clients);
        setCaseScheduleFileName(file.name);
        setCaseSettings((prev) => {
          const next = { ...prev };
          clients.forEach(({ clientName }) => {
            if (clientName && !next[clientName])
              next[clientName] = { early: 0, late: 0, isFixed: false };
          });
          return next;
        });
      } catch (err) {
        setCaseScheduleError("解析失敗: " + err.message);
      } finally {
        setCaseScheduleLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Logic: Calculate Availability for Selected Date
  const processedAvailability = useMemo(() => {
    return calculateDailyAvailability(
      selectedDate,
      activeScheduleData,
      activeStaffData,
      bufferBuffer,
    );
  }, [activeScheduleData, activeStaffData, selectedDate, bufferBuffer]);

  const weekDates = useMemo(() => {
    if (viewMode !== "week" || !selectedDate) return [];

    const weekStart = startOfWeek(new Date(selectedDate), { weekStartsOn: 0 });
    return Array.from({ length: 7 }, (_, index) =>
      format(addDays(weekStart, index), "yyyy-MM-dd"),
    );
  }, [viewMode, selectedDate]);

  const weeklyAvailabilityByDate = useMemo(() => {
    if (weekDates.length === 0 || !activeScheduleData) return [];

    return weekDates.map((dateStr) => ({
      date: dateStr,
      data: calculateDailyAvailability(
        dateStr,
        activeScheduleData,
        activeStaffData,
        bufferBuffer,
      ),
    }));
  }, [weekDates, activeScheduleData, activeStaffData, bufferBuffer]);

  // Logic: Calculate Weekly Availability
  const processedWeeklyAvailability = useMemo(() => {
    if (viewMode !== "week" || weeklyAvailabilityByDate.length === 0) return [];

    // Re-structure by Staff
    return activeStaffData.map((staff) => {
      const staffWeekData = {};
      weeklyAvailabilityByDate.forEach((day) => {
        const staffDayPayload = day.data.find((d) => d.staff.id === staff.id);
        staffWeekData[day.date] = staffDayPayload || {
          blocked: [],
          busyRaw: [],
          free: [],
        };
      });

      return {
        staff,
        days: staffWeekData,
      };
    });
  }, [
    activeStaffData,
    viewMode,
    weeklyAvailabilityByDate,
  ]);

  // Helper: Filter results for a single day
  const filteredStaffList = useMemo(() => {
    if (!filterStartTime || !filterEndTime) return null;
    try {
      return applyTimeFilter(
        processedAvailability,
        selectedDate,
        filterStartTime,
        filterEndTime,
        bufferBuffer,
        caseSettings,
      );
    } catch (e) {
      console.error("Filter Error:", e);
      return { available: [], potential: [], offDuty: [] };
    }
  }, [
    processedAvailability,
    filterStartTime,
    filterEndTime,
    selectedDate,
    bufferBuffer,
    caseSettings,
  ]);

  // Helper: Filter results for every day of the selected week
  const filteredWeeklyList = useMemo(() => {
    if (viewMode !== "week" || !filterStartTime || !filterEndTime) return null;
    try {
      return weeklyAvailabilityByDate.map(({ date, data }) => {
        return {
          date,
          ...applyTimeFilter(
            data,
            date,
            filterStartTime,
            filterEndTime,
            bufferBuffer,
            caseSettings,
          ),
        };
      });
    } catch (e) {
      console.error("Weekly Filter Error:", e);
      return null;
    }
  }, [
    viewMode,
    filterStartTime,
    filterEndTime,
    bufferBuffer,
    caseSettings,
    weeklyAvailabilityByDate,
  ]);

  // Helper: Service filter results for a single day
  const filteredByService = useMemo(() => {
    if (
      filterMode !== "service" ||
      !selectedDuration ||
      !servicePeriodStart ||
      !servicePeriodEnd
    )
      return null;
    return applyServiceFilter(
      processedAvailability,
      selectedDate,
      servicePeriodStart,
      servicePeriodEnd,
      selectedDuration,
      bufferBuffer,
      caseSettings,
    );
  }, [
    filterMode,
    selectedDuration,
    servicePeriodStart,
    servicePeriodEnd,
    processedAvailability,
    selectedDate,
    bufferBuffer,
    caseSettings,
  ]);

  // Helper: Service filter results for every day of the selected week
  const filteredByServiceWeekly = useMemo(() => {
    if (
      viewMode !== "week" ||
      filterMode !== "service" ||
      !selectedDuration ||
      !servicePeriodStart ||
      !servicePeriodEnd
    )
      return null;
    return weeklyAvailabilityByDate.map(({ date, data }) => {
      return {
        date,
        ...applyServiceFilter(
          data,
          date,
          servicePeriodStart,
          servicePeriodEnd,
          selectedDuration,
          bufferBuffer,
          caseSettings,
        ),
      };
    });
  }, [
    viewMode,
    filterMode,
    selectedDuration,
    servicePeriodStart,
    servicePeriodEnd,
    bufferBuffer,
    caseSettings,
    weeklyAvailabilityByDate,
  ]);

  const normalizedAdvancedWeekRules = useMemo(
    () =>
      advancedWeekRules
        .map((rule) => ({
          ...rule,
          weekdays: Array.isArray(rule.weekdays)
            ? [...new Set(rule.weekdays)].sort((a, b) => a - b)
            : [],
          duration: rule.duration ? Number(rule.duration) : null,
          includePotential: rule.includePotential !== false,
        }))
        .filter(
          (rule) =>
            rule.weekdays.length > 0 &&
            rule.startTime &&
            rule.endTime &&
            rule.duration,
        ),
    [advancedWeekRules],
  );

  const multiRuleWeeklyResult = useMemo(() => {
    if (
      viewMode !== "week" ||
      filterMode !== "service" ||
      weekRuleMode !== "rules" ||
      normalizedAdvancedWeekRules.length === 0
    ) {
      return null;
    }

    const ruleEvaluations = normalizedAdvancedWeekRules.map((rule, ruleIndex) => {
      const selectedDays = weeklyAvailabilityByDate.filter(({ date }) =>
        rule.weekdays.includes(new Date(date).getDay()),
      );

      return {
        ...rule,
        order: ruleIndex + 1,
        dayResults: selectedDays.map(({ date, data }) => ({
          date,
          ...applyServiceFilter(
            data,
            date,
            rule.startTime,
            rule.endTime,
            rule.duration,
            bufferBuffer,
            caseSettings,
          ),
        })),
      };
    });

    return activeStaffData
      .map((staff) => {
        const staffKey = staff.staffKey || staff.id || staff.name;
        const ruleSummaries = ruleEvaluations.map((rule) => {
          const dayStatuses = rule.dayResults.map((dayResult) => {
            const available = dayResult.available.some(
              (person) =>
                (person.staff.staffKey || person.staff.id || person.staff.name) ===
                staffKey,
            );
            const potential = dayResult.potential.some(
              (person) =>
                (person.staff.staffKey || person.staff.id || person.staff.name) ===
                staffKey,
            );
            const offDutyPerson = dayResult.offDuty.find(
              (person) =>
                (person.staff.staffKey || person.staff.id || person.staff.name) ===
                staffKey,
            );

            let status = "none";
            if (available) {
              status = "available";
            } else if (potential) {
              status = "potential";
            } else if (offDutyPerson) {
              const dayType = String(offDutyPerson.dayType || "");
              status = dayType.includes("例") ? "off_regular" : "off_leave";
            }

            return {
              date: dayResult.date,
              weekday: new Date(dayResult.date).getDay(),
              status,
            };
          });

          const passes = dayStatuses.every((day) =>
            rule.includePotential
              ? day.status === "available" ||
                day.status === "potential" ||
                day.status === "off_leave"
              : day.status === "available" || day.status === "off_leave",
          );

          return {
            id: rule.id,
            order: rule.order,
            weekdays: rule.weekdays,
            startTime: rule.startTime,
            endTime: rule.endTime,
            duration: rule.duration,
            includePotential: rule.includePotential,
            passes,
            dayStatuses,
          };
        });

        return {
          staff,
          ruleSummaries,
          passCount: ruleSummaries.filter((rule) => rule.passes).length,
        };
      })
      .reduce(
        (acc, entry) => {
          const passesAllRules = entry.ruleSummaries.every((rule) => rule.passes);
          const hasRegularOffDuty = entry.ruleSummaries.some((rule) =>
            rule.dayStatuses.some(
              (day) => day.status === "off_regular",
            ),
          );

          if (passesAllRules) {
            acc.matches.push(entry);
          } else if (hasRegularOffDuty) {
            acc.offDutyMatches.push(entry);
          }

          return acc;
        },
        { matches: [], offDutyMatches: [] },
      );
  }, [
    viewMode,
    filterMode,
    weekRuleMode,
    normalizedAdvancedWeekRules,
    weeklyAvailabilityByDate,
    bufferBuffer,
    caseSettings,
    activeStaffData,
  ]);

  const sortedMultiRuleWeeklyResult = useMemo(() => {
    if (!multiRuleWeeklyResult) return null;

    const sortByName = (a, b) => a.staff.name.localeCompare(b.staff.name, "zh-Hant");

    return {
      matches: [...multiRuleWeeklyResult.matches].sort(sortByName),
      offDutyMatches: [...multiRuleWeeklyResult.offDutyMatches].sort(sortByName),
    };
  }, [multiRuleWeeklyResult]);

  const aggregatedServiceWeekMatches = useMemo(() => {
    if (
      viewMode !== "week" ||
      filterMode !== "service" ||
      !selectedDuration ||
      !servicePeriodStart ||
      !servicePeriodEnd ||
      !minMatchingDays ||
      !filteredByServiceWeekly
    ) {
      return null;
    }

    const matchMap = new Map();

    filteredByServiceWeekly.forEach((dayResult) => {
      dayResult.available.forEach((person) => {
        const staffKey =
          person.staff.staffKey || person.staff.id || person.staff.name;

        if (!matchMap.has(staffKey)) {
          matchMap.set(staffKey, {
            staff: person.staff,
            matchedDays: new Map(),
          });
        }

        matchMap.get(staffKey).matchedDays.set(dayResult.date, "available");
      });

      dayResult.potential.forEach((person) => {
        const staffKey =
          person.staff.staffKey || person.staff.id || person.staff.name;

        if (!matchMap.has(staffKey)) {
          matchMap.set(staffKey, {
            staff: person.staff,
            matchedDays: new Map(),
          });
        }

        const currentStatus = matchMap.get(staffKey).matchedDays.get(dayResult.date);
        if (currentStatus !== "available") {
          matchMap.get(staffKey).matchedDays.set(dayResult.date, "potential");
        }
      });
    });

    return [...matchMap.values()]
      .map((entry) => {
        const days = weeklyAvailabilityByDate.map(({ date }) => ({
          date,
          weekday: new Date(date).getDay(),
          status: entry.matchedDays.get(date) || "none",
        }));
        const matchingDates = days
          .filter((day) => day.status !== "none")
          .map((day) => day.date);
        const availableDates = days
          .filter((day) => day.status === "available")
          .map((day) => day.date);
        const potentialDates = days
          .filter((day) => day.status === "potential")
          .map((day) => day.date);

        return {
          staff: entry.staff,
          matchingDates,
          availableDates,
          potentialDates,
          matchCount: matchingDates.length,
          days,
        };
      })
      .filter((entry) => entry.matchCount >= minMatchingDays)
      .sort((a, b) => {
        if (b.matchCount !== a.matchCount) {
          return b.matchCount - a.matchCount;
        }

        return a.staff.name.localeCompare(b.staff.name, "zh-Hant");
      });
  }, [
    viewMode,
    filterMode,
    selectedDuration,
    servicePeriodStart,
    servicePeriodEnd,
    minMatchingDays,
    filteredByServiceWeekly,
    weeklyAvailabilityByDate,
  ]);

  // Unified active filter result
  const activeFilterResult = filteredStaffList || filteredByService;
  const activeWeeklyFilterResult = filteredWeeklyList || filteredByServiceWeekly;

  const activeOrgIds = useMemo(() => {
    if (selectedOrgIds.size > 0) return new Set(selectedOrgIds);
    return new Set(orgs.map((org) => org.id));
  }, [orgs, selectedOrgIds]);

  const crossOrgAvailableMatches = useMemo(() => {
    if (!activeFilterResult || activeOrgIds.size < 2) return [];

    const groupedMatches = new Map();

    activeFilterResult.available.forEach((item) => {
      const normalizedName = normalizeCrossOrgStaffName(item.staff.name);
      const orgId = item.staff.orgId;

      if (!normalizedName || !orgId || !activeOrgIds.has(orgId)) return;

      if (!groupedMatches.has(normalizedName)) {
        groupedMatches.set(normalizedName, {
          normalizedName,
          orgMap: new Map(),
        });
      }

      groupedMatches.get(normalizedName).orgMap.set(orgId, {
        orgId,
        orgName: item.staff.org,
        originalName: item.staff.name,
        staff: item.staff,
        ...splitFreeIntervalsByFilter({
          freeIntervals: item.free || [],
          filterMode,
          selectedDate,
          filterStartTime,
          filterEndTime,
          servicePeriodStart,
          servicePeriodEnd,
          selectedDuration,
        }),
      });
    });

    return [...groupedMatches.values()]
      .filter((entry) => activeOrgIds.size === entry.orgMap.size)
      .map((entry) => {
        const orgEntries = [...entry.orgMap.values()].sort((a, b) =>
          a.orgName.localeCompare(b.orgName, "zh-Hant"),
        );

        return {
          normalizedName: entry.normalizedName,
          orgEntries,
        };
      })
      .sort((a, b) =>
        a.normalizedName.localeCompare(b.normalizedName, "zh-Hant"),
      );
  }, [
    activeFilterResult,
    activeOrgIds,
    filterMode,
    selectedDate,
    filterStartTime,
    filterEndTime,
    servicePeriodStart,
    servicePeriodEnd,
    selectedDuration,
  ]);

  // Stats: service hours per staff (with 例/休 day breakdown)
  const statsData = useMemo(() => {
    if (!activeScheduleData.length || !activeStaffData.length) return [];

    const getRecordStaffKey = (record) =>
      record.__staffKey || `${record.__orgId || "legacy"}::NAME::${record["服務人員"] || ""}`;

    // Build day-type map: "staffName__dateStr" -> '例' | '休'
    const dayOffMap = {};
    activeScheduleData.forEach((record) => {
      const t = record["服務時間"];
      if (t !== "例" && t !== "休") return;
      const staffKey = getRecordStaffKey(record);
      const dateVal = record["服務日期"];
      if (!staffKey || !dateVal) return;
      let dateStr = "";
      try {
        if (dateVal instanceof Date && isValid(dateVal))
          dateStr = format(dateVal, "yyyy-MM-dd");
        else {
          const p = new Date(dateVal);
          dateStr = isValid(p) ? format(p, "yyyy-MM-dd") : String(dateVal);
        }
      } catch {
        dateStr = String(dateVal);
      }
      dayOffMap[`${staffKey}__${dateStr}`] = t;
    });

    // Build transit map and national holiday set
    const transitMap = {};
    const nationalHolidaySet = new Set();
    activeScheduleData.forEach((record) => {
      const t = record["服務時間"];
      const staffKey = getRecordStaffKey(record);
      const dateVal = record["服務日期"];
      if (!staffKey || !dateVal) return;
      let dateStr = "";
      try {
        if (dateVal instanceof Date && isValid(dateVal))
          dateStr = format(dateVal, "yyyy-MM-dd");
        else {
          const p = new Date(dateVal);
          dateStr = isValid(p) ? format(p, "yyyy-MM-dd") : String(dateVal);
        }
      } catch {
        dateStr = String(dateVal);
      }
      const key = `${staffKey}__${dateStr}`;
      if (t === "_transit") {
        transitMap[key] = (transitMap[key] || 0) + (record._transitHours || 0);
      } else if (t === "_national") {
        nationalHolidaySet.add(key);
      }
    });

    const NORMAL_DAILY_MINUTES = 8 * 60; // 8h per day

    const map = {};
    activeStaffData.forEach((s) => {
      map[s.staffKey] = {
        staff: s,
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
      };
    });

    const normalizeDate = (dateVal) => {
      try {
        if (dateVal instanceof Date && isValid(dateVal))
          return format(dateVal, "yyyy-MM-dd");
        const p = new Date(dateVal);
        return isValid(p) ? format(p, "yyyy-MM-dd") : String(dateVal);
      } catch {
        return String(dateVal);
      }
    };

    activeScheduleData.forEach((record) => {
      const staffKey = getRecordStaffKey(record);
      const timeVal = record["服務時間"];
      const dateVal = record["服務日期"];
      if (!staffKey || !timeVal || !map[staffKey]) return;
      if (timeVal === "例" || timeVal === "休") return;
      const m = String(timeVal).match(
        /(\d{1,2}:\d{2})\s*[~～-]\s*(\d{1,2}:\d{2})/,
      );
      if (!m) return;
      const [sh, sm] = m[1].split(":").map(Number);
      const [eh, em] = m[2].split(":").map(Number);
      const mins = eh * 60 + em - (sh * 60 + sm);
      if (mins <= 0) return;

      const dateStr = normalizeDate(dateVal);
      const dayType = dayOffMap[`${staffKey}__${dateStr}`];
      map[staffKey].totalMinutes += mins;
      map[staffKey].sessions += 1;
      if (dateStr) map[staffKey].days.add(dateStr);

      const key = `${staffKey}__${dateStr}`;
      if (dayType === "例") {
        map[staffKey].holidayMinutes += mins;
        map[staffKey].dailyHoliday[dateStr] =
          (map[staffKey].dailyHoliday[dateStr] || 0) + mins;
      } else if (dayType === "休") {
        map[staffKey].restDayMinutes += mins;
        map[staffKey].dailyRestDay[dateStr] =
          (map[staffKey].dailyRestDay[dateStr] || 0) + mins;
      } else if (nationalHolidaySet.has(key)) {
        map[staffKey].nationalHolidayMinutes += mins;
        map[staffKey].dailyNationalHoliday[dateStr] =
          (map[staffKey].dailyNationalHoliday[dateStr] || 0) + mins;
      } else {
        // accumulate by day for overtime calculation
        map[staffKey].dailyNormal[dateStr] =
          (map[staffKey].dailyNormal[dateStr] || 0) + mins;
      }
    });

    // Accumulate transit hours per staff
    Object.entries(transitMap).forEach(([key, hours]) => {
      const [staffKey] = key.split("__");
      if (map[staffKey]) map[staffKey].transitHours += hours;
    });

    // Split normal days into regular + overtime (>8h/day) and compute tiered breakdowns
    return Object.values(map)
      .map((s) => {
        let normalMinutes = 0,
          overtimeMinutes = 0;
        Object.values(s.dailyNormal).forEach((dayMins) => {
          if (dayMins > NORMAL_DAILY_MINUTES) {
            normalMinutes += NORMAL_DAILY_MINUTES;
            overtimeMinutes += dayMins - NORMAL_DAILY_MINUTES;
          } else {
            normalMinutes += dayMins;
          }
        });

        // Tiered breakdowns — 平日
        let normal_1_8 = 0, normal_8_10 = 0, normal_gt10 = 0;
        Object.values(s.dailyNormal).forEach((dm) => {
          normal_1_8 += Math.min(dm, 480);
          normal_8_10 += Math.max(0, Math.min(dm, 600) - 480);
          normal_gt10 += Math.max(0, dm - 600);
        });

        // Tiered breakdowns — 休息日
        let rest_lte2 = 0, rest_lte8 = 0, rest_gt8 = 0;
        Object.values(s.dailyRestDay).forEach((dm) => {
          rest_lte2 += Math.min(dm, 120);
          rest_lte8 += Math.max(0, Math.min(dm, 480) - 120);
          rest_gt8 += Math.max(0, dm - 480);
        });

        // Tiered breakdowns — 例假日
        let hol_lte8 = 0, hol_gt8 = 0;
        Object.values(s.dailyHoliday).forEach((dm) => {
          hol_lte8 += Math.min(dm, 480);
          hol_gt8 += Math.max(0, dm - 480);
        });

        // Tiered breakdowns — 國定假日
        let nat_lte8 = 0, nat_8_10 = 0, nat_gt10 = 0;
        Object.values(s.dailyNationalHoliday).forEach((dm) => {
          nat_lte8 += Math.min(dm, 480);
          nat_8_10 += Math.max(0, Math.min(dm, 600) - 480);
          nat_gt10 += Math.max(0, dm - 600);
        });

        const toH = (m) => +(m / 60).toFixed(2);

        return {
          ...s,
          days: s.days.size,
          normalMinutes,
          overtimeMinutes,
          totalHours: +(s.totalMinutes / 60).toFixed(1),
          normalHours: +(normalMinutes / 60).toFixed(1),
          overtimeHours: +(overtimeMinutes / 60).toFixed(1),
          restDayHours: +(s.restDayMinutes / 60).toFixed(1),
          holidayHours: +(s.holidayMinutes / 60).toFixed(1),
          nationalHolidayHours: +(s.nationalHolidayMinutes / 60).toFixed(1),
          transitHoursTotal: +s.transitHours.toFixed(2),
          // Tiered hours
          normal_1_8: toH(normal_1_8),
          normal_8_10: toH(normal_8_10),
          normal_gt10: toH(normal_gt10),
          rest_lte2: toH(rest_lte2),
          rest_lte8: toH(rest_lte8),
          rest_gt8: toH(rest_gt8),
          hol_lte8: toH(hol_lte8),
          hol_gt8: toH(hol_gt8),
          nat_lte8: toH(nat_lte8),
          nat_8_10: toH(nat_8_10),
          nat_gt10: toH(nat_gt10),
          holDayCount: Object.keys(s.dailyHoliday).length,
          natDayCount: Object.keys(s.dailyNationalHoliday).length,
        };
      })
      .sort((a, b) => b.totalMinutes - a.totalMinutes);
  }, [activeScheduleData, activeStaffData]);

  // --- Render Components ---

  if (!isHydrated) {
    return (
      <div className="min-h-screen bg-[#F0F3F8] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 rounded-3xl border border-slate-100 bg-white px-8 py-10 shadow-sm">
          <div className="w-12 h-12 border-4 border-brand-coral border-t-transparent rounded-full animate-spin" />
          <div className="text-center">
            <p className="text-base font-semibold text-brand-slate">正在載入資料</p>
            <p className="text-sm text-slate-400 mt-1">同步本機班表與偏好設定中...</p>
          </div>
        </div>
      </div>
    );
  }

  if (step === "upload") {
    const isAddingMore = orgs.length > 0;
    const canAddMore = orgs.length < 6;

    const features = [
      {
        icon: <Calendar className="w-5 h-5" />,
        title: "月曆解析",
        desc: "自動解析每月人員班表，識別上班、例假、休假時段",
      },
      {
        icon: <List className="w-5 h-5" />,
        title: "明細解析",
        desc: "讀取服務明細表，計算實際出勤與服務時數",
      },
      {
        icon: <Users className="w-5 h-5" />,
        title: "多機構管理",
        desc: "同時載入最多 6 間機構，跨機構比對人力",
      },
    ];

    return (
      <div className="min-h-screen bg-[#F0F3F8] flex items-stretch">
        {/* Left Panel — Branding */}
        <div className="hidden lg:flex lg:w-[40%] flex-col justify-between p-14 bg-brand-slate relative overflow-hidden anim-slide-left">
          {/* Background decorations */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-brand-coral/25 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-brand-teal/15 rounded-full translate-y-1/2 -translate-x-1/3 blur-3xl pointer-events-none" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-white/[0.02] rounded-full blur-2xl pointer-events-none" />

          {/* Top — Logo + Title */}
          <div className="relative z-10">
            <div className="inline-flex items-center gap-5 mb-12 anim-fade-up anim-delay-2">
              <div className="w-20 h-20 bg-brand-coral rounded-[2rem] flex items-center justify-center -rotate-6 shadow-2xl shadow-brand-coral/50 relative">
                <Search className="w-10 h-10 text-white" />
                <div className="absolute -bottom-2 -right-2 bg-white p-2 rounded-2xl shadow-xl">
                  <User className="w-5 h-5 text-brand-coral" />
                </div>
              </div>
              <img
                src="/name2.svg"
                alt="brand name"
                className="h-14 opacity-90"
                style={{ filter: "brightness(0) invert(1)" }}
              />
            </div>

            <h1 className="text-5xl font-bold text-white leading-tight mb-4 anim-fade-up anim-delay-3">
              Staff Availability
              <br />
              <span className="text-brand-coral">Finder</span>
            </h1>
            <p className="text-white/55 text-base leading-relaxed anim-fade-up anim-delay-4">
              找人不再像大海撈針，除非你家住在海邊。
              <br />
              一鍵上傳，立刻抓出誰有空。
            </p>
          </div>

          {/* Middle — Features */}
          <div className="relative z-10 space-y-5 -mt-8">
            {features.map((f, i) => (
              <div
                key={f.title}
                className={`flex items-start gap-4 anim-fade-up anim-delay-${i + 3}`}
              >
                <div className="w-11 h-11 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center text-white shrink-0">
                  {f.icon}
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">{f.title}</p>
                  <p className="text-white/45 text-xs mt-0.5 leading-relaxed">
                    {f.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Bottom — Copyright */}
          <p className="relative z-10 text-white/25 text-xs anim-fade-up anim-delay-6">
            © {new Date().getFullYear()} Staff Availability Finder. All rights reserved.
          </p>
        </div>

        {/* Right Panel — Upload Form */}
        <div className="flex-1 flex flex-col justify-center p-8 lg:p-16 bg-[#F0F3F8] anim-slide-right">
          {/* Mobile header */}
          {!isAddingMore && (
            <div className="lg:hidden text-center mb-10 anim-fade-up">
              <h1 className="text-3xl font-bold text-brand-slate">
                Staff Availability{" "}
                <span className="text-brand-coral">Finder</span>
              </h1>
              <p className="text-slate-500 text-sm mt-2">
                一鍵上傳，立刻抓出誰有空
              </p>
            </div>
          )}

          {isAddingMore && (
            <div className="flex items-center justify-between mb-8 anim-fade-up">
              <div>
                <h2 className="text-2xl font-bold text-brand-slate">
                  管理機構
                </h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  目前已載入 {orgs.length} 間機構
                </p>
              </div>
              <button
                onClick={() => setShowOrgManager(false)}
                className="px-5 py-2.5 bg-brand-coral text-white text-sm font-bold rounded-xl shadow-lg shadow-brand-coral/30 hover:bg-brand-coral/90 transition-colors"
              >
                進入系統 →
              </button>
            </div>
          )}

          {/* Existing orgs list */}
          {isAddingMore && (
            <div className="mb-6 p-5 rounded-2xl bg-white shadow-sm border border-slate-100 anim-fade-up anim-delay-1">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">
                已上傳機構
              </p>
              <div className="space-y-2">
                {orgs.map((org, idx) => {
                  const color = ORG_COLORS[idx % ORG_COLORS.length];
                  return (
                    <div
                      key={org.id}
                      className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100"
                    >
                      <span
                        className={cn(
                          "w-3 h-3 rounded-full shrink-0",
                          color.dot,
                        )}
                      />
                      <span className="font-bold text-sm text-brand-slate flex-1">
                        {org.name}
                      </span>
                      <span className="text-xs text-slate-400 truncate max-w-[160px]">
                        {org.fileName}
                      </span>
                      <button
                        onClick={() => {
                          setOrgs((prev) => prev.filter((o) => o.id !== org.id));
                          setSelectedOrgIds((prev) => {
                            const next = new Set(prev);
                            next.delete(org.id);
                            return next;
                          });
                        }}
                        className="ml-1 text-slate-300 hover:text-red-400 transition-colors text-xl leading-none"
                        title="刪除此機構"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Upload Section */}
          {canAddMore && (
            <div className="space-y-5">
              {/* Format badges */}
              {!isAddingMore && (
                <div className="grid grid-cols-2 gap-4 anim-fade-up anim-delay-1">
                  <div className="p-5 rounded-2xl bg-white border border-orange-100 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
                    <div className="w-12 h-12 rounded-2xl bg-orange-100 flex items-center justify-center text-orange-500 shrink-0">
                      <Calendar className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">
                        月曆解析
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        每月人員班表.xls
                      </p>
                    </div>
                  </div>
                  <div className="p-5 rounded-2xl bg-white border border-teal-100 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
                    <div className="w-12 h-12 rounded-2xl bg-teal-100 flex items-center justify-center text-teal-500 shrink-0">
                      <List className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">
                        明細解析
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        服務明細.xls
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Org name input */}
              <div className="anim-fade-up anim-delay-2">
                <p className="text-sm font-bold text-brand-slate mb-2">
                  {isAddingMore
                    ? `新增第 ${orgs.length + 1} 間機構`
                    : "機構名稱（可選）"}
                </p>
                <input
                  placeholder={`機構${String.fromCharCode(65 + orgs.length)}`}
                  value={pendingOrgName}
                  onChange={(e) => setPendingOrgName(e.target.value)}
                  className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-white text-sm text-brand-slate placeholder:text-slate-400 focus:outline-none focus:border-brand-coral focus:ring-2 focus:ring-brand-coral/20 shadow-sm"
                />
                <p className="text-xs text-slate-400 mt-1.5">
                  留空則自動命名為「機構{String.fromCharCode(65 + orgs.length)}
                  」
                </p>
              </div>

              {/* Drop zone */}
              <label
                htmlFor="file-upload"
                onDragEnter={handleOrgFileDragEnter}
                onDragOver={handleOrgFileDragOver}
                onDragLeave={handleOrgFileDragLeave}
                onDrop={handleOrgFileDrop}
                className={cn(
                  "anim-fade-up anim-delay-3 group relative flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-3xl cursor-pointer bg-white shadow-sm transition-all duration-300",
                  isDraggingOrgFile
                    ? "border-brand-coral bg-brand-coral/[0.04] scale-[1.01]"
                    : "border-slate-300 hover:bg-brand-coral/[0.02] hover:border-brand-coral",
                )}
              >
                <div className="flex flex-col items-center gap-4">
                  <div
                    className={cn(
                      "w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300",
                      isDraggingOrgFile
                        ? "bg-brand-coral/10 scale-110"
                        : "bg-slate-100 group-hover:bg-brand-coral/10 group-hover:scale-110",
                    )}
                  >
                    <Upload
                      className={cn(
                        "w-8 h-8 transition-colors",
                        isDraggingOrgFile
                          ? "text-brand-coral"
                          : "text-slate-400 group-hover:text-brand-coral",
                      )}
                    />
                  </div>
                  <div className="text-center">
                    <p
                      className={cn(
                        "text-base font-semibold transition-colors",
                        isDraggingOrgFile
                          ? "text-brand-slate"
                          : "text-slate-600 group-hover:text-brand-slate",
                      )}
                    >
                      {isDraggingOrgFile ? "放開以上傳班表" : "點擊上傳或拖曳檔案至此"}
                    </p>
                    <p className="text-sm text-slate-400 mt-1">
                      支援 .xlsx, .xls
                    </p>
                  </div>
                </div>
                <input
                  id="file-upload"
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                {loading && (
                  <div className="absolute inset-0 bg-white/85 backdrop-blur-sm rounded-3xl flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 border-4 border-brand-coral border-t-transparent rounded-full animate-spin" />
                      <p className="text-sm font-semibold text-brand-slate">
                        正在解析 Excel 資料...
                      </p>
                    </div>
                  </div>
                )}
              </label>

              {error && (
                <div className="p-4 rounded-xl bg-red-50 border border-red-100 flex items-center gap-3 anim-fade-up">
                  <XCircle className="w-5 h-5 text-red-500 shrink-0" />
                  <p className="text-sm text-red-700 font-medium">{error}</p>
                </div>
              )}
            </div>
          )}

          {orgs.length >= 6 && (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-100 text-sm text-amber-700 font-medium text-center">
              已達上限（6 間機構）
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Navigation */}
      <nav className="sticky top-0 z-40 bg-brand-slate text-white shadow-lg border-b border-white/5 anim-fade-down">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-20 items-center">
            <div className="flex items-center space-x-4">
              <div className="bg-brand-coral p-2.5 rounded-2xl shadow-lg shadow-brand-coral/20 relative">
                <Search className="w-6 h-6 text-white" />
                <div className="absolute -top-1 -right-1 bg-white p-0.5 rounded-md shadow-sm">
                  <User className="w-3 h-3 text-brand-coral" />
                </div>
              </div>
              <img
                src="/name2.svg"
                alt="Staff Finder"
                className="h-8"
                style={{ filter: "brightness(0) invert(1)" }}
              />
            </div>

            <div className="hidden lg:flex items-center bg-white/5 p-1 rounded-2xl border border-white/10">
              <button
                onClick={() => setViewMode("day")}
                className={cn(
                  "px-6 py-2 rounded-xl text-sm font-semibold transition-all duration-300 flex items-center space-x-2",
                  viewMode === "day"
                    ? "bg-white text-brand-slate shadow-lg"
                    : "text-white/60 hover:text-white",
                )}
              >
                <Clock className="w-4 h-4" />
                <span>單日概況</span>
              </button>
              <button
                onClick={() => setViewMode("week")}
                className={cn(
                  "px-6 py-2 rounded-xl text-sm font-semibold transition-all duration-300 flex items-center space-x-2",
                  viewMode === "week"
                    ? "bg-white text-brand-slate shadow-lg"
                    : "text-white/60 hover:text-white",
                )}
              >
                <Calendar className="w-4 h-4" />
                <span>一週概況</span>
              </button>
              <button
                onClick={() => setViewMode("cases")}
                className={cn(
                  "px-6 py-2 rounded-xl text-sm font-semibold transition-all duration-300 flex items-center space-x-2",
                  viewMode === "cases"
                    ? "bg-white text-brand-slate shadow-lg"
                    : "text-white/60 hover:text-white",
                )}
              >
                <Users className="w-4 h-4" />
                <span>個案班表</span>
              </button>
              <button
                onClick={() => setViewMode("stats")}
                className={cn(
                  "px-6 py-2 rounded-xl text-sm font-semibold transition-all duration-300 flex items-center space-x-2",
                  viewMode === "stats"
                    ? "bg-white text-brand-slate shadow-lg"
                    : "text-white/60 hover:text-white",
                )}
              >
                <BarChart2 className="w-4 h-4" />
                <span>時數統計</span>
              </button>
            </div>

            <div className="flex items-center space-x-4">
              <Button
                variant="outline"
                className="h-10 rounded-xl border-white/10 bg-white/5 text-white hover:bg-white/10 font-bold"
                onClick={() => setIsAgentOpen(true)}
              >
                <Sparkles className="w-4 h-4 mr-2" />
                AI 釣人
              </Button>
              <Button
                variant="outline"
                className="h-10 rounded-xl border-white/10 bg-white/5 text-white hover:bg-white/10 font-bold"
                onClick={() => setShowOrgManager(true)}
              >
                管理機構
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:px-6 lg:px-8 py-8">
        {/* Dashboard Controls */}
        <div className="mb-8 bg-white rounded-3xl border border-slate-100 shadow-sm anim-fade-up anim-delay-1 overflow-hidden">
          {/* Row 1: always-visible controls */}
          <div className="p-6 flex flex-col md:flex-row md:items-start gap-6">
            <div className="space-y-2 flex-1">
              <Label className="text-brand-slate font-bold flex items-center gap-2">
                <Calendar className="w-4 h-4 text-brand-coral" />
                選擇日期
              </Label>
              <DatePicker value={selectedDate} onChange={setSelectedDate} />
            </div>

            <div className="space-y-2 flex-1">
              <Label className="text-brand-slate font-bold flex items-center gap-2">
                <Clock className="w-4 h-4 text-brand-teal" />
                服務緩衝時間 (分鐘)
              </Label>
              <Input
                type="number"
                value={bufferBuffer}
                onChange={(e) => setBufferBuffer(parseInt(e.target.value) || 0)}
                className="rounded-xl border-slate-200 focus:border-brand-coral focus:ring-brand-coral/20 bg-slate-50/50"
              />
            </div>

            <div className="hidden md:block h-10 w-px bg-slate-100 self-start mt-8" />

            {/* Filter Mode Toggle */}
            <div className="space-y-2">
              <Label className="text-brand-slate font-bold flex items-center gap-2">
                <Search className="w-4 h-4 text-brand-orange" />
                篩選模式
              </Label>
              <div className="flex rounded-xl overflow-hidden border border-slate-200">
                <button
                  onClick={() => switchFilterMode("manual")}
                  className={cn(
                    "px-4 py-2 text-xs font-bold transition-all",
                    filterMode === "manual"
                      ? "bg-brand-orange text-white"
                      : "bg-white text-slate-500 hover:bg-slate-50",
                  )}
                >
                  時段篩選
                </button>
                <button
                  onClick={() => switchFilterMode("service")}
                  className={cn(
                    "px-4 py-2 text-xs font-bold transition-all",
                    filterMode === "service"
                      ? "bg-brand-orange text-white"
                      : "bg-white text-slate-500 hover:bg-slate-50",
                  )}
                >
                  空檔查找
                </button>
              </div>
            </div>

            <div className="hidden md:block h-10 w-px bg-slate-100 self-start mt-8" />

            {/* Summary panel */}
            <div className="flex-none space-y-3">
              <div>
                {filterMode === "manual" &&
                  (filterStartTime || filterEndTime) && (
                    <button
                      onClick={() => {
                        setFilterStartTime("");
                        setFilterEndTime("");
                      }}
                      className="mt-2 w-full text-[10px] bg-white text-brand-coral border border-brand-coral/20 py-1 rounded-lg font-bold hover:bg-brand-coral hover:text-white transition-all shadow-sm"
                    >
                      清除時段篩選
                    </button>
                  )}
                {filterMode === "service" &&
                  (selectedDuration || servicePeriodStart) && (
                    <>
                      <p className="text-xs text-brand-orange mt-1">
                        {viewMode === "week" && weekRuleMode === "rules"
                          ? `多條件規則 ${advancedWeekRules.length} 組`
                          : [
                              selectedDuration ? `${selectedDuration}分鐘空檔` : "",
                              servicePeriodStart && servicePeriodEnd
                                ? `${servicePeriodStart}~${servicePeriodEnd}`
                                : "",
                              viewMode === "week" && minMatchingDays
                                ? `至少${minMatchingDays}天`
                                : "",
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                      </p>
                      <button
                        onClick={clearServiceFilter}
                        className="mt-2 w-full text-[10px] bg-white text-brand-coral border border-brand-coral/20 py-1 rounded-lg font-bold hover:bg-brand-coral hover:text-white transition-all shadow-sm"
                      >
                        清除空檔查找
                      </button>
                    </>
                  )}
              </div>
              {orgs.length > 1 && (
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    機構篩選
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {orgs.map((org, idx) => {
                      const isActive =
                        selectedOrgIds.size === 0 || selectedOrgIds.has(org.id);
                      const color = ORG_COLORS[idx % ORG_COLORS.length];
                      return (
                        <button
                          key={org.id}
                          onClick={() => toggleOrg(org.id)}
                          className={cn(
                            "px-2.5 py-1 rounded-full text-xs font-bold transition-all border",
                            isActive
                              ? `${color.bg} ${color.text} border-transparent`
                              : "bg-white text-slate-400 border-slate-200",
                          )}
                        >
                          {org.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Row 2: filter controls (conditional) */}
          {filterMode === "manual" && (
            <div className="px-6 pb-6 pt-5 border-t border-slate-100 flex flex-col md:flex-row md:items-end gap-6">
              <div className="space-y-2 flex-1">
                <Label className="text-brand-orange font-bold flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  時段篩選 (開始)
                </Label>
                <TimePicker
                  value={filterStartTime}
                  onChange={setFilterStartTime}
                  placeholder="開始時間"
                />
              </div>
              <div className="space-y-2 flex-1">
                <Label className="text-brand-orange font-bold flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  時段篩選 (結束)
                </Label>
                <TimePicker
                  value={filterEndTime}
                  onChange={setFilterEndTime}
                  placeholder="結束時間"
                />
              </div>
            </div>
          )}

          {filterMode === "service" && (
            <div className="px-6 pb-6 pt-5 border-t border-slate-100 flex flex-col md:flex-row md:items-end gap-6 bg-slate-50/40">
              <div className="w-full space-y-5">
                {viewMode === "week" && (
                  <div className="flex items-center gap-2 rounded-2xl bg-white p-1 border border-slate-200 w-fit">
                    <button
                      onClick={() => setWeekRuleMode("count")}
                      className={cn(
                        "px-4 py-2 text-xs font-bold rounded-xl transition-all",
                        weekRuleMode === "count"
                          ? "bg-brand-orange text-white"
                          : "text-slate-500 hover:bg-slate-50",
                      )}
                    >
                      至少 N 天
                    </button>
                    <button
                      onClick={() => {
                        setWeekRuleMode("rules");
                        if (advancedWeekRules.length === 0) {
                          setAdvancedWeekRules([createAdvancedWeekRule()]);
                        }
                      }}
                      className={cn(
                        "px-4 py-2 text-xs font-bold rounded-xl transition-all",
                        weekRuleMode === "rules"
                          ? "bg-brand-orange text-white"
                          : "text-slate-500 hover:bg-slate-50",
                      )}
                    >
                      多條件規則
                    </button>
                  </div>
                )}

                {viewMode === "week" && weekRuleMode === "rules" ? (
                  <div className="space-y-4">
                    {advancedWeekRules.map((rule, index) => (
                      <div
                        key={rule.id}
                        className="bg-white rounded-2xl border border-slate-200 p-4 space-y-4 shadow-sm"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-bold text-brand-slate">
                              規則 {index + 1}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              指定星期都要符合才算通過
                            </p>
                          </div>
                          {advancedWeekRules.length > 1 && (
                            <button
                              onClick={() => removeAdvancedWeekRule(rule.id)}
                              className="text-xs font-bold text-slate-400 hover:text-brand-coral"
                            >
                              刪除規則
                            </button>
                          )}
                        </div>

                        <div className="space-y-2">
                          <Label className="text-brand-orange font-bold flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            星期
                          </Label>
                          <div className="flex flex-wrap gap-3 pt-1">
                            {WEEKDAY_OPTIONS.map((option) => {
                              const isActive = rule.weekdays.includes(option.value);
                              return (
                                <button
                                  key={option.value}
                                  onClick={() =>
                                    toggleAdvancedWeekRuleDay(rule.id, option.value)
                                  }
                                  className={cn(
                                    "min-w-[72px] px-5 py-3 rounded-2xl text-base font-semibold border shadow-sm transition-all",
                                    isActive
                                      ? "bg-brand-orange text-white border-brand-orange shadow-brand-orange/15"
                                      : "bg-white text-slate-500 border-slate-200 hover:border-brand-orange/40 hover:bg-brand-lavender/20",
                                  )}
                                >
                                  週{option.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div className="space-y-2">
                            <Label className="text-brand-orange font-bold flex items-center gap-2">
                              <List className="w-4 h-4" />
                              空檔分鐘數
                            </Label>
                            <Input
                              type="number"
                              min="1"
                              value={rule.duration ?? ""}
                              onChange={(e) =>
                                updateAdvancedWeekRule(rule.id, {
                                  duration:
                                    e.target.value === ""
                                      ? null
                                      : parseInt(e.target.value, 10) || null,
                                })
                              }
                              placeholder="例如 60"
                              className="rounded-xl border-slate-200 focus:border-brand-coral focus:ring-brand-coral/20 bg-white"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-brand-orange font-bold flex items-center gap-2">
                              <Clock className="w-4 h-4" />
                              時段 (開始)
                            </Label>
                            <TimePicker
                              value={rule.startTime}
                              onChange={(value) =>
                                updateAdvancedWeekRule(rule.id, { startTime: value })
                              }
                              placeholder="開始時間"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-brand-orange font-bold flex items-center gap-2">
                              <Clock className="w-4 h-4" />
                              時段 (結束)
                            </Label>
                            <TimePicker
                              value={rule.endTime}
                              onChange={(value) =>
                                updateAdvancedWeekRule(rule.id, { endTime: value })
                              }
                              placeholder="結束時間"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-brand-orange font-bold flex items-center gap-2">
                              <Users className="w-4 h-4" />
                              篩選範圍
                            </Label>
                            <button
                              onClick={() =>
                                updateAdvancedWeekRule(rule.id, {
                                  includePotential: !rule.includePotential,
                                })
                              }
                              className={cn(
                                "w-full rounded-xl border px-3 py-2.5 text-sm font-bold transition-all",
                                rule.includePotential
                                  ? "bg-amber-50 text-amber-700 border-amber-200"
                                  : "bg-white text-slate-600 border-slate-200",
                              )}
                            >
                              {rule.includePotential ? "包含可調整" : "只看直接可排"}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}

                    <button
                      onClick={addAdvancedWeekRule}
                      className="text-sm font-bold text-brand-orange hover:text-brand-coral"
                    >
                      + 新增一條規則
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col md:flex-row md:items-end gap-6">
                    <div className="space-y-2 flex-1 min-w-[180px]">
                      <Label className="text-brand-orange font-bold flex items-center gap-2">
                        <List className="w-4 h-4" />
                        空檔分鐘數
                      </Label>
                      <Input
                        type="number"
                        min="1"
                        value={selectedDuration ?? ""}
                        onChange={(e) =>
                          setSelectedDuration(
                            e.target.value === ""
                              ? null
                              : parseInt(e.target.value, 10) || null,
                          )
                        }
                        placeholder="例如 30"
                        className="rounded-xl border-slate-200 focus:border-brand-coral focus:ring-brand-coral/20 bg-white"
                      />
                    </div>

                    <div className="space-y-2 flex-1">
                      <Label className="text-brand-orange font-bold flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        時段 (開始)
                      </Label>
                      <TimePicker
                        value={servicePeriodStart}
                        onChange={setServicePeriodStart}
                        placeholder="開始時間"
                      />
                    </div>
                    <div className="space-y-2 flex-1">
                      <Label className="text-brand-orange font-bold flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        時段 (結束)
                      </Label>
                      <TimePicker
                        value={servicePeriodEnd}
                        onChange={setServicePeriodEnd}
                        placeholder="結束時間"
                      />
                    </div>
                    {viewMode === "week" && (
                      <div className="space-y-2 flex-1 min-w-[180px]">
                        <Label className="text-brand-orange font-bold flex items-center gap-2">
                          <Calendar className="w-4 h-4" />
                          至少符合幾天
                        </Label>
                        <Input
                          type="number"
                          min="1"
                          max="7"
                          value={minMatchingDays ?? ""}
                          onChange={(e) =>
                            setMinMatchingDays(
                              e.target.value === ""
                                ? null
                                : Math.min(
                                    7,
                                    Math.max(1, parseInt(e.target.value, 10) || 1),
                                  ),
                            )
                          }
                          placeholder="例如 5"
                          className="rounded-xl border-slate-200 focus:border-brand-coral focus:ring-brand-coral/20 bg-white"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Scenario A: Filter Applied */}
        {activeFilterResult && viewMode !== "week" ? (
          <div className="space-y-8 anim-fade-up anim-delay-2">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <Search className="w-5 h-5 text-brand-coral" />
                {filterMode === "service" ? (
                  <>
                    空檔查找結果{" "}
                    <span className="bg-brand-lavender text-brand-slate px-2 py-0.5 rounded text-sm">
                      {selectedDuration}分鐘 · {servicePeriodStart}~{servicePeriodEnd}
                    </span>
                  </>
                ) : (
                  <>
                    時段篩選結果{" "}
                    <span className="bg-brand-lavender text-brand-slate px-2 py-0.5 rounded text-sm">
                      {filterStartTime}~{filterEndTime}
                    </span>
                  </>
                )}
              </h2>
            </div>

            {activeFilterResult.available.length === 0 &&
            activeFilterResult.potential.length === 0 &&
            activeFilterResult.offDuty.length === 0 ? (
              <div className="bg-white rounded-xl shadow-sm border p-12 text-center text-slate-500">
                沒有人員在此時段有空檔或可彈性調整的案件。
              </div>
            ) : (
              <div className="space-y-6">
                {crossOrgAvailableMatches.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-brand-slate font-bold text-sm">
                      <Users className="w-4 h-4 text-brand-coral" />
                      跨機構同時空閒 ({crossOrgAvailableMatches.length})
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {crossOrgAvailableMatches.map((match) => (
                        <Card
                          key={match.normalizedName}
                          className="p-4 flex flex-col gap-3 hover:shadow-md transition-shadow border-l-4 border-l-brand-coral"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h3 className="font-bold text-slate-900 text-base">
                                {match.normalizedName}
                              </h3>
                              <p className="text-xs text-slate-400 mt-1">
                                已同時符合 {match.orgEntries.length} 間機構
                              </p>
                            </div>
                            <Badge variant="secondary">跨機構</Badge>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {match.orgEntries.map((entry) => (
                              <span
                                key={entry.orgId}
                                className="text-[11px] bg-brand-lavender text-brand-slate px-2 py-0.5 rounded-full font-medium"
                              >
                                {entry.orgName}
                              </span>
                            ))}
                          </div>
                          <div className="text-[11px] text-slate-500 bg-slate-50 p-2 rounded-lg space-y-2">
                            {match.orgEntries.map((entry) => (
                              <div
                                key={`${entry.orgId}-${entry.originalName}`}
                                className="space-y-1.5"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <span className="font-bold text-slate-600">
                                    {entry.orgName}
                                  </span>
                                  <span className="text-slate-500">
                                    {entry.originalName}
                                  </span>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {entry.matching.length > 0 ? (
                                    entry.matching.map((slot, slotIndex) => (
                                      <span
                                        key={`${entry.orgId}-${slotIndex}`}
                                        className="bg-white border border-slate-200 px-1.5 py-0.5 rounded shadow-sm text-[10px]"
                                      >
                                        {format(slot.start, "HH:mm")}-
                                        {format(slot.end, "HH:mm")}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-[10px] text-slate-400">
                                      無符合篩選的空檔
                                    </span>
                                  )}
                                </div>
                                {entry.hidden.length > 0 && (
                                  <details className="text-[10px] text-slate-500">
                                    <summary className="cursor-pointer select-none text-slate-400 hover:text-slate-600">
                                      展開其他剩餘空檔 ({entry.hidden.length})
                                    </summary>
                                    <div className="flex flex-wrap gap-1 mt-1.5">
                                      {entry.hidden.map((slot, slotIndex) => (
                                        <span
                                          key={`${entry.orgId}-hidden-${slotIndex}`}
                                          className="bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-[10px]"
                                        >
                                          {format(slot.start, "HH:mm")}-
                                          {format(slot.end, "HH:mm")}
                                        </span>
                                      ))}
                                    </div>
                                  </details>
                                )}
                              </div>
                            ))}
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {/* 1. Fully Available */}
                {activeFilterResult.available.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-emerald-600 font-bold text-sm">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                      完全空閒 ({activeFilterResult.available.length})
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {activeFilterResult.available.map((item, idx) => {
                        const visibleFreeSlots = splitFreeIntervalsByFilter({
                          freeIntervals: item.free || [],
                          filterMode,
                          selectedDate,
                          filterStartTime,
                          filterEndTime,
                          servicePeriodStart,
                          servicePeriodEnd,
                          selectedDuration,
                        });

                        return (
                        <Card
                          key={idx}
                          className="p-4 flex flex-col gap-3 hover:shadow-md transition-shadow border-l-4 border-l-emerald-500"
                        >
                          <div className="flex items-start justify-between">
                            <h3 className="font-bold text-slate-900 text-base flex items-center gap-1">
                              <OrgDot staff={item.staff} orgs={orgs} />
                              {item.staff.name}
                            </h3>
                            <Badge variant="success">可用</Badge>
                          </div>
                          <div className="text-[11px] text-slate-500 bg-slate-50 p-2 rounded-lg">
                            <span className="block font-bold mb-1">
                              今日剩餘空檔:
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {visibleFreeSlots.matching.length > 0 ? (
                                visibleFreeSlots.matching.map((f, i) => (
                                <span
                                  key={i}
                                  className="bg-white border border-slate-200 px-1.5 py-0.5 rounded shadow-sm"
                                >
                                  {format(f.start, "HH:mm")}-
                                  {format(f.end, "HH:mm")}
                                </span>
                                ))
                              ) : (
                                <span className="text-[10px] text-slate-400">
                                  無符合篩選的空檔
                                </span>
                              )}
                            </div>
                            {visibleFreeSlots.hidden.length > 0 && (
                              <details className="mt-2 text-[10px] text-slate-500">
                                <summary className="cursor-pointer select-none text-slate-400 hover:text-slate-600">
                                  展開其他剩餘空檔 ({visibleFreeSlots.hidden.length})
                                </summary>
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  {visibleFreeSlots.hidden.map((f, i) => (
                                    <span
                                      key={`hidden-${i}`}
                                      className="bg-white border border-slate-200 px-1.5 py-0.5 rounded shadow-sm"
                                    >
                                      {format(f.start, "HH:mm")}-
                                      {format(f.end, "HH:mm")}
                                    </span>
                                  ))}
                                </div>
                              </details>
                            )}
                          </div>
                        </Card>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 2. Potential Matches (Flexible) */}
                {activeFilterResult.potential.length > 0 && (
                  <div className="space-y-3 pt-4 border-t border-slate-100">
                    <div className="flex items-center gap-2 text-brand-orange font-bold text-sm">
                      <Clock className="w-4 h-4" />
                      可彈性調整人力 ({activeFilterResult.potential.length})
                      <span className="font-normal text-slate-400 text-xs">
                        (案主標記為可提早或延後)
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {activeFilterResult.potential.map((item, idx) => (
                        <Card
                          key={idx}
                          className="p-4 flex flex-col gap-3 hover:shadow-md transition-shadow border-l-4 border-l-brand-orange relative overflow-hidden"
                        >
                          <div className="absolute top-0 right-0 p-1">
                            <div className="bg-brand-orange/10 text-brand-orange p-1 rounded-bl-lg">
                              <Clock className="w-3 h-3" />
                            </div>
                          </div>
                          <div className="flex items-start justify-between">
                            <h3 className="font-bold text-slate-900 text-base flex items-center gap-1">
                              <OrgDot staff={item.staff} orgs={orgs} />
                              {item.staff.name}
                            </h3>
                          </div>
                          <div className="space-y-1.5">
                            {item.flexContexts.map((ctx, i) => (
                              <div
                                key={i}
                                className="text-[11px] bg-brand-orange/5 border border-brand-orange/10 p-2 rounded-lg text-brand-slate"
                              >
                                <p className="font-bold mb-1">
                                  案主: {ctx.caseName}
                                </p>
                                <div className="flex items-center justify-between text-[10px] opacity-80">
                                  <span>
                                    設定: 早{ctx.early}m / 晚{ctx.late}m
                                  </span>
                                  <span className="text-brand-orange font-bold font-mono">
                                    {ctx.canMoveEarly
                                      ? "提早OK"
                                      : ctx.canMoveLate
                                        ? "延後OK"
                                        : ""}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
                {/* 3. Off-duty Staff */}
                {activeFilterResult.offDuty.length > 0 && (
                  <div className="space-y-3 pt-4 border-t border-slate-100">
                    <div className="flex items-center gap-2 text-slate-400 font-bold text-sm">
                      <div className="w-2 h-2 rounded-full bg-slate-300"></div>
                      休假 / 例假人員 ({activeFilterResult.offDuty.length})
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {activeFilterResult.offDuty.map((item, idx) => (
                        <Card
                          key={idx}
                          className={cn(
                            "p-4 flex items-center justify-between border-l-4",
                            item.dayType === "例"
                              ? "border-l-slate-300"
                              : "border-l-sky-300",
                          )}
                        >
                          <span className="font-bold text-slate-500 text-sm flex items-center gap-1">
                            <OrgDot staff={item.staff} orgs={orgs} />
                            {item.staff.name}
                          </span>
                          <span
                            className={cn(
                              "px-2.5 py-0.5 rounded-full text-xs font-bold",
                              item.dayType === "例"
                                ? "bg-slate-100 text-slate-400"
                                : "bg-sky-50 text-sky-400",
                            )}
                          >
                            {item.dayType === "例" ? "例假" : "休假"}
                          </span>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : viewMode === "stats" ? (
          <StatsView
            statsData={statsData}
            dataDateRange={dataDateRange}
            orgs={orgs}
            cardComponent={Card}
            inputComponent={Input}
            orgDotComponent={OrgDot}
            cn={cn}
          />
        ) : viewMode === "cases" ? (
          <CaseScheduleView
            caseScheduleData={caseScheduleData}
            caseScheduleLoading={caseScheduleLoading}
            caseScheduleError={caseScheduleError}
            caseSettings={caseSettings}
            setCaseSettings={setCaseSettings}
            onUpload={handleCaseScheduleUpload}
            fileName={caseScheduleFileName}
            cardComponent={Card}
            badgeComponent={Badge}
            inputComponent={Input}
            labelComponent={Label}
          />
        ) : viewMode === "week" ? (
          /* Scenario C: Week View (with or without filter) */
          filterMode === "service" && weekRuleMode === "rules" ? (
            <WeeklyMultiRuleFilterView
              matches={sortedMultiRuleWeeklyResult?.matches || []}
              offDutyMatches={sortedMultiRuleWeeklyResult?.offDutyMatches || []}
              rules={normalizedAdvancedWeekRules}
              selectedDate={selectedDate}
              cn={cn}
            />
          ) : aggregatedServiceWeekMatches ? (
            <WeeklyAggregateFilterView
              aggregatedMatches={aggregatedServiceWeekMatches}
              selectedDate={selectedDate}
              selectedDuration={selectedDuration}
              servicePeriodStart={servicePeriodStart}
              servicePeriodEnd={servicePeriodEnd}
              minMatchingDays={minMatchingDays}
              cn={cn}
            />
          ) : activeWeeklyFilterResult ? (
            <WeeklyFilterView
              weeklyFilterData={activeWeeklyFilterResult}
              selectedDate={selectedDate}
              filterStartTime={filterStartTime}
              filterEndTime={filterEndTime}
              filterMode={filterMode}
              selectedDuration={selectedDuration}
              servicePeriodStart={servicePeriodStart}
              servicePeriodEnd={servicePeriodEnd}
              cn={cn}
            />
          ) : (
            <WeeklyView
              weeklyData={processedWeeklyAvailability}
              selectedDate={selectedDate}
              startHour={START_OF_DAY}
              endHour={END_OF_DAY}
              orgs={orgs}
              cardComponent={Card}
              orgDotComponent={OrgDot}
              cn={cn}
            />
          )
        ) : (
          /* Scenario B: Visualization Timeline */
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">
                  全體人員日行程表 (06:00 - 22:00)
                </h2>
                {dataDateRange && (
                  <p className="text-xs text-slate-500 mt-1">
                    檔案資料區間:{" "}
                    <span className="font-medium text-blue-600">
                      {dataDateRange}
                    </span>
                  </p>
                )}
              </div>
              <div className="flex items-center gap-4 text-xs font-medium text-slate-600">
                <div className="flex items-center gap-1">
                  <span className="w-3 h-3 bg-brand-coral rounded-sm shadow-sm"></span>{" "}
                  服務中 (忙碌)
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-3 h-3 bg-brand-coral/10 border border-brand-coral/20 rounded-sm"></span>{" "}
                  緩衝時間
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-3 h-3 bg-white border border-slate-200 rounded-sm"></span>{" "}
                  空閒
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              {/* Header Row */}
              <div className="grid grid-cols-[150px_1fr] border-b bg-slate-50 divide-x">
                <div className="p-3 text-sm font-semibold text-slate-700 pl-6">
                  姓名
                </div>
                <div className="relative h-10">
                  {/* Time Makers */}
                  {Array.from({ length: END_OF_DAY - START_OF_DAY + 1 }).map(
                    (_, i) => {
                      const hour = START_OF_DAY + i;
                      return (
                        <div
                          key={hour}
                          className="absolute top-0 bottom-0 border-l border-slate-200 text-[10px] text-slate-400 pl-1 pt-2"
                          style={{
                            left: `${(i / (END_OF_DAY - START_OF_DAY)) * 100}%`,
                          }}
                        >
                          {hour}:00
                        </div>
                      );
                    },
                  )}
                </div>
              </div>

              {/* Staff Rows */}
              <div className="divide-y max-h-[70vh] overflow-y-auto">
                {processedAvailability.map((item, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-[150px_1fr] divide-x hover:bg-slate-50 transition-colors group"
                  >
                    <div className="p-3 pl-6 flex flex-col justify-center">
                      <span className="font-medium text-sm text-slate-900 flex items-center gap-1">
                        <OrgDot staff={item.staff} orgs={orgs} />
                        {item.staff.name}
                      </span>
                      {item.isOff && (
                        <span
                          className={cn(
                            "text-[10px] font-bold mt-0.5",
                            item.dayType === "例"
                              ? "text-slate-400"
                              : "text-sky-400",
                          )}
                        >
                          {item.dayType === "例" ? "例假" : "休假"}
                        </span>
                      )}
                    </div>
                    <div
                      className={cn(
                        "relative h-14",
                        item.isOff ? "bg-slate-100" : "bg-slate-100/50",
                      )}
                    >
                      {item.isOff && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <span
                            className={cn(
                              "text-sm font-bold tracking-widest",
                              item.dayType === "例"
                                ? "text-slate-300"
                                : "text-sky-300",
                            )}
                          >
                            {item.dayType === "例" ? "例假日" : "休假日"}
                          </span>
                        </div>
                      )}
                      {item.busyRaw && item.busyRaw.length > 0 && (
                        <TimelineBar
                          startTime={START_OF_DAY}
                          endTime={END_OF_DAY}
                          blocked={item.blocked}
                          rawBusy={item.busyRaw}
                          date={selectedDate}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      <AgentSidebar
        open={isAgentOpen}
        onClose={() => setIsAgentOpen(false)}
        width={agentSidebarWidth}
        onWidthChange={setAgentSidebarWidth}
        onClearMessages={clearAgentMessages}
        messages={agentMessages}
        inputValue={agentInput}
        onInputChange={setAgentInput}
        onSubmit={handleAgentSubmit}
        loading={agentLoading}
      />
    </div>
  );
}

export default App;
