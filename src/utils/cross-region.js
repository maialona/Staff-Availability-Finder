const ADDRESS_COLUMN_FALLBACK = {
  city: 40,
  district: 41,
  postalCode: 42,
  village: 43,
  road: 44,
};

const DISTANCE_THRESHOLD_METERS = 15000;

const toHalfWidth = (value = "") =>
  String(value).replace(/[！-～]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0xfee0),
  );

const compactText = (value = "") =>
  toHalfWidth(value)
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const formatDateString = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;

const parseDateValue = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDateString(value);
  }

  const text = compactText(value);
  const isoMatch = text.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : formatDateString(parsed);
};

const parseTime = (dateStr, timeStr) => {
  const [hours, minutes] = String(timeStr).split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  const parsed = new Date(dateStr);
  parsed.setHours(hours, minutes, 0, 0);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const pickFirstString = (row, names) => {
  for (const name of names) {
    if (row[name]) return row[name];
  }
  return "";
};

const findValue = (row, candidates, predicate) => {
  const direct = pickFirstString(row, candidates);
  if (direct) return direct;

  return Object.values(row).find((value) => predicate(value)) || "";
};

export function normalizeClientNameForAddressMatch(value = "") {
  return compactText(value)
    .replace(/外出(?:\([^)]*\)|（[^）]*）)?$/g, "")
    .replace(/[（(][^）)]*[）)]$/g, "")
    .replace(/[GSA]$/i, "")
    .trim();
}

export function cleanClientAddressParts(parts = []) {
  const [city, district, postalCode, village, road] = parts.map(compactText);
  const cleanRoad = road
    .replace(/[（(]\s*郵遞區號\s*:\s*\d+\s*[）)]/g, "")
    .replace(/\s+/g, "")
    .replace(/號號+/g, "號")
    .trim();
  const cleanParts = [city, district, village, cleanRoad].filter(Boolean);

  return {
    city,
    district,
    postalCode,
    village,
    road: cleanRoad,
    displayAddress: cleanParts.join(""),
    geocodeAddress: cleanParts.join(""),
  };
}

const findHeaderIndex = (rows) => {
  let bestIndex = 1;
  let bestScore = -1;

  rows.slice(0, 10).forEach((row, index) => {
    const cells = Array.isArray(row) ? row.map(compactText) : [];
    const score = cells.filter((cell) =>
      ["姓名", "通訊地址", "通訊鄉鎮區", "通訊路段"].some((keyword) =>
        cell.includes(keyword),
      ),
    ).length;

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestIndex;
};

const findColumnIndex = (header, keywords, fallback) => {
  const index = header.findIndex((cell) =>
    keywords.some((keyword) => compactText(cell).includes(keyword)),
  );
  return index >= 0 ? index : fallback;
};

export function parseClientRosterWorkbook(workbook, xlsx, fileName = "") {
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(worksheet, {
    header: 1,
    raw: false,
    defval: "",
  });
  const headerIndex = findHeaderIndex(rows);
  const header = rows[headerIndex] || [];
  const nameColumn = findColumnIndex(header, ["姓名"], 1);
  const columns = {
    city: findColumnIndex(header, ["通訊地址"], ADDRESS_COLUMN_FALLBACK.city),
    district: findColumnIndex(header, ["通訊鄉鎮區"], ADDRESS_COLUMN_FALLBACK.district),
    postalCode: findColumnIndex(
      header,
      ["通訊郵遞區號"],
      ADDRESS_COLUMN_FALLBACK.postalCode,
    ),
    village: findColumnIndex(header, ["通訊村里"], ADDRESS_COLUMN_FALLBACK.village),
    road: findColumnIndex(header, ["通訊路段"], ADDRESS_COLUMN_FALLBACK.road),
  };

  const clients = rows
    .slice(headerIndex + 1)
    .map((row, index) => {
      const clientName = compactText(row?.[nameColumn]);
      if (!clientName) return null;

      const address = cleanClientAddressParts([
        row[columns.city],
        row[columns.district],
        row[columns.postalCode],
        row[columns.village],
        row[columns.road],
      ]);

      return {
        id: compactText(row?.[0]) || `${clientName}-${index}`,
        clientName,
        normalizedName: normalizeClientNameForAddressMatch(clientName),
        address,
      };
    })
    .filter((client) => client && client.address.geocodeAddress);

  const byNormalizedName = new Map();
  clients.forEach((client) => {
    if (!byNormalizedName.has(client.normalizedName)) {
      byNormalizedName.set(client.normalizedName, client);
    }
  });

  return {
    fileName,
    sheetName,
    headerIndex,
    clients,
    byNormalizedName,
  };
}

const getRosterMap = (rosterClients = []) => {
  if (rosterClients instanceof Map) return rosterClients;
  if (rosterClients?.byNormalizedName instanceof Map) return rosterClients.byNormalizedName;

  const map = new Map();
  rosterClients.forEach((client) => {
    const key = client.normalizedName || normalizeClientNameForAddressMatch(client.clientName);
    if (key && !map.has(key)) map.set(key, client);
  });
  return map;
};

const extractServiceRecord = (record, staffMap = new Map()) => {
  const dateValue = findValue(
    record,
    ["服務日期", "日期", "Date", "date", "日", "服務日"],
    (value) => Boolean(parseDateValue(value)),
  );
  const date = parseDateValue(dateValue);
  if (!date) return null;

  const timeText = compactText(
    findValue(
      record,
      ["服務時段", "時間", "Time", "time", "時段"],
      (value) => typeof value === "string" && /\d{1,2}:\d{2}.*\d{1,2}:\d{2}/.test(value),
    ),
  );
  const timeMatch = timeText.match(/(\d{1,2}:\d{2})\s*[~～-]\s*(\d{1,2}:\d{2})/);
  if (!timeMatch) return null;

  const [, startTime, endTime] = timeMatch;
  const caseMatch = timeText.match(
    /\d{1,2}:\d{2}\s*[~～-]\s*\d{1,2}:\d{2}\s+(?:\d+(?:\.\d+)?\s+)?([^\s]+)/,
  );
  const caseName = compactText(record.caseName || record.clientName || caseMatch?.[1] || "");
  if (!caseName) return null;

  const staffKey = record.__staffKey || record.staffKey || compactText(record["員工代碼"]);
  const staff = staffMap.get(staffKey) || {};
  const staffName =
    staff.name ||
    compactText(record.staffName || record["服務員"] || record["居服員"] || record["服務人員"]);

  return {
    staffKey: staffKey || staffName,
    staffName,
    staffOrg: staff.org || "",
    date,
    startTime,
    endTime,
    start: parseTime(date, startTime),
    end: parseTime(date, endTime),
    caseName,
    normalizedCaseName: normalizeClientNameForAddressMatch(caseName),
    source: record,
  };
};

const uniqueByKey = (items, keyFn) => {
  const map = new Map();
  items.forEach((item) => {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, item);
  });
  return [...map.values()];
};

const createTransferRecord = ({ from, to, fromClient = null, toClient = null, extra = {} }) => {
  const originAddress = fromClient?.address?.geocodeAddress || extra.originAddress || "";
  const destinationAddress = toClient?.address?.geocodeAddress || extra.destinationAddress || "";

  return {
    id:
      extra.id ||
      `${from.staffKey}|${from.date}|${from.startTime}-${to.startTime}|${from.normalizedCaseName}->${to.normalizedCaseName}`,
    staffKey: from.staffKey,
    staffName: from.staffName,
    staffOrg: from.staffOrg,
    date: from.date,
    fromStartTime: from.startTime,
    fromEndTime: from.endTime,
    toStartTime: to.startTime,
    toEndTime: to.endTime,
    fromCaseName: from.caseName,
    toCaseName: to.caseName,
    fromAddress: fromClient?.address || extra.fromAddress || null,
    toAddress: toClient?.address || extra.toAddress || null,
    originAddress,
    destinationAddress,
    ...extra,
  };
};

const normalizeSkippedTransfers = (skipped = {}) => ({
  sameClient: Array.isArray(skipped.sameClient) ? skipped.sameClient : [],
  sameAddress: Array.isArray(skipped.sameAddress) ? skipped.sameAddress : [],
  missingAddress: Array.isArray(skipped.missingAddress) ? skipped.missingAddress : [],
});

const getDistanceMap = ({ distancesByPairId = {}, distanceResults = null } = {}) =>
  distanceResults || distancesByPairId || {};

const compareTransferRows = (a, b) =>
  String(a.date || "").localeCompare(String(b.date || "")) ||
  String(a.fromStartTime || "").localeCompare(String(b.fromStartTime || "")) ||
  String(a.toStartTime || "").localeCompare(String(b.toStartTime || "")) ||
  String(a.fromCaseName || "").localeCompare(String(b.fromCaseName || ""), "zh-Hant");

export function buildCrossRegionPairs({
  scheduleData = [],
  staffData = [],
  rosterClients = [],
}) {
  const rosterMap = getRosterMap(rosterClients);
  const staffMap = new Map(
    staffData.map((staff) => [staff.staffKey || staff.id || staff.name, staff]),
  );
  const services = scheduleData
    .map((record) => extractServiceRecord(record, staffMap))
    .filter(Boolean);
  const unmatchedClients = [];
  const skipped = {
    sameClient: [],
    sameAddress: [],
    missingAddress: [],
  };
  const servicesByStaffDate = new Map();

  services.forEach((service) => {
    const key = `${service.staffKey}__${service.date}`;
    if (!servicesByStaffDate.has(key)) servicesByStaffDate.set(key, []);
    servicesByStaffDate.get(key).push(service);
  });

  const pairs = [];
  servicesByStaffDate.forEach((items) => {
    const sorted = [...items].sort((a, b) => a.start - b.start);

    for (let index = 0; index < sorted.length - 1; index += 1) {
      const from = sorted[index];
      const to = sorted[index + 1];
      const fromClient = rosterMap.get(from.normalizedCaseName);
      const toClient = rosterMap.get(to.normalizedCaseName);

      if (!fromClient) unmatchedClients.push({ caseName: from.caseName, normalizedName: from.normalizedCaseName });
      if (!toClient) unmatchedClients.push({ caseName: to.caseName, normalizedName: to.normalizedCaseName });
      if (!fromClient || !toClient) {
        skipped.missingAddress.push(createTransferRecord({ from, to, fromClient, toClient }));
        continue;
      }

      if (from.normalizedCaseName === to.normalizedCaseName) {
        skipped.sameClient.push(createTransferRecord({ from, to, fromClient, toClient }));
        continue;
      }

      const originAddress = fromClient.address?.geocodeAddress || "";
      const destinationAddress = toClient.address?.geocodeAddress || "";
      if (!originAddress || !destinationAddress) {
        skipped.missingAddress.push(createTransferRecord({ from, to, fromClient, toClient }));
        continue;
      }

      if (originAddress === destinationAddress) {
        skipped.sameAddress.push(
          createTransferRecord({
            from,
            to,
            fromClient,
            toClient,
            extra: { distanceMeters: 0, distanceKm: 0 },
          }),
        );
        continue;
      }

      pairs.push(createTransferRecord({ from, to, fromClient, toClient }));
    }
  });

  return {
    pairs,
    unmatchedClients: uniqueByKey(
      unmatchedClients,
      (item) => `${item.normalizedName}__${item.caseName}`,
    ).sort((a, b) => a.caseName.localeCompare(b.caseName, "zh-Hant")),
    skipped,
  };
}

const getSundayWeekStart = (dateStr) => {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setDate(date.getDate() - date.getDay());
  return formatDateString(date);
};

const hasFourConsecutiveWeeks = (weekStarts) => {
  const sorted = [...new Set(weekStarts)].sort();
  for (let index = 0; index <= sorted.length - 4; index += 1) {
    const start = new Date(`${sorted[index]}T00:00:00`);
    const expected = [0, 1, 2, 3].map((offset) => {
      const date = new Date(start);
      date.setDate(date.getDate() + offset * 7);
      return formatDateString(date);
    });
    if (expected.every((week) => sorted.includes(week))) return expected;
  }
  return [];
};

export function buildCrossRegionBonusReport({
  pairs = [],
  distancesByPairId = {},
  distanceResults = null,
  thresholdMeters = DISTANCE_THRESHOLD_METERS,
}) {
  const distanceMap = getDistanceMap({ distancesByPairId, distanceResults });
  const qualifyingLegs = [];
  const failedDistances = [];

  pairs.forEach((pair) => {
    const distance = distanceMap[pair.id];
    if (!distance || distance.status !== "ok") {
      failedDistances.push({ ...pair, distance });
      return;
    }

    if (Number(distance.distanceMeters) > thresholdMeters) {
      qualifyingLegs.push({
        ...pair,
        distanceMeters: distance.distanceMeters,
        distanceKm:
          distance.distanceKm ?? Math.round((distance.distanceMeters / 1000) * 100) / 100,
        durationSeconds: distance.durationSeconds ?? null,
        weekStart: getSundayWeekStart(pair.date),
      });
    }
  });

  const byStaff = new Map();
  qualifyingLegs.forEach((leg) => {
    if (!byStaff.has(leg.staffKey)) {
      byStaff.set(leg.staffKey, {
        staffKey: leg.staffKey,
        staffName: leg.staffName,
        staffOrg: leg.staffOrg,
        qualifyingLegs: [],
      });
    }
    byStaff.get(leg.staffKey).qualifyingLegs.push(leg);
  });

  const staffResults = [...byStaff.values()]
    .map((staff) => {
      const weeks = [...new Set(staff.qualifyingLegs.map((leg) => leg.weekStart))].sort();
      const consecutiveWeeks = hasFourConsecutiveWeeks(weeks);
      return {
        ...staff,
        weeks,
        consecutiveWeeks,
        eligible: consecutiveWeeks.length >= 4,
      };
    })
    .sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      if (b.weeks.length !== a.weeks.length) return b.weeks.length - a.weeks.length;
      return a.staffName.localeCompare(b.staffName, "zh-Hant");
    });

  return {
    thresholdMeters,
    staffResults,
    qualifyingLegs,
    failedDistances,
  };
}

export function filterCrossRegionPairDataByStaff(pairData = {}, staffKey = "") {
  const skipped = normalizeSkippedTransfers(pairData.skipped);
  const matchesStaff = (item) => item.staffKey === staffKey;

  return {
    pairs: (pairData.pairs || []).filter(matchesStaff),
    unmatchedClients: pairData.unmatchedClients || [],
    skipped: {
      sameClient: skipped.sameClient.filter(matchesStaff),
      sameAddress: skipped.sameAddress.filter(matchesStaff),
      missingAddress: skipped.missingAddress.filter(matchesStaff),
    },
  };
}

export function buildCrossRegionStaffDetail({
  staffKey = "",
  pairs = [],
  skipped = {},
  distancesByPairId = {},
  distanceResults = null,
  thresholdMeters = DISTANCE_THRESHOLD_METERS,
}) {
  const distanceMap = getDistanceMap({ distancesByPairId, distanceResults });
  const normalizedSkipped = normalizeSkippedTransfers(skipped);
  const matchesStaff = (item) => !staffKey || item.staffKey === staffKey;
  const rows = [];

  pairs.filter(matchesStaff).forEach((pair) => {
    const distance = distanceMap[pair.id];
    const distanceMeters = Number(distance?.distanceMeters);
    const isOk = distance?.status === "ok" && Number.isFinite(distanceMeters);
    const status = !distance
      ? "pending"
      : !isOk
        ? "failed"
        : distanceMeters > thresholdMeters
          ? "qualified"
          : "below-threshold";

    rows.push({
      ...pair,
      status,
      distance,
      distanceMeters: isOk ? distanceMeters : null,
      distanceKm: isOk
        ? distance.distanceKm ?? Math.round((distanceMeters / 1000) * 100) / 100
        : null,
      durationSeconds: isOk ? distance.durationSeconds ?? null : null,
      error: distance?.error || "",
    });
  });

  normalizedSkipped.sameClient.filter(matchesStaff).forEach((item) => {
    rows.push({ ...item, status: "same-client", distanceMeters: 0, distanceKm: 0 });
  });
  normalizedSkipped.sameAddress.filter(matchesStaff).forEach((item) => {
    rows.push({ ...item, status: "same-address", distanceMeters: 0, distanceKm: 0 });
  });
  normalizedSkipped.missingAddress.filter(matchesStaff).forEach((item) => {
    rows.push({ ...item, status: "missing-address", distanceMeters: null, distanceKm: null });
  });

  rows.sort(compareTransferRows);

  return {
    rows,
    summary: {
      total: rows.length,
      qualified: rows.filter((row) => row.status === "qualified").length,
      belowThreshold: rows.filter((row) => row.status === "below-threshold").length,
      failed: rows.filter((row) => row.status === "failed").length,
      skipped: rows.filter((row) =>
        ["same-client", "same-address", "missing-address"].includes(row.status),
      ).length,
      pending: rows.filter((row) => row.status === "pending").length,
    },
  };
}

export function getUniqueAddressesAndPairs(pairs = []) {
  const routablePairs = pairs.filter(
    (pair) =>
      pair.originAddress &&
      pair.destinationAddress &&
      pair.originAddress !== pair.destinationAddress,
  );
  const addresses = [
    ...new Set(
      routablePairs.flatMap((pair) => [pair.originAddress, pair.destinationAddress]).filter(Boolean),
    ),
  ];
  return {
    addresses,
    pairs: routablePairs.map((pair) => ({
      id: pair.id,
      originAddress: pair.originAddress,
      destinationAddress: pair.destinationAddress,
    })),
  };
}
