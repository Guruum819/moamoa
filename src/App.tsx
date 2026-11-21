import { useEffect, useState } from 'react';
import { useStore } from './store';
import { NavIcon } from './ui';
import { AddShift } from './views/AddShift';
import { Calendar } from './views/Calendar';
import { Home } from './views/Home';
import { Places } from './views/Places';
import { Settings } from './views/Settings';
import { Settle } from './views/Settle';
import { ClockSheet, GoalSheet, ShiftSheet } from './views/sheets';

type Tab = 'home' | 'calendar' | 'places' | 'settle';

function tabFromHash(): Tab {
  const hash = location.hash.replace('#', '');
  if (hash === 'calendar' || hash === 'places' || hash === 'settle') return hash;
  return 'home';
}

export function App() {
  const { message } = useStore();
  const [tab, setTab] = useState<Tab>(() => tabFromHash());
  const [settings, setSettings] = useState(false);
  const [add, setAdd] = useState<{ workplaceId?: string; date?: string } | null>(null);
  const [shiftId, setShiftId] = useState<string | null>(null);
  const [goal, setGoal] = useState(false);
  const [clock, setClock] = useState(false);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const goto = (next: Tab) => {
    setTab(next);
    const url = `${location.pathname}${location.search}#${next}`;
    history.replaceState(null, '', url);
  };

  return (
    <div className="app">
      {tab === 'home' && (
        <Home
          onSettings={() => setSettings(true)}
          onAdd={(workplaceId) => setAdd({ workplaceId })}
          onPlaces={() => goto('places')}
          onSettle={() => goto('settle')}
          onGoal={() => setGoal(true)}
          onClock={() => setClock(true)}
          onShift={setShiftId}
        />
      )}
      {tab === 'calendar' && <Calendar onAdd={(workplaceId, date) => setAdd({ workplaceId, date })} onShift={setShiftId} />}
      {tab === 'places' && <Places onAddShift={(workplaceId) => setAdd({ workplaceId })} />}
      {tab === 'settle' && <Settle />}

      <button type="button" className="fab" onClick={() => setAdd({})}>
        + 근무 추가
      </button>
      <nav className="nav-wrap">
        <div className="nav">
          {(
            [
              ['home', '홈'],
              ['calendar', '달력'],
              ['places', '근무지'],
              ['settle', '정산'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" className={tab === id ? 'on' : ''} onClick={() => goto(id)}>
              <NavIcon name={id === 'home' ? 'home' : id === 'calendar' ? 'cal' : id === 'places' ? 'place' : 'pay'} />
              {label}
            </button>
          ))}
        </div>
      </nav>

      {message && <div className="toast">{message}</div>}
      {settings && <Settings onClose={() => setSettings(false)} />}
      {add && <AddShift preset={add} onClose={() => setAdd(null)} />}
      {shiftId && <ShiftSheet id={shiftId} onClose={() => setShiftId(null)} />}
      {goal && <GoalSheet onClose={() => setGoal(false)} />}
      {clock && (
        <ClockSheet
          onClose={() => setClock(false)}
          onEdit={(id) => {
            setClock(false);
            setShiftId(id);
          }}
        />
      )}
    </div>
  );
}
