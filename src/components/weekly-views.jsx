import { addDays, format, isSameDay, startOfWeek } from "date-fns";

const DAY_NAMES = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];

export const TimelineBar = ({ startTime, endTime, blocked, rawBusy, date }) => {
  const totalMinutes = (endTime - startTime) * 60;

  const getPos = (time) => {
    const startOfDay = new Date(date);
    startOfDay.setHours(startTime, 0, 0, 0);

    const diff = (time - startOfDay) / 1000 / 60;
    return (diff / totalMinutes) * 100;
  };

  return (
    <div className="absolute inset-0 w-full h-full">
      {blocked.map((block, index) => {
        const left = Math.max(0, getPos(block.start));
        const right = Math.min(100, getPos(block.end));
        const width = right - left;
        if (width <= 0) return null;

        return (
          <div
            key={`buff-${index}`}
            className="absolute top-2 bottom-2 bg-brand-coral/10 rounded-lg border border-brand-coral/20"
            style={{ left: `${left}%`, width: `${width}%` }}
            title={`Buffer/Busy: ${format(block.start, "HH:mm")} - ${format(block.end, "HH:mm")}`}
          >
            <div className="w-full h-full bg-[repeating-linear-gradient(45deg,transparent,transparent_5px,rgba(255,107,107,0.05)_5px,rgba(255,107,107,0.05)_10px)] opacity-50"></div>
          </div>
        );
      })}

      {rawBusy.map((busy, index) => {
        const left = Math.max(0, getPos(busy.start));
        const right = Math.min(100, getPos(busy.end));
        const width = right - left;
        if (width <= 0) return null;

        return (
          <div
            key={`busy-${index}`}
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

export const WeeklyFilterView = ({
  weeklyFilterData,
  selectedDate,
  filterStartTime,
  filterEndTime,
  filterMode,
  selectedDuration,
  servicePeriodStart,
  servicePeriodEnd,
  cn,
}) => {
  const weekStart = startOfWeek(new Date(selectedDate), { weekStartsOn: 0 });

  return (
    <div className="space-y-6 anim-fade-up anim-delay-2">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-brand-slate">週篩選結果</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            {format(weekStart, "yyyy/MM/dd")} ~ {format(addDays(weekStart, 6), "MM/dd")}
            <span className="mx-2 text-slate-200">|</span>
            <span className="font-semibold text-brand-slate">
              {filterMode === "service" && selectedDuration
                ? `${selectedDuration}分鐘空檔 · ${servicePeriodStart}~${servicePeriodEnd}`
                : `${filterStartTime} ~ ${filterEndTime}`}
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
        {weeklyFilterData.map((day, index) => {
          const currentDate = addDays(weekStart, index);
          const isToday =
            format(currentDate, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
          const total = day.available.length + day.potential.length;
          const hasActive = total > 0;

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
              <div className="flex items-start justify-between">
                <div>
                  <div
                    className={cn(
                      "text-[10px] font-semibold tracking-widest uppercase",
                      isToday ? "text-brand-coral" : "text-slate-400",
                    )}
                  >
                    {DAY_NAMES[currentDate.getDay()]}
                  </div>
                  <div
                    className={cn(
                      "text-3xl font-bold leading-none mt-1 tabular-nums",
                      isToday ? "text-brand-coral" : "text-brand-slate",
                    )}
                  >
                    {format(currentDate, "d")}
                  </div>
                  <div
                    className={cn(
                      "text-[11px] mt-1",
                      isToday ? "text-brand-coral/60" : "text-slate-300",
                    )}
                  >
                    {format(currentDate, "M月")}
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
                        {day.available.map((person, personIndex) => (
                          <span
                            key={personIndex}
                            className="text-[11px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium"
                          >
                            {person.staff.name}
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
                        {day.potential.map((person, personIndex) => (
                          <span
                            key={personIndex}
                            className="text-[11px] bg-amber-50 text-brand-orange px-2 py-0.5 rounded-full font-medium"
                          >
                            {person.staff.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {day.offDuty.length > 0 && (
                <div className={cn("space-y-2", hasActive && "border-t border-slate-50 pt-3")}>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
                    <span className="text-[10px] font-semibold text-slate-400 tracking-wide">
                      休假 · {day.offDuty.length}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {day.offDuty.map((person, personIndex) => (
                      <span
                        key={personIndex}
                        className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                          person.dayType === "例"
                            ? "bg-slate-50 text-slate-400"
                            : "bg-sky-50 text-sky-400",
                        )}
                      >
                        {person.staff.name}
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

export const WeeklyAggregateFilterView = ({
  aggregatedMatches,
  selectedDate,
  selectedDuration,
  servicePeriodStart,
  servicePeriodEnd,
  minMatchingDays,
  cn,
}) => {
  const weekStart = startOfWeek(new Date(selectedDate), { weekStartsOn: 0 });

  return (
    <div className="space-y-6 anim-fade-up anim-delay-2">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-brand-slate">進階週篩選結果</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            {format(weekStart, "yyyy/MM/dd")} ~ {format(addDays(weekStart, 6), "MM/dd")}
            <span className="mx-2 text-slate-200">|</span>
            <span className="font-semibold text-brand-slate">
              {servicePeriodStart}~{servicePeriodEnd} 內至少 {selectedDuration} 分鐘空檔
            </span>
          </p>
        </div>
        <div className="bg-brand-lavender/50 border border-brand-lavender rounded-2xl px-4 py-3 text-sm text-brand-slate">
          同週至少 <span className="font-bold text-brand-orange">{minMatchingDays}</span> 天符合
        </div>
      </div>

      {aggregatedMatches.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-12 text-center text-slate-500">
          這一週沒有任何人符合至少 {minMatchingDays} 天的空檔條件。
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {aggregatedMatches.map((match) => (
            <div
              key={match.staff.staffKey || match.staff.id || match.staff.name}
              className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-base font-bold text-brand-slate">
                    {match.staff.name}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    本週符合 {match.matchCount} / 7 天
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    直接可排 {match.availableDates.length} 天
                    <span className="mx-1 text-slate-200">|</span>
                    調整後可排 {match.potentialDates.length} 天
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold shrink-0">
                  已達門檻
                </span>
              </div>

              <div className="grid grid-cols-7 gap-2">
                {match.days.map((day) => (
                  <div
                    key={day.date}
                    className={cn(
                      "rounded-xl border px-2 py-3 text-center",
                      day.status === "available"
                        ? "bg-emerald-50 border-emerald-200"
                        : day.status === "potential"
                          ? "bg-amber-50 border-amber-200"
                          : "bg-slate-50 border-slate-100",
                    )}
                  >
                    <div
                      className={cn(
                        "text-[10px] font-bold",
                        day.status === "available"
                          ? "text-emerald-600"
                          : day.status === "potential"
                            ? "text-amber-600"
                            : "text-slate-400",
                      )}
                    >
                      {DAY_NAMES[day.weekday]}
                    </div>
                    <div
                      className={cn(
                        "text-sm font-bold mt-1",
                        day.status === "available"
                          ? "text-emerald-700"
                          : day.status === "potential"
                            ? "text-amber-700"
                            : "text-slate-500",
                      )}
                    >
                      {format(new Date(day.date), "d")}
                    </div>
                    <div
                      className={cn(
                        "text-[10px] mt-1",
                        day.status === "available"
                          ? "text-emerald-500"
                          : day.status === "potential"
                            ? "text-amber-500"
                            : "text-slate-300",
                      )}
                    >
                      {day.status === "available"
                        ? "可排"
                        : day.status === "potential"
                          ? "可調整"
                          : "未符合"}
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-500">符合日期</div>
                <div className="flex flex-wrap gap-1.5">
                  {match.matchingDates.map((date) => (
                    <span
                      key={date}
                      className={cn(
                        "text-[11px] px-2 py-0.5 rounded-full font-medium",
                        match.availableDates.includes(date)
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-amber-50 text-amber-700",
                      )}
                    >
                      {format(new Date(date), "M/d")} {DAY_NAMES[new Date(date).getDay()]}
                      {match.availableDates.includes(date) ? " 可排" : " 可調整"}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const WeeklyMultiRuleFilterView = ({
  matches,
  offDutyMatches = [],
  rules,
  selectedDate,
  cn,
}) => {
  const weekStart = startOfWeek(new Date(selectedDate), { weekStartsOn: 0 });
  const totalResultCount = matches.length + offDutyMatches.length;

  const getStatusStyle = (status) => {
    if (status === "available") {
      return {
        card: "bg-emerald-50 border-emerald-200",
        text: "text-emerald-600",
        subtext: "text-emerald-500",
        label: "可排",
      };
    }

    if (status === "potential") {
      return {
        card: "bg-amber-50 border-amber-200",
        text: "text-amber-600",
        subtext: "text-amber-500",
        label: "可調整",
      };
    }

    if (status === "off_leave") {
      return {
        card: "bg-sky-50 border-sky-200",
        text: "text-sky-600",
        subtext: "text-sky-500",
        label: "休假",
      };
    }

    if (status === "off_regular") {
      return {
        card: "bg-slate-100 border-slate-200",
        text: "text-slate-500",
        subtext: "text-slate-400",
        label: "例假",
      };
    }

    return {
      card: "bg-white border-slate-200",
      text: "text-slate-400",
      subtext: "text-slate-300",
        label: "未符合",
    };
  };

  const renderRuleCard = (
    match,
    badgeLabel,
    badgeClassName,
    subtitle,
    options = {},
  ) => {
    const {
      showLeaveBadge = true,
      statusFilter = null,
    } = options;
    const hasLeave = match.ruleSummaries.some((rule) =>
      rule.dayStatuses.some((day) => day.status === "off_leave"),
    );

    return (
      <div
        key={match.staff.staffKey || match.staff.id || match.staff.name}
        className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-brand-slate">{match.staff.name}</h3>
            <p className="text-xs text-slate-400 mt-1">{subtitle}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {showLeaveBadge && hasLeave && (
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-sky-100 text-sky-700">
                休假
              </span>
            )}
            <span
              className={cn(
                "px-3 py-1 rounded-full text-xs font-bold shrink-0",
                badgeClassName,
              )}
            >
              {badgeLabel}
            </span>
          </div>
        </div>

        <div className="space-y-3">
          {match.ruleSummaries.map((rule) => {
            const visibleDays = statusFilter
              ? rule.dayStatuses.filter((day) => statusFilter(day.status))
              : rule.dayStatuses;

            if (visibleDays.length === 0) {
              return null;
            }

            return (
              <div
                key={rule.id}
                className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 space-y-3"
              >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-brand-orange">規則 {rule.order}</div>
                  <div className="text-sm font-semibold text-brand-slate mt-1">
                    {rule.startTime}~{rule.endTime} / {rule.duration} 分鐘
                  </div>
                </div>
                <span className="text-[11px] text-slate-400">
                  {rule.includePotential ? "包含可調整" : "只看直接可排"}
                </span>
              </div>

              <div className="grid grid-cols-7 gap-2">
                {visibleDays.map((day) => {
                  const style = getStatusStyle(day.status);

                  return (
                    <div
                      key={`${rule.id}-${day.date}`}
                      className={cn("rounded-xl border px-2 py-3 text-center", style.card)}
                    >
                      <div className={cn("text-[10px] font-bold", style.text)}>
                        {DAY_NAMES[day.weekday]}
                      </div>
                      <div className="text-sm font-bold mt-1 text-brand-slate">
                        {format(new Date(day.date), "d")}
                      </div>
                      <div className={cn("text-[10px] mt-1", style.subtext)}>{style.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 anim-fade-up anim-delay-2">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-brand-slate">多條件週規則結果</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            {format(weekStart, "yyyy/MM/dd")} ~ {format(addDays(weekStart, 6), "MM/dd")}
            <span className="mx-2 text-slate-200">|</span>
            <span className="font-semibold text-brand-slate">共設定 {rules.length} 組規則</span>
          </p>
        </div>
        <div className="text-sm text-slate-500 bg-white border border-slate-200 rounded-2xl px-4 py-3">
          篩出 <span className="font-bold text-brand-orange">{totalResultCount}</span> 位人員
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {rules.map((rule, index) => (
          <div
            key={rule.id}
            className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4"
          >
            <div className="text-xs font-bold text-brand-orange">規則 {index + 1}</div>
            <div className="text-sm font-semibold text-brand-slate mt-1">
              {rule.startTime}~{rule.endTime}，至少 {rule.duration} 分鐘
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              {rule.weekdays.map((day) => DAY_NAMES[day]).join("、")}
              <span className="mx-1 text-slate-200">|</span>
              {rule.includePotential ? "包含可調整" : "只看直接可排"}
            </div>
          </div>
        ))}
      </div>

      {matches.length === 0 && offDutyMatches.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-12 text-center text-slate-500">
          目前沒有符合規則或落在休假 / 例假的人員
        </div>
      ) : (
        <div className="space-y-6">
          {matches.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-bold text-emerald-700">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                規則通過人員 ({matches.length})
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {matches.map((match) =>
                  renderRuleCard(
                    match,
                    "已通過",
                    "bg-emerald-100 text-emerald-700",
                    `通過規則 ${match.passCount} / ${match.ruleSummaries.length}`,
                  ),
                )}
              </div>
            </div>
          )}

          {offDutyMatches.length > 0 && (
            <div className="space-y-4 border-t border-slate-100 pt-6">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-500">
                <span className="h-2 w-2 rounded-full bg-slate-300" />
                例假人員 ({offDutyMatches.length})
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {offDutyMatches.map((match) =>
                  renderRuleCard(
                    match,
                    "例假",
                    "bg-slate-100 text-slate-500",
                    "所選規則日包含例假",
                    {
                      showLeaveBadge: false,
                      statusFilter: (status) => status === "off_regular",
                    },
                  ),
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const WeeklyView = ({
  weeklyData,
  selectedDate,
  orgs = [],
  cardComponent,
  orgDotComponent,
  cn,
}) => {
  const Card = cardComponent;
  const OrgDot = orgDotComponent;
  const weekStart = startOfWeek(new Date(selectedDate), { weekStartsOn: 0 });
  const weekDays = Array.from({ length: 7 }, (_, index) =>
    addDays(weekStart, index),
  );

  const getAvailabilityStatus = (dayData) => {
    if (!dayData || !dayData.free) {
      return { color: "bg-slate-50", text: "-", sub: "" };
    }

    if (dayData.isOff) {
      if (dayData.dayType === "例") {
        return {
          color: "bg-slate-100 text-slate-400 border-slate-200",
          text: "例假",
          sub: "",
        };
      }

      return {
        color: "bg-sky-50 text-sky-400 border-sky-200",
        text: "休假",
        sub: "",
      };
    }

    const calcEndHour = 19;
    const totalFreeMs = dayData.free.reduce((acc, current) => {
      const blockStart = current.start;
      const blockEnd = current.end;
      const limitEnd = new Date(blockStart);
      limitEnd.setHours(calcEndHour, 0, 0, 0);
      if (blockStart >= limitEnd) return acc;
      const effectiveEnd = blockEnd > limitEnd ? limitEnd : blockEnd;
      const duration = effectiveEnd - blockStart;
      return acc + (duration > 0 ? duration : 0);
    }, 0);

    const freeHours = totalFreeMs / 1000 / 60 / 60;
    if (!dayData.busyRaw || dayData.busyRaw.length === 0) {
      return {
        color: "bg-white border-slate-100 text-slate-400",
        text: "未排班",
        sub: "",
      };
    }

    if (freeHours >= 6) {
      return {
        color: "bg-emerald-50 text-emerald-700 border-emerald-200",
        text: "空閒",
        sub: `${freeHours.toFixed(1)}h`,
      };
    }

    if (freeHours >= 2) {
      return {
        color: "bg-brand-orange/10 text-brand-orange border-brand-orange/20",
        text: "普通",
        sub: `${freeHours.toFixed(1)}h`,
      };
    }

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
            {format(weekStart, "yyyy/MM/dd")} ~ {format(addDays(weekStart, 6), "MM/dd")}
          </p>
        </div>
        <div className="flex items-center gap-4 bg-white p-3 rounded-2xl border border-slate-100 shadow-sm flex-wrap">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 bg-emerald-400 rounded-sm shadow-sm"></span>
            <span className="text-xs font-bold text-slate-600">空閒 (良好)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 bg-brand-orange rounded-sm shadow-sm"></span>
            <span className="text-xs font-bold text-slate-600">普通</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 bg-brand-coral rounded-sm shadow-sm"></span>
            <span className="text-xs font-bold text-slate-600">繁忙</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 bg-slate-200 rounded-sm shadow-sm"></span>
            <span className="text-xs font-bold text-slate-600">例假</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 bg-sky-200 rounded-sm shadow-sm"></span>
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
              {weekDays.map((day) => (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "p-4 text-center border-r border-slate-100 last:border-0",
                    isSameDay(day, new Date(selectedDate)) ? "bg-brand-coral/5" : "",
                  )}
                >
                  <div
                    className={cn(
                      "text-[11px] font-bold mb-1",
                      isSameDay(day, new Date(selectedDate))
                        ? "text-brand-coral"
                        : "text-slate-400",
                    )}
                  >
                    {DAY_NAMES[day.getDay()]}
                  </div>
                  <div
                    className={cn(
                      "text-sm font-bold",
                      isSameDay(day, new Date(selectedDate))
                        ? "text-brand-coral"
                        : "text-brand-slate",
                    )}
                  >
                    {format(day, "MM/dd")}
                  </div>
                </div>
              ))}
            </div>

            <div className="divide-y divide-slate-50 max-h-[65vh] overflow-y-auto">
              {weeklyData.map((item, index) => (
                <div
                  key={index}
                  className="grid grid-cols-[180px_repeat(7,_1fr)] group hover:bg-brand-lavender/30 transition-colors"
                >
                  <div className="p-4 pl-8 flex flex-col justify-center bg-white sticky left-0 z-10 border-r border-slate-100 group-hover:bg-brand-lavender/30 transition-colors">
                    <span className="font-bold text-sm text-brand-slate truncate flex items-center gap-1">
                      <OrgDot staff={item.staff} orgs={orgs} />
                      {item.staff.name}
                    </span>
                  </div>
                  {weekDays.map((day) => {
                    const dateStr = format(day, "yyyy-MM-dd");
                    const dayData = item.days[dateStr];
                    const status = getAvailabilityStatus(dayData);
                    const isSelectedDay = isSameDay(day, new Date(selectedDate));

                    return (
                      <div
                        key={dateStr}
                        className={cn(
                          "relative h-20 p-2 border-r border-slate-50 last:border-0 flex items-center justify-center",
                          isSelectedDay ? "bg-brand-coral/[0.02]" : "",
                        )}
                      >
                        <div
                          className={cn(
                            "w-full h-full rounded-xl flex flex-col items-center justify-center border transition-all cursor-default group/cell relative overflow-hidden",
                            status.color,
                          )}
                        >
                          <span className="text-xs font-bold">{status.text}</span>
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
                                {dayData.blocked.slice(0, 3).map((block, blockIndex) => (
                                  <span key={blockIndex}>
                                    {format(block.start, "HH:mm")}~{format(block.end, "HH:mm")}
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
