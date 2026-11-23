// Run against the local Expo web app (E2E_BASE defaults to http://localhost:8081).
// Public API fixtures are intercepted in Chromium. No server or account is needed.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = new URL(process.env.E2E_BASE ?? "http://localhost:8081");
const books = Array.from({ length: 10 }, (_, i) => ({
  isbn13: String(9788936434100 + i),
  title: `테스트 도서 제목 ${i + 1}`,
  author: null,
  publisher: null,
  cover_url: null,
  source: "manual",
  description: null,
  pub_year: null,
}));
const libraries = [101, 102, 103].map((id) => ({
  id,
  name: `도서관 ${id}`,
  address: null,
  latitude: 37.581 + (id - 101) * 0.001,
  longitude: 126.983,
  dtl_region_code: "11010",
  area_label: "종로구",
  distance_m: 50,
  today: { date: "2026-11-23", is_closed: false, hours_text: "09:00~18:00", holiday_unchecked: false },
}));
const shelf = [
  { kind: "recent_reads", title: "최근 책장", basis_label: "최근 기준", books: books.slice(0, 1) },
  { kind: "theme", title: "테마 책장", basis_label: "테마 기준", books: books.slice(1, 2) },
  { kind: "popular", title: "인기 책장", basis_label: "인기 기준", books: books.slice(2, 3) },
];
const browser = await chromium.launch();
let page;
let recommendedBooks = books;
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    geolocation: { latitude: 37.581, longitude: 126.983 },
    permissions: ["geolocation"],
  });
  await context.route("**/*", async (route) => {
    const { origin, pathname } = new URL(route.request().url());
    if (!pathname.startsWith("/api/v1/")) {
      return origin === base.origin ? route.continue() : route.abort();
    }
    let json;
    const [, id, section] = pathname.match(/^\/api\/v1\/libraries\/(\d+)(?:\/(\w+))?$/) ?? [];
    if (pathname.endsWith("/books/recommendations")) {
      json = { kind: "popular", scope: "national", library_id: null, basis_label: "전국 기준",
        books: recommendedBooks, theme: null, fetched_at: null, stale: false, fallback_reason: null };
    } else if (pathname.endsWith("/libraries")) {
      json = { mode: "nearby", items: libraries, radius_km: 3, dtl_region: null, q: null };
    } else if (section === "shelf") {
      json = { pages: id === "101" ? shelf : id === "102" ? [shelf[1]] : [] };
    } else if (section === "feed" || section === "posts") {
      json = { items: [], next_cursor: null };
    } else if (id && !section) {
      json = { ...libraries.find((library) => library.id === Number(id)), tel: null, homepage: null,
        operating_time_text: null, closed_text: null };
    } else {
      return route.abort();
    }
    return route.fulfill({ json, headers: { "access-control-allow-origin": "*" } });
  });
  page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on("pageerror", (error) => console.error(error));
  const button = (name) => page.getByRole("button", { name, exact: true });
  const edges = (label) => [button(`${label} 이전`), button(`${label} 다음`)];
  const geometry = (scroller) => scroller.evaluate((node) => ({
    offset: node.scrollLeft,
    width: node.clientWidth,
    max: node.scrollWidth - node.clientWidth,
  }));
  const waitOffset = (id, x) => page.waitForFunction(
    ([testId, offset]) => Math.abs(document.querySelector(`[data-testid="${testId}"]`).scrollLeft - offset) < 1,
    [id, x],
  );
  const waitEdge = (name, disabled) => page.locator(
    `[role="button"][aria-label="${name}"]${disabled ? '[aria-disabled="true"]' : ':not([aria-disabled="true"])'}`,
  ).waitFor();
  const rapidClick = (control) => control.evaluate((node) => {
    for (let i = 0; i < 8; i++) node.click();
  });

  await page.goto(new URL("/", base).href);
  const homeId = "popular-books-scroll";
  const homeScroller = page.getByTestId(homeId);
  const [homeBack, homeNext] = edges("이 동네 인기 도서");
  await page.getByTestId("popular-book").first().waitFor();
  await homeNext.waitFor();
  assert(await homeBack.isDisabled());
  await page.getByTestId("home-find-library").focus();
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press("Tab");
    if (await homeNext.evaluate((node) => document.activeElement === node)) break;
  }
  await page.waitForFunction(() => {
    const focused = document.activeElement;
    return focused?.getAttribute("aria-label") === "이 동네 인기 도서 다음"
      && getComputedStyle(focused).outlineWidth === "2px";
  }, null, { timeout: 8000 });
  const home = await geometry(homeScroller);
  await page.keyboard.press("Enter");
  await waitOffset(homeId, home.width);
  await page.keyboard.press("Space");
  await waitOffset(homeId, Math.min(home.max, home.width * 2));
  await rapidClick(homeNext);
  await waitOffset(homeId, home.max);
  await waitEdge("이 동네 인기 도서 다음", true);
  await homeBack.click();
  await waitOffset(homeId, Math.max(0, home.max - home.width));
  await rapidClick(homeBack);
  await waitOffset(homeId, 0);
  await waitEdge("이 동네 인기 도서 이전", true);
  await page.setViewportSize({ width: 1280, height: 700 });
  await page.getByTestId("web-column").waitFor();
  assert((await geometry(homeScroller)).width > home.width);
  await homeNext.waitFor();
  await page.setViewportSize({ width: 390, height: 700 });
  await page.getByTestId("web-column").waitFor({ state: "hidden" });
  assert(await homeBack.isDisabled());
  recommendedBooks = books.slice(0, 2);
  await page.reload();
  await page.getByTestId("popular-book").first().waitFor();
  await homeNext.waitFor({ state: "hidden" });
  recommendedBooks = books;
  console.log("PASS home: Tab, focus, Enter, Space, rapid input, edges, width and height changes");

  await page.evaluate((entries) => localStorage.setItem("recent_books:guest", JSON.stringify(entries)), books.map((book) => ({
    ...book, viewed_at: "2026-11-23T00:00:00Z",
  })));
  await page.goto(new URL("/search", base).href);
  const recentId = "recent-books-scroll";
  const [, recentNext] = edges("최근 본 도서");
  const input = page.getByTestId("search-input");
  await input.waitFor();
  assert(await input.evaluate((node) => document.activeElement === node));
  // Approximate the space left by an on-screen keyboard while the input is focused.
  await page.setViewportSize({ width: 390, height: 450 });
  await recentNext.waitFor();
  const initialRecent = await geometry(page.getByTestId(recentId));
  await recentNext.click();
  await waitOffset(recentId, initialRecent.width);
  await rapidClick(recentNext);
  await waitEdge("최근 본 도서 다음", true);
  await page.getByRole("button", { name: /지우기$/ }).last().click();
  assert.equal(await page.getByRole("button", { name: /지우기$/ }).count(), 9);
  const recent = await geometry(page.getByTestId(recentId));
  assert(recent.max < initialRecent.max);
  await waitOffset(recentId, recent.max);
  await waitEdge("최근 본 도서 다음", true);
  await page.setViewportSize({ width: 430, height: 700 });
  const recentWide = await geometry(page.getByTestId(recentId));
  assert(recentWide.width > recent.width && recentWide.offset <= recentWide.max);
  await waitEdge("최근 본 도서 다음", recentWide.offset === recentWide.max);
  const removeBook = page.getByRole("button", { name: /지우기$/ });
  for (let i = 0; i < 7; i++) await removeBook.last().click();
  assert.equal(await removeBook.count(), 2);
  await recentNext.waitFor({ state: "hidden" });
  await button("전체 삭제").click();
  await page.getByTestId("recent-section").waitFor({ state: "hidden" });
  await page.getByTestId("popular-section").waitFor();
  console.log("PASS search: autofocus, viewport-width movement, end clamping after deletion, clear all");

  await page.goto(new URL("/libraries/101?distanceM=5", base).href);
  const shelfId = "shelf-pages";
  const [shelfBack, shelfNext] = edges("오늘의 서가");
  await shelfNext.waitFor();
  const expectShelfPage = async (index) => {
    const { title, basis_label } = shelf[index];
    await page.getByTestId("shelf-title").and(page.getByText(title, { exact: true })).waitFor();
    await page.getByText(basis_label, { exact: true }).waitFor();
    const dot = page.getByTestId(`shelf-dot-${index}`);
    assert.equal(await dot.getAttribute("aria-current"), "page");
    assert.equal(await page.getByTestId("shelf-dots").locator('[aria-current="page"]').count(), 1);
    const { width } = await geometry(page.getByTestId(shelfId));
    await waitOffset(shelfId, index * width);
  };
  await expectShelfPage(0);
  assert(await shelfBack.isDisabled());
  await shelfNext.press("Enter");
  await expectShelfPage(1);
  await shelfNext.press("Space");
  await expectShelfPage(2);
  await waitEdge("오늘의 서가 다음", true);
  const beforeResize = await geometry(page.getByTestId(shelfId));
  await page.setViewportSize({ width: 540, height: 700 });
  await page.getByTestId("web-column").waitFor();
  assert((await geometry(page.getByTestId(shelfId))).width > beforeResize.width);
  await expectShelfPage(2);
  await page.getByTestId("shelf-dot-1").click();
  await expectShelfPage(1);
  const shelfScroller = page.getByTestId(shelfId);
  await shelfScroller.hover();
  await page.mouse.wheel(-(await geometry(shelfScroller)).width, 0);
  await expectShelfPage(0);
  await rapidClick(shelfNext);
  await expectShelfPage(2);
  await page.goto(new URL("/libraries/102?distanceM=5", base).href);
  await page.getByText(shelf[1].title, { exact: true }).waitFor();
  await shelfNext.waitFor({ state: "hidden" });
  await page.goto(new URL("/libraries/103?distanceM=5", base).href);
  await page.getByTestId("shelf-empty").waitFor();
  await shelfNext.waitFor({ state: "hidden" });
  console.log("PASS shelf: arrows, dots, horizontal wheel, synchronized title/basis/selection, resize, one and zero pages");
} catch (error) {
  if (page) console.error(await page.locator("body").innerText());
  throw error;
} finally {
  await browser.close();
}
