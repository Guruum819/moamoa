export type GistRef = {
  id: string;
  owner: string;
  feedUrl: string;
};

type GistResponse = {
  id: string;
  owner?: { login?: string };
  message?: string;
};

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token.trim()}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': 'moamoa-ledger',
  };
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string };
    return body.message || `${res.status}`;
  } catch {
    return `${res.status}`;
  }
}

export function explainGithubStatus(status: number, message: string): string {
  if (status === 401) return '토큰이 맞지 않아요. classic 토큰에 gist 권한이 있는지 확인해 주세요.';
  if (status === 403) return 'GitHub가 요청을 거절했어요. 토큰 권한을 gist 만으로 다시 만들어 주세요.';
  if (status === 404) return '이전 캘린더 주소를 찾지 못했어요. 새로 만들게요.';
  return `GitHub 오류: ${message}`;
}

export async function checkGithubToken(token: string): Promise<{ login: string }> {
  const res = await fetch('https://api.github.com/user', { headers: authHeaders(token) });
  if (!res.ok) throw new Error(explainGithubStatus(res.status, await readError(res)));
  const scopes = res.headers.get('x-oauth-scopes') || '';
  if (scopes && !scopes.split(',').map((scope) => scope.trim()).includes('gist')) {
    throw new Error('이 토큰에는 gist 권한이 없어요. classic 토큰을 만들 때 gist 만 체크해 주세요.');
  }
  const body = (await res.json()) as { login?: string };
  if (!body.login) throw new Error('GitHub 계정을 확인하지 못했어요.');
  return { login: body.login };
}

function feedUrl(owner: string, id: string): string {
  return `https://gist.githubusercontent.com/${owner}/${id}/raw/moamoa.ics`;
}

export async function upsertCalendarGist(token: string, gistId: string, ownerHint: string, ics: string, calendarName: string): Promise<GistRef> {
  const payload = {
    description: `모아모아 캘린더 (${calendarName || '모아모아'})`,
    public: false,
    files: { 'moamoa.ics': { content: ics.endsWith('\r\n') ? ics : `${ics}\r\n` } },
  };
  const create = async (): Promise<GistRef> => {
    const res = await fetch('https://api.github.com/gists', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(explainGithubStatus(res.status, await readError(res)));
    const body = (await res.json()) as GistResponse;
    const owner = body.owner?.login || ownerHint;
    if (!body.id || !owner) throw new Error('캘린더 주소를 만들지 못했어요.');
    return { id: body.id, owner, feedUrl: feedUrl(owner, body.id) };
  };

  if (!gistId) return create();
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify({ description: payload.description, files: payload.files }),
  });
  if (res.status === 404) return create();
  if (!res.ok) throw new Error(explainGithubStatus(res.status, await readError(res)));
  const body = (await res.json()) as GistResponse;
  const owner = body.owner?.login || ownerHint;
  return { id: gistId, owner, feedUrl: feedUrl(owner, gistId) };
}
