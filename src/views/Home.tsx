import { countdownLabel, formatMd, formatWon, seoulToday, weekdayLabel } from '../lib/date';
import {
  bundleTitle,
  bundleWhen,
  goalFor,
  holidayCaption,
  monthSummary,
  paymentOf,
  placeScheduleStatus,
  visibleBundles,
  weekHoliday,
  wageLabel,
} from '../lib/model';
import { useStore } from '../store';
import { GearIcon } from '../ui';

export function Home({
  onSettings,
  onAdd,
  onPlaces,
  onSettle,
  onGoal,
  onClock,
  onShift,
}: {
  onSettings: () => void;
  onAdd: (workplaceId?: string) => void;
  onPlaces: () => void;
  onSettle: () => void;
  onGoal: () => void;
  onClock: () => void;
  onShift: (id: string) => void;
}) {
  const { state, now } = useStore();
  const today = seoulToday(now);
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const summary = monthSummary(state, year, month, today);
  const goal = goalFor(state, year, month);
  const ratio = goal && goal.amount > 0 ? Math.min(100, Math.round((summary.net / goal.amount) * 100)) : 0;
  const bundles = visibleBundles(state, today);
  const soon = bundles.filter((bundle) => bundle.payday);
  const unset = bundles.filter((bundle) => !bundle.payday);
  const preview = [...soon, ...unset].slice(0, 4);
  const active = state.workplaces.filter((wp) => !wp.archived);
  const fixed = active.filter((wp) => wp.kind === 'fixed');

  return (
    <div className="page">
      <header className="top">
        <h1>{month}월 장부</h1>
        <button type="button" className="icon-btn" onClick={onSettings} aria-label="설정">
          <GearIcon />
        </button>
      </header>

      <section className="card hero">
        <p className="eyebrow">이번 달 예상 실수령</p>
        <p className="hero-num">{formatWon(summary.net)}</p>
        <p className="split">
          고정 {formatWon(summary.fixedNet)} · 일일 {formatWon(summary.dailyNet)}
        </p>
        {goal ? (
          <button type="button" className="goal" onClick={onGoal}>
            <span className="goal-track">
              <span style={{ width: `${ratio}%` }} />
            </span>
            <span>목표 {formatWon(goal.amount)} · {ratio}%{summary.net >= goal.amount ? ' · 달성' : ''}</span>
          </button>
        ) : (
          <button type="button" className="text-link" onClick={onGoal}>
            이번 달 목표 정하기
          </button>
        )}
      </section>

      <section className="card">
        <div className="card-h">
          <h2>근무지</h2>
          <div className="card-actions">
            <button type="button" onClick={() => onAdd()}>+ 추가</button>
            <button type="button" onClick={onPlaces}>관리</button>
          </div>
        </div>
        {active.length === 0 && <p className="empty">아직 근무지가 없어요. 첫 곳을 추가하면 달력과 급여가 모여요.</p>}
        <ul className="rows">
          {active.map((wp) => {
            const status = placeScheduleStatus(wp, state.shifts, now);
            const nextPay =
              bundles.find((bundle) => bundle.workplaceId === wp.id && bundle.payday && bundle.payday >= today) ??
              bundles.find((bundle) => bundle.workplaceId === wp.id);
            return (
              <li key={wp.id}>
                <div className="place-row">
                  <i className="dot" style={{ background: wp.color }} />
                  <div className="place-main">
                    <strong>{wp.name}</strong>
                    {status.kind === 'none' ? (
                      <button type="button" className="inline-link" onClick={() => onAdd(wp.id)}>
                        예정된 근무 없음 · 근무 등록
                      </button>
                    ) : (
                      <button type="button" className="inline-link" onClick={() => onShift(status.shift.id)}>
                        {status.kind === 'now' ? '지금 근무 중 · ' : ''}
                        {formatMd(status.shift.date)} ({weekdayLabel(status.shift.date)}) {status.shift.start}–{status.shift.end}
                      </button>
                    )}
                    {nextPay && (
                      <span className="sub">
                        {nextPay.payday ? `다음 급여 ${formatMd(nextPay.payday)} · ${formatWon(nextPay.net)}` : `지급일 미정 · ${formatWon(nextPay.net)}`}
                      </span>
                    )}
                    {!nextPay && <span className="sub">{wageLabel(wp.wageType, wp.wage)}</span>}
                  </div>
                  {status.kind === 'next' && <em className="countdown">{countdownLabel(now, status.shift.date, status.shift.start)}</em>}
                  {status.kind === 'now' && <em className="countdown live">근무 중</em>}
                </div>
              </li>
            );
          })}
        </ul>
        <button type="button" className="soft-btn" onClick={onClock}>
          지금 출근 기록하기
        </button>
      </section>

      <section className="card">
        <div className="card-h">
          <h2>받을 돈</h2>
          <button type="button" onClick={onSettle}>전체 보기</button>
        </div>
        {preview.length === 0 && <p className="empty">들어올 돈이 아직 없어요.</p>}
        {soon.length > 0 && preview.some((bundle) => bundle.payday) && <p className="group-label">곧 들어와요</p>}
        <ul className="rows">
          {preview.filter((bundle) => bundle.payday).map((bundle) => (
            <PayItem key={bundle.key} bundleId={bundle.key} />
          ))}
        </ul>
        {unset.length > 0 && preview.some((bundle) => !bundle.payday) && <p className="group-label">지급일 미정</p>}
        <ul className="rows">
          {preview.filter((bundle) => !bundle.payday).map((bundle) => (
            <PayItem key={bundle.key} bundleId={bundle.key} />
          ))}
        </ul>
      </section>

      {fixed.length > 0 && (
        <section className="card">
          <div className="card-h">
            <h2>이번 주 주휴수당</h2>
          </div>
          <ul className="rows">
            {fixed.map((wp) => {
              const holiday = weekHoliday(wp, state.shifts, today, today);
              return (
                <li key={wp.id} className="holiday-row">
                  <i className="dot" style={{ background: wp.color }} />
                  <div>
                    <strong>{wp.name}</strong>
                    <span className="sub">{holidayCaption(holiday.reason, holiday.hours, holiday.gross)}</span>
                  </div>
                  <HolidayToggle id={wp.id} on={wp.holidayPay && holiday.reason !== 'under15'} disabled={holiday.hours < 15} />
                </li>
              );
            })}
          </ul>
          <p className="hint">대타·추가 근무는 빼요. 약속된 시간이 주 15시간 미만이거나, 그 주 결근이 있으면 계산하지 않아요.</p>
        </section>
      )}

      <p className="disclaimer">예상 금액이에요. 실제 지급액과 다를 수 있어요.</p>
      {!state.settings.gistId && (
        <button type="button" className="text-link center" onClick={onSettings}>
          아이폰 캘린더와 연결하기
        </button>
      )}
      {state.settings.lastSyncError && <p className="sync-error">{state.settings.lastSyncError}</p>}
    </div>
  );
}

function HolidayToggle({ id, on, disabled }: { id: string; on: boolean; disabled: boolean }) {
  const { dispatch } = useStore();
  return (
    <button
      type="button"
      className={on && !disabled ? 'switch on' : 'switch'}
      aria-pressed={on}
      disabled={disabled}
      onClick={() => dispatch({ type: 'toggle-holiday', id })}
    >
      <span />
    </button>
  );
}

function PayItem({ bundleId }: { bundleId: string }) {
  const { state, dispatch, now } = useStore();
  const today = seoulToday(now);
  const bundle = visibleBundles(state, today).find((item) => item.key === bundleId);
  if (!bundle) return null;
  const wp = state.workplaces.find((item) => item.id === bundle.workplaceId);
  const mark = paymentOf(state, bundle.key);
  return (
    <li className="pay-item">
      <div className="pay-top">
        <i className="dot" style={{ background: wp?.color ?? '#8B95A1' }} />
        <div>
          <strong>{wp?.name}</strong>
          <span className="sub">
            {bundleTitle(bundle)} · {bundleWhen(bundle, today)}
            {bundle.holiday > 0 ? ` · 주휴 ${formatWon(bundle.holiday)} 포함` : ''}
          </span>
        </div>
        <b>{formatWon(bundle.net)}</b>
      </div>
      <div className="pay-actions">
        <button type="button" onClick={() => dispatch({ type: 'set-payment', key: bundle.key, patch: { hidden: !mark.hidden } })}>
          숨기기
        </button>
        <button type="button" className="primary-ghost" onClick={() => dispatch({ type: 'set-payment', key: bundle.key, patch: { received: true } })}>
          받았어요
        </button>
      </div>
    </li>
  );
}
