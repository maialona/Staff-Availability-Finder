const TRAILING_ORG_SUFFIX = /\s*[（(][^)）]+[)）]\s*$/;

const getStaffKey = (staff) => staff.staffKey || staff.id || staff.name;

export const normalizeCrossOrgStaffName = (name = "") =>
  String(name).trim().replace(TRAILING_ORG_SUFFIX, "").trim();

export const hasCrossOrgStaffSuffix = (name = "") =>
  TRAILING_ORG_SUFFIX.test(String(name).trim());

export const buildAvailabilityStaffGroups = (staffData = []) => {
  const candidates = new Map();

  staffData.forEach((staff) => {
    const normalizedName = normalizeCrossOrgStaffName(staff.name);
    if (!normalizedName) return;

    if (!candidates.has(normalizedName)) {
      candidates.set(normalizedName, []);
    }
    candidates.get(normalizedName).push(staff);
  });

  const mergedByStaffKey = new Map();

  candidates.forEach((members, normalizedName) => {
    const membersByOrg = new Map();
    members.forEach((member) => {
      const orgId = member.orgId || "legacy";
      if (!membersByOrg.has(orgId)) membersByOrg.set(orgId, []);
      membersByOrg.get(orgId).push(member);
    });

    const hasAmbiguousOrg = [...membersByOrg.values()].some(
      (orgMembers) => orgMembers.length > 1,
    );
    const canMerge =
      membersByOrg.size >= 2 &&
      members.some((member) => hasCrossOrgStaffSuffix(member.name)) &&
      !hasAmbiguousOrg;

    if (!canMerge) return;

    const sortedMembers = [...members].sort((a, b) => {
      const orgOrder = (a.orgIdx ?? Number.MAX_SAFE_INTEGER) -
        (b.orgIdx ?? Number.MAX_SAFE_INTEGER);
      if (orgOrder !== 0) return orgOrder;
      return String(a.name).localeCompare(String(b.name), "zh-Hant");
    });
    const primaryMember =
      sortedMembers.find((member) => !hasCrossOrgStaffSuffix(member.name)) ||
      sortedMembers[0];
    const memberStaffKeys = sortedMembers.map(getStaffKey);
    const orgMemberships = sortedMembers.map((member) => ({
      orgId: member.orgId,
      orgName: member.org,
      orgIdx: member.orgIdx,
      originalName: member.name,
      staffKey: getStaffKey(member),
    }));
    const mergedStaff = {
      ...primaryMember,
      id: `cross-org::${normalizedName}`,
      staffKey: `cross-org::${normalizedName}`,
      name: normalizedName,
      org: orgMemberships.map((membership) => membership.orgName).join("、"),
      orgId: undefined,
      orgIdx: undefined,
      isCrossOrg: true,
      members: sortedMembers,
      memberStaffKeys,
      orgMemberships,
    };

    memberStaffKeys.forEach((staffKey) => {
      mergedByStaffKey.set(staffKey, mergedStaff);
    });
  });

  const emittedGroups = new Set();
  const result = [];

  staffData.forEach((staff) => {
    const staffKey = getStaffKey(staff);
    const mergedStaff = mergedByStaffKey.get(staffKey);

    if (!mergedStaff) {
      result.push(staff);
      return;
    }

    if (!emittedGroups.has(mergedStaff.staffKey)) {
      emittedGroups.add(mergedStaff.staffKey);
      result.push(mergedStaff);
    }
  });

  return result;
};
