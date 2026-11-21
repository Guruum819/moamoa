import { useState } from 'react';
import { durationMinutes, formatWon, seoulTime, seoulToday } from '../lib/date';
import { newId, shiftPay, type Shift } from '../lib/model';
import { useStore } from '../store';
import { Sheet } from '../ui';
import { TaxPicker, TimeBreak, WageFields } from './fields';

function plusMinutes(start: string, plus: number): string {
  const [h, m] = start.split(':').map(Number);
  const total = (h * 60 + m + plus) % 1440;
  const wrapped = (total + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

export function ShiftSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { state, dispatch, toast } = useStore();
  const original = state.shifts.find((shift) => shift.id === id);
  const [form, setForm] = useState<Shift | undefined>(original);
  if (!original || !form) return null;
  const wp = state.workplaces.find((item) => item.id === form.workplaceId);
  const pay = shiftPay(form);
  const set = (patch: Partial<Shift>) => setForm({ ...form, ...patch });
  return (
    <Sheet
      title="근무 수정"
      onClose={onClose}
      footer={
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            if (durationMinutes(form.start, form.end, form.breakMin) <= 0) {
              toast('퇴근 시간을 다시 확인해 주세요.');
              return;
            }
            dispatch({ type: 'update-shift', shift: form });
            toast('근무를 고쳤어요.');
            onClose();
          }}
        >
          저장 · 예상 실수령 {formatWon(pay.net)}
        </button>
      }
    >
      <div className="stack">
        <p className="picked-place">
          <i className="dot" style={{ background: wp?.color }} />
          <strong>{wp?.name}</strong>
        </p>
        <label className="field">
          <span>날짜</span>
          <input type="date" value={form.date} onChange={(event) => set({ date: event.target.value })} />
        </label>
        <TimeBreak start={form.start} end={form.end} breakMin={form.breakMin} onStart={(start) => set({ start })} onEnd={(end) => set({ end })} onBreak={(breakMin) => set({ breakMin })} />
        <WageFields wageType={form.wageType} wage={form.wage} onType={(wageType) => set({ wageType })} onWage={(wage) => set({ wage })} note="이 근무에만 적용돼요." />
        <div>
          <div className="field-label">세금·공제</div>
          <TaxPicker value={form.taxType} onChange={(taxType) => set({ taxType })} />
        </div>
        <label className="switch-row">
          <span>
            <strong>결근</strong>
            <em>이 날은 급여와 주휴수당에서 빠져요</em>
          </span>
          <input type="checkbox" checked={form.absent} onChange={(event) => set({ absent: event.target.checked })} />
        </label>
        <label className="field">
          <span>메모</span>
          <input value={form.memo} placeholder="선택" onChange={(event) => set({ memo: event.target.value })} />
        </label>
        <button
          type="button"
          className="danger-btn"
          onClick={() => {
            if (window.confirm('이 근무를 지울까요?')) {
              dispatch({ type: 'delete-shift', id: form.id });
              toast('근무를 지웠어요. 캘린더 구독에 반영되면 일정에서도 빠져요.');
              onClose();
            }
          }}
        >
          삭제
        </button>
      </div>
    </Sheet>
  );
}

export function ClockSheet({ onClose, onEdit }: { onClose: () => void; onEdit: (id: string) => void }) {
  const { state, dispatch, toast, now } = useStore();
  const today = seoulToday(now);
  const start = seoulTime(now);
  const active = state.workplaces.filter((wp) => !wp.archived);
  return (
    <Sheet title="지금 출근 기록하기" onClose={onClose}>
      <div className="stack">
        <p className="hint">오늘 {today.slice(5).replace('-', '/')} {start} 출근으로 기록해요.</p>
        {active.length === 0 && <p className="empty">먼저 근무지를 추가해 주세요.</p>}
        <ul className="rows">
          {active.map((wp) => (
            <li key={wp.id}>
              <button
                type="button"
                className="shift-line"
                onClick={() => {
                  const existing = state.shifts.find((shift) => shift.workplaceId === wp.id && shift.date === today && !shift.absent);
                  if (existing) {
                    toast('오늘 근무가 이미 있어요.');
                    onEdit(existing.id);
                    return;
                  }
                  const rule = wp.rules[0];
                  const breakMin = rule?.breakMin ?? 0;
                  const work = rule ? durationMinutes(rule.start, rule.end, rule.breakMin) : 240;
                  const stamp = new Date().toISOString();
                  dispatch({
                    type: 'add-shifts',
                    shifts: [
                      {
                        id: newId(),
                        workplaceId: wp.id,
                        date: today,
                        start,
                        end: plusMinutes(start, work + breakMin),
                        breakMin,
                        wageType: wp.wageType,
                        wage: wp.wage,
                        taxType: wp.taxType,
                        source: 'clock',
                        manualOverride: true,
                        absent: false,
                        memo: '',
                        createdAt: stamp,
                        updatedAt: stamp,
                      },
                    ],
                  });
                  toast(`${wp.name} 출근을 기록했어요.`);
                  onClose();
                }}
              >
                <i className="dot" style={{ background: wp.color }} />
                <span>
                  <strong>{wp.name}</strong>
                  <em>{start} 출근</em>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Sheet>
  );
}

export function GoalSheet({ onClose }: { onClose: () => void }) {
  const { state, dispatch, now } = useStore();
  const today = seoulToday(now);
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const current = state.goals.find((goal) => goal.year === year && goal.month === month);
  const [amount, setAmount] = useState(current?.amount ?? 1000000);
  return (
    <Sheet
      title="이번 달 목표"
      onClose={onClose}
      footer={
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            dispatch({ type: 'set-goal', year, month, amount });
            onClose();
          }}
        >
          저장
        </button>
      }
    >
      <label className="field">
        <span>{month}월 목표 실수령</span>
        <input inputMode="numeric" value={amount ? String(amount) : ''} onChange={(event) => setAmount(Number(event.target.value.replace(/[^0-9]/g, '')) || 0)} />
      </label>
      {current && (
        <button type="button" className="text-link" onClick={() => { dispatch({ type: 'set-goal', year, month, amount: null }); onClose(); }}>
          목표 지우기
        </button>
      )}
    </Sheet>
  );
}
