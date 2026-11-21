import { useState } from 'react';
import { parseBackup, serializeBackup } from '../lib/backup';
import { seoulToday } from '../lib/date';
import { checkGithubToken } from '../lib/github';
import { planFeed, webcalUrl } from '../lib/ics';
import { ALARMS, type AlarmOption } from '../lib/model';
import { useStore } from '../store';
import { Sheet } from '../ui';

async function saveFile(filename: string, text: string, type: string) {
  const file = new File([text], filename, { type });
  const shareNav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (shareNav.share && shareNav.canShare?.({ files: [file] })) {
    try {
      await shareNav.share({ files: [file], title: filename });
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function Settings({ onClose }: { onClose: () => void }) {
  const { state, dispatch, toast, syncNow, syncing, now } = useStore();
  const [token, setToken] = useState(state.settings.githubToken);
  const [checking, setChecking] = useState(false);
  const feed = state.settings.feedUrl;
  const today = seoulToday(now);

  const saveToken = async () => {
    const value = token.trim();
    dispatch({ type: 'patch-settings', patch: { githubToken: value, lastSyncError: '' } });
    if (!value) {
      toast('토큰을 지웠어요.');
      return;
    }
    setChecking(true);
    try {
      const user = await checkGithubToken(value);
      toast(`${user.login} 계정으로 확인했어요.`);
    } catch (error) {
      toast(error instanceof Error ? error.message : '토큰을 확인하지 못했어요.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <Sheet title="설정" onClose={onClose}>
      <div className="stack settings">
        <section>
          <h3>아이폰 캘린더</h3>
          <p className="hint">구독은 한 번만 하면 돼요. 같은 일정은 덮어쓰고, 지운 근무는 캘린더에서도 빠져요. 파일을 반복해서 추가하면 일정이 중복될 수 있어요.</p>
          <label className="field">
            <span>캘린더 이름</span>
            <input value={state.settings.calendarName} onChange={(event) => dispatch({ type: 'patch-settings', patch: { calendarName: event.target.value } })} />
          </label>
          <div className="field-label">출근 전 알림</div>
          <div className="chips">
            {ALARMS.map((alarm) => (
              <button key={alarm.id} type="button" className={state.settings.alarm === alarm.id ? 'chip on' : 'chip'} onClick={() => dispatch({ type: 'patch-settings', patch: { alarm: alarm.id as AlarmOption } })}>
                {alarm.label}
              </button>
            ))}
          </div>
          <p className="hint">캘린더에는 근무만 넣어요. 예전에 올라간 급여일 일정은 다음 반영 때 달력에서 빠져요.</p>
        </section>

        <section>
          <h3>구독 피드</h3>
          <ol className="steps">
            <li>GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token. 권한은 gist 만 체크해요. fine-grained 토큰은 gist를 못 열어요.</li>
            <li>토큰(ghp_…)을 아래에 붙여넣어요. 이 폰에만 저장되고, 백업 파일에는 들어가지 않아요.</li>
            <li>‘캘린더 피드 올리기’를 눌러요. 링크를 모르는 사람은 볼 수 없는 비밀 gist에 달력이 올라가요.</li>
            <li>사파리에서 ‘구독 링크로 열기’를 누르고, 캘린더 앱에서 구독해요. 홈 화면 앱에서 링크가 막히면 주소를 복사한 뒤 설정 → 앱 → 캘린더 → 계정 → 계정 추가 → 기타 → 구독 캘린더 추가에 붙여넣어요.</li>
            <li>그 계정을 눌러 새로고침을 15분마다로 바꿔요. 근무를 고치면 앱이 피드를 다시 올려요. 캘린더 앱을 열면 갱신되고, 바로 안 바뀌면 아래로 당겨요.</li>
          </ol>
          <label className="field">
            <span>GitHub 토큰</span>
            <input type="password" autoComplete="off" placeholder="ghp_…" value={token} onChange={(event) => setToken(event.target.value)} />
          </label>
          <div className="row-actions">
            <button type="button" onClick={() => void saveToken()} disabled={checking}>{checking ? '확인 중' : '토큰 저장'}</button>
            <button type="button" className="primary-ghost" onClick={syncNow} disabled={syncing}>{syncing ? '올리는 중' : '캘린더 피드 올리기'}</button>
          </div>
          {state.settings.lastSyncAt && <p className="hint">마지막 반영 {state.settings.lastSyncAt.slice(0, 16).replace('T', ' ')}</p>}
          {state.settings.lastSyncError && <p className="sync-error">{state.settings.lastSyncError}</p>}
          {feed && (
            <>
              <p className="feed-url">{feed}</p>
              <div className="row-actions">
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(feed).then(() => toast('주소를 복사했어요.')).catch(() => toast(feed));
                  }}
                >
                  주소 복사
                </button>
                <a className="btn tiny" href={webcalUrl(feed)}>구독 링크로 열기</a>
              </div>
            </>
          )}
          <button
            type="button"
            className="text-link"
            onClick={() => {
              const planned = planFeed(state);
              if (planned.seqDirty) dispatch({ type: 'patch-settings', patch: { eventSeq: planned.eventSeq, tombstones: planned.tombstones } });
              void saveFile(`moamoa-${today}.ics`, planned.fileIcs, 'text/calendar');
              toast('파일로도 저장했어요. 다시 추가하면 겹칠 수 있어요.');
            }}
          >
            .ics 파일로 저장 (구독이 안 될 때만)
          </button>
        </section>

        <section>
          <h3>알아둘 점</h3>
          <ul className="notes">
            <li>구독 캘린더는 아이폰에서 직접 고칠 수 없어요. 일정은 모아모아에서 고쳐요.</li>
            <li>비밀 gist라도 주소를 아는 사람은 근무 장소와 금액을 볼 수 있어요. 주소는 공유하지 마세요.</li>
            <li>GitHub가 피드를 최대 5분 저장할 수 있고, 아이폰은 저전력 모드에서 새로고침을 미뤄요.</li>
            <li>지난 180일보다 오래된 근무는 피드에서 빠져요.</li>
            <li>.ics 파일을 캘린더에 여러 번 추가하면 복사본이 쌓여요. 구독을 써 주세요.</li>
          </ul>
        </section>

        <section>
          <h3>백업</h3>
          <p className="hint">장부는 이 기기에만 저장돼요. JSON으로 내보내 두면 폰을 바꿔도 가져올 수 있어요.</p>
          <div className="row-actions">
            <button type="button" onClick={() => void saveFile(`moamoa-${today}.json`, serializeBackup(state), 'application/json')}>내보내기</button>
            <label className="file-btn">
              가져오기
              <input
                type="file"
                accept="application/json,.json"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    try {
                      const next = parseBackup(String(reader.result), state);
                      dispatch({ type: 'replace', state: next });
                      toast('백업을 가져왔어요.');
                    } catch (error) {
                      toast(error instanceof Error ? error.message : '가져오지 못했어요.');
                    }
                  };
                  reader.readAsText(file);
                }}
              />
            </label>
          </div>
        </section>

        <section>
          <h3>홈 화면에 추가</h3>
          <p className="hint">사파리에서 공유 → 홈 화면에 추가를 누르면 모아모아 아이콘으로 전체 화면 앱이 돼요.</p>
          <button
            type="button"
            className="text-link"
            onClick={() => {
              void navigator.serviceWorker?.getRegistrations().then((regs) => Promise.all(regs.map((reg) => reg.unregister()))).then(() => {
                void caches.keys?.().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))).then(() => location.reload());
              });
            }}
          >
            최신 버전으로 새로고침
          </button>
        </section>

        <button
          type="button"
          className="danger-btn"
          onClick={() => {
            if (window.confirm('근무지, 근무, 급여 표시를 모두 지울까요?')) {
              dispatch({ type: 'reset' });
              toast('장부를 비웠어요.');
              onClose();
            }
          }}
        >
          데이터 지우기
        </button>
      </div>
    </Sheet>
  );
}
