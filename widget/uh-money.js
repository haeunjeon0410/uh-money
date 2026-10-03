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
    dc.setFont(font(big * 0.42, "SemiBold"));
    dc.setTextColor(C.warn);
    dc.drawTextInRect(d.offline ? "⚠︎ 오프라인" : "⚠︎ 수집 끊김", new Rect(lineWidth, cx + big * 0.7, size - lineWidth * 2, big));
  }
  return dc.getImage();
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

function chip(stack, image, amount, color) {
  const done = amount > 0;
  const s = stack.addStack();
  s.layoutVertically();
  const iconRow = s.addStack();
  iconRow.addSpacer();
  const img = iconRow.addImage(image);
  img.imageSize = new Size(19, 19);
  img.tintColor = done ? color : C.off;
  iconRow.addSpacer();
  s.addSpacer(3);
  const textRow = s.addStack();
  textRow.addSpacer();
  const t = textRow.addText(done ? `+${won(amount)}` : "0"); // 안 한 날도 같은 높이를 차지하게 투명 글자를 둔다
  t.font = font(11, "SemiBold");
  t.textColor = done ? color : Color.clear();
  textRow.addSpacer();
}

async function homeWidget(d) {
  const w = new ListWidget();
  w.backgroundColor = C.bg;
  w.setPadding(12, 10, 10, 10);

  const top = w.addStack();
  top.addSpacer();
  const ring = top.addImage(ringImage(d, 104, 10, 24));
  ring.imageSize = new Size(104, 104);
  top.addSpacer();

  w.addSpacer(8);

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
  chip(chips, SFSymbol.named("figure.run").image, d.rewardsToday.exercise, C.run);
  chip(chips, SFSymbol.named("book.fill").image, d.rewardsToday.study, C.book);
  chip(chips, git, d.rewardsToday.commit, C.git);
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

// 로더가 importModule로 불러 main()을 실행한다 (Scriptable 모듈은 최상위 await를 못 쓴다)
module.exports.main = async () => {
  const data = await load();
  const widget = data.error ? errorWidget(data.error) : await homeWidget(data);
  if (!data.error && !data.offline) await notifySettlement(data);
  widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

  if (config.runsInWidget) Script.setWidget(widget);
  else await widget.presentSmall();
  Script.complete();
};
