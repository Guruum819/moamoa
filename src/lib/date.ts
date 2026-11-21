const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function seoulToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function seoulTime(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  let h = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const m = parts.find((p) => p.type === 'minute')?.value ?? '00';
  if (h === '24') h = '00';
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
}

export function weekdayIndex(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function weekdayLabel(iso: string): string {
  return WEEKDAYS[weekdayIndex(iso)];
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + days));
  return utc.toISOString().slice(0, 10);
}

export function diffDays(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / 86400000);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function parseIso(iso: string): { year: number; month: number; day: number } {
  const [year, month, day] = iso.split('-').map(Number);
  return { year, month, day };
}

export function monthKey(year: number, month: number): string {
  return `${year}-${pad2(month)}`;
}

export function shiftMonth(iso: string): string {
  return iso.slice(0, 7);
}

export function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function nextMonthOnDay(iso: string, day: number): string {
  const { year, month } = parseIso(iso);
  const next = addMonths(year, month, 1);
  const dim = daysInMonth(next.year, next.month);
  const d = Math.min(Math.max(1, day), dim);
  return isoDate(next.year, next.month, d);
}

export function eachDate(start: string, end: string): string[] {
  const out: string[] = [];
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) out.push(cursor);
  return out;
}

/** Monday–Sunday week containing iso. */
export function weekBounds(iso: string): { start: string; end: string } {
  const wd = weekdayIndex(iso);
  const offsetToMon = wd === 0 ? -6 : 1 - wd;
  const start = addDays(iso, offsetToMon);
  return { start, end: addDays(start, 6) };
}

export function seoulDateTimeToUtc(date: string, time: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh - 9, mm, 0));
}

export function formatWon(n: number): string {
  const rounded = Math.round(n);
  const sign = rounded < 0 ? '-' : '';
  return `${sign}${Math.abs(rounded).toLocaleString('ko-KR')}원`;
}

export function formatMd(iso: string): string {
  const { month, day } = parseIso(iso);
  return `${month}/${day}`;
}

export function formatKoreanDate(iso: string): string {
  const { month, day } = parseIso(iso);
  return `${month}월 ${day}일 (${weekdayLabel(iso)})`;
}

export function formatMonthTitle(year: number, month: number): string {
  return `${year}년 ${month}월`;
}

export function formatHours(minutes: number): string {
  const safe = Math.max(0, minutes);
  const hours = Math.round((safe / 60) * 10) / 10;
  if (Number.isInteger(hours)) return `${hours}시간`;
  return `${hours}시간`;
}

export function ddayLabel(today: string, target: string): string {
  const d = diffDays(today, target);
  if (d === 0) return '오늘';
  if (d > 0) return `D-${d}`;
  return `D+${-d}`;
}

export function countdownLabel(now: Date, date: string, time: string): string {
  const target = seoulDateTimeToUtc(date, time);
  const diff = target.getTime() - now.getTime();
  if (diff <= 0) return '지남';
  if (diff < 24 * 60 * 60 * 1000) {
    const mins = Math.floor(diff / 60000);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h <= 0) return `${m}분 남음`;
    return `${h}시간 ${m}분 남음`;
  }
  const d = diffDays(seoulToday(now), date);
  return `D-${Math.max(d, 1)}`;
}

export function icsUtc(date = new Date()): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function durationMinutes(start: string, end: string, breakMin: number): number {
  let mins = minutesOf(end) - minutesOf(start);
  if (mins <= 0) mins += 24 * 60;
  mins -= breakMin;
  return Math.max(0, mins);
}

export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const as = minutesOf(aStart);
  let ae = minutesOf(aEnd);
  if (ae <= as) ae += 1440;
  const bs = minutesOf(bStart);
  let be = minutesOf(bEnd);
  if (be <= bs) be += 1440;
  return as < be && bs < ae;
}
