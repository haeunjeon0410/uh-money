// Uh Money 위젯 (Scriptable). 아이폰에는 loader.js만 넣고, 이 파일은 로더가 GitHub에서 받아 실행한다.
// 디자인: design/widget.html (다크 링 + 오늘 받은 보상 아이콘 3개). 홈 화면 작은 위젯만 지원한다

const SERVER = "https://uh-money.uh-money-server.workers.dev";
const TOKEN_KEY = "uh-money-phone-token";
const CACHE_FILE = "uh-money-last.json";

const C = {
  bg: new Color("#1c1c1e"),
  track: new Color("#2c2c2e"),
  green: new Color("#30d158"),
  red: new Color("#ff453a"),
  white: Color.white(),
  gray: new Color("#8e8e93"),
  off: new Color("#48484a"),
  dim: new Color("#8e8e93"),
  run: new Color("#ff9f0a"),
  book: new Color("#bf5af2"),
  git: new Color("#0a84ff"),
  malhae: new Color("#64d2ff"),
  psat: new Color("#ffd60a"),
  badge: new Color("#30d158"),
  warn: new Color("#ff9f0a"),
};

// Wanted Sans가 아이폰에 설치돼 있으면 쓰고, 없으면 iOS가 시스템 폰트로 대신 그린다
function font(size, weight = "Bold") {
  return new Font(`WantedSans-${weight}`, size);
}

const fm = FileManager.local();
const cachePath = fm.joinPath(fm.documentsDirectory(), CACHE_FILE);

async function token() {
  if (Keychain.contains(TOKEN_KEY)) return Keychain.get(TOKEN_KEY);
  if (config.runsInWidget) return null;
  const a = new Alert();
  a.title = "Uh Money";
  a.message = "PC에서 복사한 아이폰용 토큰(PHONE_TOKEN)을 붙여넣으세요.";
  a.addSecureTextField("토큰");
  a.addAction("저장");
  a.addCancelAction("취소");
  if ((await a.presentAlert()) === -1) return null;
  const t = a.textFieldValue(0).trim();
  if (t) Keychain.set(TOKEN_KEY, t);
  return t || null;
}

// 서버에서 오늘 숫자를 받는다. 실패하면 마지막으로 받은 값을 쓰고 offline 표시
async function load() {
  const t = await token();
  if (!t) return { error: "토큰을 넣으려면 Scriptable에서 한 번 실행하세요" };
  try {
    const req = new Request(`${SERVER}/widget`);
    req.headers = { Authorization: `Bearer ${t}` };
    req.timeoutInterval = 10;
    const data = await req.loadJSON();
    if (req.response.statusCode === 401) {
      Keychain.remove(TOKEN_KEY);
      return { error: "토큰이 틀렸어요. Scriptable에서 다시 실행하세요" };
    }
    fm.writeString(cachePath, JSON.stringify(data));
    return data;
  } catch (e) {
    if (fm.fileExists(cachePath)) return { ...JSON.parse(fm.readString(cachePath)), offline: true };
    return { error: "서버에 연결할 수 없어요" };
  }
}

// 아이콘은 시안과 똑같은 모양으로 미리 만든 이미지(widget/assets/icons-v1.png)를 쓴다.
// iOS 기본 아이콘(SF 심볼)은 모양이 시안과 달라서, 한 장의 이미지에서 칸을 잘라 쓴다.
const SPRITE_URL = "https://raw.githubusercontent.com/haeunjeon0410/uh-money/main/widget/assets/icons-v1.png";
const spritePath = fm.joinPath(fm.documentsDirectory(), "uh-money-icons-v1.png");
const CELL = 96;
// [열, 줄]: 줄0=보상 색, 줄1=보상 꺼짐, 줄2=업적 달성(초록), 줄3=업적 지키는 중(회색)
const ICON = {
  exercise: [0, 0], study: [1, 0], commit: [2, 0], malhae: [3, 0], psat: [4, 0],
  noSpend: [0, 2], keptLimit: [1, 2], noDelivery: [2, 2], onTime: [3, 2],
};
let sprite = null;

async function loadSprite() {
  if (!fm.fileExists(spritePath)) {
    try {
      fm.writeImage(spritePath, await new Request(SPRITE_URL).loadImage());
    } catch (e) {
      return;
    }
  }
  sprite = fm.readImage(spritePath);
}

function slice(col, row) {
  const dc = new DrawContext();
  dc.size = new Size(CELL, CELL);
  dc.opaque = false;
  dc.respectScreenScale = false;
  if (sprite) dc.drawImageAtPoint(sprite, new Point(-col * CELL, -row * CELL));
  return dc.getImage();
}

const rewardIcon = (key, on) => slice(ICON[key][0], on ? 0 : 1);
const badgeIcon = (key, earned) => slice(ICON[key][0], earned ? 2 : 3);

const won = (n) => Math.abs(n).toLocaleString("ko-KR");

// 위젯 전체를 한 장의 그림으로 그려 배경에 넣는다. 위젯의 자동 배치(스택)는 가운데 정렬이 어긋나서,
// 모든 위치를 좌표로 직접 정한다. 작은 위젯이 정사각형이라 S×S 그림을 그대로 채운다.
const S = 160;
const G = {
  ringCy: 62, ringD: 108, ringLw: 10, // 링: 가운데 위쪽 (배지가 링 안으로 들어가서 더 크게)
  badgeSize: 11, badgeGap: 7, // 링 안 숫자 아래 업적 배지
  iconY: 128, iconSize: 17, // 보상 아이콘 줄
  barY: 148, barW: 16, barH: 3, // 아이콘 아래 진행 막대
  sideMargin: 20, // 보상 줄 좌우 여백 (넓히면 아이콘이 가운데로 모인다)
};

// 출석(onTime)은 위젯에서 바꿀 수 없는 일이라 배지로 보여주지 않는다. 보상에는 그대로 반영된다
const BADGES = ["noSpend", "keptLimit", "noDelivery"];
const REWARDS = [
  ["exercise", C.run], ["study", C.book], ["commit", C.git], ["malhae", C.malhae], ["psat", C.psat],
];

function homeImage(d) {
  const dc = new DrawContext();
  dc.size = new Size(S, S);
  dc.opaque = true;
  dc.respectScreenScale = true;
  dc.setFillColor(C.bg);
  dc.fillRect(new Rect(0, 0, S, S));

  const cx = S / 2;
  const cy = G.ringCy;
  const r = (G.ringD - G.ringLw) / 2;
  const over = d.remaining < 0;
  const pct = over ? 1 : d.allowance > 0 ? Math.max(0, Math.min(1, d.remaining / d.allowance)) : 0;

  circle(dc, cx, cy, r, G.ringLw, C.track);
  if (pct >= 1) circle(dc, cx, cy, r, G.ringLw, over ? C.red : C.green);
  else if (pct > 0) arc(dc, cx, cy, r, 0, pct, G.ringLw, over ? C.red : C.green);

  // ₩는 작은 회색, 숫자는 크고 굵게. 글자 폭 측정이 없어서 글자별 폭을 어림하고, 링 안쪽 폭에 맞게 글자 크기를 줄인다
  const num = `${over ? "−" : ""}${won(d.remaining)}`;
  const units = [...num].reduce((w, ch) => w + (ch === "," ? 0.27 : 0.6), 0) + 0.55 * 0.72 + 0.06;
  const big = Math.min(23, ((G.ringD - G.ringLw * 2) * 0.82) / units);
  const small = big * 0.55;
  const numWidth = [...num].reduce((w, ch) => w + (ch === "," ? 0.27 : 0.6) * big, 0);
  const wonWidth = 0.72 * small;
  const gap = big * 0.06;
  let x = cx - (wonWidth + gap + numWidth) / 2;
  const top = cy - big * 0.62;
  dc.setTextAlignedLeft();
  dc.setFont(font(small, "SemiBold"));
  dc.setTextColor(over ? C.red : C.gray);
  dc.drawTextInRect("₩", new Rect(x, top + (big - small) * 0.78, wonWidth + 4, small * 1.4));
  x += wonWidth + gap;
  dc.setFont(font(big));
  dc.setTextColor(over ? C.red : C.white);
  dc.drawTextInRect(num, new Rect(x, top, numWidth + 8, big * 1.4));

  if (d.stale || d.offline) {
    dc.setTextAlignedCenter();
    dc.setFont(font(9, "SemiBold"));
    dc.setTextColor(C.warn);
    dc.drawTextInRect(d.offline ? "⚠︎ 오프라인" : "⚠︎ 수집 끊김", new Rect(0, top - 13, S, 12));
  }

  // 업적 배지: 링 안 숫자 바로 아래. 지키는 중이면 초록으로 켜져 있다가, 깨지면 회색으로 꺼진다(자리는 그대로)
  const st = d.achievementsToday;
  const shown = BADGES.filter((k) => st?.[k] !== undefined && st[k] !== "none");
  const badgeY = cy + big * 0.55 + 3;
  let bx = cx - (shown.length * G.badgeSize + (shown.length - 1) * G.badgeGap) / 2;
  for (const key of shown) {
    dc.drawImageInRect(badgeIcon(key, st[key] === "earned" || st[key] === "ongoing"), new Rect(bx, badgeY, G.badgeSize, G.badgeSize));
    bx += G.badgeSize + G.badgeGap;
  }

  if (d.settlement) {
    // 정산이 필요하면 보상 줄 대신 채우기/빼기 안내를 보여준다
    const fill = d.settlement.action === "FILL";
    const label = `₩${won(d.settlement.amount)} ${fill ? "채우기" : "빼기"}`;
    const pw = 108;
    const pill = new Path();
    pill.addRoundedRect(new Rect(cx - pw / 2, G.iconY, pw, 24), 12, 12);
    dc.addPath(pill);
    dc.setFillColor(fill ? C.green : C.warn);
    dc.fillPath();
    dc.setTextAlignedCenter();
    dc.setFont(font(12));
    dc.setTextColor(Color.black());
    dc.drawTextInRect(label, new Rect(cx - pw / 2, G.iconY + 4, pw, 18));
  } else {
    // 매일 보상: 아이콘 + 아래 짧은 막대(오늘 받은 금액 / 그 항목 상한). 다섯 칸을 같은 간격으로 가운데에 둔다
    const colW = (S - G.sideMargin * 2) / REWARDS.length;
    REWARDS.forEach(([key, color], i) => {
      const reward = d.rewardsToday[key];
      const p = reward.max > 0 ? Math.min(1, reward.amount / reward.max) : 0;
      const mid = G.sideMargin + colW * (i + 0.5);
      dc.drawImageInRect(rewardIcon(key, p > 0), new Rect(mid - G.iconSize / 2, G.iconY, G.iconSize, G.iconSize));
      bar(dc, mid - G.barW / 2, G.barY, p, color);
    });
  }
  return dc.getImage();
}

// 꽉 찬 원은 이음새가 생기지 않게 정원으로 그린다
function circle(dc, cx, cy, r, width, color) {
  dc.setStrokeColor(color);
  dc.setLineWidth(width);
  dc.strokeEllipse(new Rect(cx - r, cy - r, r * 2, r * 2));
}

// DrawContext엔 원호가 없어서 짧은 선분으로 그리고, 양 끝에 원을 찍어 둥근 끝을 만든다
function arc(dc, cx, cy, r, from, to, width, color) {
  const steps = Math.max(2, Math.ceil(120 * (to - from)));
  const pt = (t) => {
    const a = -Math.PI / 2 + 2 * Math.PI * t;
    return new Point(cx + r * Math.cos(a), cy + r * Math.sin(a));
  };
  const path = new Path();
  path.addLines(Array.from({ length: steps + 1 }, (_, i) => pt(from + ((to - from) * i) / steps)));
  dc.addPath(path);
  dc.setStrokeColor(color);
  dc.setLineWidth(width);
  dc.strokePath();
  dc.setFillColor(color);
  for (const p of [pt(from), pt(to)]) dc.fillEllipse(new Rect(p.x - width / 2, p.y - width / 2, width, width));
}

function bar(dc, x, y, pct, color) {
  const track = new Path();
  track.addRoundedRect(new Rect(x, y, G.barW, G.barH), 1.5, 1.5);
  dc.addPath(track);
  dc.setFillColor(C.track);
  dc.fillPath();
  if (pct > 0) {
    const fill = new Path();
    fill.addRoundedRect(new Rect(x, y, Math.max(G.barH, G.barW * pct), G.barH), 1.5, 1.5);
    dc.addPath(fill);
    dc.setFillColor(color);
    dc.fillPath();
  }
}

async function homeWidget(d) {
  const w = new ListWidget();
  w.backgroundColor = C.bg;
  w.backgroundImage = homeImage(d);
  // 위젯을 누르면 이 스크립트를 앱에서 실행해 주간 모아보기를 열고, 정산이 필요하면 토스 송금 화면을 연다
  w.url = d.settlement?.url ?? `scriptable:///run/${encodeURIComponent(Script.name())}`;
  return w;
}

function errorWidget(message) {
  const w = new ListWidget();
  w.backgroundColor = C.bg;
  const t = w.addText(message);
  t.font = Font.mediumSystemFont(12);
  t.textColor = C.gray;
  return w;
}

// 정산 안내 알림은 같은 주·같은 종류로는 한 번만 보낸다. 알림을 누르면 토스 송금 화면이 열린다
async function notifySettlement(d) {
  const s = d.settlement;
  if (!s || !s.url) return;
  const key = `uh-money-notified-${d.week}-${s.action}`;
  if (Keychain.contains(key)) return;
  const n = new Notification();
  n.title = s.action === "FILL" ? "이번 주 용돈 채우기" : "남은 돈 빼기";
  n.body = s.action === "FILL"
    ? `케이뱅크에 ₩${won(s.amount)}을 채워 주세요.`
    : `케이뱅크에 ₩${won(s.amount)}이 남아요. 월급통장으로 보내 주세요. (토스에서 보내는 계좌를 케이뱅크로 선택)`;
  n.openURL = s.url;
  await n.schedule();
  Keychain.set(key, "1");
}

// --- 주간 모아보기 (위젯을 눌러 앱에서 실행될 때) ---

const CATEGORIES = [
  ["exercise", "운동", "#ff9f0a", (c) => `${c.days}회`],
  ["study", "공부", "#bf5af2", (c) => `${c.amount / 1000}시간`],
  ["commit", "커밋", "#0a84ff", (c) => `${c.amount / 100}회`],
  ["malhae", "말해보카", "#64d2ff", (c) => `${c.days}일`],
  ["psat", "피셋", "#ffd60a", (c) => `${c.days}일`],
  ["achievements", "업적", "#30d158", (c) => `${c.days}일`],
];
const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];

async function weekScreen() {
  const t = await token();
  if (!t) return;
  const req = new Request(`${SERVER}/week`);
  req.headers = { Authorization: `Bearer ${t}` };
  const v = await req.loadJSON();

  const pct = (n) => Math.min(100, (n / v.rewardsMax) * 100);
  const bar = CATEGORIES.map(([k, , color]) => `<div style="width:${pct(v.categories[k].amount)}%;background:${color}"></div>`).join("");
  const rows = CATEGORIES.map(([k, label, color, unit]) => {
    const c = v.categories[k];
    const on = c.amount > 0;
    return `<div class="row${on ? "" : " off"}"><span><i style="background:${on ? color : "#48484a"}"></i>${label} ${on ? unit(c) : ""}</span><span>${won(c.amount)}</span></div>`;
  }).join("");
  const peak = Math.max(10_000, ...v.days.map((d) => d.total));
  const days = v.days.map((d, i) => {
    const future = d.day > v.today;
    const h = future ? 0 : Math.max(3, (d.total / peak) * 56);
    return `<div class="day"><div class="col" style="height:${h}px;background:${d.day === v.today ? "#30d158" : "#3a3a3c"}"></div><span${d.day === v.today ? ' class="now"' : ""}>${WEEKDAYS[i]}</span></div>`;
  }).join("");

  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>

body{margin:0;background:#000;color:#fff;font-family:"Wanted Sans",-apple-system,sans-serif;padding:28px 22px}
.label{font-size:15px;color:#8e8e93}
.big{font-size:38px;font-weight:700;margin:4px 0 12px}
.big small{font-size:16px;color:#8e8e93;font-weight:500}
.bar{height:10px;border-radius:5px;background:#2c2c2e;overflow:hidden;display:flex}
.next{font-size:16px;color:#30d158;margin:14px 0 26px}
.row{display:flex;justify-content:space-between;font-size:16px;padding:9px 0;border-bottom:0.5px solid #1c1c1e}
.row i{display:inline-block;width:10px;height:10px;border-radius:5px;margin-right:10px}
.off{color:#48484a}
.days{display:flex;justify-content:space-between;align-items:flex-end;height:80px;margin:28px 4px 0}
.day{display:flex;flex-direction:column;align-items:center;gap:6px;font-size:12px;color:#8e8e93}
.col{width:22px;border-radius:4px}
.now{color:#fff}
.spent{display:flex;justify-content:space-between;font-size:16px;color:#8e8e93;margin-top:26px;padding-top:14px;border-top:0.5px solid #2c2c2e}
.spent b{color:#fff;font-weight:600}
</style></head><body>
<div class="label">이번 주 모은 보상</div>
<div class="big">₩${won(v.rewards)} <small>/ ${won(v.rewardsMax)}</small></div>
<div class="bar">${bar}</div>
<div class="next">다음 주 예산 ₩${won(v.nextBudget)}</div>
${rows}
<div class="days">${days}</div>
<div class="spent"><span>이번 주 지출</span><b>₩${won(v.spent)}</b></div>
</body></html>`;
  await WebView.loadHTML(html, null, undefined, true);
}

// 로더가 importModule로 불러 main()을 실행한다 (Scriptable 모듈은 최상위 await를 못 쓴다)
module.exports.main = async () => {
  await loadSprite();
  const data = await load();
  const widget = data.error ? errorWidget(data.error) : await homeWidget(data);
  if (!data.error && !data.offline) await notifySettlement(data);
  widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

  if (config.runsInWidget) Script.setWidget(widget);
  else await weekScreen();
  Script.complete();
};
