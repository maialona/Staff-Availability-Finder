import React from "react";
import {
  Upload,
  FileSpreadsheet,
  XCircle,
  Copy,
  Check,
  Download,
  BarChart3,
  LayoutGrid,
  List,
  Search,
  Route,
  MapPin,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

const SortBtn = ({ value, label, sortBy, setSortBy, cn }) => (
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

const HourFilterBtn = ({ value, label, hourFilter, setHourFilter, cn }) => (
  <button
    onClick={() => setHourFilter(value)}
    className={cn(
      "px-3 py-1.5 rounded-lg text-xs font-bold transition-colors",
      hourFilter === value
        ? "bg-brand-coral text-white"
        : "bg-slate-100 text-slate-500 hover:bg-slate-200",
    )}
  >
    {label}
  </button>
);

const STATS_GRID_COLUMNS = 4;

const buildStatsGridRows = (items, columns = STATS_GRID_COLUMNS) => {
  const rows = [];

  for (let index = 0; index < items.length; index += columns) {
    const row = items.slice(index, index + columns);
    while (row.length < columns) {
      row.push(null);
    }
    rows.push(row);
  }

  return rows;
};

const formatStatsHours = (value) => (value || value === 0 ? `${value}` : "-");

const buildStatsGridCopyText = (rows) =>
  rows
    .map((row) =>
      row
        .flatMap((item) =>
          item ? [item.staff.name, formatStatsHours(item.totalHours)] : ["", ""],
        )
        .join("\t"),
    )
    .join("\n");

export const StatsView = ({
  statsData,
  dataDateRange,
  orgs = [],
  cardComponent,
  orgDotComponent,
  cn,
}) => {
  const Card = cardComponent;
  const OrgDot = orgDotComponent;
  const [sortBy, setSortBy] = React.useState("sheet");
  const [viewMode, setViewMode] = React.useState("chart");
  const [hourFilter, setHourFilter] = React.useState("all");
  const [mounted, setMounted] = React.useState(false);
  const [copiedGrid, setCopiedGrid] = React.useState(false);
  const [copiedList, setCopiedList] = React.useState(false);
  const [copiedDetail, setCopiedDetail] = React.useState(false);
  const [copiedOT, setCopiedOT] = React.useState(false);

  React.useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const filteredStats = statsData.filter((item) => {
    if (hourFilter === "gt220") return item.totalHours > 220;
    if (hourFilter === "lt100") return item.totalHours < 100;
    return true;
  });

  const sorted = [...filteredStats]
    .sort((a, b) => {
      if (sortBy === "sheet") {
        const orgOrderA = a.staff.orgIdx ?? 0;
        const orgOrderB = b.staff.orgIdx ?? 0;
        if (orgOrderA !== orgOrderB) return orgOrderA - orgOrderB;

        const sheetOrderA = a.staff.sheetOrder ?? Number.MAX_SAFE_INTEGER;
        const sheetOrderB = b.staff.sheetOrder ?? Number.MAX_SAFE_INTEGER;
        if (sheetOrderA !== sheetOrderB) return sheetOrderA - sheetOrderB;

        return a.staff.name.localeCompare(b.staff.name, "zh-Hant");
      }
      if (sortBy === "sessions") return b.sessions - a.sessions;
      if (sortBy === "days") return b.days - a.days;
      return b.totalMinutes - a.totalMinutes;
    });

  const totalHours = +(
    statsData.reduce((acc, staffStat) => acc + staffStat.totalMinutes, 0) / 60
  ).toFixed(1);
  const scheduledCount = statsData.filter((staffStat) => staffStat.sessions > 0).length;
  const avgHours =
    scheduledCount > 0 ? +(totalHours / scheduledCount).toFixed(1) : 0;
  const maxMinutes = sorted[0]?.totalMinutes || 1;
  const statsGridRows = buildStatsGridRows(sorted);

  const handleGridCopy = () => {
    navigator.clipboard.writeText(buildStatsGridCopyText(statsGridRows));
    setCopiedGrid(true);
    setTimeout(() => setCopiedGrid(false), 1500);
  };

  const handleListCopy = () => {
    const headers = ["員編", "姓名", "總時數", "轉場"];
    const rows = sorted.map((item) =>
      [
        item.staff.sourceStaffId ?? item.staff.id ?? "",
        item.staff.name,
        formatStatsHours(item.totalHours),
        formatStatsHours(item.transitHoursTotal),
      ].join("\t"),
    );
    navigator.clipboard.writeText([headers.join("\t"), ...rows].join("\n"));
    setCopiedList(true);
    setTimeout(() => setCopiedList(false), 1500);
  };

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

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "已排班人員", value: scheduledCount, unit: "人" },
          { label: "總服務時數", value: totalHours, unit: "小時" },
          { label: "平均每人時數", value: avgHours, unit: "小時" },
        ].map((item, index) => (
          <Card key={index} className="p-5 text-center">
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

      <Card className="border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-end gap-3">
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
            <div className="flex items-center gap-2 border-r border-slate-200 pr-3">
              <span className="text-xs text-slate-400 font-medium">排序：</span>
              <SortBtn
                value="sheet"
                label="工作表順序"
                sortBy={sortBy}
                setSortBy={setSortBy}
                cn={cn}
              />
              <SortBtn
                value="hours"
                label="總時數"
                sortBy={sortBy}
                setSortBy={setSortBy}
                cn={cn}
              />
              <SortBtn
                value="sessions"
                label="場次"
                sortBy={sortBy}
                setSortBy={setSortBy}
                cn={cn}
              />
              <SortBtn
                value="days"
                label="服務日數"
                sortBy={sortBy}
                setSortBy={setSortBy}
                cn={cn}
              />
            </div>
            <div className="flex items-center gap-2 border-r border-slate-200 pr-3">
              <span className="text-xs text-slate-400 font-medium">時數：</span>
              <HourFilterBtn
                value="all"
                label="全部"
                hourFilter={hourFilter}
                setHourFilter={setHourFilter}
                cn={cn}
              />
              <HourFilterBtn
                value="gt220"
                label=">220h"
                hourFilter={hourFilter}
                setHourFilter={setHourFilter}
                cn={cn}
              />
              <HourFilterBtn
                value="lt100"
                label="<100h"
                hourFilter={hourFilter}
                setHourFilter={setHourFilter}
                cn={cn}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-medium">顯示：</span>
              <button
                onClick={() => setViewMode("chart")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors",
                  viewMode === "chart"
                    ? "bg-brand-coral text-white"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200",
                )}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                橫條圖
              </button>
              <button
                onClick={() => setViewMode("grid")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors",
                  viewMode === "grid"
                    ? "bg-brand-coral text-white"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200",
                )}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                表格
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors",
                  viewMode === "list"
                    ? "bg-brand-coral text-white"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200",
                )}
              >
                <List className="w-3.5 h-3.5" />
                列表
              </button>
            </div>
        </div>

        {viewMode === "chart" ? (
          <div className="divide-y divide-slate-50 max-h-[60vh] overflow-y-auto">
            {sorted.map((item, index) => {
              const normalPct = mounted ? (item.normalMinutes / maxMinutes) * 100 : 0;
              const otPct = mounted ? (item.overtimeMinutes / maxMinutes) * 100 : 0;
              const restPct = mounted ? (item.restDayMinutes / maxMinutes) * 100 : 0;
              const holPct = mounted ? (item.holidayMinutes / maxMinutes) * 100 : 0;
              const delay = `${Math.min(index * 40, 600)}ms`;
              const hasExtra =
                item.overtimeMinutes > 0 ||
                item.restDayMinutes > 0 ||
                item.holidayMinutes > 0;

              return (
                <div
                  key={item.staff.id}
                  className="grid grid-cols-[36px_1fr_72px_72px_160px_1fr] items-center gap-3 px-6 py-3 hover:bg-slate-50 transition-colors"
                >
                  <span
                    className={cn(
                      "text-xs font-bold text-center w-7 h-7 rounded-full flex items-center justify-center",
                      index === 0
                        ? "bg-yellow-100 text-yellow-600"
                        : index === 1
                          ? "bg-slate-100 text-slate-500"
                          : index === 2
                            ? "bg-orange-100 text-orange-500"
                            : "text-slate-300",
                    )}
                  >
                    {index + 1}
                  </span>

                  <span className="font-bold text-sm text-brand-slate truncate flex items-center gap-1">
                    <OrgDot staff={item.staff} orgs={orgs} />
                    {item.staff.name}
                  </span>

                  <div className="text-center">
                    <div className="text-sm font-bold text-slate-700">
                      {item.sessions}
                    </div>
                    <div className="text-[10px] text-slate-400">場次</div>
                  </div>

                  <div className="text-center">
                    <div className="text-sm font-bold text-slate-700">{item.days}</div>
                    <div className="text-[10px] text-slate-400">服務日</div>
                  </div>

                  <div className="text-right leading-tight">
                    <div>
                      <span className="text-sm font-bold text-brand-coral">
                        {item.totalHours}
                      </span>
                      <span className="text-[10px] text-slate-400 ml-1">小時</span>
                    </div>
                    {hasExtra && (
                      <div className="text-[10px] text-slate-400 space-x-2 mt-0.5">
                        {item.overtimeMinutes > 0 && (
                          <span className="text-violet-500">加{item.overtimeHours}h</span>
                        )}
                        {item.restDayMinutes > 0 && (
                          <span className="text-sky-500">休{item.restDayHours}h</span>
                        )}
                        {item.holidayMinutes > 0 && (
                          <span className="text-amber-500">例{item.holidayHours}h</span>
                        )}
                      </div>
                    )}
                  </div>

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
        ) : viewMode === "grid" ? (
          <div className="bg-gradient-to-br from-[#fff7f3] via-white to-[#fffaf7]">
            <div className="flex items-center justify-between gap-3 border-b border-brand-coral/10 bg-brand-coral/[0.03] px-4 py-3">
              <p className="text-sm font-medium text-slate-500">
                依目前搜尋與排序結果顯示姓名與總時數
              </p>
              <button
                onClick={handleGridCopy}
                className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                title="複製表格式排行"
              >
                {copiedGrid ? (
                  <Check size={15} className="text-emerald-500" />
                ) : (
                  <Copy size={15} />
                )}
              </button>
            </div>
            {sorted.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-400">
                找不到符合的人員
              </div>
            ) : (
              <div className="overflow-x-auto px-4 py-4 md:px-5">
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <table className="min-w-[720px] w-full border-collapse table-fixed bg-white text-xs">
                  <tbody>
                    {statsGridRows.map((row, rowIndex) => (
                      <tr key={`stats-grid-row-${rowIndex}`}>
                        {row.map((item, columnIndex) => (
                          <React.Fragment key={`stats-grid-cell-${rowIndex}-${columnIndex}`}>
                            <td className="border border-slate-200 px-2 py-1.5 text-center text-sm font-bold text-brand-slate md:px-3 md:py-2">
                              {item ? (
                                <span className="inline-flex items-center justify-center gap-1.5">
                                  <OrgDot staff={item.staff} orgs={orgs} />
                                  <span>{item.staff.name}</span>
                                </span>
                              ) : (
                                ""
                              )}
                            </td>
                            <td className="border border-slate-200 bg-slate-50/70 px-2 py-1.5 text-center text-sm font-medium text-brand-coral md:px-3 md:py-2">
                              {item ? formatStatsHours(item.totalHours) : ""}
                            </td>
                          </React.Fragment>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-gradient-to-br from-[#fff7f3] via-white to-[#fffaf7]">
            <div className="flex items-center justify-between gap-3 border-b border-brand-coral/10 bg-brand-coral/[0.03] px-4 py-3">
              <p className="text-sm font-medium text-slate-500">
                依目前搜尋與排序結果顯示員編、姓名、總時數與轉場
              </p>
              <button
                onClick={handleListCopy}
                className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                title="複製列表"
              >
                {copiedList ? (
                  <Check size={15} className="text-emerald-500" />
                ) : (
                  <Copy size={15} />
                )}
              </button>
            </div>
            {sorted.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-400">
                找不到符合的人員
              </div>
            ) : (
              <div className="overflow-x-auto px-4 py-4 md:px-5">
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <table className="w-full border-collapse bg-white text-xs">
                    <thead>
                      <tr>
                        <th className="border border-slate-200 bg-slate-50 px-3 py-2 text-center font-bold text-slate-600">員編</th>
                        <th className="border border-slate-200 bg-slate-50 px-3 py-2 text-left font-bold text-slate-600">姓名</th>
                        <th className="border border-slate-200 bg-slate-50 px-3 py-2 text-center font-bold text-slate-600">總時數</th>
                        <th className="border border-slate-200 bg-slate-50 px-3 py-2 text-center font-bold text-slate-600">轉場</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((item) => (
                        <tr key={item.staff.id} className="hover:bg-slate-50">
                          <td className="border border-slate-200 px-3 py-1.5 text-center text-slate-500">{item.staff.sourceStaffId ?? item.staff.id ?? "-"}</td>
                          <td className="border border-slate-200 px-3 py-1.5 text-left font-medium text-brand-slate">
                            <span className="inline-flex items-center gap-1.5">
                              <OrgDot staff={item.staff} orgs={orgs} />
                              <span>{item.staff.name}</span>
                            </span>
                          </td>
                          <td className="border border-slate-200 px-3 py-1.5 text-center font-bold text-brand-coral">{formatStatsHours(item.totalHours)}</td>
                          <td className="border border-slate-200 px-3 py-1.5 text-center text-slate-500">{formatStatsHours(item.transitHoursTotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

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
              {copiedDetail ? (
                <Check size={15} className="text-green-500" />
              ) : (
                <Copy size={15} />
              )}
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
                  <th className="bg-coral-50 border border-slate-200 px-2 py-1 text-center text-slate-600">總時數</th>
                  <th className="bg-coral-50 border border-slate-200 px-2 py-1 text-center text-slate-600">轉場</th>
                  <th className="bg-coral-50 border border-slate-200 px-2 py-1 text-center text-slate-600">1~8h</th>
                  <th className="bg-coral-50 border border-slate-200 px-2 py-1 text-center text-slate-600">8~10h</th>
                  <th className="bg-coral-50 border border-slate-200 px-2 py-1 text-center text-slate-600">&gt;10h</th>
                  <th className="bg-sky-50 border border-slate-200 px-2 py-1 text-center text-slate-600">總時數</th>
                  <th className="bg-sky-50 border border-slate-200 px-2 py-1 text-center text-slate-600">&le;2h</th>
                  <th className="bg-sky-50 border border-slate-200 px-2 py-1 text-center text-slate-600">&le;8h</th>
                  <th className="bg-sky-50 border border-slate-200 px-2 py-1 text-center text-slate-600">&gt;8h</th>
                  <th className="bg-amber-50 border border-slate-200 px-2 py-1 text-center text-slate-600">總時數</th>
                  <th className="bg-amber-50 border border-slate-200 px-2 py-1 text-center text-slate-600">&le;8h</th>
                  <th className="bg-amber-50 border border-slate-200 px-2 py-1 text-center text-slate-600">&gt;8h</th>
                  <th className="bg-emerald-50 border border-slate-200 px-2 py-1 text-center text-slate-600">總時數</th>
                  <th className="bg-emerald-50 border border-slate-200 px-2 py-1 text-center text-slate-600">&le;8h</th>
                  <th className="bg-emerald-50 border border-slate-200 px-2 py-1 text-center text-slate-600">8~10h</th>
                  <th className="bg-emerald-50 border border-slate-200 px-2 py-1 text-center text-slate-600">&gt;10h</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((item) => {
                  const formatValue = (value) => (value > 0 ? value : "-");
                  const normalTotal = +(item.normal_1_8 + item.normal_8_10 + item.normal_gt10).toFixed(2);
                  const restTotal = +(item.rest_lte2 + item.rest_lte8 + item.rest_gt8).toFixed(2);
                  const holTotal = +(item.hol_lte8 + item.hol_gt8).toFixed(2);
                  const natTotal = +(item.nat_lte8 + item.nat_8_10 + item.nat_gt10).toFixed(2);
                  return (
                    <tr key={item.staff.name} className="hover:bg-slate-50">
                      <td className="sticky left-0 z-10 bg-white border border-slate-200 px-3 py-2 font-medium text-slate-700 whitespace-nowrap">{item.staff.name}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-700 font-medium">{formatValue(normalTotal)}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-500">{formatValue(item.transitHoursTotal)}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-500">{formatValue(item.normal_1_8)}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-500">{formatValue(item.normal_8_10)}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-500">{formatValue(item.normal_gt10)}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-700 font-medium">{formatValue(restTotal)}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-500">{formatValue(item.rest_lte2)}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-500">{formatValue(item.rest_lte8)}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-500">{formatValue(item.rest_gt8)}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-700 font-medium">{formatValue(holTotal)}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-500">{formatValue(item.hol_lte8)}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-500">{formatValue(item.hol_gt8)}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-700 font-medium">{formatValue(natTotal)}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-500">{formatValue(item.nat_lte8)}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-500">{formatValue(item.nat_8_10)}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-500">{formatValue(item.nat_gt10)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {sorted.length > 0 && (
        <Card className="p-5 overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-brand-slate">加班費時數</h3>
            <button
              onClick={() => {
                const headers = ["姓名", "實際工時", "轉場", "1.34", "1.67", "2.67", "1", "2"];
                const rows = sorted.map((item) => {
                  const actualHours = item.normal_1_8;
                  const r134 = +(item.normal_8_10 + item.rest_lte2 + item.nat_8_10).toFixed(2);
                  const r167 = +(item.normal_gt10 + item.rest_lte8 + item.nat_gt10).toFixed(2);
                  const r267 = item.rest_gt8;
                  const r1x = (item.holDayCount + item.natDayCount) * 8;
                  const r2x = item.hol_gt8;
                  return [item.staff.name, actualHours || "-", item.transitHoursTotal || "-", r134 || "-", r167 || "-", r267 || "-", r1x || "-", r2x || "-"].join("\t");
                });
                navigator.clipboard.writeText([headers.join("\t"), ...rows].join("\n"));
                setCopiedOT(true);
                setTimeout(() => setCopiedOT(false), 1500);
              }}
              className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              title="複製表格"
            >
              {copiedOT ? (
                <Check size={15} className="text-green-500" />
              ) : (
                <Copy size={15} />
              )}
            </button>
          </div>
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-xs border-collapse min-w-[620px]">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-white border border-slate-200 px-2 py-1.5 text-left font-bold text-slate-600">姓名</th>
                  <th className="bg-violet-50 border border-slate-200 px-2 py-1.5 text-center font-bold text-violet-600">實際工時</th>
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
                  const formatValue = (value) => (value > 0 ? value : "-");
                  const actualHours = item.normal_1_8;
                  const r134 = +(item.normal_8_10 + item.rest_lte2 + item.nat_8_10).toFixed(2);
                  const r167 = +(item.normal_gt10 + item.rest_lte8 + item.nat_gt10).toFixed(2);
                  const r267 = item.rest_gt8;
                  const r1x = (item.holDayCount + item.natDayCount) * 8;
                  const r2x = item.hol_gt8;
                  return (
                    <tr key={item.staff.name} className="hover:bg-slate-50">
                      <td className="sticky left-0 z-10 bg-white border border-slate-200 px-2 py-1.5 font-medium text-slate-700 whitespace-nowrap">{item.staff.name}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-500">{formatValue(actualHours)}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-500">{formatValue(item.transitHoursTotal)}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-500">{formatValue(r134)}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-500">{formatValue(r167)}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-500">{formatValue(r267)}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-500">{formatValue(r1x)}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-500">{formatValue(r2x)}</td>
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

const formatDistance = (value) =>
  Number.isFinite(Number(value)) ? `${Number(value).toFixed(2)} km` : "-";

const formatDuration = (seconds) => {
  if (!Number.isFinite(Number(seconds))) return "";
  const minutes = Math.round(Number(seconds) / 60);
  return `${minutes} 分`;
};

const crossRegionStatusMeta = {
  qualified: { label: "符合", className: "bg-emerald-100 text-emerald-700" },
  "below-threshold": { label: "未達", className: "bg-slate-100 text-slate-600" },
  "same-client": { label: "同案", className: "bg-blue-100 text-blue-700" },
  "same-address": { label: "同址", className: "bg-blue-100 text-blue-700" },
  "missing-address": { label: "缺地址", className: "bg-amber-100 text-amber-700" },
  failed: { label: "計算失敗", className: "bg-red-100 text-red-700" },
  pending: { label: "待計算", className: "bg-slate-100 text-slate-500" },
};

const formatAddress = (address, fallback = "") =>
  address?.displayAddress || address?.geocodeAddress || fallback || "-";

export const CrossRegionBonusView = ({
  roster,
  rosterLoading,
  rosterError,
  onUpload,
  pairData,
  report,
  staffOptions = [],
  selectedStaffKey = "",
  onSelectStaff,
  staffSearch = "",
  onStaffSearchChange,
  selectedPairData,
  selectedStaffDetail,
  distanceLoading,
  distanceError,
  cardComponent,
}) => {
  const Card = cardComponent;
  const eligibleStaff = report.staffResults.filter((item) => item.eligible);
  const pendingStaff = report.staffResults.filter((item) => !item.eligible);
  const unmatched = pairData.unmatchedClients || [];
  const failedDistances = report.failedDistances || [];
  const selectedStaff = staffOptions.find((staff) => staff.staffKey === selectedStaffKey);
  const selectedStaffReport = report.staffResults.find(
    (staff) => staff.staffKey === selectedStaffKey,
  );
  const filteredStaffOptions = staffOptions
    .filter((staff) => {
      const keyword = String(staffSearch || "").trim().toLowerCase();
      if (!keyword) return true;
      return `${staff.name} ${staff.org}`.toLowerCase().includes(keyword);
    })
    .slice(0, 20);
  const detailRows = selectedStaffDetail?.rows || [];
  const detailSummary = selectedStaffDetail?.summary || {
    total: 0,
    qualified: 0,
    belowThreshold: 0,
    failed: 0,
    skipped: 0,
    pending: 0,
  };
  const selectedTransferCount =
    (selectedPairData?.pairs?.length || 0) +
    (selectedPairData?.skipped?.sameClient?.length || 0) +
    (selectedPairData?.skipped?.sameAddress?.length || 0) +
    (selectedPairData?.skipped?.missingAddress?.length || 0);

  return (
    <div className="space-y-6 anim-fade-up anim-delay-2">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-brand-slate">跨區獎金</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            判定同日相鄰兩案行車距離超過 15 公里，且連續四周每周至少一次。
          </p>
        </div>
        <label
          htmlFor="client-roster-upload"
          className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-brand-coral text-white text-sm font-bold rounded-xl shadow hover:bg-brand-coral/90 transition-colors"
        >
          <Upload className="w-4 h-4" />
          上傳個案清冊
          <input
            id="client-roster-upload"
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={onUpload}
          />
        </label>
      </div>

      {rosterLoading && (
        <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
          <div className="w-5 h-5 border-2 border-brand-coral border-t-transparent rounded-full animate-spin shrink-0" />
          <span className="text-sm text-slate-600 font-medium">正在解析個案清冊...</span>
        </div>
      )}

      {rosterError && (
        <div className="flex items-center gap-3 p-4 bg-red-50 rounded-2xl border border-red-100">
          <XCircle className="w-5 h-5 text-red-500 shrink-0" />
          <span className="text-sm text-red-700 font-medium">{rosterError}</span>
        </div>
      )}

      {!roster && !rosterLoading && (
        <Card className="p-16 flex flex-col items-center text-center border-dashed border-2 border-slate-200 bg-slate-50/50 shadow-none">
          <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
            <FileSpreadsheet className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-base font-semibold text-slate-700 mb-1">
            請上傳個案清冊
          </h3>
          <p className="text-sm text-slate-400 max-w-sm">
            系統會讀取 AO:AS 的通訊地址，清洗後比對班表中的個案姓名。
          </p>
        </Card>
      )}

      {roster && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              { label: "清冊個案", value: roster.clients.length, unit: "位" },
              { label: "相鄰案轉場", value: pairData.pairs.length, unit: "筆" },
              { label: "符合服務員", value: eligibleStaff.length, unit: "位" },
              { label: "未匹配個案", value: unmatched.length, unit: "筆" },
            ].map((item) => (
              <Card key={item.label} className="p-5 text-center">
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

          <Card className="p-5 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-end gap-4">
              <div className="flex-1">
                <label className="text-sm font-bold text-brand-slate flex items-center gap-2 mb-2">
                  <Search className="w-4 h-4 text-brand-coral" />
                  指定服務員
                </label>
                <input
                  value={staffSearch}
                  onChange={(event) => onStaffSearchChange?.(event.target.value)}
                  placeholder="輸入服務員姓名，例如：郭承翰"
                  className="w-full h-11 rounded-xl border border-slate-200 bg-slate-50/70 px-4 text-sm outline-none focus:border-brand-coral focus:ring-2 focus:ring-brand-coral/10"
                />
              </div>
              <div className="lg:w-72 rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
                <div className="text-xs text-slate-400 font-bold mb-1">目前查看</div>
                <div className="text-sm font-bold text-brand-slate">
                  {selectedStaff ? selectedStaff.name : "尚未指定服務員"}
                </div>
                {selectedStaff?.org && (
                  <div className="text-xs text-slate-400 mt-0.5">{selectedStaff.org}</div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto pr-1">
              {filteredStaffOptions.map((staff) => (
                <button
                  key={staff.staffKey}
                  type="button"
                  onClick={() => onSelectStaff?.(staff.staffKey)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                    selectedStaffKey === staff.staffKey
                      ? "bg-brand-coral text-white border-brand-coral"
                      : "bg-white text-slate-600 border-slate-200 hover:border-brand-coral/50"
                  }`}
                >
                  {staff.name}
                  {staff.org ? ` · ${staff.org}` : ""}
                </button>
              ))}
              {filteredStaffOptions.length === 0 && (
                <span className="text-sm text-slate-400">找不到符合的服務員</span>
              )}
            </div>
          </Card>

          {distanceLoading && (
            <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-2xl border border-blue-100">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0" />
              <span className="text-sm text-blue-700 font-medium">
                正在呼叫 Google Maps 計算行車距離...
              </span>
            </div>
          )}

          {distanceError && (
            <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-2xl border border-amber-100">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-amber-700 font-bold">距離尚未完成計算</p>
                <p className="text-sm text-amber-700 mt-1">{distanceError}</p>
              </div>
            </div>
          )}

          {selectedStaffKey && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {[
                  {
                    label: "資格",
                    value: selectedStaffReport?.eligible ? "符合" : "未符合",
                    tone: selectedStaffReport?.eligible ? "text-emerald-600" : "text-slate-500",
                  },
                  { label: "符合周數", value: `${selectedStaffReport?.weeks?.length || 0} 周` },
                  { label: "跨區筆數", value: `${detailSummary.qualified} 筆` },
                  { label: "全部轉場", value: `${selectedTransferCount || detailSummary.total} 筆` },
                  { label: "略過/失敗", value: `${detailSummary.skipped}/${detailSummary.failed} 筆` },
                ].map((item) => (
                  <Card key={item.label} className="p-4 text-center">
                    <div className={`text-xl font-bold ${item.tone || "text-brand-slate"}`}>
                      {item.value}
                    </div>
                    <div className="text-xs text-slate-400 font-medium mt-1">
                      {item.label}
                    </div>
                  </Card>
                ))}
              </div>

              <Card className="p-5 overflow-hidden">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <h3 className="text-base font-bold text-brand-slate">
                    {selectedStaff?.name || "指定服務員"}轉場明細
                  </h3>
                  <span className="text-xs text-slate-400">
                    依日期與服務開始時間排序
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse min-w-[980px]">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="border border-slate-200 px-3 py-2 text-left">日期</th>
                        <th className="border border-slate-200 px-3 py-2 text-left">前案</th>
                        <th className="border border-slate-200 px-3 py-2 text-left">後案</th>
                        <th className="border border-slate-200 px-3 py-2 text-left">前案地址</th>
                        <th className="border border-slate-200 px-3 py-2 text-left">後案地址</th>
                        <th className="border border-slate-200 px-3 py-2 text-right">距離</th>
                        <th className="border border-slate-200 px-3 py-2 text-right">車程</th>
                        <th className="border border-slate-200 px-3 py-2 text-center">狀態</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailRows.map((row) => {
                        const meta = crossRegionStatusMeta[row.status] || crossRegionStatusMeta.pending;
                        return (
                          <tr key={row.id} className="hover:bg-slate-50">
                            <td className="border border-slate-200 px-3 py-2 font-mono whitespace-nowrap">
                              {row.date}
                            </td>
                            <td className="border border-slate-200 px-3 py-2">
                              <div className="font-mono text-slate-500">
                                {row.fromStartTime}-{row.fromEndTime}
                              </div>
                              <div className="font-bold text-slate-700">{row.fromCaseName}</div>
                            </td>
                            <td className="border border-slate-200 px-3 py-2">
                              <div className="font-mono text-slate-500">
                                {row.toStartTime}-{row.toEndTime}
                              </div>
                              <div className="font-bold text-slate-700">{row.toCaseName}</div>
                            </td>
                            <td className="border border-slate-200 px-3 py-2 text-slate-500">
                              {formatAddress(row.fromAddress, row.originAddress)}
                            </td>
                            <td className="border border-slate-200 px-3 py-2 text-slate-500">
                              {formatAddress(row.toAddress, row.destinationAddress)}
                            </td>
                            <td className="border border-slate-200 px-3 py-2 text-right font-mono">
                              {row.distanceKm == null ? "-" : formatDistance(row.distanceKm)}
                            </td>
                            <td className="border border-slate-200 px-3 py-2 text-right font-mono">
                              {formatDuration(row.durationSeconds)}
                            </td>
                            <td className="border border-slate-200 px-3 py-2 text-center">
                              <span className={`px-2 py-0.5 rounded-full font-bold ${meta.className}`}>
                                {meta.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                      {detailRows.length === 0 && (
                        <tr>
                          <td
                            colSpan={8}
                            className="border border-slate-200 px-3 py-8 text-center text-slate-400"
                          >
                            這位服務員目前沒有同日相鄰服務轉場
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}

          {!selectedStaffKey && (
            <Card className="p-8 text-center border-dashed border-2 border-slate-200 bg-slate-50/50 shadow-none">
              <Search className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-600">
                請先指定服務員，系統才會計算該員的跨區距離明細
              </p>
            </Card>
          )}

          {selectedStaffKey && eligibleStaff.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-brand-slate font-bold text-sm">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                符合領取資格
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {eligibleStaff.map((staff) => (
                  <Card key={staff.staffKey} className="p-5 border-l-4 border-l-emerald-500">
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div>
                        <h3 className="font-bold text-brand-slate text-base">
                          {staff.staffName}
                        </h3>
                        {staff.staffOrg && (
                          <p className="text-xs text-slate-400 mt-1">{staff.staffOrg}</p>
                        )}
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
                        {staff.weeks.length} 周
                      </span>
                    </div>
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {staff.qualifyingLegs.map((leg) => (
                        <div
                          key={leg.id}
                          className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-bold text-slate-700">
                              {leg.date} {leg.fromEndTime} → {leg.toStartTime}
                            </span>
                            <span className="font-bold text-brand-coral">
                              {formatDistance(leg.distanceKm)}
                            </span>
                          </div>
                          <div className="mt-2 flex items-center gap-2 text-slate-500">
                            <Route className="w-3.5 h-3.5" />
                            <span>
                              {leg.fromCaseName} → {leg.toCaseName}
                              {leg.durationSeconds
                                ? `，約 ${formatDuration(leg.durationSeconds)}`
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
          ) : selectedStaffKey ? (
            <Card className="p-8 text-center border-dashed border-2 border-slate-200 bg-slate-50/50 shadow-none">
              <Route className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-600">
                目前沒有服務員符合連續四周跨區條件
              </p>
            </Card>
          ) : null}

          {pendingStaff.length > 0 && (
            <Card className="p-5 overflow-hidden">
              <h3 className="text-base font-bold text-brand-slate mb-4">
                未達連續四周但有跨區紀錄
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse min-w-[640px]">
                  <thead>
                    <tr>
                      <th className="border border-slate-200 px-3 py-2 text-left">服務員</th>
                      <th className="border border-slate-200 px-3 py-2 text-center">符合周數</th>
                      <th className="border border-slate-200 px-3 py-2 text-left">日期</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingStaff.map((staff) => (
                      <tr key={staff.staffKey} className="hover:bg-slate-50">
                        <td className="border border-slate-200 px-3 py-2 font-medium">
                          {staff.staffName}
                        </td>
                        <td className="border border-slate-200 px-3 py-2 text-center">
                          {staff.weeks.length}
                        </td>
                        <td className="border border-slate-200 px-3 py-2 text-slate-500">
                          {staff.qualifyingLegs.map((leg) => leg.date).join("、")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {(unmatched.length > 0 || failedDistances.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {unmatched.length > 0 && (
                <Card className="p-5">
                  <h3 className="text-base font-bold text-brand-slate mb-3">
                    未匹配個案
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {unmatched.slice(0, 60).map((item) => (
                      <span
                        key={`${item.caseName}-${item.normalizedName}`}
                        className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-medium"
                      >
                        {item.caseName}
                      </span>
                    ))}
                    {unmatched.length > 60 && (
                      <span className="text-xs text-slate-400">
                        另有 {unmatched.length - 60} 筆
                      </span>
                    )}
                  </div>
                </Card>
              )}

              {failedDistances.length > 0 && (
                <Card className="p-5">
                  <h3 className="text-base font-bold text-brand-slate mb-3">
                    距離計算失敗
                  </h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {failedDistances.slice(0, 30).map((item) => (
                      <div key={item.id} className="text-xs text-slate-600">
                        <MapPin className="w-3.5 h-3.5 inline mr-1 text-slate-400" />
                        {item.date} {item.fromCaseName} → {item.toCaseName}
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export const CaseScheduleView = ({
  caseScheduleData,
  caseScheduleLoading,
  caseScheduleError,
  caseSettings,
  setCaseSettings,
  onUpload,
  fileName,
  cardComponent,
  badgeComponent,
  inputComponent,
  labelComponent,
}) => {
  const Card = cardComponent;
  const Badge = badgeComponent;
  const Input = inputComponent;
  const Label = labelComponent;
  const [search, setSearch] = React.useState("");

  const normalizedClients = Array.isArray(caseScheduleData)
    ? caseScheduleData
        .map((client) => ({
          clientName: String(client?.clientName || "").trim(),
          records: Array.isArray(client?.records) ? client.records : [],
        }))
        .filter((client) => client.clientName)
    : [];

  const filtered = normalizedClients.filter((client) =>
    client.clientName.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6 anim-fade-up anim-delay-2">
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

      {caseScheduleLoading && (
        <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
          <div className="w-5 h-5 border-2 border-brand-coral border-t-transparent rounded-full animate-spin shrink-0" />
          <span className="text-sm text-slate-600 font-medium">
            正在解析個案班表...
          </span>
        </div>
      )}

      {caseScheduleError && (
        <div className="flex items-center gap-3 p-4 bg-red-50 rounded-2xl border border-red-100 animate-in fade-in">
          <XCircle className="w-5 h-5 text-red-500 shrink-0" />
          <span className="text-sm text-red-700 font-medium">
            {caseScheduleError}
          </span>
        </div>
      )}

      {!caseScheduleLoading &&
        !caseScheduleError &&
        normalizedClients.length === 0 && (
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

      {normalizedClients.length > 0 && (
        <>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="搜尋案主姓名..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
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
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={settings.isFixed}
                        onChange={(event) => patch("isFixed", event.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-brand-coral focus:ring-brand-coral"
                      />
                      <span className="text-slate-600 font-medium">不可移動</span>
                    </label>

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
                            onChange={(event) =>
                              patch("early", parseInt(event.target.value, 10) || 0)
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
                            onChange={(event) =>
                              patch("late", parseInt(event.target.value, 10) || 0)
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
