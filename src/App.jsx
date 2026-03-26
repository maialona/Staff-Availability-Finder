import React, { useState, useMemo, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import {
  format,
  addMinutes,
  subMinutes,
  areIntervalsOverlapping,
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
  Copy,
  Check,
} from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import { calculateDailyAvailability } from "./utils/availability";
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
  const minutes = ["00", "15", "30", "45"];
  const [selH, selM] = value ? value.split(":") : [null, null];
  const hourRef = useRef(null);

  useEffect(() => {
    if (open && hourRef.current && selH) {
      const el = hourRef.current.querySelector(`[data-hour="${selH}"]`);
      if (el) el.scrollIntoView({ block: "center" });
    }
  }, [open, selH]);

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
              className="h-52 w-16 overflow-y-auto scrollbar-none flex flex-col gap-0.5 pr-1"
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
            <div className="flex flex-col gap-0.5 w-16">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center mb-1">
                分
              </p>
              {minutes.map((m) => (
                <button
                  key={m}
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

function parseCaseScheduleWorkbook(workbook) {
  const clients = [];
  workbook.SheetNames.forEach((sheetName) => {
    const clientName = sheetName
      .trim()
      .replace(/\s*[（(].*?[)）]\s*$/, "")
      .trim();
    if (!clientName) return;

    const ws = workbook.Sheets[sheetName];
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1 });

    // Detect monthly grid format (first row has 周日/周一/週一 etc.)
    const firstRow = aoa[0] || [];
    const isGrid = firstRow.some(
      (c) =>
        typeof c === "string" &&
        ["周日", "周一", "周二", "週日", "週一", "週二", "Sun", "Mon"].some(
          (k) => c.includes(k),
        ),
    );

    let records = [];

    if (isGrid) {
      // Monthly grid: each cell may contain "day\nHH:MM~HH:MM  staffName\n..."
      aoa.forEach((row) => {
        (row || []).forEach((cell) => {
          if (typeof cell !== "string") return;
          const timeRegex = /(\d{1,2}:\d{2})\s*[~～-]\s*(\d{1,2}:\d{2})/g;
          let m;
          while ((m = timeRegex.exec(cell)) !== null) {
            const afterTime = cell.slice(m.index + m[0].length);
            const sameLine = afterTime.split("\n")[0];
            const chineseWords = sameLine.match(/[\u4e00-\u9fa5]+/g);
            const staffName = chineseWords
              ? chineseWords[chineseWords.length - 1]
              : "";
            records.push({
              服務日期: "",
              服務人員: staffName,
              服務時間: `${m[1]}~${m[2]}`,
            });
          }
        });
      });
    } else {
      // Tabular format: find header row
      const keywords = [
        "服務日期",
        "日期",
        "服務人員",
        "服務員",
        "服務時間",
        "時間",
      ];
      let headerIdx = 0,
        bestScore = 0;
      aoa.slice(0, 10).forEach((row, i) => {
        const score = (row || []).filter(
          (c) => typeof c === "string" && keywords.some((k) => c.includes(k)),
        ).length;
        if (score > bestScore) {
          bestScore = score;
          headerIdx = i;
        }
      });

      const rows = XLSX.utils.sheet_to_json(ws, { range: headerIdx });
      const normalized = rows.map((row) => {
        const n = {};
        Object.keys(row).forEach((k) => {
          n[k.trim()] = row[k];
        });
        return n;
      });

      if (normalized.length) {
        const firstKeys = Object.keys(normalized[0]);
        const findKey = (kws) =>
          firstKeys.find((k) => kws.some((kw) => k.includes(kw)));
        const dateKey = findKey(["服務日期", "日期", "Date"]);
        const staffKey = findKey(["服務人員", "居服員", "照服員", "服務員"]);
        const timeKey = findKey(["服務時間", "起迄", "時間"]);
        records = normalized
          .map((row) => ({
            服務日期: dateKey ? row[dateKey] : "",
            服務人員: staffKey ? row[staffKey] : "",
            服務時間: timeKey ? row[timeKey] : "",
          }))
          .filter((r) => r["服務日期"] || r["服務時間"]);
      }
    }

    clients.push({ clientName, sheetName, records });
  });
  return clients;
}

// Shared filter logic used by both single-day and weekly filter
function applyTimeFilter(
  dayAvailability,
  dateStr,
  filterStartTime,
  filterEndTime,
  bufferBuffer,
  caseSettings,
) {
  const filterStart = new Date(dateStr);
  const [sh, sm] = filterStartTime.split(":").map(Number);
  filterStart.setHours(sh, sm, 0, 0);

  const filterEnd = new Date(dateStr);
  const [eh, em] = filterEndTime.split(":").map(Number);
  filterEnd.setHours(eh, em, 0, 0);

  if (!isValid(filterStart) || !isValid(filterEnd))
    return { available: [], potential: [], offDuty: [] };

  const reqInterval = { start: filterStart, end: filterEnd };
  const reqIntervalWithBuffer = {
    start: subMinutes(filterStart, bufferBuffer),
    end: addMinutes(filterEnd, bufferBuffer),
  };

  const available = [],
    potential = [],
    offDuty = [];

  dayAvailability.forEach((p) => {
    if (p.isOff) {
      offDuty.push(p);
      return;
    }

    const isFree = p.free.some(
      (f) =>
        areIntervalsOverlapping(f, reqInterval) &&
        f.start <= reqInterval.start &&
        f.end >= reqInterval.end,
    );
    if (isFree) {
      available.push(p);
      return;
    }

    const overlapping = p.busyRaw.filter((b) =>
      areIntervalsOverlapping(b, reqIntervalWithBuffer),
    );
    if (overlapping.length === 0) {
      available.push(p);
      return;
    }

    let allFlex = true;
    const flexContexts = [];
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
        reqIntervalWithBuffer.start.getTime();
      const canMoveLate =
        busy.start.getTime() + settings.late * 60000 >=
        reqIntervalWithBuffer.end.getTime();
      if (canMoveEarly || canMoveLate) {
        flexContexts.push({
          caseName: busy.caseName,
          early: settings.early,
          late: settings.late,
          canMoveEarly,
          canMoveLate,
        });
      } else {
        allFlex = false;
        break;
      }
    }
    if (allFlex && overlapping.length > 0)
      potential.push({ ...p, flexContexts });
  });

  return { available, potential, offDuty };
}

function App() {
  // Multi-org state
  const [orgs, setOrgs] = useState([]); // [{ id, name, staffData, scheduleData, fileName, dateRange }]
  const [pendingOrgName, setPendingOrgName] = useState("");
  const [showOrgManager, setShowOrgManager] = useState(false);
  const [selectedOrgIds, setSelectedOrgIds] = useState(new Set());

  // Derived: step
  const step = orgs.length === 0 || showOrgManager ? "upload" : "dashboard";

  // Derived: merged staff (with org metadata)
  const allStaffData = useMemo(
    () =>
      orgs.flatMap((o, idx) =>
        o.staffData.map((s) => ({
          ...s,
          id: `${o.id}__${s.id}`,
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
    const ranges = orgs.map((o) => o.dateRange).filter(Boolean);
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
    const orgStaffNames = new Set(
      allStaffData
        .filter((s) => selectedOrgIds.has(s.orgId))
        .map((s) => s.name),
    );
    return allScheduleData.filter((r) => orgStaffNames.has(r["服務人員"]));
  }, [allScheduleData, allStaffData, selectedOrgIds]);

  const toggleOrg = (orgId) => {
    setSelectedOrgIds((prev) => {
      const next = new Set(prev);
      if (next.has(orgId)) {
        next.delete(orgId);
      } else {
        next.add(orgId);
      }
      // If all selected or none selected, reset to "all"
      if (next.size === orgs.length) return new Set();
      return next;
    });
  };

  const [viewMode, setViewMode] = useState("day"); // 'day' | 'week'
  const [selectedDate, setSelectedDate] = useState(
    format(new Date(), "yyyy-MM-dd"),
  );
  const [bufferBuffer, setBufferBuffer] = useState(15);
  const [filterStartTime, setFilterStartTime] = useState("");
  const [filterEndTime, setFilterEndTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [caseSettings, setCaseSettings] = useState(() => {
    const saved = localStorage.getItem("stafffind_case_flexibility");
    return saved ? JSON.parse(saved) : {};
  });

  const [caseScheduleData, setCaseScheduleData] = useState([]);
  const [caseScheduleLoading, setCaseScheduleLoading] = useState(false);
  const [caseScheduleError, setCaseScheduleError] = useState(null);
  const [caseScheduleFileName, setCaseScheduleFileName] = useState("");

  // Persist case settings
  React.useEffect(() => {
    localStorage.setItem(
      "stafffind_case_flexibility",
      JSON.stringify(caseSettings),
    );
  }, [caseSettings]);

  // Constants
  const START_OF_DAY = 6; // 06:00
  const END_OF_DAY = 22; // 22:00

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    setError(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const workbook = XLSX.read(bstr, { type: "array", cellDates: true });

        // Parse Sheet 1: Service Records
        const sheet1Name = workbook.SheetNames[0];
        const sheet1 = workbook.Sheets[sheet1Name];

        // --- Monthly Grid Detection Logic ---
        const isMonthlyGrid = workbook.SheetNames.some((name) =>
          /^[A-Z]\d{3}/.test(name.trim()),
        );
        let rawSchedule = [];
        let rawStaff = [];
        let headerIndex = 0;

        if (isMonthlyGrid) {
          console.log("Detected Monthly Grid format. Parsing all sheets...");

          // Try to extract year and month from filename
          const yearMonthMatch = file.name.match(/(\d{4})[.\-_](\d{1,2})/);
          const baseYear = yearMonthMatch
            ? parseInt(yearMonthMatch[1])
            : new Date().getFullYear();
          const baseMonth = yearMonthMatch
            ? parseInt(yearMonthMatch[2]) - 1
            : new Date().getMonth();

          const gridSchedule = [];
          const gridStaff = [];

          workbook.SheetNames.forEach((sName) => {
            const sNameTrimmed = sName.trim();
            // Match pattern like "C028張瓊文"
            const nameMatch = sNameTrimmed.match(/^[A-Z]\d{3}(.+)$/);
            if (!nameMatch) return;

            const staffName = nameMatch[1].trim();
            const staffId = sNameTrimmed.substring(0, 4);
            gridStaff.push({ id: staffId, name: staffName });

            const ws = workbook.Sheets[sName];
            const aoa = XLSX.utils.sheet_to_json(ws, { header: 1 });

            aoa.forEach((row) => {
              if (!Array.isArray(row)) return;
              row.forEach((cell) => {
                if (typeof cell !== "string") return;

                // Extract day from cell (usually at the start)
                const dayMatch = cell.match(/^\s*(\d{1,2})/);
                if (!dayMatch) return;

                const day = parseInt(dayMatch[1]);
                const dateObj = new Date(baseYear, baseMonth, day);
                if (!isValid(dateObj)) return;
                const dateStr = format(dateObj, "yyyy-MM-dd");

                // Extract transit time: (X小時/Y) pattern
                const transitMatch = cell.match(/\([\d.]+小時\/([\d.]+)\)/);
                if (transitMatch) {
                  gridSchedule.push({
                    服務日期: dateStr,
                    服務時間: "_transit",
                    服務人員: staffName,
                    _transitHours: parseFloat(transitMatch[1]),
                    _isGrid: true,
                  });
                }

                // Detect national holidays in the first line of cell
                const firstLine = cell.split("\n")[0];
                const nationalHolidayKeywords = [
                  "春節", "除夕", "小年夜", "228紀念日", "228", "二二八",
                  "元旦", "清明", "端午", "中秋", "國慶",
                  "勞動節", "兒童節", "國定假日",
                ];
                const isNationalHoliday = nationalHolidayKeywords.some((kw) =>
                  firstLine.includes(kw),
                );
                if (isNationalHoliday) {
                  gridSchedule.push({
                    服務日期: dateStr,
                    服務時間: "_national",
                    服務人員: staffName,
                    _isGrid: true,
                  });
                }

                // Always store 例/休 marker if present (covers both pure day-off and working on day-off)
                if (cell.includes("例")) {
                  gridSchedule.push({
                    服務日期: dateStr,
                    服務時間: "例",
                    服務人員: staffName,
                    _isGrid: true,
                  });
                } else if (cell.includes("休")) {
                  gridSchedule.push({
                    服務日期: dateStr,
                    服務時間: "休",
                    服務人員: staffName,
                    _isGrid: true,
                  });
                }

                // Extract all time ranges from cell
                const timeRegex = /(\d{1,2}:\d{2})\s*[~～-]\s*(\d{1,2}:\d{2})/g;
                let tMatch;
                while ((tMatch = timeRegex.exec(cell)) !== null) {
                  // Extract case name: same line after the time range, last Chinese word
                  const afterTime = cell.slice(tMatch.index + tMatch[0].length);
                  const sameLine = afterTime.split("\n")[0];
                  const chineseWords = sameLine.match(/[\u4e00-\u9fa5]+/g);
                  const caseName = chineseWords
                    ? chineseWords[chineseWords.length - 1]
                    : "";
                  gridSchedule.push({
                    服務日期: dateStr,
                    服務時間: caseName
                      ? `${tMatch[1]}~${tMatch[2]} ${caseName}`
                      : `${tMatch[1]}~${tMatch[2]}`,
                    服務人員: staffName,
                    _isGrid: true,
                  });
                }
              });
            });
          });

          rawSchedule = gridSchedule;
          rawStaff = gridStaff;
        } else {
          // --- Smart Header Detection (Records) ---
          // Scan first 10 rows to find the header row
          const aoaRecords = XLSX.utils.sheet_to_json(sheet1, { header: 1 });
          let bestMatch = -1;
          const requiredKeywords = [
            "服務日期",
            "日期",
            "Date",
            "服務人員",
            "服務員",
            "時間",
            "Time",
          ];

          for (let i = 0; i < Math.min(10, aoaRecords.length); i++) {
            const row = aoaRecords[i];
            if (!Array.isArray(row)) continue;
            const matches = row.filter(
              (cell) =>
                typeof cell === "string" &&
                requiredKeywords.some((kw) => cell.includes(kw)),
            ).length;

            if (matches > bestMatch) {
              bestMatch = matches;
              headerIndex = i;
            }
          }

          rawSchedule = XLSX.utils.sheet_to_json(sheet1, {
            range: headerIndex,
          });

          // Parse Sheet 2: Staff List
          if (workbook.SheetNames.length > 1) {
            const sheet2Name = workbook.SheetNames[1];
            const sheet2 = workbook.Sheets[sheet2Name];

            // Smart Header Detection (Staff)
            const aoaStaff = XLSX.utils.sheet_to_json(sheet2, { header: 1 });
            let sHeaderIndex = 0;
            let sBestMatch = -1;
            const sKeywords = ["姓名", "Name", "員編", "ID"];

            for (let i = 0; i < Math.min(10, aoaStaff.length); i++) {
              const row = aoaStaff[i];
              if (!Array.isArray(row)) continue;
              const matches = row.filter(
                (cell) =>
                  typeof cell === "string" &&
                  sKeywords.some((kw) => cell.includes(kw)),
              ).length;
              if (matches > sBestMatch) {
                sBestMatch = matches;
                sHeaderIndex = i;
              }
            }
            rawStaff = XLSX.utils.sheet_to_json(sheet2, {
              range: sHeaderIndex,
            });
          }
        }

        // Validate basic structure
        if (!rawSchedule || rawSchedule.length === 0) {
          throw new Error("找不到服務紀錄 (無法辨識檔案格式或資料為空)");
        }

        // Normalize keys (trim whitespace)
        const normalizeKeys = (row) => {
          const newRow = {};
          Object.keys(row).forEach((k) => {
            newRow[k.trim()] = row[k];
          });
          return newRow;
        };

        // --- Smart Column Detection ---
        const firstRow = normalizeKeys(rawSchedule[0]); // Use normalized first row for detection
        const keys = Object.keys(firstRow);

        const findKey = (keywords, exclude = []) => {
          return keys.find(
            (k) =>
              keywords.some((kw) => k.includes(kw)) &&
              !exclude.some((ex) => k.includes(ex)),
          );
        };

        // Helper to check if a value looks like a time range (e.g. "09:00-12:00")
        const isTimeRangeValue = (val) => {
          if (typeof val !== "string") return false;
          // Check for at least two time patterns
          const matches = val.match(/(\d{1,2}:\d{2})/g);
          return matches && matches.length >= 2;
        };

        const dateKey = findKey(["服務日期", "日期", "Date"]);

        // Staff Key Strategy:
        // Prioritize "Caregiver" (居服員/照服員) or "Service Person" (服務人員)
        // Avoid generic "Name" (姓名) if possible, as it often refers to the Client/Patient.
        const staffKey =
          findKey(["居服員", "照服員", "服務人員", "服務員"], ["編號", "ID"]) ||
          findKey(
            ["姓名", "Staff", "Name"],
            ["編號", "ID", "家屬", "案主", "受照顧者"],
          );

        // Smart Time Key Detection:
        // 1. Find ALL candidate keys containing '時間' or 'Time'
        // Add '排班' (Scheduled) to candidates
        const timeCandidates = keys.filter((k) =>
          ["時間", "Time", "起迄", "區間", "排班"].some((kw) => k.includes(kw)),
        );

        let timeKey = null;

        // 2. Inspect content to find the real range column
        // Check first 10 rows
        for (const candidate of timeCandidates) {
          const validRows = rawSchedule
            .slice(0, 10)
            .filter((row) => row[candidate]);
          const isRangeColumn = validRows.some((row) =>
            isTimeRangeValue(row[candidate]),
          );
          if (isRangeColumn) {
            timeKey = candidate;
            // Prefer "Range/Start" keywords if multiple valid columns found?
            // Usually only one column contains the actual range string.
            if (candidate.includes("起迄") || candidate.includes("區間")) break;
            break;
          }
        }

        // Fallback: Use previous keyword logic if data scan fails (empty file?)
        if (!timeKey) {
          timeKey =
            findKey(["起迄", "起訖", "區間", "Range", "Start"]) ||
            findKey(
              ["服務時間", "Time"],
              ["核定", "總", "數", "Total", "Count", "Duration"],
            ) ||
            findKey(["時間"], ["核定", "總", "數"]);
        }

        // Normalize entire schedule with trimmed keys
        const normalizedSchedule = rawSchedule.map((row) => normalizeKeys(row));

        // Pass 2: Value-Based Time Column Confirmation
        // Check if the detected 'timeKey' actually contains time-like strings in the normalized data
        if (timeKey) {
          const sampleRows = normalizedSchedule
            .slice(0, 50)
            .filter((r) => r[timeKey]);
          const validCount = sampleRows.filter((r) =>
            isTimeRangeValue(r[timeKey]),
          ).length;
          // If fewer than 20% of rows have valid time in this column, it's probably wrong (e.g. just text notes)
          if (validCount < sampleRows.length * 0.2 && sampleRows.length > 5) {
            console.warn(
              `Column ${timeKey} failed validation (${validCount}/${sampleRows.length}). Searching for better column...`,
            );

            // Try to find a better column by scanning ALL columns
            for (const k of keys) {
              const checkRows = normalizedSchedule
                .slice(0, 50)
                .filter((r) => r[k]);
              const checkCount = checkRows.filter((r) =>
                isTimeRangeValue(r[k]),
              ).length;
              if (checkCount > checkRows.length * 0.5) {
                // If >50% look like time ranges
                timeKey = k;
                console.log(`Switched to better column: ${timeKey}`);
                break;
              }
            }
          }
        }

        if (!dateKey || !timeKey || !staffKey) {
          const missing = [];
          if (!dateKey) missing.push("日期 (例如: 服務日期)");
          if (!timeKey) missing.push("時間 (例如: 11:20~11:30)");
          if (!staffKey) missing.push("人員 (例如: 服務人員)");

          throw new Error(`無法辨識檔案格式。
                偵測到的標題列在第 ${headerIndex + 1} 行。
                缺少必要欄位: ${missing.join("、 ")}
                請檢查 Excel 檔是否包含正確的標題列。`);
        }

        // Create Standardized Schedule with internal keys
        const formattedSchedule = normalizedSchedule.map((row) => ({
          服務日期: row[dateKey],
          服務時間: row[timeKey],
          服務人員: row[staffKey],
          ...row, // keep other data for debugging
        }));

        const scheduleToUse = formattedSchedule;

        // Calculate available date range for hint
        const dates = scheduleToUse
          .map((r) => r["服務日期"])
          .filter((d) => d)
          .map((d) => {
            try {
              if (d instanceof Date) return d;
              return new Date(d);
            } catch {
              return null;
            }
          })
          .filter((d) => isValid(d));

        let dateHint = "";
        if (dates.length > 0) {
          const minDate = new Date(Math.min(...dates));
          const maxDate = new Date(Math.max(...dates));
          dateHint = `${format(minDate, "yyyy-MM-dd")} ~ ${format(maxDate, "yyyy-MM-dd")}`;
        }

        // Process Staff List
        let uniqueStaff = [];
        let sheet2Valid = false;
        if (rawStaff.length > 0) {
          // Sheet 2 mapping (Staff List)
          const sRow = rawStaff[0];
          const sKeys = Object.keys(sRow);
          const sNameKey = sKeys.find((k) =>
            ["姓名", "Name", "服務員", "照服員"].some((kw) => k.includes(kw)),
          );
          const sIdKey = sKeys.find((k) =>
            ["員編", "ID", "編號"].some((kw) => k.includes(kw)),
          );

          if (sNameKey) {
            uniqueStaff = rawStaff
              .map((s) => ({
                id: String(s[sIdKey] || "Unknown"),
                name: String(s[sNameKey] || "Unknown Name").trim(),
              }))
              .filter(
                (s) =>
                  s.name !== "Unknown Name" &&
                  s.name !== "null" &&
                  s.name !== "",
              );

            if (uniqueStaff.length > 0) sheet2Valid = true;
          }
        }

        if (!sheet2Valid) {
          console.log(
            "Sheet 2 is invalid or missing staff columns. Falling back to Sheet 1 unique names.",
          );
          const names = new Set(
            scheduleToUse.map((row) => row["服務人員"]).filter(Boolean),
          );
          uniqueStaff = Array.from(names).map((name, idx) => ({
            id: `GEN-${idx}`,
            name: String(name).trim(),
          }));
        }

        const newOrg = {
          id: Date.now().toString(),
          name:
            pendingOrgName.trim() ||
            `機構${String.fromCharCode(65 + orgs.length)}`,
          staffData: uniqueStaff,
          scheduleData: scheduleToUse,
          fileName: file.name,
          dateRange: dateHint,
        };
        setOrgs((prev) => [...prev, newOrg]);
        setPendingOrgName("");

        // --- Auto-populate Case Registry ---
        const discoveredCases = new Set();
        scheduleToUse.forEach((row) => {
          const timeVal = row["服務時間"];
          if (typeof timeVal === "string") {
            // Regex to find text AFTER the time range HH:MM~HH:MM
            const caseMatch = timeVal.match(
              /\d{1,2}:\d{2}\s*[~～-]\s*\d{1,2}:\d{2}\s+(.+)$/,
            );
            if (caseMatch) {
              discoveredCases.add(caseMatch[1].trim());
            }
          }
        });

        if (discoveredCases.size > 0) {
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

        // Auto-switch to the first detected date if available
        if (dates.length > 0) {
          const minDate = new Date(Math.min(...dates));
          setSelectedDate(format(minDate, "yyyy-MM-dd"));
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

  const handleCaseScheduleUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setCaseScheduleLoading(true);
    setCaseScheduleError(null);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const workbook = XLSX.read(evt.target.result, {
          type: "array",
          cellDates: true,
        });
        const clients = parseCaseScheduleWorkbook(workbook);
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

  // Logic: Calculate Weekly Availability
  const processedWeeklyAvailability = useMemo(() => {
    if (viewMode !== "week" || !selectedDate || !activeScheduleData) return [];

    // Start of week (Sunday)
    const startDate = startOfWeek(new Date(selectedDate), { weekStartsOn: 0 });

    // Generate 7 days
    const weekDays = Array.from({ length: 7 }).map((_, i) => {
      const d = addDays(startDate, i);
      return format(d, "yyyy-MM-dd");
    });

    // We want data pivoting on Staff:
    // [ { staff, days: { '2023-12-16': { ...avail }, ... } } ]

    // First, get availability for each day
    const dailyResults = weekDays.map((dateStr) => {
      return {
        date: dateStr,
        data: calculateDailyAvailability(
          dateStr,
          activeScheduleData,
          activeStaffData,
          bufferBuffer,
        ),
      };
    });

    // Re-structure by Staff
    return activeStaffData.map((staff) => {
      const staffWeekData = {};
      dailyResults.forEach((day) => {
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
    activeScheduleData,
    activeStaffData,
    selectedDate,
    bufferBuffer,
    viewMode,
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
      const weekStart = startOfWeek(new Date(selectedDate), {
        weekStartsOn: 0,
      });
      return Array.from({ length: 7 }).map((_, i) => {
        const d = addDays(weekStart, i);
        const dateStr = format(d, "yyyy-MM-dd");
        const dayAvail = calculateDailyAvailability(
          dateStr,
          activeScheduleData,
          activeStaffData,
          bufferBuffer,
        );
        return {
          date: dateStr,
          ...applyTimeFilter(
            dayAvail,
            dateStr,
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
    selectedDate,
    activeScheduleData,
    activeStaffData,
    bufferBuffer,
    caseSettings,
  ]);

  // Stats: service hours per staff (with 例/休 day breakdown)
  const statsData = useMemo(() => {
    if (!activeScheduleData.length || !activeStaffData.length) return [];

    // Build day-type map: "staffName__dateStr" -> '例' | '休'
    const dayOffMap = {};
    activeScheduleData.forEach((record) => {
      const t = record["服務時間"];
      if (t !== "例" && t !== "休") return;
      const name = record["服務人員"];
      const dateVal = record["服務日期"];
      if (!name || !dateVal) return;
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
      dayOffMap[`${name}__${dateStr}`] = t;
    });

    // Build transit map and national holiday set
    const transitMap = {};
    const nationalHolidaySet = new Set();
    activeScheduleData.forEach((record) => {
      const t = record["服務時間"];
      const name = record["服務人員"];
      const dateVal = record["服務日期"];
      if (!name || !dateVal) return;
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
      const key = `${name}__${dateStr}`;
      if (t === "_transit") {
        transitMap[key] = (transitMap[key] || 0) + (record._transitHours || 0);
      } else if (t === "_national") {
        nationalHolidaySet.add(key);
      }
    });

    const NORMAL_DAILY_MINUTES = 8 * 60; // 8h per day

    const map = {};
    activeStaffData.forEach((s) => {
      map[s.name] = {
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
      const name = record["服務人員"];
      const timeVal = record["服務時間"];
      const dateVal = record["服務日期"];
      if (!name || !timeVal || !map[name]) return;
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
      const dayType = dayOffMap[`${name}__${dateStr}`];
      map[name].totalMinutes += mins;
      map[name].sessions += 1;
      if (dateStr) map[name].days.add(dateStr);

      const key = `${name}__${dateStr}`;
      if (dayType === "例") {
        map[name].holidayMinutes += mins;
        map[name].dailyHoliday[dateStr] =
          (map[name].dailyHoliday[dateStr] || 0) + mins;
      } else if (dayType === "休") {
        map[name].restDayMinutes += mins;
        map[name].dailyRestDay[dateStr] =
          (map[name].dailyRestDay[dateStr] || 0) + mins;
      } else if (nationalHolidaySet.has(key)) {
        map[name].nationalHolidayMinutes += mins;
        map[name].dailyNationalHoliday[dateStr] =
          (map[name].dailyNationalHoliday[dateStr] || 0) + mins;
      } else {
        // accumulate by day for overtime calculation
        map[name].dailyNormal[dateStr] =
          (map[name].dailyNormal[dateStr] || 0) + mins;
      }
    });

    // Accumulate transit hours per staff
    Object.entries(transitMap).forEach(([key, hours]) => {
      const name = key.split("__")[0];
      if (map[name]) map[name].transitHours += hours;
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
                        onClick={() =>
                          setOrgs((prev) => prev.filter((o) => o.id !== org.id))
                        }
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
                className="anim-fade-up anim-delay-3 group relative flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-slate-300 rounded-3xl cursor-pointer bg-white hover:bg-brand-coral/[0.02] hover:border-brand-coral shadow-sm transition-all duration-300"
              >
                <div className="flex flex-col items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center group-hover:bg-brand-coral/10 group-hover:scale-110 transition-all duration-300">
                    <Upload className="w-8 h-8 text-slate-400 group-hover:text-brand-coral transition-colors" />
                  </div>
                  <div className="text-center">
                    <p className="text-base font-semibold text-slate-600 group-hover:text-brand-slate transition-colors">
                      點擊上傳或拖曳檔案至此
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
        <div className="mb-8 p-6 bg-white rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row md:items-end gap-6 anim-fade-up anim-delay-1">
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

          <div className="space-y-2 flex-1 border-l border-slate-100 pl-6">
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

          <div className="hidden md:block h-10 w-px bg-slate-100 self-end mb-1"></div>

          <div className="flex-none bg-brand-lavender/50 p-4 rounded-2xl border border-brand-lavender space-y-3">
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">
                當前查看範圍
              </p>
              <p className="text-sm font-bold text-brand-slate">
                {format(new Date(selectedDate), "yyyy年 MM月 dd日")}
              </p>
              {(filterStartTime || filterEndTime) && (
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

        {/* Scenario A: Filter Applied */}
        {filteredStaffList && viewMode !== "week" ? (
          <div className="space-y-8 anim-fade-up anim-delay-2">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <Search className="w-5 h-5 text-brand-coral" />
                時段篩選結果{" "}
                <span className="bg-brand-lavender text-brand-slate px-2 py-0.5 rounded text-sm">
                  {filterStartTime}~{filterEndTime}
                </span>
              </h2>
            </div>

            {filteredStaffList.available.length === 0 &&
            filteredStaffList.potential.length === 0 &&
            filteredStaffList.offDuty.length === 0 ? (
              <div className="bg-white rounded-xl shadow-sm border p-12 text-center text-slate-500">
                沒有人員在此時段有空檔或可彈性調整的案件。
              </div>
            ) : (
              <div className="space-y-6">
                {/* 1. Fully Available */}
                {filteredStaffList.available.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-emerald-600 font-bold text-sm">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                      完全空閒 ({filteredStaffList.available.length})
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filteredStaffList.available.map((item, idx) => (
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
                              {item.free.map((f, i) => (
                                <span
                                  key={i}
                                  className="bg-white border border-slate-200 px-1.5 py-0.5 rounded shadow-sm"
                                >
                                  {format(f.start, "HH:mm")}-
                                  {format(f.end, "HH:mm")}
                                </span>
                              ))}
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {/* 2. Potential Matches (Flexible) */}
                {filteredStaffList.potential.length > 0 && (
                  <div className="space-y-3 pt-4 border-t border-slate-100">
                    <div className="flex items-center gap-2 text-brand-orange font-bold text-sm">
                      <Clock className="w-4 h-4" />
                      可彈性調整人力 ({filteredStaffList.potential.length})
                      <span className="font-normal text-slate-400 text-xs">
                        (案主標記為可提早或延後)
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filteredStaffList.potential.map((item, idx) => (
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
                {filteredStaffList.offDuty.length > 0 && (
                  <div className="space-y-3 pt-4 border-t border-slate-100">
                    <div className="flex items-center gap-2 text-slate-400 font-bold text-sm">
                      <div className="w-2 h-2 rounded-full bg-slate-300"></div>
                      休假 / 例假人員 ({filteredStaffList.offDuty.length})
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filteredStaffList.offDuty.map((item, idx) => (
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
          />
        ) : viewMode === "week" ? (
          /* Scenario C: Week View (with or without filter) */
          filteredWeeklyList ? (
            <WeeklyFilterView
              weeklyFilterData={filteredWeeklyList}
              selectedDate={selectedDate}
              filterStartTime={filterStartTime}
              filterEndTime={filterEndTime}
            />
          ) : (
            <WeeklyView
              weeklyData={processedWeeklyAvailability}
              selectedDate={selectedDate}
              startHour={START_OF_DAY}
              endHour={END_OF_DAY}
              orgs={orgs}
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
    </div>
  );
}

// Timeline Component helper
const TimelineBar = ({ startTime, endTime, blocked, rawBusy, date }) => {
  const totalMinutes = (endTime - startTime) * 60;

  // Helper to get % position
  const getPos = (d) => {
    const startOfDay = new Date(date);
    startOfDay.setHours(startTime, 0, 0, 0);

    let diff = (d - startOfDay) / 1000 / 60; // minutes
    return (diff / totalMinutes) * 100;
  };

  return (
    <div className="absolute inset-0 w-full h-full">
      {/* Render "Blocked/Buffer" first (Secondary) */}
      {blocked.map((block, i) => {
        const left = Math.max(0, getPos(block.start));
        const right = Math.min(100, getPos(block.end));
        const width = right - left;
        if (width <= 0) return null;

        return (
          <div
            key={`buff-${i}`}
            className="absolute top-2 bottom-2 bg-brand-coral/10 rounded-lg border border-brand-coral/20"
            style={{ left: `${left}%`, width: `${width}%` }}
            title={`Buffer/Busy: ${format(block.start, "HH:mm")} - ${format(block.end, "HH:mm")}`}
          >
            <div className="w-full h-full bg-[repeating-linear-gradient(45deg,transparent,transparent_5px,rgba(255,107,107,0.05)_5px,rgba(255,107,107,0.05)_10px)] opacity-50"></div>
          </div>
        );
      })}

      {/* Render "Actual Busy" on top (Coral) */}
      {rawBusy.map((busy, i) => {
        const left = Math.max(0, getPos(busy.start));
        const right = Math.min(100, getPos(busy.end));
        const width = right - left;
        if (width <= 0) return null;

        return (
          <div
            key={`busy-${i}`}
            className="absolute top-3 bottom-3 bg-brand-coral shadow-[0_4px_12px_rgba(255,107,107,0.3)] rounded-lg z-10 flex items-center justify-center overflow-hidden"
            style={{ left: `${left}%`, width: `${width}%` }}
            title={`Service: ${format(busy.start, "HH:mm")} - ${format(busy.end, "HH:mm")}`}
          >
            <div className="text-[8px] text-white font-bold truncate px-1 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
              {format(busy.start, "HH:mm")}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// Weekly View Component
const DAY_NAMES = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];

const WeeklyFilterView = ({
  weeklyFilterData,
  selectedDate,
  filterStartTime,
  filterEndTime,
}) => {
  const weekStart = startOfWeek(new Date(selectedDate), { weekStartsOn: 0 });

  return (
    <div className="space-y-6 anim-fade-up anim-delay-2">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-brand-slate">週篩選結果</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            {format(weekStart, "yyyy/MM/dd")} ~{" "}
            {format(addDays(weekStart, 6), "MM/dd")}
            <span className="mx-2 text-slate-200">|</span>
            <span className="font-semibold text-brand-slate">
              {filterStartTime} ~ {filterEndTime}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-500 font-medium">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 bg-emerald-400 rounded-full"></span>可用
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 bg-brand-orange rounded-full"></span>彈性
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 bg-slate-300 rounded-full"></span>例假
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 bg-sky-300 rounded-full"></span>休假
          </div>
        </div>
      </div>

      {/* 7-day grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
        {weeklyFilterData.map((day, i) => {
          const d = addDays(weekStart, i);
          const isToday =
            format(d, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
          const total = day.available.length + day.potential.length;
          const hasActive =
            day.available.length > 0 || day.potential.length > 0;

          return (
            <div
              key={day.date}
              className={cn(
                "bg-white rounded-2xl p-5 flex flex-col gap-4 border transition-shadow",
                isToday
                  ? "border-brand-coral/25 shadow-md shadow-brand-coral/8"
                  : "border-slate-100 shadow-sm",
              )}
            >
              {/* Day header */}
              <div className="flex items-start justify-between">
                <div>
                  <div
                    className={cn(
                      "text-[10px] font-semibold tracking-widest uppercase",
                      isToday ? "text-brand-coral" : "text-slate-400",
                    )}
                  >
                    {DAY_NAMES[d.getDay()]}
                  </div>
                  <div
                    className={cn(
                      "text-3xl font-bold leading-none mt-1 tabular-nums",
                      isToday ? "text-brand-coral" : "text-brand-slate",
                    )}
                  >
                    {format(d, "d")}
                  </div>
                  <div
                    className={cn(
                      "text-[11px] mt-1",
                      isToday ? "text-brand-coral/60" : "text-slate-300",
                    )}
                  >
                    {format(d, "M月")}
                  </div>
                </div>
                <span
                  className={cn(
                    "text-[11px] font-bold px-2.5 py-1 rounded-full min-w-[38px] text-center mt-0.5",
                    total > 0
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-100 text-slate-400",
                  )}
                >
                  {total}人
                </span>
              </div>

              {/* Available & Flexible */}
              {hasActive && (
                <div className="space-y-3">
                  {day.available.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                        <span className="text-[10px] font-semibold text-emerald-600 tracking-wide">
                          可用 · {day.available.length}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {day.available.map((p, j) => (
                          <span
                            key={j}
                            className="text-[11px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium"
                          >
                            {p.staff.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {day.potential.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-brand-orange shrink-0" />
                        <span className="text-[10px] font-semibold text-brand-orange tracking-wide">
                          彈性 · {day.potential.length}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {day.potential.map((p, j) => (
                          <span
                            key={j}
                            className="text-[11px] bg-amber-50 text-brand-orange px-2 py-0.5 rounded-full font-medium"
                          >
                            {p.staff.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Off-duty — visually secondary */}
              {day.offDuty.length > 0 && (
                <div
                  className={cn(
                    "space-y-2",
                    hasActive && "border-t border-slate-50 pt-3",
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
                    <span className="text-[10px] font-semibold text-slate-400 tracking-wide">
                      休假 · {day.offDuty.length}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {day.offDuty.map((p, j) => (
                      <span
                        key={j}
                        className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                          p.dayType === "例"
                            ? "bg-slate-50 text-slate-400"
                            : "bg-sky-50 text-sky-400",
                        )}
                      >
                        {p.staff.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {total === 0 && day.offDuty.length === 0 && (
                <div className="text-[11px] text-slate-300 text-center py-4">
                  無可用人員
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const WeeklyView = ({ weeklyData, selectedDate, orgs = [] }) => {
  const weekStart = startOfWeek(new Date(selectedDate), { weekStartsOn: 0 });
  const weekDays = Array.from({ length: 7 }).map((_, i) =>
    addDays(weekStart, i),
  );

  const getAvailabilityStatus = (dayData) => {
    if (!dayData || !dayData.free)
      return { color: "bg-slate-50", text: "-", sub: "" };

    // Day-off markers
    if (dayData.isOff) {
      if (dayData.dayType === "例")
        return {
          color: "bg-slate-100 text-slate-400 border-slate-200",
          text: "例假",
          sub: "",
        };
      return {
        color: "bg-sky-50 text-sky-400 border-sky-200",
        text: "休假",
        sub: "",
      };
    }

    const calcEndHour = 19;
    const totalFreeMs = dayData.free.reduce((acc, curr) => {
      const blockStart = curr.start;
      const blockEnd = curr.end;
      const limitEnd = new Date(blockStart);
      limitEnd.setHours(calcEndHour, 0, 0, 0);
      if (blockStart >= limitEnd) return acc;
      const effectiveEnd = blockEnd > limitEnd ? limitEnd : blockEnd;
      const duration = effectiveEnd - blockStart;
      return acc + (duration > 0 ? duration : 0);
    }, 0);

    const freeHours = totalFreeMs / 1000 / 60 / 60;
    if (!dayData.busyRaw || dayData.busyRaw.length === 0)
      return {
        color: "bg-white border-slate-100 text-slate-400",
        text: "未排班",
        sub: "",
      };

    if (freeHours >= 6)
      return {
        color: "bg-emerald-50 text-emerald-700 border-emerald-200",
        text: "空閒",
        sub: `${freeHours.toFixed(1)}h`,
      };
    if (freeHours >= 2)
      return {
        color: "bg-brand-orange/10 text-brand-orange border-brand-orange/20",
        text: "普通",
        sub: `${freeHours.toFixed(1)}h`,
      };
    return {
      color: "bg-brand-coral/10 text-brand-coral border-brand-coral/20",
      text: "繁忙",
      sub: `${freeHours.toFixed(1)}h`,
    };
  };

  return (
    <div className="space-y-6 anim-fade-up anim-delay-2">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-brand-slate">人員週行程概況</h2>
          <p className="text-sm text-slate-500 font-medium">
            {format(weekStart, "yyyy/MM/dd")} ~{" "}
            {format(addDays(weekStart, 6), "MM/dd")}
          </p>
        </div>
        <div className="flex items-center gap-4 bg-white p-3 rounded-2xl border border-slate-100 shadow-sm flex-wrap">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 bg-emerald-400 rounded-sm shadow-sm"></span>{" "}
            <span className="text-xs font-bold text-slate-600">
              空閒 (良好)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 bg-brand-orange rounded-sm shadow-sm"></span>{" "}
            <span className="text-xs font-bold text-slate-600">普通</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 bg-brand-coral rounded-sm shadow-sm"></span>{" "}
            <span className="text-xs font-bold text-slate-600">繁忙</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 bg-slate-200 rounded-sm shadow-sm"></span>{" "}
            <span className="text-xs font-bold text-slate-600">例假</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 bg-sky-200 rounded-sm shadow-sm"></span>{" "}
            <span className="text-xs font-bold text-slate-600">休假</span>
          </div>
        </div>
      </div>

      <Card className="border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-[1000px]">
            <div className="grid grid-cols-[180px_repeat(7,_1fr)] border-b bg-slate-50/50">
              <div className="p-4 text-sm font-bold text-brand-slate pl-8 flex items-center border-r border-slate-100">
                人員 / 日期
              </div>
              {weekDays.map((d) => (
                <div
                  key={d.toISOString()}
                  className={cn(
                    "p-4 text-center border-r border-slate-100 last:border-0",
                    isSameDay(d, new Date(selectedDate))
                      ? "bg-brand-coral/5"
                      : "",
                  )}
                >
                  <div
                    className={cn(
                      "text-[11px] font-bold mb-1",
                      isSameDay(d, new Date(selectedDate))
                        ? "text-brand-coral"
                        : "text-slate-400",
                    )}
                  >
                    {
                      ["週日", "週一", "週二", "週三", "週四", "週五", "週六"][
                        d.getDay()
                      ]
                    }
                  </div>
                  <div
                    className={cn(
                      "text-sm font-bold",
                      isSameDay(d, new Date(selectedDate))
                        ? "text-brand-coral"
                        : "text-brand-slate",
                    )}
                  >
                    {format(d, "MM/dd")}
                  </div>
                </div>
              ))}
            </div>

            <div className="divide-y divide-slate-50 max-h-[65vh] overflow-y-auto">
              {weeklyData.map((item, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-[180px_repeat(7,_1fr)] group hover:bg-brand-lavender/30 transition-colors"
                >
                  <div className="p-4 pl-8 flex flex-col justify-center bg-white sticky left-0 z-10 border-r border-slate-100 group-hover:bg-brand-lavender/30 transition-colors">
                    <span className="font-bold text-sm text-brand-slate truncate flex items-center gap-1">
                      <OrgDot staff={item.staff} orgs={orgs} />
                      {item.staff.name}
                    </span>
                  </div>
                  {weekDays.map((d) => {
                    const dateStr = format(d, "yyyy-MM-dd");
                    const dayData = item.days[dateStr];
                    const status = getAvailabilityStatus(dayData);
                    const isTodayCell = isSameDay(d, new Date(selectedDate));

                    return (
                      <div
                        key={dateStr}
                        className={cn(
                          "relative h-20 p-2 border-r border-slate-50 last:border-0 flex items-center justify-center",
                          isTodayCell ? "bg-brand-coral/[0.02]" : "",
                        )}
                      >
                        <div
                          className={cn(
                            "w-full h-full rounded-xl flex flex-col items-center justify-center border transition-all cursor-default group/cell relative overflow-hidden",
                            status.color,
                          )}
                        >
                          <span className="text-xs font-bold">
                            {status.text}
                          </span>
                          <span className="text-[10px] font-medium opacity-70">
                            {status.sub}
                          </span>

                          <div className="absolute inset-0 bg-brand-slate text-white opacity-0 group-hover/cell:opacity-100 transition-opacity flex flex-col items-center justify-center p-2 text-center z-20">
                            {dayData && dayData.isOff ? (
                              <span className="text-[9px] font-bold text-slate-300">
                                {dayData.dayType === "例" ? "例假日" : "休假日"}
                              </span>
                            ) : dayData && dayData.blocked.length > 0 ? (
                              <div className="text-[8px] leading-tight flex flex-col gap-0.5">
                                {dayData.blocked.slice(0, 3).map((b, i) => (
                                  <span key={i}>
                                    {format(b.start, "HH:mm")}~
                                    {format(b.end, "HH:mm")}
                                  </span>
                                ))}
                                {dayData.blocked.length > 3 && <span>...</span>}
                              </div>
                            ) : (
                              <span className="text-[9px] font-bold text-emerald-300">
                                全日空閒
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

const SortBtn = ({ value, label, sortBy, setSortBy }) => (
  <button
    onClick={() => setSortBy(value)}
    className={cn(
      "px-3 py-1.5 rounded-lg text-xs font-bold transition-colors",
      sortBy === value
        ? "bg-brand-coral text-white"
        : "bg-slate-100 text-slate-500 hover:bg-slate-200",
    )}
  >
    {label}
  </button>
);

const StatsView = ({ statsData, dataDateRange, orgs = [] }) => {
  const [sortBy, setSortBy] = React.useState("hours"); // 'hours' | 'sessions' | 'days'
  const [search, setSearch] = React.useState("");
  const [mounted, setMounted] = React.useState(false);
  const [copiedDetail, setCopiedDetail] = React.useState(false);
  const [copiedOT, setCopiedOT] = React.useState(false);
  React.useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const sorted = [...statsData]
    .filter((s) => s.staff.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === "sessions") return b.sessions - a.sessions;
      if (sortBy === "days") return b.days - a.days;
      return b.totalMinutes - a.totalMinutes;
    });

  const totalHours = +(
    statsData.reduce((acc, s) => acc + s.totalMinutes, 0) / 60
  ).toFixed(1);
  const scheduledCount = statsData.filter((s) => s.sessions > 0).length;
  const avgHours =
    scheduledCount > 0 ? +(totalHours / scheduledCount).toFixed(1) : 0;
  const maxMinutes = statsData[0]?.totalMinutes || 1;

  return (
    <div className="space-y-6 anim-fade-up anim-delay-2">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-brand-slate">服務時數統計</h2>
          {dataDateRange && (
            <p className="text-sm text-slate-500 font-medium">
              資料區間：{dataDateRange}
            </p>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "已排班人員", value: scheduledCount, unit: "人" },
          { label: "總服務時數", value: totalHours, unit: "小時" },
          { label: "平均每人時數", value: avgHours, unit: "小時" },
        ].map((item, i) => (
          <Card key={i} className="p-5 text-center">
            <div className="text-2xl font-bold text-brand-slate">
              {item.value}
              <span className="text-sm font-medium text-slate-400 ml-1">
                {item.unit}
              </span>
            </div>
            <div className="text-xs text-slate-400 font-medium mt-1">
              {item.label}
            </div>
          </Card>
        ))}
      </div>

      {/* Table */}
      <Card className="border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <Input
            placeholder="搜尋姓名..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs h-9 text-sm"
          />
          <div className="flex items-center gap-3 flex-wrap">
            {/* Legend */}
            <div className="flex items-center gap-3 text-[11px] font-medium text-slate-500 border-r border-slate-200 pr-3">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm bg-brand-coral inline-block"></span>
                平日
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm bg-violet-400 inline-block"></span>
                加班
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm bg-sky-400 inline-block"></span>
                休假日出勤
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm bg-amber-400 inline-block"></span>
                例假日出勤
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-medium">排序：</span>
              <SortBtn
                value="hours"
                label="總時數"
                sortBy={sortBy}
                setSortBy={setSortBy}
              />
              <SortBtn
                value="sessions"
                label="場次"
                sortBy={sortBy}
                setSortBy={setSortBy}
              />
              <SortBtn
                value="days"
                label="服務日數"
                sortBy={sortBy}
                setSortBy={setSortBy}
              />
            </div>
          </div>
        </div>

        <div className="divide-y divide-slate-50 max-h-[60vh] overflow-y-auto">
          {sorted.map((item, idx) => {
            const normalPct = mounted
              ? (item.normalMinutes / maxMinutes) * 100
              : 0;
            const otPct = mounted
              ? (item.overtimeMinutes / maxMinutes) * 100
              : 0;
            const restPct = mounted
              ? (item.restDayMinutes / maxMinutes) * 100
              : 0;
            const holPct = mounted
              ? (item.holidayMinutes / maxMinutes) * 100
              : 0;
            const delay = `${Math.min(idx * 40, 600)}ms`;
            const hasExtra =
              item.overtimeMinutes > 0 ||
              item.restDayMinutes > 0 ||
              item.holidayMinutes > 0;
            return (
              <div
                key={item.staff.id}
                className="grid grid-cols-[36px_1fr_72px_72px_160px_1fr] items-center gap-3 px-6 py-3 hover:bg-slate-50 transition-colors"
              >
                {/* Rank */}
                <span
                  className={cn(
                    "text-xs font-bold text-center w-7 h-7 rounded-full flex items-center justify-center",
                    idx === 0
                      ? "bg-yellow-100 text-yellow-600"
                      : idx === 1
                        ? "bg-slate-100 text-slate-500"
                        : idx === 2
                          ? "bg-orange-100 text-orange-500"
                          : "text-slate-300",
                  )}
                >
                  {idx + 1}
                </span>

                {/* Name */}
                <span className="font-bold text-sm text-brand-slate truncate flex items-center gap-1">
                  <OrgDot staff={item.staff} orgs={orgs} />
                  {item.staff.name}
                </span>

                {/* Sessions */}
                <div className="text-center">
                  <div className="text-sm font-bold text-slate-700">
                    {item.sessions}
                  </div>
                  <div className="text-[10px] text-slate-400">場次</div>
                </div>

                {/* Days */}
                <div className="text-center">
                  <div className="text-sm font-bold text-slate-700">
                    {item.days}
                  </div>
                  <div className="text-[10px] text-slate-400">服務日</div>
                </div>

                {/* Hours breakdown */}
                <div className="text-right leading-tight">
                  <div>
                    <span className="text-sm font-bold text-brand-coral">
                      {item.totalHours}
                    </span>
                    <span className="text-[10px] text-slate-400 ml-1">
                      小時
                    </span>
                  </div>
                  {hasExtra && (
                    <div className="text-[10px] text-slate-400 space-x-2 mt-0.5">
                      {item.overtimeMinutes > 0 && (
                        <span className="text-violet-500">
                          加{item.overtimeHours}h
                        </span>
                      )}
                      {item.restDayMinutes > 0 && (
                        <span className="text-sky-500">
                          休{item.restDayHours}h
                        </span>
                      )}
                      {item.holidayMinutes > 0 && (
                        <span className="text-amber-500">
                          例{item.holidayHours}h
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Stacked bar */}
                <div className="bg-slate-100 rounded-full h-2.5 overflow-hidden flex">
                  {item.normalMinutes > 0 && (
                    <div
                      className="h-full bg-brand-coral transition-all duration-700 ease-out"
                      style={{ width: `${normalPct}%`, transitionDelay: delay }}
                      title={`平日正常 ${item.normalHours}h`}
                    />
                  )}
                  {item.overtimeMinutes > 0 && (
                    <div
                      className="h-full bg-violet-400 transition-all duration-700 ease-out"
                      style={{ width: `${otPct}%`, transitionDelay: delay }}
                      title={`加班 ${item.overtimeHours}h`}
                    />
                  )}
                  {item.restDayMinutes > 0 && (
                    <div
                      className="h-full bg-sky-400 transition-all duration-700 ease-out"
                      style={{ width: `${restPct}%`, transitionDelay: delay }}
                      title={`休假日出勤 ${item.restDayHours}h`}
                    />
                  )}
                  {item.holidayMinutes > 0 && (
                    <div
                      className="h-full bg-amber-400 transition-all duration-700 ease-out"
                      style={{ width: `${holPct}%`, transitionDelay: delay }}
                      title={`例假日出勤 ${item.holidayHours}h`}
                    />
                  )}
                </div>
              </div>
            );
          })}
          {sorted.length === 0 && (
            <div className="py-12 text-center text-slate-400 text-sm">
              找不到符合的人員
            </div>
          )}
        </div>
      </Card>

      {/* Detail hours breakdown table */}
      {sorted.length > 0 && (
        <Card className="p-5 overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-brand-slate">時數明細</h3>
            <button
              onClick={() => {
                const headers = ["姓名", "平日總時數", "轉場", "1~8h", "8~10h", ">10h", "休息日總時數", "<=2h", "<=8h", ">8h", "例假日總時數", "<=8h", ">8h", "國定假日總時數", "<=8h", "8~10h", ">10h"];
                const rows = sorted.map((item) => {
                  const normalTotal = +(item.normal_1_8 + item.normal_8_10 + item.normal_gt10).toFixed(2);
                  const restTotal = +(item.rest_lte2 + item.rest_lte8 + item.rest_gt8).toFixed(2);
                  const holTotal = +(item.hol_lte8 + item.hol_gt8).toFixed(2);
                  const natTotal = +(item.nat_lte8 + item.nat_8_10 + item.nat_gt10).toFixed(2);
                  return [item.staff.name, normalTotal || "-", item.transitHoursTotal || "-", item.normal_1_8 || "-", item.normal_8_10 || "-", item.normal_gt10 || "-", restTotal || "-", item.rest_lte2 || "-", item.rest_lte8 || "-", item.rest_gt8 || "-", holTotal || "-", item.hol_lte8 || "-", item.hol_gt8 || "-", natTotal || "-", item.nat_lte8 || "-", item.nat_8_10 || "-", item.nat_gt10 || "-"].join("\t");
                });
                navigator.clipboard.writeText([headers.join("\t"), ...rows].join("\n"));
                setCopiedDetail(true);
                setTimeout(() => setCopiedDetail(false), 1500);
              }}
              className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              title="複製表格"
            >
              {copiedDetail ? <Check size={15} className="text-green-500" /> : <Copy size={15} />}
            </button>
          </div>
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-xs border-collapse min-w-[900px]">
              <thead>
                <tr>
                  <th rowSpan={2} className="sticky left-0 z-10 bg-white border border-slate-200 px-3 py-2 text-left font-bold text-slate-700">服務員</th>
                  <th colSpan={5} className="bg-coral-50 border border-slate-200 px-2 py-1.5 text-center font-bold text-brand-coral">平日</th>
                  <th colSpan={4} className="bg-sky-50 border border-slate-200 px-2 py-1.5 text-center font-bold text-sky-600">休息日</th>
                  <th colSpan={3} className="bg-amber-50 border border-slate-200 px-2 py-1.5 text-center font-bold text-amber-600">例假日</th>
                  <th colSpan={4} className="bg-emerald-50 border border-slate-200 px-2 py-1.5 text-center font-bold text-emerald-600">國定假日</th>
                </tr>
                <tr>
                  {/* 平日 sub-headers */}
                  <th className="bg-coral-50 border border-slate-200 px-2 py-1 text-center text-slate-600">總時數</th>
                  <th className="bg-coral-50 border border-slate-200 px-2 py-1 text-center text-slate-600">轉場</th>
                  <th className="bg-coral-50 border border-slate-200 px-2 py-1 text-center text-slate-600">1~8h</th>
                  <th className="bg-coral-50 border border-slate-200 px-2 py-1 text-center text-slate-600">8~10h</th>
                  <th className="bg-coral-50 border border-slate-200 px-2 py-1 text-center text-slate-600">&gt;10h</th>
                  {/* 休息日 sub-headers */}
                  <th className="bg-sky-50 border border-slate-200 px-2 py-1 text-center text-slate-600">總時數</th>
                  <th className="bg-sky-50 border border-slate-200 px-2 py-1 text-center text-slate-600">&le;2h</th>
                  <th className="bg-sky-50 border border-slate-200 px-2 py-1 text-center text-slate-600">&le;8h</th>
                  <th className="bg-sky-50 border border-slate-200 px-2 py-1 text-center text-slate-600">&gt;8h</th>
                  {/* 例假日 sub-headers */}
                  <th className="bg-amber-50 border border-slate-200 px-2 py-1 text-center text-slate-600">總時數</th>
                  <th className="bg-amber-50 border border-slate-200 px-2 py-1 text-center text-slate-600">&le;8h</th>
                  <th className="bg-amber-50 border border-slate-200 px-2 py-1 text-center text-slate-600">&gt;8h</th>
                  {/* 國定假日 sub-headers */}
                  <th className="bg-emerald-50 border border-slate-200 px-2 py-1 text-center text-slate-600">總時數</th>
                  <th className="bg-emerald-50 border border-slate-200 px-2 py-1 text-center text-slate-600">&le;8h</th>
                  <th className="bg-emerald-50 border border-slate-200 px-2 py-1 text-center text-slate-600">8~10h</th>
                  <th className="bg-emerald-50 border border-slate-200 px-2 py-1 text-center text-slate-600">&gt;10h</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((item) => {
                  const v = (val) => (val > 0 ? val : "-");
                  const normalTotal = +(item.normal_1_8 + item.normal_8_10 + item.normal_gt10).toFixed(2);
                  const restTotal = +(item.rest_lte2 + item.rest_lte8 + item.rest_gt8).toFixed(2);
                  const holTotal = +(item.hol_lte8 + item.hol_gt8).toFixed(2);
                  const natTotal = +(item.nat_lte8 + item.nat_8_10 + item.nat_gt10).toFixed(2);
                  return (
                    <tr key={item.staff.name} className="hover:bg-slate-50">
                      <td className="sticky left-0 z-10 bg-white border border-slate-200 px-3 py-2 font-medium text-slate-700 whitespace-nowrap">{item.staff.name}</td>
                      {/* 平日 */}
                      <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-700 font-medium">{v(normalTotal)}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-500">{v(item.transitHoursTotal)}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-500">{v(item.normal_1_8)}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-500">{v(item.normal_8_10)}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-500">{v(item.normal_gt10)}</td>
                      {/* 休息日 */}
                      <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-700 font-medium">{v(restTotal)}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-500">{v(item.rest_lte2)}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-500">{v(item.rest_lte8)}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-500">{v(item.rest_gt8)}</td>
                      {/* 例假日 */}
                      <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-700 font-medium">{v(holTotal)}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-500">{v(item.hol_lte8)}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-500">{v(item.hol_gt8)}</td>
                      {/* 國定假日 */}
                      <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-700 font-medium">{v(natTotal)}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-500">{v(item.nat_lte8)}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-500">{v(item.nat_8_10)}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-500">{v(item.nat_gt10)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Overtime pay hours table */}
      {sorted.length > 0 && (
        <Card className="p-5 overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-brand-slate">加班費時數</h3>
            <button
              onClick={() => {
                const headers = ["姓名", "轉場", "1.34", "1.67", "2.67", "1", "2"];
                const rows = sorted.map((item) => {
                  const r134 = +(item.normal_8_10 + item.rest_lte2 + item.nat_8_10).toFixed(2);
                  const r167 = +(item.normal_gt10 + item.rest_lte8 + item.nat_gt10).toFixed(2);
                  const r267 = item.rest_gt8;
                  const r1x = (item.holDayCount + item.natDayCount) * 8;
                  const r2x = item.hol_gt8;
                  return [item.staff.name, item.transitHoursTotal || "-", r134 || "-", r167 || "-", r267 || "-", r1x || "-", r2x || "-"].join("\t");
                });
                navigator.clipboard.writeText([headers.join("\t"), ...rows].join("\n"));
                setCopiedOT(true);
                setTimeout(() => setCopiedOT(false), 1500);
              }}
              className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              title="複製表格"
            >
              {copiedOT ? <Check size={15} className="text-green-500" /> : <Copy size={15} />}
            </button>
          </div>
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-xs border-collapse min-w-[500px]">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-white border border-slate-200 px-2 py-1.5 text-left font-bold text-slate-600">姓名</th>
                  <th className="bg-violet-50 border border-slate-200 px-2 py-1.5 text-center font-bold text-violet-600">轉場</th>
                  <th className="bg-violet-50 border border-slate-200 px-2 py-1.5 text-center font-bold text-violet-600">1.34</th>
                  <th className="bg-violet-50 border border-slate-200 px-2 py-1.5 text-center font-bold text-violet-600">1.67</th>
                  <th className="bg-violet-50 border border-slate-200 px-2 py-1.5 text-center font-bold text-violet-600">2.67</th>
                  <th className="bg-violet-50 border border-slate-200 px-2 py-1.5 text-center font-bold text-violet-600">1</th>
                  <th className="bg-violet-50 border border-slate-200 px-2 py-1.5 text-center font-bold text-violet-600">2</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((item) => {
                  const v = (val) => (val > 0 ? val : "-");
                  const r134 = +(item.normal_8_10 + item.rest_lte2 + item.nat_8_10).toFixed(2);
                  const r167 = +(item.normal_gt10 + item.rest_lte8 + item.nat_gt10).toFixed(2);
                  const r267 = item.rest_gt8;
                  const r1x = (item.holDayCount + item.natDayCount) * 8;
                  const r2x = item.hol_gt8;
                  return (
                    <tr key={item.staff.name} className="hover:bg-slate-50">
                      <td className="sticky left-0 z-10 bg-white border border-slate-200 px-2 py-1.5 font-medium text-slate-700 whitespace-nowrap">{item.staff.name}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-500">{v(item.transitHoursTotal)}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-500">{v(r134)}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-500">{v(r167)}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-500">{v(r267)}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-500">{v(r1x)}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-500">{v(r2x)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};

const CaseScheduleView = ({
  caseScheduleData,
  caseScheduleLoading,
  caseScheduleError,
  caseSettings,
  setCaseSettings,
  onUpload,
  fileName,
}) => {
  const [search, setSearch] = React.useState("");

  const filtered = caseScheduleData.filter((c) =>
    c.clientName.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6 anim-fade-up anim-delay-2">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-brand-slate">個案班表</h2>
          {fileName && (
            <p className="text-sm text-slate-500 mt-0.5">已載入：{fileName}</p>
          )}
        </div>
        <label
          htmlFor="case-schedule-upload"
          className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-brand-coral text-white text-sm font-bold rounded-xl shadow hover:bg-brand-coral/90 transition-colors"
        >
          <Upload className="w-4 h-4" />
          上傳個案班表
          <input
            id="case-schedule-upload"
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={onUpload}
          />
        </label>
      </div>

      {/* Loading */}
      {caseScheduleLoading && (
        <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
          <div className="w-5 h-5 border-2 border-brand-coral border-t-transparent rounded-full animate-spin shrink-0" />
          <span className="text-sm text-slate-600 font-medium">
            正在解析個案班表...
          </span>
        </div>
      )}

      {/* Error */}
      {caseScheduleError && (
        <div className="flex items-center gap-3 p-4 bg-red-50 rounded-2xl border border-red-100 animate-in fade-in">
          <XCircle className="w-5 h-5 text-red-500 shrink-0" />
          <span className="text-sm text-red-700 font-medium">
            {caseScheduleError}
          </span>
        </div>
      )}

      {/* Empty state */}
      {!caseScheduleLoading &&
        !caseScheduleError &&
        caseScheduleData.length === 0 && (
          <Card className="p-16 flex flex-col items-center text-center border-dashed border-2 border-slate-200 bg-slate-50/50 shadow-none">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
              <FileSpreadsheet className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-base font-semibold text-slate-700 mb-1">
              尚未上傳個案班表
            </h3>
            <p className="text-sm text-slate-400 max-w-sm">
              請上傳以案主姓名為分頁名稱的 Excel
              檔案，系統將自動提取案主清單並與彈性設定連動。
            </p>
          </Card>
        )}

      {/* Search & Grid */}
      {caseScheduleData.length > 0 && (
        <>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="搜尋案主姓名..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 rounded-xl border-slate-200"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(({ clientName, records }) => {
              const settings = caseSettings[clientName] || {
                early: 0,
                late: 0,
                isFixed: false,
              };
              const patch = (field, value) =>
                setCaseSettings((prev) => ({
                  ...prev,
                  [clientName]: { ...prev[clientName], [field]: value },
                }));

              return (
                <Card
                  key={clientName}
                  className="p-5 flex flex-col gap-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <h3 className="font-bold text-brand-slate text-base">
                      {clientName}
                    </h3>
                    <Badge variant="outline">{records.length} 筆</Badge>
                  </div>

                  <div className="space-y-3 text-sm">
                    {/* Fixed checkbox */}
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={settings.isFixed}
                        onChange={(e) => patch("isFixed", e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-brand-coral focus:ring-brand-coral"
                      />
                      <span className="text-slate-600 font-medium">
                        不可移動
                      </span>
                    </label>

                    {/* Early / Late inputs */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs text-slate-500 mb-1 block">
                          可提早 (分鐘)
                        </Label>
                        <div className="inline-flex w-full items-center bg-slate-100 rounded-lg px-2 py-1">
                          <input
                            type="number"
                            min="0"
                            value={settings.early}
                            disabled={settings.isFixed}
                            onChange={(e) =>
                              patch("early", parseInt(e.target.value) || 0)
                            }
                            className="w-full bg-transparent border-none text-center text-sm font-bold focus:ring-0 disabled:opacity-50"
                          />
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500 mb-1 block">
                          可延後 (分鐘)
                        </Label>
                        <div className="inline-flex w-full items-center bg-slate-100 rounded-lg px-2 py-1">
                          <input
                            type="number"
                            min="0"
                            value={settings.late}
                            disabled={settings.isFixed}
                            onChange={(e) =>
                              patch("late", parseInt(e.target.value) || 0)
                            }
                            className="w-full bg-transparent border-none text-center text-sm font-bold focus:ring-0 disabled:opacity-50"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default App;
