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
const githubIconPath = fm.joinPath(fm.documentsDirectory(), "uh-money-github.png");

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

async function githubIcon() {
  if (fm.fileExists(githubIconPath)) return fm.readImage(githubIconPath);
  try {
    const img = await new Request("https://github.githubassets.com/favicons/favicon-dark.png").loadImage();
    fm.writeImage(githubIconPath, img);
    return img;
  } catch (e) {
    return SFSymbol.named("chevron.left.forwardslash.chevron.right").image;
  }
}

const won = (n) => Math.abs(n).toLocaleString("ko-KR");

// 링 + 가운데 숫자를 한 장의 이미지로 그린다 (위젯 스택은 겹쳐 그릴 수 없어서)
function ringImage(d, size, lineWidth, numberSize) {
  const dc = new DrawContext();
  dc.size = new Size(size, size);
  dc.opaque = false;
  dc.respectScreenScale = true;

  const over = d.remaining < 0;
  const pct = over ? 1 : d.allowance > 0 ? Math.max(0, Math.min(1, d.remaining / d.allowance)) : 0;
  const cx = size / 2;
  const r = (size - lineWidth) / 2;

  circle(dc, cx, r, lineWidth, C.track);
  if (pct >= 1) circle(dc, cx, r, lineWidth, over ? C.red : C.green);
  else if (pct > 0) arc(dc, cx, r, 0, pct, lineWidth, over ? C.red : C.green);

  // ₩는 작은 회색, 숫자는 크고 굵게. DrawContext엔 글자 폭 측정이 없어서 글자별 폭을 어림하고,
  // 링 안쪽 폭의 78%를 넘지 않도록 글자 크기를 줄인다 (100,000처럼 긴 금액도 링 안에 들어가게)
  const num = `${over ? "−" : ""}${won(d.remaining)}`;
  const units = [...num].reduce((w, ch) => w + (ch === "," ? 0.27 : 0.6), 0) + 0.55 * 0.72 + 0.06;
  const big = Math.min(numberSize, ((size - lineWidth * 2) * 0.78) / units);
  const small = big * 0.55;
  const numWidth = [...num].reduce((w, ch) => w + (ch === "," ? 0.27 : 0.6) * big, 0);
  const wonWidth = 0.72 * small;
  const gap = big * 0.06;
  let x = cx - (wonWidth + gap + numWidth) / 2;
  const top = cx - big * 0.62;

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
    dc.drawTextInRect(d.offline ? "⚠︎ 오프라인" : "⚠︎ 수집 끊김", new Rect(lineWidth, top - 13, size - lineWidth * 2, 12));
  }
  return dc.getImage();
}

// 업적 배지: 달성(earned)은 초록, 지키는 중(ongoing)은 회색, 깨졌거나 해당 없으면 숨긴다
const BADGES = [
  ["noSpend", "wonsign.circle.fill"],
  ["keptLimit", "checkmark.shield.fill"],
  ["noDelivery", "takeoutbag.and.cup.and.straw.fill"],
  ["onTime", "graduationcap.fill"],
];

// 링 아래 작은 배지 줄. 하나도 보일 게 없으면 줄 자체를 만들지 않는다
function badgeRow(w, states) {
  const shown = BADGES.filter(([key]) => states?.[key] === "earned" || states?.[key] === "ongoing");
  if (shown.length === 0) return;
  const row = w.addStack();
  row.spacing = 5;
  row.addSpacer();
  for (const [key, name] of shown) {
    const sym = SFSymbol.named(name);
    if (!sym) continue;
    const img = row.addImage(sym.image);
    img.imageSize = new Size(10, 10);
    img.tintColor = states[key] === "earned" ? C.badge : C.off;
  }
  row.addSpacer();
}

// 꽉 찬 원은 이음새가 생기지 않게 정원으로 그린다
function circle(dc, c, r, width, color) {
  dc.setStrokeColor(color);
  dc.setLineWidth(width);
  dc.strokeEllipse(new Rect(c - r, c - r, r * 2, r * 2));
}

// DrawContext엔 원호가 없어서 짧은 선분으로 그리고, 양 끝에 원을 찍어 둥근 끝을 만든다
function arc(dc, c, r, from, to, width, color) {
  const steps = Math.max(2, Math.ceil(120 * (to - from)));
  const pt = (t) => {
    const a = -Math.PI / 2 + 2 * Math.PI * t;
    return new Point(c + r * Math.cos(a), c + r * Math.sin(a));
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

// 매일 보상 한 칸: 아이콘 + 아래 짧은 막대 (오늘 받은 금액 / 그 항목 상한)
function chip(stack, image, reward, color) {
  const pct = reward.max > 0 ? Math.min(1, reward.amount / reward.max) : 0;
  const s = stack.addStack();
  s.layoutVertically();
  const iconRow = s.addStack();
  iconRow.addSpacer();
  const img = iconRow.addImage(image);
  img.imageSize = new Size(17, 17);
  img.tintColor = pct > 0 ? color : C.off;
  iconRow.addSpacer();
  s.addSpacer(4);
  const barRow = s.addStack();
  barRow.addSpacer();
  barRow.addImage(barImage(pct, color)).imageSize = new Size(16, 3);
  barRow.addSpacer();
}

function barImage(pct, color) {
  const dc = new DrawContext();
  dc.size = new Size(16, 3);
  dc.opaque = false;
  dc.respectScreenScale = true;
  const track = new Path();
  track.addRoundedRect(new Rect(0, 0, 16, 3), 1.5, 1.5);
  dc.addPath(track);
  dc.setFillColor(C.track);
  dc.fillPath();
  if (pct > 0) {
    const fill = new Path();
    fill.addRoundedRect(new Rect(0, 0, Math.max(3, 16 * pct), 3), 1.5, 1.5);
    dc.addPath(fill);
    dc.setFillColor(color);
    dc.fillPath();
  }
  return dc.getImage();
}

async function homeWidget(d) {
  const w = new ListWidget();
  w.backgroundColor = C.bg;
  w.setPadding(12, 10, 10, 10);

  const top = w.addStack();
  top.addSpacer();
  const ring = top.addImage(ringImage(d, 96, 9, 23));
  ring.imageSize = new Size(96, 96);
  top.addSpacer();

  w.addSpacer(5);
  badgeRow(w, d.achievementsToday);
  w.addSpacer(6);

  // 위젯을 누르면 이 스크립트를 앱에서 실행해 주간 모아보기를 연다
  w.url = `scriptable:///run/${encodeURIComponent(Script.name())}`;

  // 정산이 필요하면 보상 줄 대신 채우기/빼기 안내를 보여주고, 위젯을 누르면 토스 송금 화면을 연다
  if (d.settlement) {
    if (d.settlement.url) w.url = d.settlement.url;
    const row = w.addStack();
    row.addSpacer();
    const pill = row.addStack();
    pill.backgroundColor = d.settlement.action === "FILL" ? C.green : C.warn;
    pill.cornerRadius = 10;
    pill.setPadding(5, 10, 5, 10);
    const t = pill.addText(`₩${won(d.settlement.amount)} ${d.settlement.action === "FILL" ? "채우기" : "빼기"}`);
    t.font = font(12);
    t.textColor = Color.black();
    row.addSpacer();
    return w;
  }

  const chips = w.addStack();
  const git = await githubIcon();
  const sym = (name, fallback) => (SFSymbol.named(name) ?? SFSymbol.named(fallback)).image;
  const r = d.rewardsToday;
  chip(chips, sym("figure.run", "figure.walk"), r.exercise, C.run);
  chip(chips, sym("book.fill", "book"), r.study, C.book);
  chip(chips, git, r.commit, C.git);
  chip(chips, sym("character.bubble.fill", "bubble.left.fill"), r.malhae, C.malhae);
  chip(chips, sym("pencil.and.list.clipboard", "list.bullet.clipboard.fill"), r.psat, C.psat);
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
    ? `케이뱅크에 ₩${won(s.amount)}을 채워 주세요. 누르면 토스 송금 화면이 열려요.`
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
  const data = await load();
  const widget = data.error ? errorWidget(data.error) : await homeWidget(data);
  if (!data.error && !data.offline) await notifySettlement(data);
  widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

  if (config.runsInWidget) Script.setWidget(widget);
  else await weekScreen();
  Script.complete();
};
