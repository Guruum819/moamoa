import { useState } from 'react';
import { formatWon, seoulToday } from '../lib/date';
import {
  defaultPlaceDraft,
  draftFromWorkplace,
  monthSummary,
  newId,
  paydayLabel,
  wageLabel,
  workplaceFromDraft,
  type PlaceDraft,
} from '../lib/model';
import { useStore } from '../store';
import { Mascot, Sheet } from '../ui';
import { PlaceFields } from './fields';

export function Places({ onAddShift }: { onAddShift: (workplaceId: string) => void }) {
  const { state, dispatch, now } = useStore();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const today = seoulToday(now);
  const { year, month } = { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) };
  const active = state.workplaces.filter((wp) => !wp.archived);
  const archived = state.workplaces.filter((wp) => wp.archived);
  const current = editing && editing !== 'new' ? state.workplaces.find((wp) => wp.id === editing) : undefined;

  return (
    <div className="page">
      <header className="top">
        <h1>근무지</h1>
      </header>
      <button type="button" className="soft-btn" onClick={() => setEditing('new')}>
        + 근무지 추가
      </button>
      {active.length === 0 && (
        <section className="card empty-card">
          <Mascot />
          <p>모아둘 알바가 아직 없어요.</p>
        </section>
      )}
      <ul className="rows place-cards">
        {active.map((wp) => {
          const mine = { ...state, shifts: state.shifts.filter((shift) => shift.workplaceId === wp.id), workplaces: [wp] };
          const summary = monthSummary(mine, year, month, today);
          return (
            <li key={wp.id} className="card place-card">
              <button type="button" className="place-card-main" onClick={() => setEditing(wp.id)}>
                <span className="card-h tight">
                  <strong>
                    <i className="dot" style={{ background: wp.color }} />
                    {wp.name}
                  </strong>
                  <em className={wp.kind === 'fixed' ? 'tag fixed' : 'tag daily'}>{wp.kind === 'fixed' ? '고정' : '일일'}</em>
                </span>
                <span className="sub">{wageLabel(wp.wageType, wp.wage)}</span>
                <span className="sub">급여일 {paydayLabel(wp.payday)}</span>
                <span className="sub">이번 달 예상 {formatWon(summary.net)}</span>
              </button>
              <button type="button" className="text-link" onClick={() => onAddShift(wp.id)}>
                근무 등록
              </button>
            </li>
          );
        })}
      </ul>
      {archived.length > 0 && (
        <section>
          <h2 className="section-title">관둔 알바</h2>
          <ul className="rows">
            {archived.map((wp) => (
              <li key={wp.id} className="card archived">
                <button type="button" className="place-card-main" onClick={() => setEditing(wp.id)}>
                  <strong>
                    <i className="dot" style={{ background: wp.color }} />
                    {wp.name}
                  </strong>
                  <span className="sub">{wageLabel(wp.wageType, wp.wage)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {editing && (
        <PlaceSheet
          initial={current ? draftFromWorkplace(current) : defaultPlaceDraft('fixed', today)}
          creating={!current}
          archived={current?.archived}
          onClose={() => setEditing(null)}
          onSave={(draft) => {
            const id = current?.id ?? newId();
            dispatch({ type: 'save-place', workplace: workplaceFromDraft(draft, id, current) });
            setEditing(null);
          }}
          onArchive={
            current
              ? () => {
                  dispatch({ type: 'archive-place', id: current.id, archived: !current.archived });
                  setEditing(null);
                }
              : undefined
          }
          onDelete={
            current
              ? () => {
                  if (window.confirm(`${current.name}와 그 근무 기록을 지울까요?`)) {
                    dispatch({ type: 'delete-place', id: current.id });
                    setEditing(null);
                  }
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

function PlaceSheet({
  initial,
  creating,
  archived,
  onClose,
  onSave,
  onArchive,
  onDelete,
}: {
  initial: PlaceDraft;
  creating: boolean;
  archived?: boolean;
  onClose: () => void;
  onSave: (draft: PlaceDraft) => void;
  onArchive?: () => void;
  onDelete?: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const valid = draft.name.trim().length > 0 && draft.wage > 0;
  return (
    <Sheet
      title={creating ? '어디서 일하나요?' : '근무지 수정'}
      onClose={onClose}
      footer={
        <button type="button" className="btn primary" disabled={!valid} onClick={() => onSave(draft)}>
          저장
        </button>
      }
    >
      <PlaceFields draft={draft} onChange={setDraft} creating={creating} />
      {!creating && (
        <div className="row-actions">
          <button type="button" onClick={onArchive}>{archived ? '다시 시작' : '관둘래요'}</button>
          <button type="button" className="danger" onClick={onDelete}>삭제</button>
        </div>
      )}
    </Sheet>
  );
}
