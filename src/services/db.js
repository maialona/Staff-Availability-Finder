import Dexie from "dexie";

export const db = new Dexie("StaffFinderDB");

db.version(1).stores({
  orgs: "id, name, fileName, dateRange",
  caseSchedules: "clientName, sheetName",
  settings: "id",
});

export const orgService = {
  async getAll() {
    return db.orgs.toArray();
  },
  async saveAll(orgs) {
    await db.transaction("rw", db.orgs, async () => {
      await db.orgs.clear();
      if (orgs.length > 0) {
        await db.orgs.bulkPut(orgs);
      }
    });
  },
};

export const caseScheduleService = {
  async getAll() {
    return db.caseSchedules.toArray();
  },
  async saveAll(schedules) {
    await db.transaction("rw", db.caseSchedules, async () => {
      await db.caseSchedules.clear();
      if (schedules.length > 0) {
        await db.caseSchedules.bulkPut(schedules);
      }
    });
  },
};

export const appStateService = {
  async get(key, fallbackValue = null) {
    const record = await db.settings.get(key);
    return record ? record.data : fallbackValue;
  },
  async getMany(defaults) {
    const keys = Object.keys(defaults);
    const records = await db.settings.bulkGet(keys);

    return keys.reduce((acc, key, index) => {
      const record = records[index];
      acc[key] = record ? record.data : defaults[key];
      return acc;
    }, {});
  },
  async set(key, data) {
    await db.settings.put({ id: key, data });
  },
  async setMany(entries) {
    const records = Object.entries(entries).map(([id, data]) => ({ id, data }));
    await db.settings.bulkPut(records);
  },
};
