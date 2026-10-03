// Scriptable에 이 파일 내용만 붙여넣는다. 실행할 때마다 GitHub에서 최신 위젯 코드를 받아 돌린다.
const SRC = "https://raw.githubusercontent.com/haeunjeon0410/uh-money/main/widget/uh-money.js";
const fm = FileManager.local();
const path = fm.joinPath(fm.documentsDirectory(), "uh-money-main.js");
try {
  fm.writeString(path, await new Request(SRC).loadString());
} catch (e) {
  // 오프라인이면 마지막으로 받은 코드를 그대로 쓴다
}
await importModule(path).main();
