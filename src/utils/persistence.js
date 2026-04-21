export const STORAGE_KEYS = {
  orgs: "stafffind_orgs",
  selectedOrgIds: "stafffind_selected_orgs",
  bufferBuffer: "stafffind_buffer",
  filterStartTime: "stafffind_filter_start",
  filterEndTime: "stafffind_filter_end",
  filterMode: "stafffind_filter_mode",
  selectedDuration: "stafffind_duration",
  servicePeriodStart: "stafffind_period_start",
  servicePeriodEnd: "stafffind_period_end",
  minMatchingDays: "stafffind_min_matching_days",
  weekRuleMode: "stafffind_week_rule_mode",
  advancedWeekRules: "stafffind_advanced_week_rules",
  caseSettings: "stafffind_case_flexibility",
  caseScheduleData: "stafffind_case_schedule",
  caseScheduleFileName: "stafffind_case_schedule_name",
};

export const DEFAULT_PERSISTED_STATE = {
  selectedOrgIds: [],
  bufferBuffer: 15,
  filterStartTime: "",
  filterEndTime: "",
  filterMode: "manual",
  selectedDuration: null,
  servicePeriodStart: "",
  servicePeriodEnd: "",
  minMatchingDays: null,
  weekRuleMode: "count",
  advancedWeekRules: [],
  caseSettings: {},
  caseScheduleFileName: "",
};

export const createScopedStaffKey = (orgId, staffId, staffName = "") =>
  `${orgId}::${staffId || staffName}`;

const readLocalStorageJSON = (key, fallbackValue) => {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallbackValue;
  } catch {
    return fallbackValue;
  }
};

export const readLegacyPersistedState = () => {
  const duration = localStorage.getItem(STORAGE_KEYS.selectedDuration);
  const savedMinMatchingDays = localStorage.getItem(STORAGE_KEYS.minMatchingDays);

  return {
    orgs: readLocalStorageJSON(STORAGE_KEYS.orgs, []),
    caseScheduleData: readLocalStorageJSON(STORAGE_KEYS.caseScheduleData, []),
    selectedOrgIds: readLocalStorageJSON(STORAGE_KEYS.selectedOrgIds, []),
    bufferBuffer: (() => {
      const saved = localStorage.getItem(STORAGE_KEYS.bufferBuffer);
      return saved !== null ? Number(saved) : DEFAULT_PERSISTED_STATE.bufferBuffer;
    })(),
    filterStartTime:
      localStorage.getItem(STORAGE_KEYS.filterStartTime) ??
      DEFAULT_PERSISTED_STATE.filterStartTime,
    filterEndTime:
      localStorage.getItem(STORAGE_KEYS.filterEndTime) ??
      DEFAULT_PERSISTED_STATE.filterEndTime,
    filterMode:
      localStorage.getItem(STORAGE_KEYS.filterMode) ??
      DEFAULT_PERSISTED_STATE.filterMode,
    selectedDuration: duration !== null ? Number(duration) : null,
    servicePeriodStart:
      localStorage.getItem(STORAGE_KEYS.servicePeriodStart) ??
      DEFAULT_PERSISTED_STATE.servicePeriodStart,
    servicePeriodEnd:
      localStorage.getItem(STORAGE_KEYS.servicePeriodEnd) ??
      DEFAULT_PERSISTED_STATE.servicePeriodEnd,
    minMatchingDays:
      savedMinMatchingDays !== null ? Number(savedMinMatchingDays) : null,
    weekRuleMode:
      localStorage.getItem(STORAGE_KEYS.weekRuleMode) ??
      DEFAULT_PERSISTED_STATE.weekRuleMode,
    advancedWeekRules: readLocalStorageJSON(
      STORAGE_KEYS.advancedWeekRules,
      DEFAULT_PERSISTED_STATE.advancedWeekRules,
    ),
    caseSettings: readLocalStorageJSON(
      STORAGE_KEYS.caseSettings,
      DEFAULT_PERSISTED_STATE.caseSettings,
    ),
    caseScheduleFileName:
      localStorage.getItem(STORAGE_KEYS.caseScheduleFileName) ??
      DEFAULT_PERSISTED_STATE.caseScheduleFileName,
  };
};

export const normalizeOrgData = (orgs = []) =>
  orgs.map((org, orgIndex) => {
    const orgId = org.id || `ORG-${orgIndex}`;
    const staffData = (org.staffData || []).map((staff, staffIndex) => {
      const rawName = String(staff.name || "").trim();
      const baseStaffId =
        staff.sourceStaffId ||
        staff.rawId ||
        staff.localId ||
        staff.id ||
        `GEN-${staffIndex}`;
      const sourceStaffId = String(baseStaffId);
      const staffKey = createScopedStaffKey(orgId, sourceStaffId, rawName);

      return {
        ...staff,
        sheetOrder:
          Number.isFinite(Number(staff.sheetOrder)) ? Number(staff.sheetOrder) : staffIndex,
        id: sourceStaffId,
        sourceStaffId,
        name: rawName,
        staffKey,
      };
    });

    const staffKeyByName = new Map(
      staffData.map((staff) => [staff.name, staff.staffKey]),
    );

    const scheduleData = (org.scheduleData || []).map((row) => {
      const staffName = String(row["服務人員"] || "").trim();
      const resolvedStaffKey =
        row.__staffKey ||
        staffKeyByName.get(staffName) ||
        `${orgId}::NAME::${staffName}`;

      return {
        ...row,
        服務人員: staffName,
        __orgId: row.__orgId || orgId,
        __staffKey: resolvedStaffKey,
      };
    });

    return {
      ...org,
      id: orgId,
      staffData,
      scheduleData,
    };
  });
