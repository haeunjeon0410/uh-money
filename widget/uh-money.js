// Uh Money 위젯 (Scriptable). 아이폰에는 loader.js만 넣고, 이 파일은 로더가 GitHub에서 받아 실행한다.
// 디자인: design/widget.html (다크 링 + 오늘 받은 보상 아이콘 3개)

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
function ringImage(d, size, lineWidth, numberSize, mono = false) {
  const dc = new DrawContext();
  dc.size = new Size(size, size);
  dc.opaque = false;
  dc.respectScreenScale = true;

  const over = d.remaining < 0;
  const pct = over ? 1 : d.allowance > 0 ? Math.max(0, Math.min(1, d.remaining / d.allowance)) : 0;
  const cx = size / 2;
  const r = (size - lineWidth) / 2;
  const color = mono ? C.white : over ? C.red : C.green;

  arc(dc, cx, r, 0, 1, lineWidth, mono ? new Color("#ffffff", 0.3) : C.track);
  if (pct > 0) arc(dc, cx, r, 0, pct, lineWidth, color);

  if (numberSize > 0) {
    const label = `${over ? "−" : ""}₩${won(d.remaining)}`;
    dc.setFont(font(over ? numberSize * 0.82 : numberSize));
    dc.setTextColor(over && !mono ? C.red : C.white);
    dc.setTextAlignedCenter();
    dc.drawTextInRect(label, new Rect(lineWidth, cx - numberSize * 0.68, size - lineWidth * 2, numberSize * 1.4));
    if (d.stale || d.offline) {
      dc.setFont(font(numberSize * 0.4, "SemiBold"));
      dc.setTextColor(C.warn);
      dc.drawTextInRect(d.offline ? "⚠︎ 오프라인" : "⚠︎ 수집 끊김", new Rect(lineWidth, cx + numberSize * 0.62, size - lineWidth * 2, numberSize));
    }
  }
  return dc.getImage();
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
  if (to - from < 1) {
    dc.setFillColor(color);
    for (const p of [pt(from), pt(to)]) dc.fillEllipse(new Rect(p.x - width / 2, p.y - width / 2, width, width));
  }
}

function chip(stack, image, amount, color, mono) {
  const s = stack.addStack();
  s.layoutVertically();
  s.centerAlignContent();
  const done = amount > 0;
  const row = s.addStack();
  row.addSpacer();
  const img = row.addImage(image);
  img.imageSize = new Size(18, 18);
  img.tintColor = mono ? (done ? C.white : new Color("#ffffff", 0.35)) : done ? color : C.off;
  row.addSpacer();
  if (mono) return;
  s.addSpacer(2);
  const textRow = s.addStack();
  textRow.addSpacer();
  const t = textRow.addText(won(amount));
  t.font = font(12, "SemiBold");
  t.textColor = done ? C.white : C.off;
  textRow.addSpacer();
}

async function homeWidget(d) {
  const w = new ListWidget();
  w.backgroundColor = C.bg;
  w.setPadding(12, 12, 10, 12);

  const top = w.addStack();
  top.addSpacer();
  const ring = top.addImage(ringImage(d, 100, 9, 21));
  ring.imageSize = new Size(100, 100);
  top.addSpacer();

  w.addSpacer();
  const chips = w.addStack();
  const git = await githubIcon();
  chip(chips, SFSymbol.named("figure.run").image, d.rewardsToday.exercise, C.run);
  chip(chips, SFSymbol.named("book.fill").image, d.rewardsToday.study, C.book);
  chip(chips, git, d.rewardsToday.commit, C.git);
  return w;
}

async function lockWidget(d) {
  const w = new ListWidget();
  const row = w.addStack();
  row.centerAlignContent();
  const ring = row.addImage(ringImage(d, 40, 5, 0, true));
  ring.imageSize = new Size(40, 40);
  row.addSpacer(8);

  const col = row.addStack();
  col.layoutVertically();
  const n = col.addText(`${d.remaining < 0 ? "−" : ""}₩${won(d.remaining)}${d.stale || d.offline ? " ⚠︎" : ""}`);
  n.font = font(20);
  n.minimumScaleFactor = 0.7;
  col.addSpacer(2);
  const icons = col.addStack();
  icons.spacing = 6;
  const git = await githubIcon();
  for (const [img, amount] of [
    [SFSymbol.named("figure.run").image, d.rewardsToday.exercise],
    [SFSymbol.named("book.fill").image, d.rewardsToday.study],
    [git, d.rewardsToday.commit],
  ]) {
    const i = icons.addImage(img);
    i.imageSize = new Size(13, 13);
    i.tintColor = new Color("#ffffff", amount > 0 ? 1 : 0.35);
  }
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

// 로더가 importModule로 불러 main()을 실행한다 (Scriptable 모듈은 최상위 await를 못 쓴다)
module.exports.main = async () => {
  const data = await load();
  const family = config.widgetFamily ?? "small";
  let widget;
  if (data.error) widget = errorWidget(data.error);
  else if (family.startsWith("accessory")) widget = await lockWidget(data);
  else widget = await homeWidget(data);
  widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

  if (config.runsInWidget) Script.setWidget(widget);
  else await widget.presentSmall();
  Script.complete();
};
