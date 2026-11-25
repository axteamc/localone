// 실기기 개선 P2~P4: 시안(실기기개선_P2-P4_시안.html)과 웹 앱(가짜 API·가짜 세션)을 390×844로 캡처
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
const require = createRequire("C:/seokhunchoi_Ax_Fullstack/libproject/mobile/package.json");
const { chromium } = require("playwright");

const OUT = join(process.argv[2], "cap2");
mkdirSync(OUT, { recursive: true });
const APP = "http://localhost:8091";
const API = "http://172.20.10.3:8000";
const MOCK = "file:///C:/seokhunchoi_Ax_Fullstack/libproject/개발산출물/시안/실기기개선_P2-P4_시안.html";
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const T = { date: today, is_closed: false, hours_text: "09:00~18:00", holiday_unchecked: false };
const lib = (id, name, d) => ({ id, name, address: `광주 북구 ${id}`, latitude: 35.17 + id / 1000, longitude: 126.92 + id / 1000,
  dtl_region_code: "24040", area_label: "북구", distance_m: d, today: T, tel: null, homepage: "https://lib.example.org",
  operating_time_text: null, closed_text: null });
const LIBS = [lib(1, "전남광주통합특별시 북구 중흥도서관", 1200), lib(2, "운암도서관", 420), lib(3, "일곡도서관", 2100)];
const book = (i, t) => ({ isbn13: `97889364341${String(20 + i).padStart(2, "0")}`, title: t, author: "작가", publisher: "출판",
  cover_url: null, source: "yes24", description: null, pub_year: 2024 });
const TITLES = ["불편한 편의점", "아몬드", "채식주의자", "소년이 온다", "작별하지 않는다", "82년생 김지영", "1984", "데미안"];
const REC = { kind: "popular", scope: "national", library_id: null, basis_label: "YES24 스테디셀러 · 국내도서", theme: null,
  books: TITLES.map((t, i) => book(i, t)), fetched_at: null, stale: false, fallback_reason: null };
const SHELF = { pages: [
  { kind: "theme", title: "요즘 서점 스테디셀러", basis_label: "이 도서관 소장", books: TITLES.slice(0, 4).map((t, i) => ({ ...book(i, t) })) },
  { kind: "popular", title: "인기 도서", basis_label: "최근 30일 대출", books: TITLES.slice(4, 8).map((t, i) => ({ ...book(i + 4, t) })) },
] };

const unknown = new Set();
function respond(path, method, q) {
  if (path === "/api/v1/auth/session") return { user_id: "00000000-0000-4000-8000-000000000001" };
  if (path === "/api/v1/libraries") return { mode: "nearby", radius_km: 3, dtl_region: null, q: null, items: LIBS };
  const m = path.match(/^\/api\/v1\/libraries\/(\d+)$/);
  if (m) return LIBS.find((l) => l.id === Number(m[1])) ?? LIBS[0];
  if (path.endsWith("/shelf")) return SHELF;
  if (path.endsWith("/stamps/today")) {
    if (method === "PUT") return { stamped: true, stamp: { id: "s1", stamped_on: today, visibility: "public" } };
    return { stamped: true, stamp: { id: "s1", stamped_on: today, visibility: "private" } };
  }
  if (path.match(/\/libraries\/\d+\/(feed|posts)/)) return { items: [], next_cursor: null };
  if (path === "/api/v1/books/recommendations") return REC;
  if (path === "/api/v1/me/settings") return { club_notices: true };
  if (path === "/api/v1/me/inbox") return { items: [{ id: "i1", kind: "club_confirmed", title: "모임 일정이 확정됐어요", target: { club_id: "c1" }, created_at: new Date().toISOString(), read: true }], next_cursor: null };
  if (path === "/api/v1/me/inbox/unread" || path === "/api/v1/me/inbox/read") return { has_unread: false };
  if (path === "/api/v1/me/restrictions") return { items: [] };
  if (path === "/api/v1/me/profile") return { user_id: "u", nickname: "이웃-6e74", bio: null, avatar_url: null, updated_at: new Date().toISOString() };
  if (path.startsWith("/api/v1/me/")) return { items: [], next_cursor: null };
  unknown.add(`${method} ${path}`);
  return null;
}
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };

const browser = await chromium.launch({ channel: "msedge" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
  geolocation: { latitude: 35.1765, longitude: 126.9253 }, permissions: ["geolocation"], locale: "ko-KR" });
await ctx.addInitScript(() => {
  const exp = Math.floor(Date.now() / 1000) + 86400;
  localStorage.setItem("sb-blsdnibkgukoksmwnuxu-auth-token", JSON.stringify({ access_token: "x.eyJzdWIiOiJ1In0.x", refresh_token: "r",
    token_type: "bearer", expires_in: 86400, expires_at: exp,
    user: { id: "00000000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-11-01T00:00:00Z" } }));
});
await ctx.route(`${API}/**`, async (route) => {
  const req = route.request();
  if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
  const u = new URL(req.url());
  const body = respond(u.pathname, req.method(), u.searchParams);
  if (body === null) return route.fulfill({ status: 404, headers: cors, contentType: "application/json", body: JSON.stringify({ error: { code: "NOT_FOUND", message: "x", detail: "" } }) });
  return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(body) });
});
await ctx.route("https://*.supabase.co/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
const p = await ctx.newPage();
const shot = (name, loc) => (loc ? loc.screenshot({ path: join(OUT, name) }) : p.screenshot({ path: join(OUT, name) }));
const errors = [];
p.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 160)));

// 홈 책 줄
await p.goto(`${APP}/`);
await p.getByTestId("popular-books").waitFor({ timeout: 90000 });
await p.getByTestId("popular-book").first().waitFor({ timeout: 30000 });
await p.getByTestId("popular-books").scrollIntoViewIfNeeded();
await p.waitForTimeout(800);
await shot("a1_home_row.png", p.getByTestId("popular-books"));
await p.getByLabel("요즘 많이 읽는 책 다음").click();
await p.waitForTimeout(700);
await shot("a2_home_row_moved.png", p.getByTestId("popular-books"));

// 방문 화면(머리 ⋯, 스탬프, 책장)
await p.goto(`${APP}/libraries/1?distanceM=1200`);
await p.getByTestId("bookshelf").waitFor({ timeout: 60000 });
await p.getByTestId("stamp-label").waitFor({ timeout: 30000 });
await p.waitForTimeout(800);
await shot("a3_visit.png");
await p.getByLabel("공개 범위 바꾸기").click();
await p.waitForTimeout(400);
await shot("a4_visit_stamp_menu.png");
await p.keyboard.press("Escape").catch(() => {});
await p.getByLabel("닫기").first().click().catch(() => {});
await p.getByLabel("도서관 메뉴").click();
await p.waitForTimeout(400);
await shot("a5_visit_more_menu.png");

// 설정·처음 도서관·알림함
await p.goto(`${APP}/settings`);
await p.getByTestId("settings-first-library").waitFor({ timeout: 60000 });
await p.waitForTimeout(600);
await shot("a6_settings.png");
await p.goto(`${APP}/me`);
await p.getByTestId("profile-actions").first().waitFor({ timeout: 60000 }).catch(() => {});
await p.waitForTimeout(800);
await shot("a7_me.png");
await p.goto(`${APP}/inbox`);
await p.getByLabel("알림 설정").waitFor({ timeout: 60000 });
await p.getByLabel("알림 설정").click();
await p.waitForTimeout(500);
await shot("a8_inbox_settings.png");

// 시안
const m = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
await m.goto(MOCK);
for (const el of ["el-arrows", "el-visithead", "el-settings"]) {
  await m.locator(`#${el} article.cand[data-id="A"] .phone`).screenshot({ path: join(OUT, `m_${el}.png`) });
}
console.log(JSON.stringify({ errors: [...new Set(errors)].slice(0, 10), unknown: [...unknown] }, null, 1));
await browser.close();
