import React from "react";
import {
  Upload,
  FileSpreadsheet,
  XCircle,
  Search,
  Copy,
  Check,
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

export const StatsView = ({
  statsData,
  dataDateRange,
  orgs = [],
  cardComponent,
  inputComponent,
  orgDotComponent,
  cn,
}) => {
  const Card = cardComponent;
  const Input = inputComponent;
  const OrgDot = orgDotComponent;
  const [sortBy, setSortBy] = React.useState("hours");
  const [search, setSearch] = React.useState("");
  const [mounted, setMounted] = React.useState(false);
  const [copiedDetail, setCopiedDetail] = React.useState(false);
  const [copiedOT, setCopiedOT] = React.useState(false);

  React.useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const sorted = [...statsData]
    .filter((staffStat) =>
      staffStat.staff.name.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => {
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
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <Input
            placeholder="搜尋姓名..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="max-w-xs h-9 text-sm"
          />
          <div className="flex items-center gap-3 flex-wrap">
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
          </div>
        </div>

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

  const filtered = caseScheduleData.filter((client) =>
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

      {caseScheduleData.length > 0 && (
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
