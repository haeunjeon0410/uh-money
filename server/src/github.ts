// 1시간마다 GitHub에서 내 커밋을 가져온다.
// 내 활동 기록(events)은 토큰 종류에 따라 비공개 저장소 푸시가 빠지므로 쓰지 않고, 토큰으로 볼 수 있는 저장소를 직접 훑는다.
// 최근에 푸시된 저장소마다 브랜치 몇 개의 내 커밋을 모으고, 같은 커밋은 sha로 한 번만 저장한다.
import type { Env } from "./store";
import * as store from "./store";
import { dayStart } from "./engine/time";

type Fetch = typeof fetch;
const LOOKBACK_MS = 8 * 24 * 60 * 60 * 1000; // 지난주 보상 확정 전에 늦게 푸시한 커밋까지 잡을 만큼
const MAX_REPOS = 8; // Workers는 요청 한 번에 외부 호출을 50번까지만 허용한다
const MAX_BRANCHES = 3;

interface Repo {
  full_name: string;
  pushed_at: string | null;
  default_branch: string;
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

  const repos = (await get<Repo[]>(`/user/repos?affiliation=owner&sort=pushed&per_page=30`))
    .filter((r) => r.pushed_at && new Date(r.pushed_at) >= since)
    .slice(0, MAX_REPOS);

  let added = 0;
  for (const repo of repos) {
    // 기본 브랜치를 먼저 보고, 그 밖의 브랜치도 몇 개 본다
    const branches = await get<{ name: string }[]>(`/repos/${repo.full_name}/branches?per_page=10`);
    const names = [repo.default_branch, ...branches.map((b) => b.name).filter((n) => n !== repo.default_branch)].slice(0, MAX_BRANCHES);
    for (const branch of names) {
      const commits = await get<CommitItem[]>(
        `/repos/${repo.full_name}/commits?sha=${encodeURIComponent(branch)}&author=${env.GITHUB_USER}&since=${since.toISOString()}&per_page=100`,
      );
      for (const c of commits) {
        if (await store.insertCommit(env.DB, c.sha, new Date(c.commit.author.date))) added++;
      }
    }
  }
  return { skipped: false, added };
}
