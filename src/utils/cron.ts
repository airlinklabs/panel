import CronParser from 'cron-parser';

const MINUTES_PER_MS = 60_000;

export function isValidCron(cron: string): boolean {
  try {
    CronParser.parse(cron);
    return true;
  } catch {
    return false;
  }
}

export function nextRunFromCron(cron: string, timeOffsetMinutes = 0): Date {
  const clock = new Date(Date.now() + timeOffsetMinutes * MINUTES_PER_MS);
  return CronParser.parse(cron, { currentDate: clock }).next().toDate();
}
