import { emptySettings, materialize, type AppState, type Settings, type Shift, type Workplace } from './model';
import type { TaxType } from './tax';

const ALARMS = new Set(['none', '15', '30', '60', '120', '1440']);
const TAXES = new Set(['none', 'biz33', 'ins4', 'daily']);

function asTax(value: unknown): TaxType {
  return TAXES.has(String(value)) ? (value as TaxType) : 'none';
}

function normalizeWorkplace(value: unknown): Workplace | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<Workplace>;
  if (!raw.id || !raw.name) return null;
  return {
    id: String(raw.id),
    name: String(raw.name),
    kind: raw.kind === 'daily' ? 'daily' : 'fixed',
    color: raw.color || '#3182F6',
    wageType: raw.wageType === 'daily' || raw.wageType === 'per_job' ? raw.wageType : 'hourly',
    wage: Number(raw.wage) || 0,
    taxType: asTax(raw.taxType),
    payday: raw.payday && typeof raw.payday === 'object' ? raw.payday : { kind: 'unset' },
    rules: Array.isArray(raw.rules) ? raw.rules : [],
    holidayPay: Boolean(raw.holidayPay),
    archived: Boolean(raw.archived),
    excludedDates: Array.isArray(raw.excludedDates) ? raw.excludedDates.map(String) : [],
    absenceDates: Array.isArray(raw.absenceDates) ? raw.absenceDates.map(String) : [],
    createdOn: raw.createdOn || '2026-01-01',
    updatedAt: raw.updatedAt || new Date().toISOString(),
  };
}

function normalizeShift(value: unknown): Shift | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<Shift>;
  if (!raw.id || !raw.workplaceId || !raw.date) return null;
  return {
    id: String(raw.id),
    workplaceId: String(raw.workplaceId),
    date: String(raw.date),
    start: raw.start || '09:00',
    end: raw.end || '18:00',
    breakMin: Number(raw.breakMin) || 0,
    wageType: raw.wageType === 'daily' || raw.wageType === 'per_job' ? raw.wageType : 'hourly',
    wage: Number(raw.wage) || 0,
    taxType: asTax(raw.taxType),
    source: raw.source === 'rule' || raw.source === 'clock' ? raw.source : 'manual',
    manualOverride: Boolean(raw.manualOverride),
    absent: Boolean(raw.absent),
    memo: raw.memo || '',
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || new Date().toISOString(),
  };
}

export function serializeBackup(state: AppState): string {
  const clone: AppState = JSON.parse(JSON.stringify(state)) as AppState;
  clone.settings = { ...clone.settings, githubToken: '' };
  return JSON.stringify(clone, null, 2);
}

export function parseBackup(text: string, previous: AppState, today?: string): AppState {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('JSON 파일을 읽지 못했어요.');
  }
  if (!data || typeof data !== 'object') throw new Error('모아모아 백업 파일이 아니에요.');
  const raw = data as Partial<AppState>;
  if (!Array.isArray(raw.workplaces) || !Array.isArray(raw.shifts)) {
    throw new Error('모아모아 백업 파일이 아니에요.');
  }
  const settings: Settings = { ...emptySettings(), ...(raw.settings ?? {}) };
  if (!ALARMS.has(settings.alarm)) settings.alarm = '30';
  if (!settings.githubToken) settings.githubToken = previous.settings.githubToken;
  settings.eventSeq = settings.eventSeq && typeof settings.eventSeq === 'object' ? settings.eventSeq : {};
  settings.tombstones = Array.isArray(settings.tombstones) ? settings.tombstones : [];
  const next: AppState = {
    version: 1,
    workplaces: raw.workplaces.map(normalizeWorkplace).filter((item): item is Workplace => Boolean(item)),
    shifts: raw.shifts.map(normalizeShift).filter((item): item is Shift => Boolean(item)),
    payments: raw.payments && typeof raw.payments === 'object' ? raw.payments : {},
    goals: Array.isArray(raw.goals) ? raw.goals.filter((goal) => goal && typeof goal.amount === 'number') : [],
    settings,
  };
  return materialize(next, today ? { today } : undefined);
}
