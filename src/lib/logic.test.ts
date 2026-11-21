import { describe, expect, it } from 'vitest';
import { addDays, diffDays, weekdayIndex } from './date';
import { planFeed } from './ics';
import {
  draftFromWorkplace,
  emptyState,
  listBundles,
  materialize,
  monthSummary,
  paydayOf,
  placeScheduleStatus,
  weekHoliday,
  workplaceFromDraft,
  type AppState,
  type Shift,
  type Workplace,
} from './model';
import { applyTax, business33, dailyWorker, insurance4 } from './tax';

const TODAY = '2026-11-21';

function place(partial: Partial<Workplace> & Pick<Workplace, 'id' | 'name'>): Workplace {
  return {
    kind: 'fixed',
    color: '#3182F6',
    wageType: 'hourly',
    wage: 10320,
    taxType: 'none',
    payday: { kind: 'next_month_day', day: 15 },
    rules: [],
    holidayPay: true,
    archived: false,
    excludedDates: [],
    absenceDates: [],
    createdOn: TODAY,
    updatedAt: TODAY,
    ...partial,
  };
}

function shift(partial: Partial<Shift> & Pick<Shift, 'id' | 'workplaceId' | 'date'>): Shift {
  return {
    start: '09:00',
    end: '18:00',
    breakMin: 60,
    wageType: 'hourly',
    wage: 10320,
    taxType: 'none',
    source: 'manual',
    manualOverride: false,
    absent: false,
    memo: '',
    createdAt: TODAY,
    updatedAt: TODAY,
    ...partial,
  };
}

function state(partial: Partial<AppState> = {}): AppState {
  return { ...emptyState(), ...partial, settings: { ...emptyState().settings, ...partial.settings } };
}

describe('calendar dates', () => {
  it('knows 21 Nov 2026 is Saturday and 15 Dec is Tuesday', () => {
    expect(weekdayIndex('2026-11-21')).toBe(6);
    expect(weekdayIndex('2026-12-15')).toBe(2);
    expect(diffDays('2026-11-21', '2026-12-15')).toBe(24);
  });

  it('rolls payday to the 15th of the next month and clamps short months', () => {
    expect(paydayOf({ kind: 'next_month_day', day: 15 }, '2026-11-21')).toBe('2026-12-15');
    expect(paydayOf({ kind: 'after_days', days: 5 }, '2026-11-21')).toBe('2026-11-26');
    expect(paydayOf({ kind: 'unset' }, '2026-11-21')).toBeNull();
    expect(paydayOf({ kind: 'next_month_day', day: 31 }, '2026-01-10')).toBe('2026-02-28');
  });
});

describe('withholding', () => {
  it('turns a 100,000원 day into 96,700원 at 3.3%', () => {
    const tax = business33(100000);
    expect(tax.deduction).toBe(3300);
    expect(tax.net).toBe(96700);
    expect(tax.lines.map((line) => line.amount)).toEqual([3000, 300]);
  });

  it('withholds no daily-worker income tax at or under 187,000원 and still takes employment insurance', () => {
    const small = dailyWorker(100000);
    expect(small.lines.map((line) => line.label)).toEqual(['고용보험 0.9%']);
    expect(small.deduction).toBe(900);
    expect(small.net).toBe(99100);

    const edge = dailyWorker(187000);
    expect(edge.lines.some((line) => line.label.includes('소득세'))).toBe(false);
    expect(edge.deduction).toBe(Math.floor((187000 * 9) / 1000));

    const taxed = dailyWorker(200000);
    expect(taxed.lines.find((line) => line.label === '일용 소득세')?.amount).toBe(1350);
    expect(taxed.lines.find((line) => line.label === '지방소득세')?.amount).toBe(130);
    expect(taxed.lines.find((line) => line.label === '고용보험 0.9%')?.amount).toBe(1800);
    expect(taxed.net).toBe(200000 - 1350 - 130 - 1800);
  });

  it('matches the 2026 four-insurance payslip total for 3,000,000원', () => {
    const tax = insurance4(3000000);
    expect(tax.deduction).toBe(291522);
    expect(tax.net).toBe(3000000 - 291522);
  });

  it('leaves pay untouched when tax is off', () => {
    expect(applyTax(82560, 'none').net).toBe(82560);
  });
});

describe('schedule and holiday pay', () => {
  it('fills future rule shifts once and keeps the same id when the hours change', () => {
    const wp = place({
      id: 'cafe',
      name: '메가커피',
      rules: [
        { weekday: 1, start: '09:00', end: '18:00', breakMin: 60 },
        { weekday: 3, start: '09:00', end: '18:00', breakMin: 60 },
      ],
    });
    const first = materialize(state({ workplaces: [wp] }), { today: TODAY, nowIso: '2026-11-21T00:00:00Z' });
    const monday = first.shifts.find((item) => item.date === '2026-11-23');
    expect(monday?.id).toBe('rule_cafe_2026-11-23');
    expect(monday?.start).toBe('09:00');
    expect(first.shifts.some((item) => item.date < TODAY)).toBe(false);

    const edited = workplaceFromDraft(
      { ...draftFromWorkplace(wp), start: '10:00', end: '16:00', breakMin: 0, weekdays: [1, 3] },
      wp.id,
      wp,
    );
    const second = materialize({ ...first, workplaces: [edited] }, { today: TODAY, nowIso: '2026-11-21T01:00:00Z' });
    const again = second.shifts.find((item) => item.id === 'rule_cafe_2026-11-23');
    expect(again?.start).toBe('10:00');
    expect(materialize(second, { today: TODAY }).shifts).toHaveLength(second.shifts.length);
  });

  it('pays weekly holiday allowance only for promised hours of 15 or more, and not after an absence', () => {
    const full = place({
      id: 'full',
      name: '우리카드',
      createdOn: '2026-11-01',
      rules: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: '09:00', end: '18:00', breakMin: 60 })),
    });
    const filled = materialize(state({ workplaces: [full] }), { today: TODAY, nowIso: '2026-11-21T00:00:00Z' });
    const ok = weekHoliday(full, filled.shifts, TODAY, TODAY);
    expect(ok.hours).toBe(40);
    expect(ok.reason).toBe('on');
    expect(ok.gross).toBe(Math.round(40 * 10320 * 0.2));

    const short = place({
      id: 'short',
      name: '짧은알바',
      rules: [
        { weekday: 1, start: '09:00', end: '16:00', breakMin: 0 },
        { weekday: 3, start: '09:00', end: '16:00', breakMin: 0 },
      ],
    });
    expect(weekHoliday(short, [], TODAY, TODAY).reason).toBe('under15');
    expect(weekHoliday(short, [], TODAY, TODAY).gross).toBe(0);

    const extra = shift({ id: 'extra', workplaceId: 'short', date: '2026-11-22', start: '09:00', end: '18:00', breakMin: 0, source: 'manual' });
    expect(weekHoliday(short, [extra], TODAY, TODAY).reason).toBe('under15');

    const absent = weekHoliday(full, filled.shifts, TODAY, TODAY);
    expect(absent.gross).toBeGreaterThan(0);
    const missed = { ...full, absenceDates: ['2026-11-18'] };
    expect(weekHoliday(missed, filled.shifts, TODAY, TODAY).reason).toBe('absent');
    expect(weekHoliday({ ...full, holidayPay: false }, filled.shifts, TODAY, TODAY).reason).toBe('off');
  });

  it('groups a workplace payday and keeps unset pay separate', () => {
    const wp = place({ id: 'cafe', name: '메가커피', payday: { kind: 'next_month_day', day: 15 } });
    const daily = place({
      id: 'day',
      name: '행사',
      kind: 'daily',
      wageType: 'daily',
      wage: 100000,
      taxType: 'biz33',
      payday: { kind: 'unset' },
      holidayPay: false,
    });
    const app = state({
      workplaces: [wp, daily],
      shifts: [
        shift({ id: 'a', workplaceId: 'cafe', date: '2026-11-07' }),
        shift({ id: 'b', workplaceId: 'cafe', date: '2026-11-18' }),
        shift({ id: 'c', workplaceId: 'day', date: '2026-11-16', wageType: 'daily', wage: 100000, taxType: 'biz33', breakMin: 0 }),
      ],
    });
    const bundles = listBundles(app, TODAY);
    const cafe = bundles.find((bundle) => bundle.workplaceId === 'cafe' && bundle.payday === '2026-12-15');
    expect(cafe?.count).toBe(2);
    expect(cafe?.startDate).toBe('2026-11-07');
    expect(cafe?.endDate).toBe('2026-11-18');
    const unset = bundles.find((bundle) => bundle.workplaceId === 'day');
    expect(unset?.payday).toBeNull();
    expect(unset?.net).toBe(96700);
  });

  it('counts this month’s net with fixed and daily split', () => {
    const fixed = place({ id: 'f', name: '고정', kind: 'fixed', holidayPay: false, rules: [] });
    const daily = place({ id: 'd', name: '일일', kind: 'daily', wageType: 'daily', wage: 100000, taxType: 'biz33', holidayPay: false });
    const summary = monthSummary(
      state({
        workplaces: [fixed, daily],
        shifts: [
          shift({ id: '1', workplaceId: 'f', date: '2026-11-02' }),
          shift({ id: '2', workplaceId: 'd', date: '2026-11-16', wageType: 'daily', wage: 100000, taxType: 'biz33' }),
          shift({ id: '3', workplaceId: 'd', date: '2026-12-01', wageType: 'daily', wage: 100000, taxType: 'biz33' }),
        ],
      }),
      2026,
      11,
      TODAY,
    );
    expect(summary.count).toBe(2);
    expect(summary.dailyNet).toBe(96700);
    expect(summary.fixedNet).toBe(Math.round((8 * 10320)));
  });
});

describe('calendar feed identity', () => {
  it('keeps UIDs, bumps SEQUENCE when a shift changes, and drops deleted shifts from the subscription', () => {
    const wp = place({ id: 'cafe', name: '메가커피', rules: [], holidayPay: false });
    const base = state({
      workplaces: [wp],
      shifts: [shift({ id: 's1', workplaceId: 'cafe', date: '2026-11-23', start: '09:00', end: '13:00', breakMin: 0 })],
      settings: { ...emptyState().settings, includePayday: true, alarm: '30' },
    });
    const now = new Date('2026-11-21T02:00:00Z');
    const first = planFeed(base, now, TODAY);
    expect(first.ics).toContain('UID:shift-s1@moamoa.app');
    expect(first.ics).toContain('SEQUENCE:0');
    expect(first.ics).toMatch(/SUMMARY:메가커피\r\n/);
    expect(first.ics).not.toMatch(/SUMMARY:[^\r\n]*근무/);
    expect(first.fileIcs).toMatch(/SUMMARY:메가커피\r\n/);
    expect(first.ics).toMatch(/SUMMARY:메가커피 급여 /);
    expect(first.ics).not.toContain('METHOD:');
    expect(first.fileIcs).toContain('METHOD:PUBLISH');
    for (const line of first.ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);

    const saved: AppState = { ...base, settings: { ...base.settings, eventSeq: first.eventSeq, tombstones: first.tombstones } };
    const again = planFeed(saved, now, TODAY);
    expect(again.ics).toBe(first.ics);
    expect(again.seqDirty).toBe(false);

    const legacySeq = saved.settings.eventSeq['shift-s1@moamoa.app'];
    const legacy: AppState = {
      ...saved,
      settings: {
        ...saved.settings,
        eventSeq: {
          ...saved.settings.eventSeq,
          'shift-s1@moamoa.app': { ...legacySeq, hash: 'old-title-with-suffix', summary: '메가커피 근무' },
        },
      },
    };
    const renamed = planFeed(legacy, new Date('2026-11-21T02:30:00Z'), TODAY);
    expect(renamed.ics).toContain('UID:shift-s1@moamoa.app');
    expect(renamed.ics).toMatch(/SUMMARY:메가커피\r\n/);
    expect(renamed.ics).toContain('SEQUENCE:1');

    const moved: AppState = {
      ...saved,
      shifts: [{ ...saved.shifts[0], start: '12:00', end: '16:00' }],
    };
    const updated = planFeed(moved, new Date('2026-11-21T03:00:00Z'), TODAY);
    expect(updated.ics).toContain('UID:shift-s1@moamoa.app');
    expect(updated.ics).toContain('SEQUENCE:1');
    expect(updated.ics).toContain('DTSTART;TZID=Asia/Seoul:20261123T120000');

    const removed: AppState = {
      ...saved,
      settings: { ...saved.settings, eventSeq: updated.eventSeq, tombstones: updated.tombstones },
      shifts: [],
    };
    const gone = planFeed(removed, new Date('2026-11-21T04:00:00Z'), TODAY);
    expect(gone.ics).not.toContain('UID:shift-s1@moamoa.app');
    expect(gone.fileIcs).toContain('UID:shift-s1@moamoa.app');
    expect(gone.fileIcs).toContain('STATUS:CANCELLED');
    expect(gone.fileIcs).toContain('SEQUENCE:2');
  });

  it('does not duplicate a payday event when the amount changes', () => {
    const wp = place({ id: 'cafe', name: '메가커피', payday: { kind: 'after_days', days: 0 }, holidayPay: false, rules: [] });
    const app = state({
      workplaces: [wp],
      shifts: [shift({ id: 's1', workplaceId: 'cafe', date: '2026-11-23', breakMin: 0, end: '13:00' })],
      settings: { ...emptyState().settings, includePayday: true },
    });
    const first = planFeed(app, new Date('2026-11-21T02:00:00Z'), TODAY);
    const uid = 'UID:pay-cafe-20261123@moamoa.app';
    expect(first.ics.split(uid).length - 1).toBe(1);
    const saved = { ...app, settings: { ...app.settings, eventSeq: first.eventSeq, tombstones: first.tombstones } };
    const richer = {
      ...saved,
      shifts: [...saved.shifts, shift({ id: 's2', workplaceId: 'cafe', date: '2026-11-23', start: '18:00', end: '21:00', breakMin: 0 })],
    };
    const second = planFeed(richer, new Date('2026-11-21T05:00:00Z'), TODAY);
    expect(second.ics.split(uid).length - 1).toBe(1);
    expect(second.ics).toContain('SEQUENCE:1');
  });
});

describe('clock status', () => {
  it('reports an in-progress shift before the next one', () => {
    const wp = place({ id: 'cafe', name: '메가커피', rules: [], holidayPay: false });
    const now = new Date('2026-11-21T06:30:00Z');
    expect(addDays('2026-11-21', 0)).toBe('2026-11-21');
    const status = placeScheduleStatus(
      wp,
      [
        shift({ id: 'now', workplaceId: 'cafe', date: '2026-11-21', start: '14:00', end: '18:00' }),
        shift({ id: 'later', workplaceId: 'cafe', date: '2026-11-22', start: '09:00', end: '13:00' }),
      ],
      now,
    );
    expect(status.kind === 'now' && status.shift.id).toBe('now');
  });
});
