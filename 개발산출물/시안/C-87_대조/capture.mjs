// 시안 HTML과 웹 앱(가짜 API·가짜 세션)을 390×844에서 같은 상태로 캡처한다. 결과: scratchpad/cap/*.png
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
const require = createRequire("C:/seokhunchoi_Ax_Fullstack/libproject/mobile/package.json");
const { chromium } = require("playwright");

const OUT = join(process.argv[2], "cap");
mkdirSync(OUT, { recursive: true });
const APP = "http://localhost:8091";
const API = "http://172.20.10.3:8000";
const MOCK = "file:///C:/seokhunchoi_Ax_Fullstack/libproject/개발산출물/시안/Y-6_도서상세_YES24_시안.html";
const ISBN = "9788936434120";
const ISBN_B = "9788954682152";
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 15 * 3600e3).toISOString().slice(0, 10);

const lib = (id, name, dist) => ({
  id, name, address: `광주 북구 ${id}`, area_label: "북구", distance_m: dist, tel: null, homepage: null,
  today: { date: today, is_closed: false, hours_text: "09:00~18:00", holiday_unchecked: false },
});
const item = (l, extra = {}) => ({
  library: l, holding: "yes", loanable: "yes", basis: "stale", source: "data4library", observed_at: null,
  data_date: yesterday, data_date_assumed: false, fallback_reason: null,
  live_check: { url: "https://lib.example.org", kind: "homepage" }, ...extra,
});
const POST_LIB = lib(101, "푸른숲도서관", null);
const NEAR = [lib(1, "운암도서관", 420), lib(101, "푸른숲도서관", 900), lib(3, "중흥도서관", 1200)];
const post = {
  id: "11111111-1111-4111-8111-111111111111", library: { id: 101, name: "푸른숲도서관" },
  book: { isbn13: ISBN, title: "창가에 놓인 책", author: "한서윤", cover_url: null },
  image_kind: "color", image_url: null, image_color: "fill2", overlay_text: "오늘 다 읽었어요",
  body: "마지막 장이 오래 남아요.", author: { nickname: "책읽는이웃" }, is_mine: false,
  reaction_count: 2, my_reaction: false, my_bookmark: false, published_at: "2026-11-24T12:00:00+09:00",
};
const book = { isbn13: ISBN, title: "창가에 놓인 책", author: "한서윤", publisher: "예시출판", cover_url: null,
  source: "yes24", description: "책 소개 예시입니다.", pub_year: 2024 };
const plan = (id, isbn, l) => ({ id, book: { isbn13: isbn, title: `책 ${id}`, author: null, cover_url: null },
  library: l, status: "planned", created_at: "2026-11-24T10:00:00+09:00" });
const cand = (l, h, n) => ({ library: { ...l, homepage: "https://lib.example.org" }, holding_count: h, loanable_count: n,
  held_isbn13s: [ISBN, ISBN_B], loanable_isbn13s: [ISBN], link: { url: "https://lib.example.org", kind: "homepage" } });

const unknown = new Set();
function respond(path, method) {
  if (path === "/api/v1/auth/session") return { user_id: "00000000-0000-4000-8000-000000000001" };
  if (path.startsWith("/api/v1/posts/") && !path.includes("/posts/" + post.id + "/")) return post;
  if (path.match(/\/books\/\d+\/availability$/)) {
    return { isbn13: ISBN, scope: "library", radius_km: null, dtl_region: null, checked_at: `${today}T09:30:00+09:00`, items: [item(POST_LIB)] };
  }
  if (path === "availability/nearby") {
    return { isbn13: ISBN, scope: "nearby", radius_km: 3, dtl_region: null, checked_at: `${today}T09:30:00+09:00`,
      items: NEAR.map((l, i) => item(l, i === 2 ? { loanable: "no" } : {})) };
  }
  if (path.match(/\/books\/\d+\/purchase-link/)) return { isbn13: ISBN, provider: "yes24", kind: "product", url: "https://www.yes24.com/" };
  if (path.match(/\/api\/v1\/books\/\d+$/)) return book;
  if (path === "/api/v1/me/loan-plans/availability") {
    return { checked_at: `${today}T09:30:00+09:00`, radius_km: 3, complete: true, unknown_pairs: 0,
      fallback_counts: { limit: 0, provider_error: 0, not_configured: 0 }, books: [],
      candidates: [cand(NEAR[0], 2, 2), cand(NEAR[1], 2, 1), cand(NEAR[2], 2, 0)] };
  }
  if (path.startsWith("/api/v1/me/loan-plans")) return { items: [plan("p1", ISBN, null), plan("p2", ISBN_B, null)], next_cursor: null };
  if (path.startsWith("/api/v1/me/loans")) return { items: [], next_cursor: null };
  if (path.includes("/same-book") || path.includes("/posts?") || path.match(/libraries\/\d+\/posts/)) return { items: [], next_cursor: null };
  unknown.add(`${method} ${path}`);
  return null;
}

const browser = await chromium.launch({ channel: "msedge" });
async function ctx() {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    geolocation: { latitude: 35.1765, longitude: 126.9253 }, permissions: ["geolocation"], locale: "ko-KR" });
  await c.addInitScript(() => {
    const exp = Math.floor(Date.now() / 1000) + 3600 * 24;
    const session = { access_token: "x.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDEiLCJleHAiOjk5OTk5OTk5OTl9.x",
      refresh_token: "r", token_type: "bearer", expires_in: 86400, expires_at: exp,
      user: { id: "00000000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-11-01T00:00:00Z" } };
    localStorage.setItem("sb-blsdnibkgukoksmwnuxu-auth-token", JSON.stringify(session));
    window.open = () => ({ closed: false, focus() {} }); // 외부 링크 열기 성공으로
  });
  await c.route(`${API}/**`, async (route) => {
    const u = new URL(route.request().url());
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors() });
    const body = u.searchParams.get("scope") === "nearby" ? respond("availability/nearby", "GET") : respond(u.pathname + (u.pathname.endsWith("/posts") ? "?" : ""), route.request().method());
    if (body === null) return route.fulfill({ status: 404, headers: cors(), contentType: "application/json", body: JSON.stringify({ detail: "x", code: "NOT_FOUND" }) });
    return route.fulfill({ status: 200, headers: cors(), contentType: "application/json", body: JSON.stringify(body) });
  });
  await c.route("https://*.supabase.co/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  return c;
}
const cors = () => ({ "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" });
const shot = (p, name, loc) => (loc ? loc.screenshot({ path: join(OUT, name) }) : p.screenshot({ path: join(OUT, name) }));

// ── 시안 ──
{
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await c.newPage();
  await p.goto(MOCK);
  await shot(p, "m1_sns_card.png", p.locator("#sns-review"));
  await p.click("#sns-find");
  await p.waitForTimeout(300);
  await shot(p, "m2_lookup_unselected.png");
  await p.locator("[data-select]").nth(0).click();
  await shot(p, "m3_lookup_selected.png");
  await p.locator("[data-live]").nth(0).click();
  await p.locator("#preview-close").click().catch(() => {});
  await shot(p, "m4_lookup_done.png");
  await p.click("#sheet-close");
  await p.click("#cart-link");
  await p.waitForTimeout(200);
  await p.click("#batch");
  await p.waitForTimeout(300);
  await shot(p, "m5_batch_unselected.png");
  await p.locator("[data-select]").nth(0).click();
  await p.locator("[data-live]").nth(0).click();
  await p.locator("#preview-close").click().catch(() => {});
  await shot(p, "m6_batch_selected_done.png");
  await c.close();
}

// ── 앱 ──
{
  const c = await ctx();
  const p = await c.newPage();
  const errors = [];
  p.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 200)));
  await p.goto(`${APP}/posts/${post.id}`);
  await p.getByTestId("loan-box").waitFor({ timeout: 60000 });
  await p.getByTestId("loan-box").scrollIntoViewIfNeeded();
  await p.waitForTimeout(500);
  await shot(p, "a1_sns_card.png", p.getByTestId("loan-box"));
  await p.getByTestId("loan-find").click();
  await p.getByTestId("library-sheet").waitFor({ timeout: 30000 });
  await p.getByTestId("select-library-101").waitFor({ timeout: 30000 });
  await p.waitForTimeout(500);
  await shot(p, "a2_lookup_unselected.png");
  await p.getByTestId("select-library-101").click();
  await shot(p, "a3_lookup_selected.png");
  await p.getByTestId("live-check-101").click();
  await p.waitForTimeout(300);
  await shot(p, "a4_lookup_done.png");
  const stillSelected = await p.getByTestId("select-library-101").getAttribute("aria-selected");

  await p.goto(`${APP}/loans`);
  await p.getByTestId("batch-search").waitFor({ timeout: 60000 });
  await p.getByTestId("batch-search").click();
  await p.getByTestId("batch-select-1").waitFor({ timeout: 30000 });
  await p.getByTestId("batch-panel").scrollIntoViewIfNeeded();
  await shot(p, "a5_batch_unselected.png", p.getByTestId("batch-panel"));
  await p.getByTestId("batch-select-1").click();
  await p.getByTestId("batch-live-1").click();
  await p.waitForTimeout(300);
  await shot(p, "a6_batch_selected_done.png", p.getByTestId("batch-panel"));
  const batchSelected = await p.getByTestId("batch-select-1").getAttribute("aria-selected");
  const nested = await p.evaluate(() => document.querySelectorAll("button button, [role=button] [role=button]").length);
  console.log(JSON.stringify({ stillSelected, batchSelected, nested, errors: [...new Set(errors)].slice(0, 8), unknown: [...unknown] }, null, 1));
  await c.close();
}
await browser.close();
