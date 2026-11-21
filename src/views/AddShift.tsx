import { useEffect, useState } from 'react';
import { addMonths, durationMinutes, formatWon, parseIso, seoulToday } from '../lib/date';
import {
  defaultPlaceDraft,
  newId,
  workplaceFromDraft,
  type PlaceDraft,
  type Shift,
  type WageType,
} from '../lib/model';
import { applyTax, type TaxType } from '../lib/tax';
import { useStore } from '../store';
import { MonthGrid, Sheet } from '../ui';
import { PlaceFields, TaxPicker, TimeBreak, WageFields, placeKindLabel } from './fields';

export function AddShift({
  preset,
  onClose,
}: {
  preset?: { workplaceId?: string; date?: string };
  onClose: () => void;
}) {
  const { state, dispatch, toast, now } = useStore();
  const today = seoulToday(now);
  const active = state.workplaces.filter((wp) => !wp.archived);
  const [step, setStep] = useState(preset?.workplaceId ? 1 : 0);
  const [workplaceId, setWorkplaceId] = useState(preset?.workplaceId || (active.length ? active[0].id : 'new'));
  const [draft, setDraft] = useState<PlaceDraft>(() => defaultPlaceDraft('fixed', today));
  const [dates, setDates] = useState<string[]>(preset?.date ? [preset.date] : []);
  const [cursor, setCursor] = useState(() => {
    const parsed = parseIso(preset?.date || today);
    return { year: parsed.year, month: parsed.month };
  });
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('18:00');
  const [breakMin, setBreakMin] = useState(60);
  const [wageType, setWageType] = useState<WageType>('hourly');
  const [wage, setWage] = useState(10320);
  const [taxType, setTaxType] = useState<TaxType>('none');

  useEffect(() => {
    if (workplaceId === 'new') {
      setStart(draft.start);
      setEnd(draft.end);
      setBreakMin(draft.breakMin);
      setWageType(draft.wageType);
      setWage(draft.wage);
      setTaxType(draft.taxType);
      return;
    }
    const wp = state.workplaces.find((item) => item.id === workplaceId);
    if (!wp) return;
    const rule = wp.rules[0];
    setStart(rule?.start ?? (wp.kind === 'fixed' ? '09:00' : '10:00'));
    setEnd(rule?.end ?? (wp.kind === 'fixed' ? '18:00' : '15:00'));
    setBreakMin(rule?.breakMin ?? 0);
    setWageType(wp.wageType);
    setWage(wp.wage);
    setTaxType(wp.taxType);
    // Only reseed when the chosen workplace changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workplaceId]);

  const selected = workplaceId === 'new' ? null : state.workplaces.find((wp) => wp.id === workplaceId);
  const minutes = durationMinutes(start, end, breakMin);
  const gross = wageType === 'hourly' ? Math.round((minutes / 60) * wage) : wage;
  const net = applyTax(gross, taxType).net;
  const placeReady = workplaceId === 'new' ? draft.name.trim().length > 0 && draft.wage > 0 : Boolean(selected);
  const title = step === 0 ? '어디서 일하나요?' : step === 1 ? '언제 일하나요?' : '시간과 급여';

  const toggleDate = (iso: string) => {
    setDates((current) => (current.includes(iso) ? current.filter((date) => date !== iso) : [...current, iso].sort()));
  };

  const save = () => {
    if (minutes <= 0) {
      toast('퇴근 시간을 다시 확인해 주세요.');
      return;
    }
    let id = workplaceId;
    if (workplaceId === 'new') {
      id = newId();
      dispatch({ type: 'save-place', workplace: workplaceFromDraft(draft, id) });
    }
    const stamp = new Date().toISOString();
    const shifts: Shift[] = dates.map((date) => ({
      id: newId(),
      workplaceId: id,
      date,
      start,
      end,
      breakMin,
      wageType,
      wage,
      taxType,
      source: 'manual',
      manualOverride: false,
      absent: false,
      memo: '',
      createdAt: stamp,
      updatedAt: stamp,
    }));
    dispatch({ type: 'add-shifts', shifts });
    toast(`${dates.length}일 근무를 등록했어요.`);
    onClose();
  };

  return (
    <Sheet
      title={title}
      progress={step}
      onClose={onClose}
      footer={
        <div className="foot-actions">
          <button type="button" className="btn ghost" onClick={() => (step === 0 ? onClose() : setStep((value) => value - 1))}>
            이전
          </button>
          {step === 0 && (
            <button
              type="button"
              className="btn primary"
              disabled={!placeReady}
              onClick={() => {
                if (workplaceId === 'new') {
                  setStart(draft.start);
                  setEnd(draft.end);
                  setBreakMin(draft.breakMin);
                  setWageType(draft.wageType);
                  setWage(draft.wage);
                  setTaxType(draft.taxType);
                }
                setStep(1);
              }}
            >
              다음
            </button>
          )}
          {step === 1 && (
            <button type="button" className="btn primary" disabled={dates.length === 0} onClick={() => setStep(2)}>
              {dates.length === 0 ? '날짜를 골라 주세요' : '다음'}
            </button>
          )}
          {step === 2 && (
            <button type="button" className="btn primary" onClick={save}>
              {dates.length}일 등록 · 예상 실수령 {formatWon(net * dates.length)}
            </button>
          )}
        </div>
      }
    >
      {step === 0 && (
        <div className="stack">
          {active.length > 0 && (
            <>
              <p className="field-label">자주 가는 곳</p>
              <div className="chips">
                {active.map((wp) => (
                  <button key={wp.id} type="button" className={workplaceId === wp.id ? 'chip on' : 'chip'} onClick={() => setWorkplaceId(wp.id)}>
                    <i className="mini-dot" style={{ background: wp.color }} />
                    {wp.name}
                  </button>
                ))}
              </div>
            </>
          )}
          <button type="button" className={workplaceId === 'new' ? 'new-place on' : 'new-place'} onClick={() => setWorkplaceId('new')}>
            <strong>새 근무지</strong>
            <span>처음 가는 곳이면 여기서 시작해요</span>
          </button>
          {workplaceId === 'new' ? (
            <PlaceFields draft={draft} onChange={setDraft} creating />
          ) : (
            selected && <p className="hint">{placeKindLabel(selected)} · {selected.name}의 기본 급여와 시간을 불러왔어요. 다음 단계에서 이 근무만 바꿀 수 있어요.</p>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="stack">
          <div className="picked-place">
            <i className="dot" style={{ background: selected?.color ?? draft.color }} />
            <strong>{selected?.name ?? (draft.name || '새 근무지')}</strong>
            <em className="tag">{selected ? placeKindLabel(selected) : draft.kind === 'fixed' ? '고정' : '일일'}</em>
          </div>
          <p className="hint">일할 날을 모두 눌러 주세요. 다시 누르면 빼져요.</p>
          {(selected?.kind === 'fixed' || (workplaceId === 'new' && draft.kind === 'fixed')) && (
            <p className="hint">고정 알바의 매주 반복은 근무지에 저장돼 달력에 자동으로 채워져요. 여기서는 추가로 일할 날을 골라요.</p>
          )}
          <div className="month-bar">
            <button type="button" aria-label="이전 달" onClick={() => setCursor((value) => addMonths(value.year, value.month, -1))}>‹</button>
            <strong>{cursor.year}년 {cursor.month}월</strong>
            <button type="button" aria-label="다음 달" onClick={() => setCursor((value) => addMonths(value.year, value.month, 1))}>›</button>
          </div>
          <MonthGrid year={cursor.year} month={cursor.month} today={today} selected={dates} mode="pick" dots={{}} onPick={toggleDate} />
          <p className="picked-count">{dates.length}일 선택</p>
        </div>
      )}

      {step === 2 && (
        <div className="stack">
          <TimeBreak start={start} end={end} breakMin={breakMin} onStart={setStart} onEnd={setEnd} onBreak={setBreakMin} />
          <WageFields
            wageType={wageType}
            wage={wage}
            onType={setWageType}
            onWage={setWage}
            note="이 근무에만 적용되고, 근무지 기본값은 그대로예요."
          />
          <div>
            <div className="field-label">세금·공제</div>
            <TaxPicker value={taxType} onChange={setTaxType} gross={gross} />
          </div>
          <div className="net-box">
            <span>예상 실수령</span>
            <strong>{formatWon(net)}</strong>
            {applyTax(gross, taxType).lines.map((line) => (
              <em key={line.label}>{line.label} -{formatWon(line.amount)}</em>
            ))}
          </div>
        </div>
      )}
    </Sheet>
  );
}
