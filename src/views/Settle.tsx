import { useState } from 'react';
import { addMonths, formatMonthTitle, formatWon, seoulToday } from '../lib/date';
import { bundleTitle, bundleWhen, monthSummary, pastUnreceivedKeys, paymentOf, receiveBundles } from '../lib/model';
import { useStore } from '../store';

export function Settle() {
  const { state, dispatch, now, toast } = useStore();
  const today = seoulToday(now);
  const [cursor, setCursor] = useState({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) });
  const [showHidden, setShowHidden] = useState(false);
  const summary = monthSummary(state, cursor.year, cursor.month, today);
  const next = addMonths(cursor.year, cursor.month, 1);
  const current = receiveBundles(state, cursor.year, cursor.month, today).filter((bundle) => showHidden || !paymentOf(state, bundle.key).hidden);
  const upcoming = receiveBundles(state, next.year, next.month, today).filter((bundle) => !paymentOf(state, bundle.key).hidden);
  const hiddenCount = receiveBundles(state, cursor.year, cursor.month, today).filter((bundle) => paymentOf(state, bundle.key).hidden).length;
  const receiveTotal = current.filter((bundle) => !paymentOf(state, bundle.key).hidden).reduce((sum, bundle) => sum + (paymentOf(state, bundle.key).received ? 0 : bundle.net), 0);
  const nextTotal = upcoming.reduce((sum, bundle) => sum + (paymentOf(state, bundle.key).received ? 0 : bundle.net), 0);
  const pastKeys = pastUnreceivedKeys(state, today);

  return (
    <div className="page">
      <header className="top">
        <h1>정산</h1>
      </header>
      <div className="month-bar plain">
        <button type="button" aria-label="이전 달" onClick={() => setCursor((value) => addMonths(value.year, value.month, -1))}>‹</button>
        <strong>{formatMonthTitle(cursor.year, cursor.month)}</strong>
        <button type="button" aria-label="다음 달" onClick={() => setCursor((value) => addMonths(value.year, value.month, 1))}>›</button>
      </div>

      <section className="card hero compact">
        <p className="eyebrow">이번 달에 번 돈</p>
        <p className="hero-num">{formatWon(summary.net)}</p>
        <p className="split">세전 {formatWon(summary.gross)} · 예상 실수령 {formatWon(summary.net)} · {summary.count}건 근무</p>
        {pastKeys.length > 0 && (
          <button
            type="button"
            className="text-link"
            onClick={() => {
              dispatch({ type: 'mark-received', keys: pastKeys });
              toast('이전 급여를 받았다고 표시했어요.');
            }}
          >
            이전 건 모두 받았어요
          </button>
        )}
      </section>

      <section className="card">
        <div className="card-h">
          <h2>이번 달에 받을 돈</h2>
          <strong>{formatWon(receiveTotal)}</strong>
        </div>
        {current.length === 0 && <p className="empty">이 달에 들어올 돈이 없어요.</p>}
        <ul className="rows">
          {current.map((bundle) => {
            const wp = state.workplaces.find((item) => item.id === bundle.workplaceId);
            const mark = paymentOf(state, bundle.key);
            return (
              <li key={bundle.key} className="pay-item">
                <div className="pay-top">
                  <i className="dot" style={{ background: wp?.color }} />
                  <div>
                    <strong>{wp?.name}</strong>
                    <span className="sub">{bundleTitle(bundle)} · {bundleWhen(bundle, today)}</span>
                  </div>
                  <b>{formatWon(bundle.net)}</b>
                </div>
                <div className="pay-actions">
                  <em className={mark.received ? 'status got' : 'status wait'}>{mark.received ? '받았어요' : bundle.payday ? '미입금' : '미정'}</em>
                  <button type="button" onClick={() => dispatch({ type: 'set-payment', key: bundle.key, patch: { hidden: !mark.hidden } })}>
                    {mark.hidden ? '숨기기 해제' : '숨기기'}
                  </button>
                  {mark.received ? (
                    <button type="button" onClick={() => dispatch({ type: 'set-payment', key: bundle.key, patch: { received: false } })}>되돌리기</button>
                  ) : (
                    <button type="button" className="primary-ghost" onClick={() => dispatch({ type: 'set-payment', key: bundle.key, patch: { received: true } })}>받았어요</button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {hiddenCount > 0 && (
          <button type="button" className="text-link" onClick={() => setShowHidden((value) => !value)}>
            {showHidden ? '숨긴 항목 접기' : `숨긴 항목 ${hiddenCount}건 보기`}
          </button>
        )}
      </section>

      <section className="card">
        <div className="card-h">
          <h2>다음 달에 받을 돈</h2>
          <strong>{formatWon(nextTotal)}</strong>
        </div>
        {upcoming.length === 0 && <p className="empty">다음 달 입금 예정이 없어요.</p>}
        <ul className="rows">
          {upcoming.map((bundle) => {
            const wp = state.workplaces.find((item) => item.id === bundle.workplaceId);
            const mark = paymentOf(state, bundle.key);
            return (
              <li key={bundle.key} className="pay-item">
                <div className="pay-top">
                  <i className="dot" style={{ background: wp?.color }} />
                  <div>
                    <strong>{wp?.name}</strong>
                    <span className="sub">{bundleTitle(bundle)} · {bundleWhen(bundle, today)}{mark.received ? ' · 받았어요' : ''}</span>
                  </div>
                  <b>{formatWon(bundle.net)}</b>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
