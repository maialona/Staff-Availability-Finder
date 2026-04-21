import { format, isValid } from "date-fns";
import { createScopedStaffKey } from "./persistence";

export const loadXLSX = () => import("xlsx");

export function parseCaseScheduleWorkbook(workbook, xlsx) {
  const clients = [];

  workbook.SheetNames.forEach((sheetName) => {
    const clientName = sheetName
      .trim()
      .replace(/\s*[（(].*?[)）]\s*$/, "")
      .trim();
    if (!clientName) return;

    const worksheet = workbook.Sheets[sheetName];
    const rowsAsArrays = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
    const firstRow = rowsAsArrays[0] || [];
    const isGrid = firstRow.some(
      (cell) =>
        typeof cell === "string" &&
        ["周日", "周一", "周二", "週日", "週一", "週二", "Sun", "Mon"].some(
          (keyword) => cell.includes(keyword),
        ),
    );

    let records = [];

    if (isGrid) {
      rowsAsArrays.forEach((row) => {
        (row || []).forEach((cell) => {
          if (typeof cell !== "string") return;
          const timeRegex = /(\d{1,2}:\d{2})\s*[~～-]\s*(\d{1,2}:\d{2})/g;
          let match;

          while ((match = timeRegex.exec(cell)) !== null) {
            const sameLine = cell.slice(match.index + match[0].length).split("\n")[0];
            const chineseWords = sameLine.match(/[\u4e00-\u9fa5]+/g);
            const staffName = chineseWords
              ? chineseWords[chineseWords.length - 1]
              : "";

            records.push({
              服務日期: "",
              服務人員: staffName,
              服務時間: `${match[1]}~${match[2]}`,
            });
          }
        });
      });
    } else {
      const keywords = [
        "服務日期",
        "日期",
        "服務人員",
        "服務員",
        "服務時間",
        "時間",
      ];
      let headerIdx = 0;
      let bestScore = 0;

      rowsAsArrays.slice(0, 10).forEach((row, index) => {
        const score = (row || []).filter(
          (cell) =>
            typeof cell === "string" &&
            keywords.some((keyword) => cell.includes(keyword)),
        ).length;

        if (score > bestScore) {
          bestScore = score;
          headerIdx = index;
        }
      });

      const rows = xlsx.utils.sheet_to_json(worksheet, { range: headerIdx });
      const normalizedRows = rows.map((row) => {
        const normalized = {};
        Object.keys(row).forEach((key) => {
          normalized[key.trim()] = row[key];
        });
        return normalized;
      });

      if (normalizedRows.length > 0) {
        const firstKeys = Object.keys(normalizedRows[0]);
        const findKey = (keywordsToMatch) =>
          firstKeys.find((key) =>
            keywordsToMatch.some((keyword) => key.includes(keyword)),
          );

        const dateKey = findKey(["服務日期", "日期", "Date"]);
        const staffKey = findKey(["服務人員", "居服員", "照服員", "服務員"]);
        const timeKey = findKey(["服務時間", "起迄", "時間"]);

        records = normalizedRows
          .map((row) => ({
            服務日期: dateKey ? row[dateKey] : "",
            服務人員: staffKey ? row[staffKey] : "",
            服務時間: timeKey ? row[timeKey] : "",
          }))
          .filter((row) => row["服務日期"] || row["服務時間"]);
      }
    }

    clients.push({ clientName, sheetName, records });
  });

  return clients;
}

export function parseOrgWorkbook({
  file,
  workbook,
  xlsx,
  pendingOrgName,
  orgCount,
}) {
  const sheet1Name = workbook.SheetNames[0];
  const sheet1 = workbook.Sheets[sheet1Name];
  const orgId = Date.now().toString();
  const isMonthlyGrid = workbook.SheetNames.some((name) =>
    /^[A-Z]\d{3}/.test(name.trim()),
  );

  let rawSchedule = [];
  let rawStaff = [];
  let headerIndex = 0;

  if (isMonthlyGrid) {
    const yearMonthMatch = file.name.match(/(\d{4})[.\-_](\d{1,2})/);
    const baseYear = yearMonthMatch
      ? parseInt(yearMonthMatch[1], 10)
      : new Date().getFullYear();
    const baseMonth = yearMonthMatch
      ? parseInt(yearMonthMatch[2], 10) - 1
      : new Date().getMonth();

    const gridSchedule = [];
    const gridStaff = [];

    workbook.SheetNames.forEach((sheetName) => {
      const trimmedName = sheetName.trim();
      const nameMatch = trimmedName.match(/^[A-Z]\d{3}(.+)$/);
      if (!nameMatch) return;

      const staffName = nameMatch[1].trim();
      const staffId = trimmedName.substring(0, 4);
      gridStaff.push({ id: staffId, name: staffName });

      const worksheet = workbook.Sheets[sheetName];
      const rowsAsArrays = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

      rowsAsArrays.forEach((row) => {
        if (!Array.isArray(row)) return;

        row.forEach((cell) => {
          if (typeof cell !== "string") return;

          const dayMatch = cell.match(/^\s*(\d{1,2})/);
          if (!dayMatch) return;

          const day = parseInt(dayMatch[1], 10);
          const dateObj = new Date(baseYear, baseMonth, day);
          if (!isValid(dateObj)) return;
          const dateStr = format(dateObj, "yyyy-MM-dd");

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

          const firstLine = cell.split("\n")[0];
          const nationalHolidayKeywords = [
            "春節",
            "除夕",
            "小年夜",
            "228紀念日",
            "228",
            "二二八",
            "元旦",
            "清明",
            "端午",
            "中秋",
            "國慶",
            "勞動節",
            "兒童節",
            "國定假日",
          ];
          const isNationalHoliday = nationalHolidayKeywords.some((keyword) =>
            firstLine.includes(keyword),
          );

          if (isNationalHoliday) {
            gridSchedule.push({
              服務日期: dateStr,
              服務時間: "_national",
              服務人員: staffName,
              _isGrid: true,
            });
          }

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

          const timeRegex = /(\d{1,2}:\d{2})\s*[~～-]\s*(\d{1,2}:\d{2})/g;
          let timeMatch;
          while ((timeMatch = timeRegex.exec(cell)) !== null) {
            const sameLine = cell.slice(timeMatch.index + timeMatch[0].length).split("\n")[0];
            const chineseWords = sameLine.match(/[\u4e00-\u9fa5]+/g);
            const caseName = chineseWords
              ? chineseWords[chineseWords.length - 1]
              : "";

            gridSchedule.push({
              服務日期: dateStr,
              服務時間: caseName
                ? `${timeMatch[1]}~${timeMatch[2]} ${caseName}`
                : `${timeMatch[1]}~${timeMatch[2]}`,
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
    const rowsAsArrays = xlsx.utils.sheet_to_json(sheet1, { header: 1 });
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

    for (let i = 0; i < Math.min(10, rowsAsArrays.length); i += 1) {
      const row = rowsAsArrays[i];
      if (!Array.isArray(row)) continue;

      const matches = row.filter(
        (cell) =>
          typeof cell === "string" &&
          requiredKeywords.some((keyword) => cell.includes(keyword)),
      ).length;

      if (matches > bestMatch) {
        bestMatch = matches;
        headerIndex = i;
      }
    }

    rawSchedule = xlsx.utils.sheet_to_json(sheet1, { range: headerIndex });

    if (workbook.SheetNames.length > 1) {
      const sheet2 = workbook.Sheets[workbook.SheetNames[1]];
      const rowsAsArrays = xlsx.utils.sheet_to_json(sheet2, { header: 1 });
      let staffHeaderIndex = 0;
      let bestStaffMatch = -1;
      const staffKeywords = ["姓名", "Name", "員編", "ID"];

      for (let i = 0; i < Math.min(10, rowsAsArrays.length); i += 1) {
        const row = rowsAsArrays[i];
        if (!Array.isArray(row)) continue;

        const matches = row.filter(
          (cell) =>
            typeof cell === "string" &&
            staffKeywords.some((keyword) => cell.includes(keyword)),
        ).length;

        if (matches > bestStaffMatch) {
          bestStaffMatch = matches;
          staffHeaderIndex = i;
        }
      }

      rawStaff = xlsx.utils.sheet_to_json(sheet2, {
        range: staffHeaderIndex,
      });
    }
  }

  if (!rawSchedule || rawSchedule.length === 0) {
    throw new Error("找不到服務紀錄 (無法辨識檔案格式或資料為空)");
  }

  const normalizeKeys = (row) => {
    const normalized = {};
    Object.keys(row).forEach((key) => {
      normalized[key.trim()] = row[key];
    });
    return normalized;
  };

  const firstRow = normalizeKeys(rawSchedule[0]);
  const keys = Object.keys(firstRow);
  const findKey = (keywords, exclude = []) =>
    keys.find(
      (key) =>
        keywords.some((keyword) => key.includes(keyword)) &&
        !exclude.some((excluded) => key.includes(excluded)),
    );

  const isTimeRangeValue = (value) => {
    if (typeof value !== "string") return false;
    const matches = value.match(/(\d{1,2}:\d{2})/g);
    return matches && matches.length >= 2;
  };

  const dateKey = findKey(["服務日期", "日期", "Date"]);
  const staffKey =
    findKey(["居服員", "照服員", "服務人員", "服務員"], ["編號", "ID"]) ||
    findKey(["姓名", "Staff", "Name"], ["編號", "ID", "家屬", "案主", "受照顧者"]);

  const timeCandidates = keys.filter((key) =>
    ["時間", "Time", "起迄", "區間", "排班"].some((keyword) =>
      key.includes(keyword),
    ),
  );

  let timeKey = null;
  for (const candidate of timeCandidates) {
    const validRows = rawSchedule.slice(0, 10).filter((row) => row[candidate]);
    const isRangeColumn = validRows.some((row) => isTimeRangeValue(row[candidate]));
    if (isRangeColumn) {
      timeKey = candidate;
      if (candidate.includes("起迄") || candidate.includes("區間")) break;
      break;
    }
  }

  if (!timeKey) {
    timeKey =
      findKey(["起迄", "起訖", "區間", "Range", "Start"]) ||
      findKey(["服務時間", "Time"], ["核定", "總", "數", "Total", "Count", "Duration"]) ||
      findKey(["時間"], ["核定", "總", "數"]);
  }

  const normalizedSchedule = rawSchedule.map((row) => normalizeKeys(row));

  if (timeKey) {
    const sampleRows = normalizedSchedule.slice(0, 50).filter((row) => row[timeKey]);
    const validCount = sampleRows.filter((row) => isTimeRangeValue(row[timeKey])).length;

    if (validCount < sampleRows.length * 0.2 && sampleRows.length > 5) {
      for (const key of keys) {
        const checkRows = normalizedSchedule.slice(0, 50).filter((row) => row[key]);
        const checkCount = checkRows.filter((row) => isTimeRangeValue(row[key])).length;
        if (checkCount > checkRows.length * 0.5) {
          timeKey = key;
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

  const dates = normalizedSchedule
    .map((row) => row[dateKey])
    .filter(Boolean)
    .map((dateValue) => {
      try {
        if (dateValue instanceof Date) return dateValue;
        return new Date(dateValue);
      } catch {
        return null;
      }
    })
    .filter((dateValue) => isValid(dateValue));

  let dateHint = "";
  if (dates.length > 0) {
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));
    dateHint = `${format(minDate, "yyyy-MM-dd")} ~ ${format(maxDate, "yyyy-MM-dd")}`;
  }

  let uniqueStaff = [];
  let sheet2Valid = false;
  if (rawStaff.length > 0) {
    const firstStaffRow = rawStaff[0];
    const staffKeys = Object.keys(firstStaffRow);
    const staffNameKey = staffKeys.find((key) =>
      ["姓名", "Name", "服務員", "照服員"].some((keyword) => key.includes(keyword)),
    );
    const staffIdKey = staffKeys.find((key) =>
      ["員編", "ID", "編號"].some((keyword) => key.includes(keyword)),
    );

    if (staffNameKey) {
      uniqueStaff = rawStaff
        .map((staff) => ({
          id: String(staff[staffIdKey] || "Unknown"),
          name: String(staff[staffNameKey] || "Unknown Name").trim(),
        }))
        .filter(
          (staff) =>
            staff.name !== "Unknown Name" &&
            staff.name !== "null" &&
            staff.name !== "",
        );

      if (uniqueStaff.length > 0) {
        sheet2Valid = true;
      }
    }
  }

  if (!sheet2Valid) {
    const names = new Set(
      normalizedSchedule.map((row) => row[staffKey]).filter(Boolean),
    );
    uniqueStaff = Array.from(names).map((name, index) => ({
      id: `GEN-${index}`,
      name: String(name).trim(),
    }));
  }

  const normalizedStaffData = uniqueStaff.map((staff, index) => {
    const sourceStaffId = String(staff.id || `GEN-${index}`);
    const name = String(staff.name || "").trim();

    return {
      ...staff,
      sheetOrder: index,
      id: sourceStaffId,
      sourceStaffId,
      name,
      staffKey: createScopedStaffKey(orgId, sourceStaffId, name),
    };
  });

  const staffKeyByName = new Map(
    normalizedStaffData.map((staff) => [staff.name, staff.staffKey]),
  );

  const scheduleData = normalizedSchedule.map((row) => {
    const staffName = String(row[staffKey] || "").trim();
    return {
      服務日期: row[dateKey],
      服務時間: row[timeKey],
      服務人員: staffName,
      __orgId: orgId,
      __staffKey: staffKeyByName.get(staffName) || `${orgId}::NAME::${staffName}`,
      ...row,
    };
  });

  const discoveredCases = new Set();
  scheduleData.forEach((row) => {
    const timeValue = row["服務時間"];
    if (typeof timeValue !== "string") return;

    const caseMatch = timeValue.match(
      /\d{1,2}:\d{2}\s*[~～-]\s*\d{1,2}:\d{2}\s+(.+)$/,
    );
    if (caseMatch) {
      discoveredCases.add(caseMatch[1].trim());
    }
  });

  let suggestedDate = null;
  if (dates.length > 0) {
    const minDate = new Date(Math.min(...dates));
    suggestedDate = format(minDate, "yyyy-MM-dd");
  }

  return {
    newOrg: {
      id: orgId,
      name: pendingOrgName.trim() || `機構${String.fromCharCode(65 + orgCount)}`,
      staffData: normalizedStaffData,
      scheduleData,
      fileName: file.name,
      dateRange: dateHint,
    },
    discoveredCases: Array.from(discoveredCases),
    suggestedDate,
  };
}
