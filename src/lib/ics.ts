import { addDays, durationMinutes, formatHours, formatWon, icsUtc, seoulToday } from './date';
import {
  paydayOf,
  shiftPay,
  type AlarmOption,
  type AppState,
  type SeqEntry,
  type Settings,
  type Tombstone,
} from './model';

export type FeedPlan = {
  ics: string;
  fileIcs: string;
  hash: string;
  eventSeq: Record<string, SeqEntry>;
  tombstones: Tombstone[];
  seqDirty: boolean;
};

type Draft = {
  uid: string;
  summary: string;
  description: string;
  date: string;
  start?: string;
  end?: string;
  allDay?: boolean;
  alarm: boolean;
};

function esc(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let index = 0;
  let budget = 75;
  while (index < bytes.length) {
    let end = Math.min(index + budget, bytes.length);
    if (end < bytes.length) {
      while (end > index && (bytes[end] & 0xc0) === 0x80) end -= 1;
      if (end === index) end = Math.min(index + budget, bytes.length);
    }
    const chunk = new TextDecoder().decode(bytes.slice(index, end));
    parts.push(index === 0 ? chunk : ` ${chunk}`);
    index = end;
    budget = 74;
  }
  return parts.join('\r\n');
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function alarmTrigger(alarm: AlarmOption): string | null {
  if (alarm === 'none') return null;
  if (alarm === '1440') return '-P1D';
  if (alarm === '60') return '-PT1H';
  if (alarm === '120') return '-PT2H';
  return `-PT${alarm}M`;
}

function collect(state: AppState, today: string): Draft[] {
  const start = addDays(today, -180);
  const end = addDays(today, 420);
  const drafts: Draft[] = [];
  for (const shift of state.shifts) {
    if (shift.absent || shift.date < start || shift.date > end) continue;
    const wp = state.workplaces.find((item) => item.id === shift.workplaceId);
    if (!wp) continue;
    const pay = shiftPay(shift);
    const mins = durationMinutes(shift.start, shift.end, shift.breakMin);
    const payday = paydayOf(wp.payday, shift.date);
    const lines = [
      `${wp.name}`,
      `시간 ${shift.start}–${shift.end} (휴게 ${shift.breakMin}분, 총 ${formatHours(mins)})`,
      `예상 실수령 ${formatWon(pay.net)} / 세전 ${formatWon(pay.gross)}`,
      payday ? `급여일 ${payday}` : '급여일 미정',
    ];
    if (shift.memo) lines.push(shift.memo);
    drafts.push({
      uid: `shift-${shift.id}@moamoa.app`,
      summary: wp.name,
      description: lines.join('\n'),
      date: shift.date,
      start: shift.start,
      end: shift.end,
      alarm: true,
    });
  }

  return drafts;
}

function renderDraft(draft: Draft, entry: SeqEntry, alarm: AlarmOption, cancelled: boolean): string[] {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${draft.uid}`,
    `SEQUENCE:${cancelled ? entry.seq : entry.seq}`,
    `DTSTAMP:${entry.stamp}`,
    `CREATED:${entry.created}`,
    `LAST-MODIFIED:${entry.stamp}`,
    `SUMMARY:${esc(draft.summary)}`,
    `DESCRIPTION:${esc(draft.description)}`,
    cancelled ? 'STATUS:CANCELLED' : 'STATUS:CONFIRMED',
  ];
  if (draft.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${draft.date.replace(/-/g, '')}`);
    lines.push(`DTEND;VALUE=DATE:${addDays(draft.date, 1).replace(/-/g, '')}`);
  } else {
    const start = `${draft.date.replace(/-/g, '')}T${(draft.start ?? '09:00').replace(':', '')}00`;
    const end = `${draft.date.replace(/-/g, '')}T${(draft.end ?? '18:00').replace(':', '')}00`;
    lines.push(`DTSTART;TZID=Asia/Seoul:${start}`);
    lines.push(`DTEND;TZID=Asia/Seoul:${end}`);
  }
  if (!cancelled && draft.alarm) {
    const trigger = alarmTrigger(alarm);
    if (trigger) {
      lines.push('BEGIN:VALARM', `TRIGGER:${trigger}`, 'ACTION:DISPLAY', `DESCRIPTION:${esc(draft.summary)}`, 'END:VALARM');
    }
  }
  lines.push('END:VEVENT');
  return lines;
}

function calendarHead(settings: Settings, method?: string): string[] {
  const name = settings.calendarName.trim() || '모아모아';
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Moamoa//Gather Ledger//KO',
    'CALSCALE:GREGORIAN',
    ...(method ? [`METHOD:${method}`] : []),
    `X-WR-CALNAME:${esc(name)}`,
    'X-WR-CALDESC:모아모아 근무 일정',
    'X-WR-TIMEZONE:Asia/Seoul',
    'X-APPLE-CALENDAR-COLOR:#3182F6',
    'X-PUBLISHED-TTL:PT15M',
    'REFRESH-INTERVAL;VALUE=DURATION:PT15M',
    'BEGIN:VTIMEZONE',
    'TZID:Asia/Seoul',
    'X-LIC-LOCATION:Asia/Seoul',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0900',
    'TZOFFSETTO:+0900',
    'TZNAME:KST',
    'DTSTART:19700101T000000',
    'END:STANDARD',
    'END:VTIMEZONE',
  ];
}

export function planFeed(state: AppState, now = new Date(), today = seoulToday(now)): FeedPlan {
  const drafts = collect(state, today);
  const seen = new Set<string>();
  const eventSeq: Record<string, SeqEntry> = {};
  const activeLines: string[][] = [];
  const stampNow = icsUtc(now);

  for (const draft of drafts) {
    const content = [draft.summary, draft.description, draft.date, draft.start ?? '', draft.end ?? '', draft.allDay ? '1' : '0', draft.alarm ? state.settings.alarm : 'none'].join('\u001f');
    const hash = hashString(content);
    const prev = state.settings.eventSeq[draft.uid];
    const changed = !prev || prev.hash !== hash;
    const entry: SeqEntry = {
      seq: !prev ? 0 : changed ? prev.seq + 1 : prev.seq,
      hash,
      stamp: changed ? stampNow : prev.stamp,
      created: prev?.created || stampNow,
      summary: draft.summary,
      date: draft.date,
      start: draft.start,
      end: draft.end,
      allDay: draft.allDay,
    };
    eventSeq[draft.uid] = entry;
    seen.add(draft.uid);
    activeLines.push(renderDraft(draft, entry, state.settings.alarm, false));
  }

  const tombstones: Tombstone[] = state.settings.tombstones.filter((item) => item.removedOn >= addDays(today, -180));
  for (const [uid, info] of Object.entries(state.settings.eventSeq)) {
    if (seen.has(uid) || tombstones.some((item) => item.uid === uid)) continue;
    tombstones.push({
      uid,
      seq: info.seq + 1,
      stamp: stampNow,
      summary: info.summary,
      date: info.date,
      start: info.start,
      end: info.end,
      allDay: info.allDay,
      removedOn: today,
    });
  }

  const head = calendarHead(state.settings);
  const fileHead = calendarHead(state.settings, 'PUBLISH');
  const live = [...head, ...activeLines.flat(), 'END:VCALENDAR'].map(fold).join('\r\n');
  const cancelledLines = tombstones.map((item) =>
    renderDraft(
      {
        uid: item.uid,
        summary: item.summary,
        description: '모아모아에서 삭제된 일정',
        date: item.date,
        start: item.start,
        end: item.end,
        allDay: item.allDay,
        alarm: false,
      },
      {
        seq: item.seq,
        hash: '',
        stamp: item.stamp,
        created: item.stamp,
        summary: item.summary,
        date: item.date,
        start: item.start,
        end: item.end,
        allDay: item.allDay,
      },
      'none',
      true,
    ),
  );
  const fileIcs = [...fileHead, ...activeLines.flat(), ...cancelledLines.flat(), 'END:VCALENDAR'].map(fold).join('\r\n');
  const seqDirty =
    JSON.stringify(eventSeq) !== JSON.stringify(state.settings.eventSeq) ||
    JSON.stringify(tombstones) !== JSON.stringify(state.settings.tombstones.filter((item) => item.removedOn >= addDays(today, -180)));

  return { ics: live, fileIcs, hash: hashString(live), eventSeq, tombstones, seqDirty };
}

export function webcalUrl(httpsUrl: string): string {
  return httpsUrl.replace(/^https:\/\//, 'webcal://');
}
