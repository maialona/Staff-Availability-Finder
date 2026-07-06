import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCrossRegionBonusReport,
  buildCrossRegionPairs,
  buildCrossRegionStaffDetail,
  cleanClientAddressParts,
  filterCrossRegionPairDataByStaff,
  getUniqueAddressesAndPairs,
  normalizeClientNameForAddressMatch,
  parseClientRosterWorkbook,
} from "../src/utils/cross-region.js";

const createWorkbook = () => ({
  SheetNames: ["clients"],
  Sheets: {
    clients: { marker: "clients" },
  },
});

const createXlsx = (rows) => ({
  utils: {
    sheet_to_json(sheet, options) {
      assert.equal(sheet.marker, "clients");
      assert.deepEqual(options, { header: 1, raw: false, defval: "" });
      return rows;
    },
  },
});

const createRecord = ({
  staffKey = "org::C001",
  staffName = "王小明",
  date = "2026-07-01",
  time,
}) => ({
  "服務日期": date,
  "服務時段": time,
  "服務員": staffName,
  "__staffKey": staffKey,
});

test("cleanClientAddressParts merges AO to AS while removing postal-code noise", () => {
  const cleaned = cleanClientAddressParts([
    "臺南市",
    "東區",
    "701",
    "德光里",
    "016鄰(郵遞區號: 701)林森路一段186號號",
  ]);

  assert.deepEqual(cleaned, {
    city: "臺南市",
    district: "東區",
    postalCode: "701",
    village: "德光里",
    road: "016鄰林森路一段186號",
    displayAddress: "臺南市東區德光里016鄰林森路一段186號",
    geocodeAddress: "臺南市東區德光里016鄰林森路一段186號",
  });
});

test("normalizeClientNameForAddressMatch removes schedule suffixes and outing notes", () => {
  assert.equal(normalizeClientNameForAddressMatch("蔣翁英美G"), "蔣翁英美");
  assert.equal(normalizeClientNameForAddressMatch("翁王翠連S"), "翁王翠連");
  assert.equal(normalizeClientNameForAddressMatch("陳添木A"), "陳添木");
  assert.equal(normalizeClientNameForAddressMatch("陳慧卿外出(自)"), "陳慧卿");
});

test("parseClientRosterWorkbook reads client names and AO-AS address columns", () => {
  const rows = [
    ["機構名稱"],
    ["案件編號", "姓名", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "通訊地址", "通訊鄉鎮區", "通訊郵遞區號", "通訊村里", "通訊路段"],
    ["001", "蔡美珠", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "臺南市", "永康區", "710", "勝利里", "030鄰小東路423巷8號五樓之5"],
  ];

  const result = parseClientRosterWorkbook(createWorkbook(), createXlsx(rows), "個案清冊.xls");

  assert.equal(result.fileName, "個案清冊.xls");
  assert.equal(result.clients.length, 1);
  assert.equal(result.clients[0].clientName, "蔡美珠");
  assert.equal(result.clients[0].normalizedName, "蔡美珠");
  assert.equal(
    result.clients[0].address.geocodeAddress,
    "臺南市永康區勝利里030鄰小東路423巷8號五樓之5",
  );
  assert.equal(result.byNormalizedName.get("蔡美珠").clientName, "蔡美珠");
});

test("buildCrossRegionPairs compares same-staff same-day adjacent cases only", () => {
  const roster = [
    { clientName: "甲案", normalizedName: "甲案", address: { geocodeAddress: "A" } },
    { clientName: "乙案", normalizedName: "乙案", address: { geocodeAddress: "B" } },
    { clientName: "丙案", normalizedName: "丙案", address: { geocodeAddress: "C" } },
  ];
  const scheduleData = [
    createRecord({ time: "09:00~10:00 甲案" }),
    createRecord({ time: "10:30~11:00 甲案" }),
    createRecord({ time: "13:00~14:00 乙案" }),
    createRecord({ staffKey: "org::C002", staffName: "李小華", time: "14:10~15:00 丙案" }),
  ];
  const staffData = [
    { staffKey: "org::C001", name: "王小明", org: "A" },
    { staffKey: "org::C002", name: "李小華", org: "A" },
  ];

  const result = buildCrossRegionPairs({ scheduleData, staffData, rosterClients: roster });

  assert.equal(result.pairs.length, 1);
  assert.equal(result.pairs[0].fromCaseName, "甲案");
  assert.equal(result.pairs[0].toCaseName, "乙案");
  assert.equal(result.skipped.sameClient.length, 1);
  assert.equal(result.unmatchedClients.length, 0);
});

test("buildCrossRegionBonusReport requires qualifying legs in four consecutive weeks", () => {
  const pairs = [
    { id: "1", staffKey: "s1", staffName: "王小明", date: "2026-07-01", fromCaseName: "A", toCaseName: "B" },
    { id: "2", staffKey: "s1", staffName: "王小明", date: "2026-07-08", fromCaseName: "A", toCaseName: "B" },
    { id: "3", staffKey: "s1", staffName: "王小明", date: "2026-07-15", fromCaseName: "A", toCaseName: "B" },
    { id: "4", staffKey: "s1", staffName: "王小明", date: "2026-07-22", fromCaseName: "A", toCaseName: "B" },
    { id: "5", staffKey: "s2", staffName: "李小華", date: "2026-07-01", fromCaseName: "A", toCaseName: "B" },
    { id: "6", staffKey: "s2", staffName: "李小華", date: "2026-07-15", fromCaseName: "A", toCaseName: "B" },
    { id: "7", staffKey: "s2", staffName: "李小華", date: "2026-07-22", fromCaseName: "A", toCaseName: "B" },
    { id: "8", staffKey: "s2", staffName: "李小華", date: "2026-07-29", fromCaseName: "A", toCaseName: "B" },
  ];
  const distancesByPairId = {
    1: { status: "ok", distanceMeters: 16001 },
    2: { status: "ok", distanceMeters: 17000 },
    3: { status: "ok", distanceMeters: 18000 },
    4: { status: "ok", distanceMeters: 19000 },
    5: { status: "ok", distanceMeters: 20000 },
    6: { status: "ok", distanceMeters: 20000 },
    7: { status: "ok", distanceMeters: 20000 },
    8: { status: "ok", distanceMeters: 20000 },
  };

  const report = buildCrossRegionBonusReport({ pairs, distancesByPairId });

  assert.equal(report.staffResults.length, 2);
  assert.equal(report.staffResults[0].staffName, "王小明");
  assert.equal(report.staffResults[0].eligible, true);
  assert.equal(report.staffResults[0].qualifyingLegs.length, 4);
  assert.equal(report.staffResults[1].staffName, "李小華");
  assert.equal(report.staffResults[1].eligible, false);
});

test("filterCrossRegionPairDataByStaff limits distance requests to one scoped staff key", () => {
  const pairData = {
    pairs: [
      {
        id: "s1-p1",
        staffKey: "org-a::001",
        originAddress: "A",
        destinationAddress: "B",
      },
      {
        id: "s2-p1",
        staffKey: "org-b::001",
        originAddress: "C",
        destinationAddress: "D",
      },
    ],
    skipped: {
      sameClient: [{ id: "s1-skip", staffKey: "org-a::001" }],
      sameAddress: [{ id: "s2-skip", staffKey: "org-b::001" }],
      missingAddress: [{ id: "s1-missing", staffKey: "org-a::001" }],
    },
    unmatchedClients: [],
  };

  const filtered = filterCrossRegionPairDataByStaff(pairData, "org-a::001");
  const request = getUniqueAddressesAndPairs(filtered.pairs);

  assert.deepEqual(filtered.pairs.map((pair) => pair.id), ["s1-p1"]);
  assert.deepEqual(filtered.skipped.sameClient.map((item) => item.id), ["s1-skip"]);
  assert.deepEqual(filtered.skipped.sameAddress, []);
  assert.deepEqual(filtered.skipped.missingAddress.map((item) => item.id), ["s1-missing"]);
  assert.deepEqual(request.pairs.map((pair) => pair.id), ["s1-p1"]);
});

test("buildCrossRegionStaffDetail lists every transfer status for selected staff", () => {
  const pairs = [
    {
      id: "qualified",
      staffKey: "org::kuo",
      staffName: "郭承翰",
      staffOrg: "A",
      date: "2026-07-01",
      fromStartTime: "08:00",
      fromEndTime: "09:00",
      toStartTime: "10:00",
      toEndTime: "11:00",
      fromCaseName: "A",
      toCaseName: "B",
      originAddress: "addr-a",
      destinationAddress: "addr-b",
    },
    {
      id: "below",
      staffKey: "org::kuo",
      staffName: "郭承翰",
      staffOrg: "A",
      date: "2026-07-02",
      fromStartTime: "08:00",
      fromEndTime: "09:00",
      toStartTime: "10:00",
      toEndTime: "11:00",
      fromCaseName: "C",
      toCaseName: "D",
      originAddress: "addr-c",
      destinationAddress: "addr-d",
    },
    {
      id: "failed",
      staffKey: "org::kuo",
      staffName: "郭承翰",
      staffOrg: "A",
      date: "2026-07-03",
      fromStartTime: "08:00",
      fromEndTime: "09:00",
      toStartTime: "10:00",
      toEndTime: "11:00",
      fromCaseName: "E",
      toCaseName: "F",
      originAddress: "addr-e",
      destinationAddress: "addr-f",
    },
  ];
  const skipped = {
    sameClient: [
      {
        id: "same-client",
        staffKey: "org::kuo",
        staffName: "郭承翰",
        staffOrg: "A",
        date: "2026-07-04",
        fromStartTime: "08:00",
        fromEndTime: "09:00",
        toStartTime: "10:00",
        toEndTime: "11:00",
        fromCaseName: "G",
        toCaseName: "G",
      },
    ],
    sameAddress: [
      {
        id: "same-address",
        staffKey: "org::kuo",
        staffName: "郭承翰",
        staffOrg: "A",
        date: "2026-07-05",
        fromStartTime: "08:00",
        fromEndTime: "09:00",
        toStartTime: "10:00",
        toEndTime: "11:00",
        fromCaseName: "H",
        toCaseName: "I",
        originAddress: "addr-h",
        destinationAddress: "addr-h",
      },
    ],
    missingAddress: [
      {
        id: "missing-address",
        staffKey: "org::kuo",
        staffName: "郭承翰",
        staffOrg: "A",
        date: "2026-07-06",
        fromStartTime: "08:00",
        fromEndTime: "09:00",
        toStartTime: "10:00",
        toEndTime: "11:00",
        fromCaseName: "J",
        toCaseName: "K",
      },
    ],
  };

  const detail = buildCrossRegionStaffDetail({
    staffKey: "org::kuo",
    pairs,
    skipped,
    distanceResults: {
      qualified: { status: "ok", distanceMeters: 16001, distanceKm: 16, durationSeconds: 1200 },
      below: { status: "ok", distanceMeters: 14999, distanceKm: 15, durationSeconds: 900 },
      failed: { status: "error", error: "Route matrix element failed" },
    },
  });

  assert.deepEqual(detail.rows.map((row) => row.status), [
    "qualified",
    "below-threshold",
    "failed",
    "same-client",
    "same-address",
    "missing-address",
  ]);
  assert.equal(detail.summary.total, 6);
  assert.equal(detail.summary.qualified, 1);
  assert.equal(detail.summary.belowThreshold, 1);
  assert.equal(detail.summary.failed, 1);
  assert.equal(detail.summary.skipped, 3);
});

test("buildCrossRegionBonusReport accepts distanceResults from the app", () => {
  const report = buildCrossRegionBonusReport({
    pairs: [
      {
        id: "app-distance",
        staffKey: "s1",
        staffName: "App Staff",
        date: "2026-07-01",
        fromCaseName: "A",
        toCaseName: "B",
      },
    ],
    distanceResults: {
      "app-distance": { status: "ok", distanceMeters: 16001 },
    },
  });

  assert.equal(report.failedDistances.length, 0);
  assert.equal(report.qualifyingLegs.length, 1);
});
