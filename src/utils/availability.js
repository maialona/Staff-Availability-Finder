
import { format, isValid, subMinutes, addMinutes, areIntervalsOverlapping } from 'date-fns';

// Constants
const START_OF_DAY = 7; // 07:00
const END_OF_DAY = 22; // 22:00

export const calculateDailyAvailability = (dateStr, scheduleData, staffData, bufferBuffer) => {
    if (!dateStr || !scheduleData) return [];

    try {
        // Filter schedule for selected date
        const dailyRecords = scheduleData.filter(record => {
            let recDate = record['服務日期'];
            if (!recDate) return false;
            
            // Handle Excel Date Object
            if (recDate instanceof Date) {
                 return format(recDate, 'yyyy-MM-dd') === dateStr;
            }
            // Handle String "2023/10/01" or "2023-10-01"
            try {
                if (typeof recDate === 'string' && (recDate.includes(dateStr) || recDate === dateStr)) return true;
                 const parsed = new Date(recDate);
                 if (!isNaN(parsed)) {
                     return format(parsed, 'yyyy-MM-dd') === dateStr;
                 }
            } catch(e) {}
            return false;
        });

        // Map each staff to their timeline
        return staffData.map(staff => {
            const staffRecords = dailyRecords.filter(r => r['服務人員'] === staff.name);
            
            // Parse Busy Times
            let busyIntervals = [];
            staffRecords.forEach(record => {
                const timeRange = record['服務時間']; // "HH:MM~HH:MM"
                if (!timeRange || typeof timeRange !== 'string') return;
                
                // Robust extraction: Find any two time strings "HH:MM"
                const matches = timeRange.match(/(\d{1,2}:\d{2})/g);
                if (!matches || matches.length < 2) return;

                const startStr = matches[0];
                const endStr = matches[1];

                // Construct Date objects for calculation
                // Base is dateStr 00:00
                const dayStart = new Date(dateStr);
                
                const parseTime = (str) => {
                    const [h, m] = str.trim().split(':').map(Number);
                    const d = new Date(dayStart);
                    d.setHours(h, m, 0, 0);
                    return d;
                };

                const startTime = parseTime(startStr);
                const endTime = parseTime(endStr);

                if (isValid(startTime) && isValid(endTime)) {
                     busyIntervals.push({ start: startTime, end: endTime });
                }
            });

            // Add Buffer
            const rawBlocked = busyIntervals.map(interval => ({
                start: subMinutes(interval.start, bufferBuffer),
                end: addMinutes(interval.end, bufferBuffer),
                type: 'buffered_busy',
                originalStart: interval.start,
                originalEnd: interval.end
            }));

            // Merge overlapping
            rawBlocked.sort((a, b) => a.start - b.start);

            const mergedBlocked = [];
            if (rawBlocked.length > 0) {
                let current = rawBlocked[0];
                for (let i = 1; i < rawBlocked.length; i++) {
                    const next = rawBlocked[i];
                    if (current.end >= next.start) {
                        current.end = new Date(Math.max(current.end, next.end));
                    } else {
                        mergedBlocked.push(current);
                        current = next;
                    }
                }
                mergedBlocked.push(current);
            }

            // Find Free Blocks
            const dayStartBoundary = new Date(dateStr);
            dayStartBoundary.setHours(START_OF_DAY, 0, 0, 0);
            
            const dayEndBoundary = new Date(dateStr);
            dayEndBoundary.setHours(END_OF_DAY, 0, 0, 0);

            const freeIntervals = [];
            let cursor = dayStartBoundary;

            mergedBlocked.forEach(block => {
                if (block.start > cursor) {
                    const actualEnd = new Date(Math.min(block.start, dayEndBoundary));
                    if (actualEnd > cursor) {
                        freeIntervals.push({ start: new Date(cursor), end: actualEnd });
                    }
                }
                cursor = new Date(Math.max(cursor, block.end));
            });

            if (cursor < dayEndBoundary) {
                freeIntervals.push({ start: new Date(cursor), end: dayEndBoundary });
            }

            return {
                staff,
                busyRaw: busyIntervals,
                blocked: mergedBlocked,
                free: freeIntervals,
                isFullyFree: busyIntervals.length === 0
            };
        });
    } catch (e) {
        console.error("Availability Calc Error:", e);
        return [];
    }
};
