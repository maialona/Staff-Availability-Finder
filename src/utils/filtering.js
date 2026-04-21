import { addMinutes, areIntervalsOverlapping, isValid, subMinutes } from "date-fns";

// Shared manual time-range filter used by both the UI and AI agent query execution.
export function applyTimeFilter(
  dayAvailability,
  dateStr,
  filterStartTime,
  filterEndTime,
  bufferBuffer,
  caseSettings,
) {
  const filterStart = new Date(dateStr);
  const [sh, sm] = filterStartTime.split(":").map(Number);
  filterStart.setHours(sh, sm, 0, 0);

  const filterEnd = new Date(dateStr);
  const [eh, em] = filterEndTime.split(":").map(Number);
  filterEnd.setHours(eh, em, 0, 0);

  if (!isValid(filterStart) || !isValid(filterEnd)) {
    return { available: [], potential: [], offDuty: [] };
  }

  const reqInterval = { start: filterStart, end: filterEnd };
  const reqIntervalWithBuffer = {
    start: subMinutes(filterStart, bufferBuffer),
    end: addMinutes(filterEnd, bufferBuffer),
  };

  const available = [];
  const potential = [];
  const offDuty = [];

  dayAvailability.forEach((personAvailability) => {
    if (personAvailability.isOff) {
      offDuty.push(personAvailability);
      return;
    }

    const isFree = personAvailability.free.some(
      (freeInterval) =>
        areIntervalsOverlapping(freeInterval, reqInterval) &&
        freeInterval.start <= reqInterval.start &&
        freeInterval.end >= reqInterval.end,
    );

    if (isFree) {
      available.push(personAvailability);
      return;
    }

    const overlapping = personAvailability.busyRaw.filter((busyInterval) =>
      areIntervalsOverlapping(busyInterval, reqIntervalWithBuffer),
    );

    if (overlapping.length === 0) {
      available.push(personAvailability);
      return;
    }

    let allFlex = true;
    const flexContexts = [];

    for (const busyInterval of overlapping) {
      const settings = caseSettings[busyInterval.caseName] || {
        early: 0,
        late: 0,
        isFixed: false,
      };

      if (settings.isFixed) {
        allFlex = false;
        break;
      }

      const canMoveEarly =
        busyInterval.end.getTime() - settings.early * 60000 <=
        reqIntervalWithBuffer.start.getTime();
      const canMoveLate =
        busyInterval.start.getTime() + settings.late * 60000 >=
        reqIntervalWithBuffer.end.getTime();

      if (canMoveEarly || canMoveLate) {
        flexContexts.push({
          caseName: busyInterval.caseName,
          early: settings.early,
          late: settings.late,
          canMoveEarly,
          canMoveLate,
        });
      } else {
        allFlex = false;
        break;
      }
    }

    if (allFlex && overlapping.length > 0) {
      potential.push({ ...personAvailability, flexContexts });
    }
  });

  return { available, potential, offDuty };
}
