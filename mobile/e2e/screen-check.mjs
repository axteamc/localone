// 웹 자동 화면 검사(시연 전 개선 S5). 시연 순서대로 화면을 열어 겹침·넘침·버튼 없음·정렬·콘솔 오류·HTTP 오류를 본다.
//
// 준비: 서버(uvicorn :8000, 로컬 DB)와 Metro 웹(`npx expo start --web`, CI=1 없이)을 띄운다.
// 실행: `npm run e2e:web` (주소 바꾸기: E2E_BASE=http://localhost:8083). 첫 실행 전 `npx playwright install chromium`.
// 실패하면 e2e/output/<크기>_<화면>.png 를 남기고 종료 코드 1.
// 로그인 뒤 화면은 다루지 않는다(Google 로그인 자동화 불가) — 로그아웃 상태만.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.E2E_BASE ?? "http://localhost:8081";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "output");
const GWANGJU = { latitude: 35.1765, longitude: 126.9253 }; // 광주 북구(로컬 DB 도서관이 광주)
const SIZES = [
  { name: "390x844", width: 390, height: 844 },
  { name: "375x667", width: 375, height: 667 },
  { name: "1280x800", width: 1280, height: 800 },
];

// need: 보이고 눌릴 수 있어야 하는 것. text = 보이는 글자, testId = testID, label = 접근성 이름
// alignTestIdPrefix: 같은 열 카드들의 왼쪽 시작선이 ±1px 안이어야 한다
const SCREENS = [
  { id: "home", path: "/", need: [{ text: "도서관 찾기" }] },
  { id: "find", path: "/", click: { text: "도서관 찾기" }, need: [{ testId: "find-sheet-input" }] },
  { id: "visit", path: "/libraries/30?distanceM=5", need: [{ label: "글쓰기" }] },
  { id: "compose", path: "/posts/new?libraryId=30", need: [{ text: "로그인하기" }] },
  { id: "search", path: "/search", need: [{ testId: "search-input" }, { testId: "search-button" }] },
  { id: "search-result", path: "/search", type: "채식주의자", need: [{ testId: "search-input" }] },
  {
    id: "detail",
    path: "/books/9788936434120",
    wait: { testIdPrefix: "library-" },
    need: [{ text: "빌릴 예정에 저장" }, { testIdPrefix: "live-check-" }, { testIdPrefix: "info-open-" }],
    alignTestIdPrefix: "library-",
  },
  { id: "loans", path: "/loans", need: [{ text: "로그인" }] },
  { id: "me", path: "/me", need: [{ text: "로그인" }] },
  { id: "login", path: "/login", need: [{ text: "Google로 계속하기" }] },
];

/** 페이지 안에서 돈다: 보이는 글자끼리 겹침, 화면 밖 넘침, 필요한 요소 확인, 정렬 */
function inspect({ need, alignTestIdPrefix }) {
  const problems = [];
  const vw = innerWidth;
  const vh = innerHeight;
  const onTop = (el) => {
    const r = el.getBoundingClientRect();
    const x = Math.min(vw - 1, Math.max(0, r.left + r.width / 2));
    const y = Math.min(vh - 1, Math.max(0, r.top + r.height / 2));
    const hit = document.elementFromPoint(x, y);
    return !!hit && (hit === el || el.contains(hit) || hit.contains(el));
  };
  const inHScroll = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if ((o === "auto" || o === "scroll") && p.scrollWidth > p.clientWidth) return true;
    }
    return false;
  };
  const textEls = [];
  for (const el of document.querySelectorAll("body *")) {
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own) continue;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    if (r.width === 0 || r.height === 0 || s.visibility === "hidden" || Number(s.opacity) === 0) continue;
    if (r.bottom <= 0 || r.top >= vh) continue;
    textEls.push(el);
  }
  // 넘침: 가로 스크롤 영역 밖에서 화면 오른쪽을 넘는 글자
  if (document.documentElement.scrollWidth > vw + 1) problems.push(`가로 넘침: 문서 폭 ${document.documentElement.scrollWidth} > ${vw}`);
  for (const el of textEls) {
    const r = el.getBoundingClientRect();
    if ((r.right > vw + 1 || r.left < -1) && !inHScroll(el)) problems.push(`화면 밖 글자: "${el.textContent.trim().slice(0, 20)}"`);
  }
  // 겹침: 보이는 글자끼리 사각형이 겹침(조상·자손 관계 제외).
  // 보이는 사각형 = 부모의 overflow로 잘린 부분과 화면 밖을 뺀 것(탭 바·창 아래로 잘린 글자는 겹침이 아님).
  const visRect = (el) => {
    const r = el.getBoundingClientRect();
    let [l, t, rt, b] = [Math.max(0, r.left), Math.max(0, r.top), Math.min(vw, r.right), Math.min(vh, r.bottom)];
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.overflow === "visible" && s.overflowX === "visible" && s.overflowY === "visible") continue;
      const pr = p.getBoundingClientRect();
      [l, t, rt, b] = [Math.max(l, pr.left), Math.max(t, pr.top), Math.min(rt, pr.right), Math.min(b, pr.bottom)];
    }
    return rt - l > 1 && b - t > 1 ? { left: l, top: t, right: rt, bottom: b } : null;
  };
  // 가운데 점을 덮은 것이 같은 층의 글자·버튼이면 겹침 후보. 위에 떠 있는 다른 층(창·덮개·절대 위치 배지)이 덮었으면 뺀다.
  const hasOwnText = (e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  const isOverlayLayer = (hit, el) => {
    for (let p = hit; p && !p.contains(el); p = p.parentElement) {
      const pos = getComputedStyle(p).position;
      if (pos === "absolute" || pos === "fixed") return true;
    }
    return false;
  };
  const visibleText = [];
  for (const el of textEls) {
    const vr = visRect(el);
    if (!vr) continue;
    const hit = document.elementFromPoint((vr.left + vr.right) / 2, (vr.top + vr.bottom) / 2);
    if (!hit) continue;
    const mine = hit === el || el.contains(hit) || hit.contains(el);
    const sameLayerContent = !mine && (hasOwnText(hit) || !!hit.closest('[role="button"],button,a')) && !isOverlayLayer(hit, el);
    if (mine || sameLayerContent) visibleText.push({ el, r: vr });
  }
  for (let i = 0; i < visibleText.length; i++) {
    for (let j = i + 1; j < visibleText.length; j++) {
      const { el: a, r: ra } = visibleText[i];
      const { el: b, r: rb } = visibleText[j];
      if (a.contains(b) || b.contains(a)) continue;
      const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (w > 2 && h > 2) problems.push(`글자 겹침: "${a.textContent.trim().slice(0, 16)}" ↔ "${b.textContent.trim().slice(0, 16)}" (${Math.round(w)}×${Math.round(h)})`);
    }
  }
  // 필요한 요소: 있고, 크기 > 0, 가려지지 않음
  for (const n of need) {
    let els = [];
    if (n.testId) els = [...document.querySelectorAll(`[data-testid="${n.testId}"]`)];
    else if (n.testIdPrefix) els = [...document.querySelectorAll(`[data-testid^="${n.testIdPrefix}"]`)];
    else if (n.label) els = [...document.querySelectorAll(`[aria-label="${n.label}"]`)];
    else els = textEls.filter((e) => e.textContent.trim() === n.text);
    const name = n.testId ?? n.testIdPrefix ?? n.label ?? n.text;
    const ok = els.filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.top < vh && r.bottom > 0;
    });
    if (ok.length === 0) problems.push(`버튼 없음: ${name}`);
    else if (!ok.some(onTop)) problems.push(`가려진 버튼: ${name}`);
  }
  // 정렬: 같은 열 카드의 왼쪽 시작선
  if (alignTestIdPrefix) {
    const lefts = [...document.querySelectorAll(`[data-testid^="${alignTestIdPrefix}"]`)].map((e) => Math.round(e.getBoundingClientRect().left));
    if (lefts.length > 1 && Math.max(...lefts) - Math.min(...lefts) > 1) problems.push(`정렬 어긋남: ${alignTestIdPrefix}* 왼쪽 ${lefts.join(",")}`);
  }
  return problems;
}

async function run() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const failures = [];
  for (const size of SIZES) {
    const ctx = await browser.newContext({
      viewport: { width: size.width, height: size.height },
      geolocation: GWANGJU,
      permissions: ["geolocation"],
      locale: "ko-KR",
    });
    for (const sc of SCREENS) {
      const page = await ctx.newPage();
      const errors = [];
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(`콘솔 오류: ${m.text().slice(0, 160)}`);
      });
      page.on("pageerror", (e) => errors.push(`페이지 오류: ${e.message.slice(0, 160)}`));
      page.on("response", (r) => {
        const u = new URL(r.url());
        // 앱·API만 본다(외부 표지 이미지 등은 제외)
        if (r.status() >= 400 && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) errors.push(`HTTP ${r.status()}: ${u.pathname}`);
      });
      try {
        await page.goto(BASE + sc.path, { waitUntil: "networkidle", timeout: 30000 });
        if (sc.wait?.testIdPrefix) await page.waitForSelector(`[data-testid^="${sc.wait.testIdPrefix}"]`, { timeout: 15000 });
        await page.waitForTimeout(1500);
        if (sc.click) {
          await page.getByText(sc.click.text, { exact: true }).first().click();
          await page.waitForTimeout(1000);
        }
        if (sc.type) {
          const input = page.getByTestId("search-input");
          await input.fill(sc.type);
          await input.press("Enter");
          await page.waitForTimeout(2500);
        }
        const problems = [...errors, ...(await page.evaluate(inspect, { need: sc.need, alignTestIdPrefix: sc.alignTestIdPrefix }))];
        if (problems.length) {
          await page.screenshot({ path: join(OUT, `${size.name}_${sc.id}.png`) });
          failures.push({ where: `${size.name} ${sc.id}`, problems });
        }
        console.log(`${problems.length ? "✗" : "✓"} ${size.name} ${sc.id}${problems.length ? ` — ${problems.length}건` : ""}`);
      } catch (e) {
        await page.screenshot({ path: join(OUT, `${size.name}_${sc.id}.png`) }).catch(() => {});
        failures.push({ where: `${size.name} ${sc.id}`, problems: [`실행 실패: ${e.message.split("\n")[0]}`] });
        console.log(`✗ ${size.name} ${sc.id} — 실행 실패`);
      }
      await page.close();
    }
    await ctx.close();
  }
  await browser.close();
  if (failures.length) {
    console.log("\n실패 목록");
    for (const f of failures) for (const p of f.problems) console.log(`- ${f.where}: ${p}`);
    process.exit(1);
  }
  console.log("\n모든 화면 통과");
}

run();
