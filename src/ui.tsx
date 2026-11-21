import { useEffect, type ReactNode } from 'react';
import { weekdayIndex, weekdayLabel } from './lib/date';
import { calendarCells } from './lib/model';

export function Sheet({
  title,
  onClose,
  children,
  footer,
  progress,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  progress?: number;
}) {
  useEffect(() => {
    document.body.classList.add('lock');
    return () => document.body.classList.remove('lock');
  }, []);
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        {progress !== undefined && (
          <div className="progress" aria-hidden="true">
            {[0, 1, 2].map((step) => (
              <span key={step} className={step <= progress ? 'on' : ''} />
            ))}
          </div>
        )}
        <div className="sheet-top">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="닫기">
            <CloseIcon />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Segment<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div className="segment" role="tablist" aria-label={label}>
      {options.map((option) => (
        <button key={option.id} type="button" role="tab" aria-selected={value === option.id} className={value === option.id ? 'on' : ''} onClick={() => onChange(option.id)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function MonthGrid({
  year,
  month,
  today,
  selected,
  mode,
  dots,
  onPick,
}: {
  year: number;
  month: number;
  today: string;
  selected: string[];
  mode: 'view' | 'pick';
  dots: Record<string, string[]>;
  onPick: (iso: string) => void;
}) {
  const cells = calendarCells(year, month);
  return (
    <div className="cal">
      <div className="cal-week">
        {['일', '월', '화', '수', '목', '금', '토'].map((name, index) => (
          <span key={name} className={index === 0 ? 'sun' : ''}>
            {name}
          </span>
        ))}
      </div>
      <div className="cal-grid">
        {cells.map((iso, index) => {
          if (!iso) return <span key={`e-${index}`} />;
          const isToday = iso === today;
          const isSelected = selected.includes(iso);
          const sun = weekdayIndex(iso) === 0;
          const filled = mode === 'view' ? isToday : isSelected;
          const soft = mode === 'view' && isSelected && !isToday;
          const ring = mode === 'pick' && isToday && !isSelected;
          const className = ['day', filled ? 'filled' : '', soft ? 'soft' : '', ring ? 'ring' : '', sun && !filled && !soft ? 'sun' : ''].filter(Boolean).join(' ');
          return (
            <button key={iso} type="button" className={className} onClick={() => onPick(iso)} aria-pressed={isSelected} aria-label={`${iso} ${weekdayLabel(iso)}`}>
              <span>{Number(iso.slice(-2))}</span>
              <span className="dots">
                {(dots[iso] ?? []).slice(0, 3).map((color, dot) => (
                  <i key={dot} style={{ background: color }} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Mascot({ size = 72 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" aria-hidden="true">
      <circle cx="64" cy="64" r="60" fill="#FFE7C7" />
      <circle cx="64" cy="72" r="36" fill="#FFC7A3" />
      <circle cx="64" cy="76" r="26" fill="#FFE8D6" />
      <path d="M64 34c0-8-8-14-16-10 8 2 12 8 16 16 4-8 8-14 16-16-8-4-16 2-16 10z" fill="#03B26C" />
      <rect x="61" y="40" width="6" height="10" rx="3" fill="#03B26C" />
      <ellipse cx="52" cy="70" rx="3.2" ry="4.2" fill="#2C2A32" />
      <ellipse cx="76" cy="70" rx="3.2" ry="4.2" fill="#2C2A32" />
      <circle cx="53.2" cy="68.6" r="1.1" fill="#fff" />
      <circle cx="77.2" cy="68.6" r="1.1" fill="#fff" />
      <ellipse cx="42" cy="78" rx="5" ry="2.6" fill="#FF9B8A" />
      <ellipse cx="86" cy="78" rx="5" ry="2.6" fill="#FF9B8A" />
      <path d="M56 84q8 8 16 0" fill="none" stroke="#2C2A32" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="92" cy="96" r="14" fill="#3182F6" />
      <circle cx="92" cy="96" r="9" fill="none" stroke="#E8F3FF" strokeWidth="2" />
    </svg>
  );
}

export function GearIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        d="M19.4 13.5a7.7 7.7 0 0 0 .1-3l1.7-1.3-1.6-2.8-2 .6a7.6 7.6 0 0 0-2.6-1.5L14.6 3h-3.2l-.4 2.5a7.6 7.6 0 0 0-2.6 1.5l-2-.6L4.8 9.2 6.5 10.5a7.7 7.7 0 0 0 .1 3L4.8 14.8l1.6 2.8 2-.6a7.6 7.6 0 0 0 2.6 1.5l.4 2.5h3.2l.4-2.5a7.6 7.6 0 0 0 2.6-1.5l2 .6 1.6-2.8-1.8-1.3Z"
      />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function NavIcon({ name }: { name: 'home' | 'cal' | 'place' | 'pay' }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (name === 'home') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" />
      </svg>
    );
  }
  if (name === 'cal') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
        <rect {...common} x="4" y="5" width="16" height="15" rx="2" />
        <path {...common} d="M8 3.5V7M16 3.5V7M4 10h16" />
      </svg>
    );
  }
  if (name === 'place') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M4 10h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9Z" />
        <path {...common} d="M3 10l2.2-4.2A1 1 0 0 1 7.1 5h9.8a1 1 0 0 1 .9.6L20 10M9 14h6" />
      </svg>
    );
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <rect {...common} x="3" y="6" width="18" height="13" rx="2" />
      <path {...common} d="M3 10h18M7 15h4" />
    </svg>
  );
}
