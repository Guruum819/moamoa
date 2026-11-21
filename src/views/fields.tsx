import { durationMinutes, formatHours } from '../lib/date';
import { PALETTE, paydayLabel, type PlaceDraft, type Workplace } from '../lib/model';
import { TAX_OPTIONS, type TaxType } from '../lib/tax';
import { Segment } from '../ui';

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

export function PlaceFields({
  draft,
  onChange,
  creating,
}: {
  draft: PlaceDraft;
  onChange: (draft: PlaceDraft) => void;
  creating?: boolean;
}) {
  const set = (patch: Partial<PlaceDraft>) => onChange({ ...draft, ...patch });
  const setKind = (kind: PlaceDraft['kind']) => {
    if (!creating) {
      set({ kind, holidayPay: kind === 'fixed' ? true : false, weekdays: kind === 'fixed' && draft.weekdays.length === 0 ? [1, 2, 3, 4, 5] : draft.weekdays });
      return;
    }
    onChange({
      ...(kind === 'daily'
        ? { ...draft, kind, wageType: 'daily', wage: 100000, taxType: 'daily', paydayKind: 'after_days', paydayValue: 5, weekdays: [], start: '10:00', end: '15:00', breakMin: 0, holidayPay: false }
        : { ...draft, kind, wageType: 'hourly', wage: 10320, taxType: 'none', paydayKind: 'next_month_day', paydayValue: 15, weekdays: [1, 2, 3, 4, 5], start: '09:00', end: '18:00', breakMin: 60, holidayPay: true }),
    });
  };
  const toggleDay = (day: number) => {
    const weekdays = draft.weekdays.includes(day) ? draft.weekdays.filter((item) => item !== day) : [...draft.weekdays, day].sort((a, b) => a - b);
    set({ weekdays });
  };

  return (
    <div className="stack">
      <label className="field">
        <span>이름</span>
        <input value={draft.name} placeholder="예: 메가커피 역삼점" onChange={(event) => set({ name: event.target.value })} />
      </label>
      <Segment label="알바 종류" value={draft.kind} onChange={setKind} options={[{ id: 'fixed', label: '고정알바' }, { id: 'daily', label: '일일알바' }]} />
      <div>
        <div className="field-label">색</div>
        <div className="colors">
          {PALETTE.map((color) => (
            <button key={color.hex} type="button" className={draft.color === color.hex ? 'color on' : 'color'} style={{ background: color.hex }} aria-label={color.name} aria-pressed={draft.color === color.hex} onClick={() => set({ color: color.hex })}>
              <span>{color.name}</span>
            </button>
          ))}
        </div>
      </div>
      <WageFields wageType={draft.wageType} wage={draft.wage} onType={(wageType) => set({ wageType })} onWage={(wage) => set({ wage })} />
      <PaydayFields kind={draft.paydayKind} value={draft.paydayValue} onKind={(paydayKind) => set({ paydayKind })} onValue={(paydayValue) => set({ paydayValue })} />
      {draft.kind === 'fixed' && (
        <>
          <div>
            <div className="field-label">매주 반복</div>
            <p className="hint">고른 요일은 달력에 자동으로 채워져요. 대타나 추가 근무는 따로 등록해요.</p>
            <div className="weekdays">
              {WEEK.map((name, index) => (
                <button key={name} type="button" className={draft.weekdays.includes(index) ? 'on' : ''} onClick={() => toggleDay(index)} aria-pressed={draft.weekdays.includes(index)}>
                  {name}
                </button>
              ))}
            </div>
          </div>
          <TimeBreak start={draft.start} end={draft.end} breakMin={draft.breakMin} onStart={(start) => set({ start })} onEnd={(end) => set({ end })} onBreak={(breakMin) => set({ breakMin })} />
          <label className="switch-row">
            <span>
              <strong>주휴수당 계산</strong>
              <em>약속된 근무가 주 15시간 이상이고, 그 주 결근이 없을 때</em>
            </span>
            <input type="checkbox" checked={draft.holidayPay} onChange={(event) => set({ holidayPay: event.target.checked })} />
          </label>
        </>
      )}
      <div>
        <div className="field-label">기본 세금·공제</div>
        <TaxPicker value={draft.taxType} onChange={(taxType) => set({ taxType })} />
      </div>
    </div>
  );
}

export function WageFields({
  wageType,
  wage,
  onType,
  onWage,
  note,
}: {
  wageType: PlaceDraft['wageType'];
  wage: number;
  onType: (type: PlaceDraft['wageType']) => void;
  onWage: (wage: number) => void;
  note?: string;
}) {
  return (
    <div>
      <Segment
        label="급여 방식"
        value={wageType}
        onChange={onType}
        options={[
          { id: 'hourly', label: '시급' },
          { id: 'daily', label: '일당' },
          { id: 'per_job', label: '건당' },
        ]}
      />
      <label className="field tight">
        <span>{wageType === 'hourly' ? '시급' : wageType === 'daily' ? '일당' : '건당 금액'}</span>
        <input inputMode="numeric" value={wage ? String(wage) : ''} onChange={(event) => onWage(Number(event.target.value.replace(/[^0-9]/g, '')) || 0)} />
      </label>
      {note && <p className="hint">{note}</p>}
    </div>
  );
}

export function PaydayFields({
  kind,
  value,
  onKind,
  onValue,
}: {
  kind: PlaceDraft['paydayKind'];
  value: number;
  onKind: (kind: PlaceDraft['paydayKind']) => void;
  onValue: (value: number) => void;
}) {
  return (
    <div>
      <div className="field-label">급여일</div>
      <div className="chips">
        <button type="button" className={kind === 'next_month_day' ? 'chip on' : 'chip'} onClick={() => onKind('next_month_day')}>다음 달 N일</button>
        <button type="button" className={kind === 'after_days' ? 'chip on' : 'chip'} onClick={() => onKind('after_days')}>근무 후 N일</button>
        <button type="button" className={kind === 'unset' ? 'chip on' : 'chip'} onClick={() => onKind('unset')}>미정</button>
      </div>
      {kind !== 'unset' && (
        <label className="field tight">
          <span>{kind === 'next_month_day' ? '다음 달 며칠' : '근무 후 며칠'}</span>
          <input inputMode="numeric" value={String(value)} onChange={(event) => onValue(Number(event.target.value.replace(/[^0-9]/g, '')) || 0)} />
        </label>
      )}
      <p className="hint">{paydayLabel(kind === 'unset' ? { kind } : kind === 'after_days' ? { kind, days: value } : { kind, day: value })}</p>
    </div>
  );
}

export function TimeBreak({
  start,
  end,
  breakMin,
  onStart,
  onEnd,
  onBreak,
}: {
  start: string;
  end: string;
  breakMin: number;
  onStart: (value: string) => void;
  onEnd: (value: string) => void;
  onBreak: (value: number) => void;
}) {
  const preset = breakMin === 0 ? '0' : breakMin === 30 ? '30' : breakMin === 60 ? '60' : 'custom';
  const minutes = durationMinutes(start, end, breakMin);
  return (
    <div>
      <div className="time-row">
        <label>
          <span>출근</span>
          <input type="time" value={start} onChange={(event) => onStart(event.target.value)} />
        </label>
        <label>
          <span>퇴근</span>
          <input type="time" value={end} onChange={(event) => onEnd(event.target.value)} />
        </label>
      </div>
      <p className="total-hours">총 {formatHours(minutes)}{end <= start ? ' · 다음날 퇴근' : ''}</p>
      <div className="field-label">공제시간</div>
      <div className="chips">
        {[
          ['0', '없음'],
          ['30', '30분'],
          ['60', '1시간'],
          ['custom', '직접'],
        ].map(([id, label]) => (
          <button key={id} type="button" className={preset === id ? 'chip on' : 'chip'} onClick={() => onBreak(id === 'custom' ? breakMin || 45 : Number(id))}>
            {label}
          </button>
        ))}
      </div>
      {preset === 'custom' && (
        <label className="field tight">
          <span>분</span>
          <input inputMode="numeric" value={String(breakMin)} onChange={(event) => onBreak(Number(event.target.value.replace(/[^0-9]/g, '')) || 0)} />
        </label>
      )}
    </div>
  );
}

export function TaxPicker({ value, onChange, gross }: { value: TaxType; onChange: (type: TaxType) => void; gross?: number }) {
  return (
    <>
      <div className="chips">
        {TAX_OPTIONS.map((option) => (
          <button key={option.id} type="button" className={value === option.id ? 'chip on' : 'chip'} onClick={() => onChange(option.id)}>
            {option.label}
          </button>
        ))}
      </div>
      <p className="hint">{TAX_OPTIONS.find((option) => option.id === value)?.hint}</p>
      {value === 'daily' && gross === 100000 && <p className="hint">10만 원 일당의 96,700원은 3.3%예요. 일용직은 소득세 0원, 고용보험 900원을 뺀 99,100원이에요.</p>}
      {value === 'ins4' && <p className="hint">월 60시간 미만이면 국민연금·건강보험이 빠지지 않을 수 있어요. 예상 금액이에요.</p>}
      {value === 'daily' && <p className="hint">여러 날을 한 번에 받으면 소득세 1,000원 미만 면제가 합산으로 달라질 수 있어요. 여기선 하루씩 계산해요.</p>}
    </>
  );
}

export function placeKindLabel(wp: Pick<Workplace, 'kind'>): string {
  return wp.kind === 'fixed' ? '고정' : '일일';
}
