import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { parseBackup } from './lib/backup';
import { seoulToday, weekdayIndex } from './lib/date';
import { upsertCalendarGist } from './lib/github';
import { planFeed } from './lib/ics';
import {
  emptyState,
  materialize,
  newId,
  type AppState,
  type PaymentMark,
  type Settings,
  type Shift,
  type Workplace,
} from './lib/model';

const KEY = 'moamoa.v1';

export type Action =
  | { type: 'replace'; state: AppState }
  | { type: 'save-place'; workplace: Workplace }
  | { type: 'archive-place'; id: string; archived: boolean }
  | { type: 'delete-place'; id: string }
  | { type: 'add-shifts'; shifts: Shift[] }
  | { type: 'update-shift'; shift: Shift }
  | { type: 'delete-shift'; id: string }
  | { type: 'set-payment'; key: string; patch: Partial<PaymentMark> }
  | { type: 'mark-received'; keys: string[] }
  | { type: 'set-goal'; year: number; month: number; amount: number | null }
  | { type: 'patch-settings'; patch: Partial<Settings> }
  | { type: 'toggle-holiday'; id: string }
  | { type: 'reset' };

function apply(state: AppState, action: Action): AppState {
  const now = new Date().toISOString();
  switch (action.type) {
    case 'replace':
      return action.state;
    case 'reset':
      return emptyState();
    case 'patch-settings':
      return { ...state, settings: { ...state.settings, ...action.patch } };
    case 'set-goal': {
      const goals = state.goals.filter((goal) => !(goal.year === action.year && goal.month === action.month));
      if (action.amount && action.amount > 0) goals.push({ year: action.year, month: action.month, amount: Math.round(action.amount) });
      return { ...state, goals };
    }
    case 'set-payment': {
      const prev = state.payments[action.key] ?? { received: false, hidden: false };
      return { ...state, payments: { ...state.payments, [action.key]: { ...prev, ...action.patch } } };
    }
    case 'mark-received': {
      const payments = { ...state.payments };
      for (const key of action.keys) payments[key] = { ...payments[key], received: true, hidden: payments[key]?.hidden ?? false };
      return { ...state, payments };
    }
    case 'toggle-holiday':
      return {
        ...state,
        workplaces: state.workplaces.map((wp) => (wp.id === action.id ? { ...wp, holidayPay: !wp.holidayPay, updatedAt: now } : wp)),
      };
    case 'save-place': {
      const exists = state.workplaces.some((wp) => wp.id === action.workplace.id);
      const workplaces = exists
        ? state.workplaces.map((wp) => (wp.id === action.workplace.id ? action.workplace : wp))
        : [...state.workplaces, action.workplace];
      return { ...state, workplaces };
    }
    case 'archive-place': {
      const today = seoulToday();
      return {
        ...state,
        workplaces: state.workplaces.map((wp) => (wp.id === action.id ? { ...wp, archived: action.archived, updatedAt: now } : wp)),
        shifts: action.archived
          ? state.shifts.filter((shift) => !(shift.workplaceId === action.id && shift.date > today && shift.source === 'rule' && !shift.manualOverride))
          : state.shifts,
      };
    }
    case 'delete-place': {
      const payments = Object.fromEntries(Object.entries(state.payments).filter(([key]) => !key.startsWith(`${action.id}|`)));
      return {
        ...state,
        workplaces: state.workplaces.filter((wp) => wp.id !== action.id),
        shifts: state.shifts.filter((shift) => shift.workplaceId !== action.id),
        payments,
      };
    }
    case 'add-shifts': {
      let workplaces = state.workplaces;
      let shifts = state.shifts.slice();
      for (const incoming of action.shifts) {
        workplaces = workplaces.map((wp) =>
          wp.id === incoming.workplaceId
            ? {
                ...wp,
                excludedDates: wp.excludedDates.filter((date) => date !== incoming.date),
                absenceDates: wp.absenceDates.filter((date) => date !== incoming.date),
              }
            : wp,
        );
        const ruleId = `rule_${incoming.workplaceId}_${incoming.date}`;
        const index = shifts.findIndex((shift) => shift.id === ruleId || (shift.workplaceId === incoming.workplaceId && shift.date === incoming.date && !shift.absent));
        if (index >= 0) {
          const current = shifts[index];
          shifts[index] = {
            ...current,
            ...incoming,
            id: current.id,
            source: current.source,
            manualOverride: true,
            absent: false,
            createdAt: current.createdAt,
            updatedAt: now,
          };
        } else {
          const wp = workplaces.find((item) => item.id === incoming.workplaceId);
          const ruleDay = wp?.kind === 'fixed' && wp.rules.some((rule) => rule.weekday === weekdayIndex(incoming.date));
          shifts.push({
            ...incoming,
            id: ruleDay ? ruleId : incoming.id || newId(),
            source: ruleDay ? 'rule' : incoming.source,
            manualOverride: ruleDay ? true : incoming.manualOverride,
            updatedAt: now,
          });
        }
      }
      return { ...state, workplaces, shifts };
    }
    case 'update-shift':
      return {
        ...state,
        workplaces: state.workplaces.map((wp) =>
          wp.id === action.shift.workplaceId
            ? {
                ...wp,
                absenceDates: action.shift.absent
                  ? [...new Set([...wp.absenceDates, action.shift.date])]
                  : wp.absenceDates.filter((date) => date !== action.shift.date),
              }
            : wp,
        ),
        shifts: state.shifts.map((shift) => (shift.id === action.shift.id ? { ...action.shift, manualOverride: true, updatedAt: now } : shift)),
      };
    case 'delete-shift': {
      const target = state.shifts.find((shift) => shift.id === action.id);
      if (!target) return state;
      return {
        ...state,
        shifts: state.shifts.filter((shift) => shift.id !== action.id),
        workplaces: state.workplaces.map((wp) => {
          if (wp.id !== target.workplaceId || target.source !== 'rule') return wp;
          return {
            ...wp,
            excludedDates: [...new Set([...wp.excludedDates, target.date])],
            absenceDates: [...new Set([...wp.absenceDates, target.date])],
          };
        }),
      };
    }
    default:
      return state;
  }
}

export function reduce(state: AppState, action: Action): AppState {
  return materialize(apply(state, action));
}

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return materialize(emptyState());
    return parseBackup(raw, emptyState());
  } catch {
    return materialize(emptyState());
  }
}

type StoreValue = {
  state: AppState;
  dispatch: (action: Action) => void;
  toast: (message: string) => void;
  message: string | null;
  now: Date;
  syncNow: () => void;
  syncing: boolean;
};

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(() => loadState());
  const [message, setMessage] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [syncing, setSyncing] = useState(false);
  const stateRef = useRef(state);
  const failedHash = useRef('');
  const syncLock = useRef(false);
  const toastTimer = useRef(0);
  stateRef.current = state;

  const dispatch = (action: Action) => setState((current) => reduce(current, action));
  const toast = (text: string) => {
    setMessage(text);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setMessage(null), 2600);
  };

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const feedSignature = useMemo(
    () =>
      JSON.stringify({
        w: state.workplaces,
        s: state.shifts,
        p: state.payments,
        n: state.settings.calendarName,
        a: state.settings.alarm,
      }),
    [state],
  );

  const push = async (manual: boolean) => {
    const current = stateRef.current;
    if (!current.settings.githubToken.trim()) {
      if (manual) toast('설정에서 GitHub 토큰을 먼저 넣어 주세요.');
      return;
    }
    let planned = planFeed(current);
    if (planned.seqDirty) {
      dispatch({ type: 'patch-settings', patch: { eventSeq: planned.eventSeq, tombstones: planned.tombstones } });
      planned = planFeed({ ...current, settings: { ...current.settings, eventSeq: planned.eventSeq, tombstones: planned.tombstones } });
    }
    if (!manual && !current.settings.gistId) return;
    if (!manual && (planned.hash === current.settings.lastFeedHash || planned.hash === failedHash.current)) return;
    if (syncLock.current) return;
    syncLock.current = true;
    setSyncing(true);
    try {
      const ref = await upsertCalendarGist(
        current.settings.githubToken,
        current.settings.gistId,
        current.settings.gistOwner,
        planned.ics,
        current.settings.calendarName,
      );
      failedHash.current = '';
      const replaced = Boolean(current.settings.gistId) && ref.id !== current.settings.gistId;
      dispatch({
        type: 'patch-settings',
        patch: {
          gistId: ref.id,
          gistOwner: ref.owner,
          feedUrl: ref.feedUrl,
          lastFeedHash: planned.hash,
          lastSyncAt: new Date().toISOString(),
          lastSyncError: '',
          eventSeq: planned.eventSeq,
          tombstones: planned.tombstones,
        },
      });
      if (manual) toast(replaced ? '새 캘린더 주소를 만들었어요. 아이폰에서 다시 구독해 주세요.' : '캘린더 피드를 올렸어요.');
    } catch (error) {
      failedHash.current = planned.hash;
      const text = error instanceof Error ? error.message : '캘린더를 올리지 못했어요.';
      dispatch({ type: 'patch-settings', patch: { lastSyncError: text } });
      if (manual) toast(text);
    } finally {
      syncLock.current = false;
      setSyncing(false);
    }
  };

  const syncNow = () => {
    failedHash.current = '';
    void push(true);
  };

  useEffect(() => {
    if (!state.settings.githubToken.trim() || !state.settings.gistId) return;
    const planned = planFeed(state);
    if (planned.seqDirty) {
      dispatch({ type: 'patch-settings', patch: { eventSeq: planned.eventSeq, tombstones: planned.tombstones } });
      return;
    }
    if (planned.hash === state.settings.lastFeedHash || planned.hash === failedHash.current) return;
    const timer = window.setTimeout(() => void push(false), 1200);
    return () => window.clearTimeout(timer);
    // push closes over the latest refs; the signature is the data trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedSignature, state.settings.gistId, state.settings.githubToken, state.settings.lastFeedHash, state.settings.eventSeq]);

  const value = useMemo(() => ({ state, dispatch, toast, message, now, syncNow, syncing }), [state, message, now, syncing]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error('store missing');
  return value;
}
