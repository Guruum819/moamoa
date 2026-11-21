import { useMemo, useState } from 'react';
import { addMonths, formatKoreanDate, formatMonthTitle, formatWon, parseIso, seoulToday } from '../lib/date';
import { listBundles, monthSummary, paymentOf, shiftPay, type PlaceKind } from '../lib/model';
import { useStore } from '../store';
import { MonthGrid, Segment } from '../ui';

export function Calendar({ onAdd, onShift }: { onAdd: (workplaceId?: string, date?: string) => void; onShift: (id: string) => void }) {
  const { state, now } = useStore();
  const today = seoulToday(now);
  const initial = parseIso(today);
  const [cursor, setCursor] = useState({ year: initial.year, month: initial.month });
  const [selected, setSelected] = useState(today);
  const [mode, setMode] = useState<'work' | 'pay'>('work');
  const [filter, setFilter] = useState('all');
  const places = state.workplaces.filter((wp) => !wp.archived);

  const visibleShift = (workplaceId: string) => {
    const wp = state.workplaces.find((item) => item.id === workplaceId);
    if (!wp) return false;
    if (filter === 'all') return true;
    if (filter === 'fixed' || filter === 'daily') return wp.kind === (filter as PlaceKind);
    return wp.id === filter;
  };

  const dots = useMemo(() => {
    const map: Record<string, string[]> = {};
    if (mode === 'work') {
      for (const shift of state.shifts) {
        if (!visibleShift(shift.workplaceId)) continue;
        const wp = state.workplaces.find((item) => item.id === shift.workplaceId);
        if (!wp) continue;
        const list = map[shift.date] ?? [];
        list.push(wp.color);
        map[shift.date] = list;
      }
    } else {
      for (const bundle of listBundles(state, today)) {
        if (!bundle.payday || !visibleShift(bundle.workplaceId)) continue;
        const wp = state.workplaces.find((item) => item.id === bundle.workplaceId);
        if (!wp) continue;
        const list = map[bundle.payday] ?? [];
        if (!list.includes(wp.color)) list.push(wp.color);
        map[bundle.payday] = list;
      }
    }
    return map;
    // filter is part of the view identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, mode, filter, today]);

  const summary = monthSummary(
    {
      ...state,
      shifts: state.shifts.filter((shift) => visibleShift(shift.workplaceId)),
      workplaces: state.workplaces.filter((wp) => visibleShift(wp.id)),
    },
    cursor.year,
    cursor.month,
    today,
  );
  const dayShifts = state.shifts
    .filter((shift) => shift.date === selected && visibleShift(shift.workplaceId))
    .sort((a, b) => a.start.localeCompare(b.start));
  const dayPays = listBundles(state, today).filter((bundle) => bundle.payday === selected && visibleShift(bundle.workplaceId));
  const move = (delta: number) => setCursor((current) => addMonths(current.year, current.month, delta));

  return (
    <div className="page">
      <header className="top">
        <h1>달력</h1>
      </header>
      <Segment
        label="달력 보기"
        value={mode}
        onChange={setMode}
        options={[
          { id: 'work', label: '근무 보기' },
          { id: 'pay', label: '급여일 보기' },
        ]}
      />
      <div className="chips scroll">
        <button type="button" className={filter === 'all' ? 'chip on' : 'chip'} onClick={() => setFilter('all')}>전체</button>
        <button type="button" className={filter === 'fixed' ? 'chip on' : 'chip'} onClick={() => setFilter('fixed')}>고정</button>
        <button type="button" className={filter === 'daily' ? 'chip on' : 'chip'} onClick={() => setFilter('daily')}>일일</button>
        {places.map((wp) => (
          <button key={wp.id} type="button" className={filter === wp.id ? 'chip on' : 'chip'} onClick={() => setFilter(wp.id)}>
            <i className="mini-dot" style={{ background: wp.color }} />
            {wp.name}
          </button>
        ))}
      </div>
      <section className="card cal-card">
        <div className="month-bar">
          <button type="button" onClick={() => move(-1)} aria-label="이전 달">‹</button>
          <strong>{formatMonthTitle(cursor.year, cursor.month)}</strong>
          <button type="button" onClick={() => move(1)} aria-label="다음 달">›</button>
        </div>
        <MonthGrid year={cursor.year} month={cursor.month} today={today} selected={[selected]} mode="view" dots={dots} onPick={setSelected} />
      </section>
      <p className="cal-foot">
        {mode === 'work'
          ? `이번 달 근무 ${summary.count}건 / 예상 실수령 ${formatWon(summary.net)}`
          : `이번 달 급여 ${dayCount(state, cursor.year, cursor.month, visibleShift)}건 / 받을 돈 ${formatWon(paySum(state, cursor.year, cursor.month, today, visibleShift))}`}
      </p>
      <section className="card">
        <div className="card-h">
          <h2>{formatKoreanDate(selected)}</h2>
          <button type="button" onClick={() => onAdd(undefined, selected)}>+ 추가</button>
        </div>
        {mode === 'work' && dayShifts.length === 0 && <p className="empty">이 날 근무가 없어요.</p>}
        {mode === 'work' && (
          <ul className="rows">
            {dayShifts.map((shift) => {
              const wp = state.workplaces.find((item) => item.id === shift.workplaceId);
              const pay = shiftPay(shift);
              return (
                <li key={shift.id}>
                  <button type="button" className="shift-line" onClick={() => onShift(shift.id)}>
                    <i className="dot" style={{ background: wp?.color }} />
                    <span>
                      <strong>{wp?.name}{shift.absent ? ' · 결근' : ''}</strong>
                      <em>{shift.start}–{shift.end}{shift.absent ? '' : ` · ${formatWon(pay.net)}`}</em>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {mode === 'pay' && dayPays.length === 0 && <p className="empty">이 날 급여일이 없어요.</p>}
        {mode === 'pay' && (
          <ul className="rows">
            {dayPays.map((bundle) => {
              const wp = state.workplaces.find((item) => item.id === bundle.workplaceId);
              const mark = paymentOf(state, bundle.key);
              return (
                <li key={bundle.key} className="shift-line static">
                  <i className="dot" style={{ background: wp?.color }} />
                  <span>
                    <strong>{wp?.name}{mark.received ? ' · 받았어요' : ''}</strong>
                    <em>{formatWon(bundle.net)}</em>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      </div>
  );
}

function dayCount(state: ReturnType<typeof useStore>['state'], year: number, month: number, visible: (id: string) => boolean): number {
  const key = `${year}-${String(month).padStart(2, '0')}`;
  return listBundles(state).filter((bundle) => bundle.payday && bundle.payday.startsWith(key) && visible(bundle.workplaceId)).length;
}

function paySum(state: ReturnType<typeof useStore>['state'], year: number, month: number, today: string, visible: (id: string) => boolean): number {
  const key = `${year}-${String(month).padStart(2, '0')}`;
  return listBundles(state, today)
    .filter((bundle) => bundle.month === key && bundle.payday && visible(bundle.workplaceId))
    .reduce((sum, bundle) => sum + bundle.net, 0);
}
