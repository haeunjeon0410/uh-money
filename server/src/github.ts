// 1시간마다 GitHub에서 내 커밋을 가져온다.
// 내 계정의 최근 푸시 이벤트를 보고, 푸시된 브랜치 끝(head)에서 내가 작성한 커밋을 모은다.
// 기본 브랜치가 아닌 곳에 푸시한 커밋도 세고, 여러 브랜치에 같은 커밋이 있어도 sha로 한 번만 저장한다.
import type { Env } from "./store";
import * as store from "./store";
import { dayStart } from "./engine/time";

type Fetch = typeof fetch;
const LOOKBACK_MS = 8 * 24 * 60 * 60 * 1000; // 지난주 보상 확정 전에 늦게 푸시한 커밋까지 잡을 만큼

interface PushEvent {
  type: string;
  created_at: string;
  repo: { name: string };
  payload: { head?: string };
}

interface CommitItem {
  sha: string;
  commit: { author: { date: string } };
}

export async function syncCommits(env: Env, now: Date, fetchFn: Fetch = fetch) {
  if (!env.GITHUB_TOKEN) return { skipped: true, added: 0 };
  const firstDay = dayStart(env.FIRST_WEEK);
  const since = new Date(Math.max(firstDay.getTime(), now.getTime() - LOOKBACK_MS));

  const get = async <T>(path: string): Promise<T> => {
    const res = await fetchFn(`https://api.github.com${path}`, {
      headers: {
        authorization: `Bearer ${env.GITHUB_TOKEN}`,
        accept: "application/vnd.github+json",
        "user-agent": "uh-money",
      },
    });
    if (!res.ok) throw new Error(`GitHub ${res.status} ${path}`);
    return (await res.json()) as T;
  };

  const events = await get<PushEvent[]>(`/users/${env.GITHUB_USER}/events?per_page=100`);
  const heads = new Set<string>();
  for (const e of events) {
    if (e.type !== "PushEvent" || !e.payload.head || new Date(e.created_at) < since) continue;
    heads.add(`${e.repo.name}@${e.payload.head}`);
  }

  let added = 0;
  for (const key of heads) {
    const [repo, head] = key.split("@");
    const commits = await get<CommitItem[]>(
      `/repos/${repo}/commits?sha=${head}&author=${env.GITHUB_USER}&since=${since.toISOString()}&per_page=100`,
    );
    for (const c of commits) {
      if (await store.insertCommit(env.DB, c.sha, new Date(c.commit.author.date))) added++;
    }
  }
  return { skipped: false, added };
}
