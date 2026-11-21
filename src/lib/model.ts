import {
  addDays,
  addMonths,
  diffDays,
  durationMinutes,
  eachDate,
  formatKoreanDate,
  formatMd,
  isoDate,
  monthKey,
  nextMonthOnDay,
  parseIso,
  seoulTime,
  seoulToday,
  shiftMonth,
  weekBounds,
  weekdayIndex,
} from './date';
import { applyTax, type TaxType } from './tax';

export type WageType = 'hourly' | 'daily' | 'per_job';
export type PlaceKind = 'fixed' | 'daily';
export type ShiftSource = 'rule' | 'manual' | 'clock';

export type PaydayRule =
  | { kind: 'next_month_day'; day: number }
  | { kind: 'after_days'; days: number }
  | { kind: 'unset' };

export type WeekRule = {
  weekday: number;
  start: string;
  end: string;
  breakMin: number;
};

export type Workplace = {
  id: string;
  name: string;
  kind: PlaceKind;
  color: string;
  wageType: WageType;
  wage: number;
  taxType: TaxType;
  payday: PaydayRule;
  rules: WeekRule[];
  holidayPay: boolean;
  archived: boolean;
  excludedDates: string[];
  absenceDates: string[];
  createdOn: string;
  updatedAt: string;
};

export type Shift = {
  id: string;
  workplaceId: string;
  date: string;
  start: string;
  end: string;
  breakMin: number;
  wageType: WageType;
  wage: number;
  taxType: TaxType;
  source: ShiftSource;
  manualOverride: boolean;
  absent: boolean;
  memo: string;
  createdAt: string;
  updatedAt: string;
};

export type PaymentMark = { received: boolean; hidden: boolean };

export type Goal = { year: number; month: number; amount: number };

export type SeqEntry = {
  seq: number;
  hash: string;
  stamp: string;
  created: string;
  summary: string;
  date: string;
  start?: string;
  end?: string;
  allDay?: boolean;
};

export type Tombstone = {
  uid: string;
  seq: number;
  stamp: string;
  summary: string;
  date: string;
  start?: string;
  end?: string;
  allDay?: boolean;
  removedOn: string;
};

export type AlarmOption = 'none' | '15' | '30' | '60' | '120' | '1440';

export type Settings = {
  calendarName: string;
  alarm: AlarmOption;
  includePayday: boolean;
  githubToken: string;
  gistId: string;
  gistOwner: string;
  feedUrl: string;
  lastFeedHash: string;
  lastSyncAt: string;
  lastSyncError: string;
  eventSeq: Record<string, SeqEntry>;
  tombstones: Tombstone[];
};

export type AppState = {
  version: 1;
  workplaces: Workplace[];
  shifts: Shift[];
  payments: Record<string, PaymentMark>;
  goals: Goal[];
  settings: Settings;
};

export const PALETTE: { name: string; hex: string }[] = [
  { name: '파랑', hex: '#3182F6' },
  { name: '주황', hex: '#FF8A00' },
  { name: '초록', hex: '#03B26C' },
  { name: '빨강', hex: '#F04452' },
  { name: '보라', hex: '#7C5CFC' },
  { name: '청록', hex: '#13B8A6' },
  { name: '분홍', hex: '#F472B6' },
  { name: '회색', hex: '#8B95A1' },
];

export const ALARMS: { id: AlarmOption; label: string }[] = [
  { id: 'none', label: '없음' },
  { id: '15', label: '15분' },
  { id: '30', label: '30분' },
  { id: '60', label: '1시간' },
  { id: '120', label: '2시간' },
  { id: '1440', label: '전날' },
];

export function emptySettings(): Settings {
  return {
    calendarName: '모아모아',
    alarm: '30',
    includePayday: true,
    githubToken: '',
    gistId: '',
    gistOwner: '',
    feedUrl: '',
    lastFeedHash: '',
    lastSyncAt: '',
    lastSyncError: '',
    eventSeq: {},
    tombstones: [],
  };
}

export function emptyState(): AppState {
  return {
    version: 1,
    workplaces: [],
    shifts: [],
    payments: {},
    goals: [],
    settings: emptySettings(),
  };
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function paydayOf(rule: PaydayRule, date: string): string | null {
  if (rule.kind === 'unset') return null;
  if (rule.kind === 'after_days') return addDays(date, Math.max(0, rule.days));
  return nextMonthOnDay(date, rule.day);
}

export function paydayLabel(rule: PaydayRule): string {
  if (rule.kind === 'unset') return '미정';
  if (rule.kind === 'after_days') return `근무 후 ${rule.days}일`;
  return `다음 달 ${rule.day}일`;
}

export function wageLabel(type: WageType, amount: number): string {
  const won = Math.round(amount).toLocaleString('ko-KR');
  if (type === 'hourly') return `시급 ${won}원`;
  if (type === 'daily') return `일당 ${won}원`;
  return `건당 ${won}원`;
}

export function shiftGross(shift: Pick<Shift, 'wageType' | 'wage' | 'start' | 'end' | 'breakMin' | 'absent'>): number {
  if (shift.absent) return 0;
  if (shift.wageType === 'hourly') {
    const mins = durationMinutes(shift.start, shift.end, shift.breakMin);
    return Math.round((mins / 60) * shift.wage);
  }
  return Math.max(0, Math.round(shift.wage));
}

export function shiftPay(shift: Shift): { gross: number; net: number; deduction: number } {
  const gross = shiftGross(shift);
  const taxed = applyTax(gross, shift.taxType);
  return { gross, net: taxed.net, deduction: taxed.deduction };
}

export function weeklyContract(wp: Workplace): { hours: number; holiday: number; eligible: boolean } {
  let minutes = 0;
  let flatPay = 0;
  for (const rule of wp.rules) {
    const mins = durationMinutes(rule.start, rule.end, rule.breakMin);
    minutes += mins;
    if (wp.wageType !== 'hourly') flatPay += wp.wage;
  }
  const hours = minutes / 60;
  const holiday =
    wp.wageType === 'hourly' ? Math.round(hours * wp.wage * 0.2) : Math.round(flatPay * 0.2);
  return { hours, holiday, eligible: hours >= 15 - 1e-6 };
}

export type HolidayReason = 'on' | 'off' | 'under15' | 'absent' | 'none' | 'soon';

export function weekHoliday(
  wp: Workplace,
  shifts: Shift[],
  anyDay: string,
  today: string,
): { gross: number; reason: HolidayReason; hours: number } {
  if (wp.kind !== 'fixed' || wp.archived) return { gross: 0, reason: 'none', hours: 0 };
  const contract = weeklyContract(wp);
  if (!wp.holidayPay) return { gross: 0, reason: 'off', hours: contract.hours };
  if (!contract.eligible) return { gross: 0, reason: 'under15', hours: contract.hours };
  const { start, end } = weekBounds(anyDay);
  for (let date = start; date <= end; date = addDays(date, 1)) {
    if (date < wp.createdOn && wp.rules.some((rule) => rule.weekday === weekdayIndex(date))) {
      return { gross: 0, reason: 'soon', hours: contract.hours };
    }
  }
  for (let date = start; date <= end; date = addDays(date, 1)) {
    if (date < wp.createdOn) continue;
    const wd = weekdayIndex(date);
    if (!wp.rules.some((rule) => rule.weekday === wd)) continue;
    if (wp.absenceDates.includes(date)) return { gross: 0, reason: 'absent', hours: contract.hours };
    const dayShifts = shifts.filter((shift) => shift.workplaceId === wp.id && shift.date === date);
    if (dayShifts.some((shift) => shift.absent)) return { gross: 0, reason: 'absent', hours: contract.hours };
    if (date < today && dayShifts.length === 0) return { gross: 0, reason: 'absent', hours: contract.hours };
  }
  return { gross: contract.holiday, reason: 'on', hours: contract.hours };
}

function weeksEndingInMonth(year: number, month: number): string[] {
  const sundays: string[] = [];
  const dim = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (let day = 1; day <= dim; day += 1) {
    const iso = isoDate(year, month, day);
    if (weekdayIndex(iso) === 0) sundays.push(iso);
  }
  return sundays;
}

export function monthHoliday(state: AppState, year: number, month: number, today = seoulToday()): number {
  let total = 0;
  for (const wp of state.workplaces) {
    if (wp.kind !== 'fixed' || wp.archived) continue;
    for (const sunday of weeksEndingInMonth(year, month)) {
      total += weekHoliday(wp, state.shifts, sunday, today).gross;
    }
  }
  return total;
}

export type MonthSummary = {
  gross: number;
  net: number;
  fixedNet: number;
  dailyNet: number;
  holiday: number;
  count: number;
};

export function monthSummary(state: AppState, year: number, month: number, today = seoulToday()): MonthSummary {
  const key = monthKey(year, month);
  let gross = 0;
  let net = 0;
  let fixedNet = 0;
  let dailyNet = 0;
  let count = 0;
  for (const shift of state.shifts) {
    if (shiftMonth(shift.date) !== key || shift.absent) continue;
    const wp = state.workplaces.find((item) => item.id === shift.workplaceId);
    const pay = shiftPay(shift);
    gross += pay.gross;
    net += pay.net;
    count += 1;
    if (wp?.kind === 'daily') dailyNet += pay.net;
    else fixedNet += pay.net;
  }
  const holiday = monthHoliday(state, year, month, today);
  return { gross: gross + holiday, net: net + holiday, fixedNet: fixedNet + holiday, dailyNet, holiday, count };
}

export type Bundle = {
  key: string;
  workplaceId: string;
  payday: string | null;
  shiftIds: string[];
  startDate: string;
  endDate: string;
  count: number;
  gross: number;
  net: number;
  holiday: number;
  month: string;
};

export function bundleKey(workplaceId: string, payday: string | null, workMonth: string): string {
  if (payday) return `${workplaceId}|pay|${payday}`;
  return `${workplaceId}|unset|${workMonth}`;
}

export function listBundles(state: AppState, today = seoulToday()): Bundle[] {
  const map = new Map<string, Bundle>();
  const ensure = (key: string, workplaceId: string, payday: string | null, month: string): Bundle => {
    const found = map.get(key);
    if (found) return found;
    const created: Bundle = {
      key,
      workplaceId,
      payday,
      shiftIds: [],
      startDate: '9999-99-99',
      endDate: '0000-00-00',
      count: 0,
      gross: 0,
      net: 0,
      holiday: 0,
      month,
    };
    map.set(key, created);
    return created;
  };

  for (const shift of state.shifts) {
    if (shift.absent) continue;
    const wp = state.workplaces.find((item) => item.id === shift.workplaceId);
    if (!wp) continue;
    const payday = paydayOf(wp.payday, shift.date);
    const workMonth = shiftMonth(shift.date);
    const key = bundleKey(wp.id, payday, workMonth);
    const bundle = ensure(key, wp.id, payday, payday ? shiftMonth(payday) : workMonth);
    const pay = shiftPay(shift);
    bundle.shiftIds.push(shift.id);
    bundle.count += 1;
    bundle.gross += pay.gross;
    bundle.net += pay.net;
    if (shift.date < bundle.startDate) bundle.startDate = shift.date;
    if (shift.date > bundle.endDate) bundle.endDate = shift.date;
  }

  const horizonStart = addDays(today, -160);
  const horizonEnd = addDays(today, 200);
  for (const wp of state.workplaces) {
    if (wp.kind !== 'fixed') continue;
    for (let sunday = weekBounds(horizonStart).end; sunday <= horizonEnd; sunday = addDays(sunday, 7)) {
      const holiday = weekHoliday(wp, state.shifts, sunday, today);
      if (holiday.gross <= 0) continue;
      const payday = paydayOf(wp.payday, sunday);
      const workMonth = shiftMonth(sunday);
      const key = bundleKey(wp.id, payday, workMonth);
      const bundle = ensure(key, wp.id, payday, payday ? shiftMonth(payday) : workMonth);
      bundle.holiday += holiday.gross;
      bundle.net += holiday.gross;
      bundle.gross += holiday.gross;
      if (bundle.startDate === '9999-99-99') {
        bundle.startDate = sunday;
        bundle.endDate = sunday;
      }
    }
  }

  return [...map.values()].sort((a, b) => {
    if (a.payday && b.payday) return a.payday.localeCompare(b.payday) || a.workplaceId.localeCompare(b.workplaceId);
    if (a.payday) return -1;
    if (b.payday) return 1;
    return a.month.localeCompare(b.month);
  });
}

export function paymentOf(state: AppState, key: string): PaymentMark {
  return state.payments[key] ?? { received: false, hidden: false };
}

export function bundleTitle(bundle: Bundle): string {
  if (bundle.count === 0) return '주휴수당';
  if (bundle.count === 1 || bundle.startDate === bundle.endDate) return `${formatMd(bundle.startDate)} 근무`;
  return `${formatMd(bundle.startDate)}~${formatMd(bundle.endDate)} ${bundle.count}건`;
}

export function bundleWhen(bundle: Bundle, today: string): string {
  if (!bundle.payday) return '지급일 미정';
  const tag = diffDays(today, bundle.payday) === 0 ? '오늘' : diffDays(today, bundle.payday) > 0 ? `D-${diffDays(today, bundle.payday)}` : `D+${-diffDays(today, bundle.payday)}`;
  return `${tag} ${formatKoreanDate(bundle.payday)}`;
}

export function placeScheduleStatus(
  wp: Workplace,
  shifts: Shift[],
  now = new Date(),
): { kind: 'now' | 'next'; shift: Shift } | { kind: 'none' } {
  const today = seoulToday(now);
  const time = seoulTime(now);
  const mine = shifts
    .filter((shift) => shift.workplaceId === wp.id && !shift.absent && !wp.archived)
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  const inProgress = mine.find((shift) => {
    if (shift.date !== today) return false;
    const end = shift.end <= shift.start ? '24:00' : shift.end;
    return shift.start <= time && time < end;
  });
  if (inProgress) return { kind: 'now', shift: inProgress };
  const next = mine.find((shift) => shift.date > today || (shift.date === today && shift.start > time));
  if (next) return { kind: 'next', shift: next };
  return { kind: 'none' };
}

export function goalFor(state: AppState, year: number, month: number): Goal | undefined {
  return state.goals.find((goal) => goal.year === year && goal.month === month);
}

function sameShift(a: Shift, b: Shift): boolean {
  return (
    a.start === b.start &&
    a.end === b.end &&
    a.breakMin === b.breakMin &&
    a.wageType === b.wageType &&
    a.wage === b.wage &&
    a.taxType === b.taxType &&
    a.absent === b.absent
  );
}

function ruleShift(wp: Workplace, rule: WeekRule, date: string, nowIso: string): Shift {
  return {
    id: `rule_${wp.id}_${date}`,
    workplaceId: wp.id,
    date,
    start: rule.start,
    end: rule.end,
    breakMin: rule.breakMin,
    wageType: wp.wageType,
    wage: wp.wage,
    taxType: wp.taxType,
    source: 'rule',
    manualOverride: false,
    absent: false,
    memo: '',
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export function materialize(state: AppState, opts?: { today?: string; nowIso?: string }): AppState {
  const today = opts?.today ?? seoulToday();
  const nowIso = opts?.nowIso ?? new Date().toISOString();
  const windowStart = addDays(today, -120);
  const windowEnd = addDays(today, 400);
  let shifts = state.shifts;
  let changed = false;

  const replace = (next: Shift[]) => {
    shifts = next;
    changed = true;
  };

  for (const wp of state.workplaces) {
    if (wp.archived || wp.kind !== 'fixed' || wp.rules.length === 0) continue;
    const byWeekday = new Map<number, WeekRule>();
    for (const rule of wp.rules) byWeekday.set(rule.weekday, rule);
    const from = wp.createdOn > windowStart ? wp.createdOn : windowStart;
    const removed = new Set<string>();
    for (const shift of shifts) {
      if (shift.workplaceId !== wp.id || shift.source !== 'rule' || shift.manualOverride) continue;
      if (shift.date < today) continue;
      const rule = byWeekday.get(weekdayIndex(shift.date));
      if (!rule || wp.excludedDates.includes(shift.date)) removed.add(shift.id);
    }
    if (removed.size) replace(shifts.filter((shift) => !removed.has(shift.id)));

    const additions: Shift[] = [];
    const updates = new Map<string, Shift>();
    for (const date of eachDate(from, windowEnd)) {
      if (wp.excludedDates.includes(date)) continue;
      const rule = byWeekday.get(weekdayIndex(date));
      if (!rule) continue;
      const id = `rule_${wp.id}_${date}`;
      const existing = shifts.find((shift) => shift.id === id);
      if (!existing && shifts.some((shift) => shift.workplaceId === wp.id && shift.date === date)) continue;
      if (existing) {
        if (existing.manualOverride || existing.date < today || existing.absent) continue;
        const next = { ...existing, start: rule.start, end: rule.end, breakMin: rule.breakMin, wageType: wp.wageType, wage: wp.wage, taxType: wp.taxType };
        if (!sameShift(existing, next)) updates.set(existing.id, { ...next, updatedAt: nowIso });
        continue;
      }
      additions.push(ruleShift(wp, rule, date, nowIso));
    }
    if (updates.size || additions.length) {
      replace(shifts.map((shift) => updates.get(shift.id) ?? shift).concat(additions));
    }
  }

  const tombstones = state.settings.tombstones.filter((item) => item.removedOn >= addDays(today, -200));
  const tombsChanged = tombstones.length !== state.settings.tombstones.length;
  if (!changed && !tombsChanged) return state;
  return {
    ...state,
    shifts,
    settings: tombsChanged ? { ...state.settings, tombstones } : state.settings,
  };
}

export function visibleBundles(state: AppState, today = seoulToday()): Bundle[] {
  return listBundles(state, today).filter((bundle) => {
    const mark = paymentOf(state, bundle.key);
    return !mark.hidden && !mark.received && (bundle.count > 0 || bundle.holiday > 0);
  });
}

export function receiveBundles(state: AppState, year: number, month: number, today = seoulToday()): Bundle[] {
  const key = monthKey(year, month);
  return listBundles(state, today).filter((bundle) => bundle.month === key && (bundle.count > 0 || bundle.holiday > 0));
}

export function pastUnreceivedKeys(state: AppState, today = seoulToday()): string[] {
  return listBundles(state, today)
    .filter((bundle) => bundle.payday && bundle.payday < today && !paymentOf(state, bundle.key).received)
    .map((bundle) => bundle.key);
}

export function calendarCells(year: number, month: number): (string | null)[] {
  const first = isoDate(year, month, 1);
  const lead = weekdayIndex(first);
  const dim = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= dim; day += 1) cells.push(isoDate(year, month, day));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export type PlaceDraft = {
  name: string;
  kind: PlaceKind;
  color: string;
  wageType: WageType;
  wage: number;
  taxType: TaxType;
  paydayKind: 'next_month_day' | 'after_days' | 'unset';
  paydayValue: number;
  weekdays: number[];
  start: string;
  end: string;
  breakMin: number;
  holidayPay: boolean;
  createdOn: string;
};

export function defaultPlaceDraft(kind: PlaceKind, today: string): PlaceDraft {
  if (kind === 'daily') {
    return {
      name: '',
      kind,
      color: PALETTE[1].hex,
      wageType: 'daily' as WageType,
      wage: 100000,
      taxType: 'daily' as TaxType,
      paydayKind: 'after_days' as const,
      paydayValue: 5,
      weekdays: [] as number[],
      start: '10:00',
      end: '15:00',
      breakMin: 0,
      holidayPay: false,
      createdOn: today,
    };
  }
  return {
    name: '',
    kind,
    color: PALETTE[0].hex,
    wageType: 'hourly' as WageType,
    wage: 10320,
    taxType: 'none' as TaxType,
    paydayKind: 'next_month_day' as const,
    paydayValue: 15,
    weekdays: [1, 2, 3, 4, 5],
    start: '09:00',
    end: '18:00',
    breakMin: 60,
    holidayPay: true,
    createdOn: today,
  };
}

export function draftFromWorkplace(wp: Workplace): PlaceDraft {
  const weekdays = [...new Set(wp.rules.map((rule) => rule.weekday))].sort((a, b) => a - b);
  const first = wp.rules[0];
  return {
    name: wp.name,
    kind: wp.kind,
    color: wp.color,
    wageType: wp.wageType,
    wage: wp.wage,
    taxType: wp.taxType,
    paydayKind: wp.payday.kind,
    paydayValue: wp.payday.kind === 'next_month_day' ? wp.payday.day : wp.payday.kind === 'after_days' ? wp.payday.days : 15,
    weekdays: wp.kind === 'fixed' ? weekdays : [],
    start: first?.start ?? (wp.kind === 'fixed' ? '09:00' : '10:00'),
    end: first?.end ?? (wp.kind === 'fixed' ? '18:00' : '15:00'),
    breakMin: first?.breakMin ?? (wp.kind === 'fixed' ? 60 : 0),
    holidayPay: wp.holidayPay,
    createdOn: wp.createdOn,
  };
}

export function workplaceFromDraft(draft: PlaceDraft, id: string, previous?: Workplace): Workplace {
  const payday: PaydayRule =
    draft.paydayKind === 'unset'
      ? { kind: 'unset' }
      : draft.paydayKind === 'after_days'
        ? { kind: 'after_days', days: Math.max(0, Math.round(draft.paydayValue)) }
        : { kind: 'next_month_day', day: Math.min(31, Math.max(1, Math.round(draft.paydayValue))) };
  const rules: WeekRule[] =
    draft.kind === 'fixed'
      ? draft.weekdays.map((weekday) => ({
          weekday,
          start: draft.start,
          end: draft.end,
          breakMin: Math.max(0, Math.round(draft.breakMin)),
        }))
      : [];
  const now = new Date().toISOString();
  return {
    id,
    name: draft.name.trim(),
    kind: draft.kind,
    color: draft.color,
    wageType: draft.wageType,
    wage: Math.max(0, Math.round(draft.wage)),
    taxType: draft.taxType,
    payday,
    rules,
    holidayPay: draft.kind === 'fixed' ? draft.holidayPay : false,
    archived: previous?.archived ?? false,
    excludedDates: previous?.excludedDates ?? [],
    absenceDates: previous?.absenceDates ?? [],
    createdOn: previous?.createdOn ?? draft.createdOn,
    updatedAt: now,
  };
}

export function currentMonth(now = new Date()): { year: number; month: number } {
  const today = seoulToday(now);
  const { year, month } = parseIso(today);
  return { year, month };
}

export function nextMonthOf(year: number, month: number): { year: number; month: number } {
  return addMonths(year, month, 1);
}

export function holidayCaption(reason: HolidayReason, hours: number, gross: number): string {
  const rounded = Math.round(hours * 10) / 10;
  const hourText = Number.isInteger(rounded) ? `${rounded}` : `${rounded}`;
  if (reason === 'soon') return `약속된 근무 주 ${hourText}시간 · 이번 주는 시작 전`;
  if (reason === 'under15' || reason === 'none') return `약속된 근무 주 ${hourText}시간 · 계산 꺼짐`;
  if (reason === 'off') return `약속된 근무 주 ${hourText}시간 · 계산 꺼짐`;
  if (reason === 'absent') return `약속된 근무 주 ${hourText}시간 · 이번 주 결근`;
  return `약속된 근무 주 ${hourText}시간 · 이번 주 ${Math.round(gross).toLocaleString('ko-KR')}원`;
}
