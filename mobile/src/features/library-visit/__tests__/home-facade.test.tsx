// VISIT-1 홈 큐브 파사드 시험 (2026-11-18 "홈 큐브 배치"): 주인공·가장자리 걸침·기점 전체 보기·꾹 누르기 설정·큐브 눌러 방문 페이지.
// 자리 계산(칸 나누기·기점·걸침·전체 보기·끌기)은 direction.test.ts가 순수 함수로 본다.
import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import React from "react";
import { StyleSheet } from "react-native";
import * as api from "../deps";
import type { HeroRule } from "../direction";
import { cubeLidColors } from "../FacadeHome";
import { CUBE_PALETTE } from "../../../theme/tokens";
import { HomeScreen } from "../HomeScreen";
import { theme } from "../../../theme";

const mockPush = jest.fn();
// 홈은 방문 페이지(루트 Stack)로 가도 unmount되지 않는다. 마지막 useFocusEffect 콜백을 잡아 두고 "홈 복귀"를 흉내 낸다
let mockFocus: (() => unknown) | null = null;

jest.mock("expo-router", () => {
  const ReactLib = require("react") as typeof import("react");
  return {
    useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
    useFocusEffect: (cb: () => unknown) => {
      mockFocus = cb;
      ReactLib.useEffect(() => {
        cb();
      }, [cb]);
    },
  };
});

/** 시험에서 응답 순서를 정하는 Promise */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

jest.mock("../../../auth/AuthProvider", () => ({
  useAuth: jest.fn(() => ({ status: "signedOut", session: null, user: null })),
}));

// 홈 시험은 파사드 동작만 본다. 하단 창(VISIT-1b)은 home-sheet·home-news 시험이 따로 본다.
jest.mock("../HomeSheet", () => ({
  HomeSheet: (p: { above?: unknown }) => p.above ?? null,
}));

jest.mock("../deps", () => {
  const actual = jest.requireActual("../__fakes__/publicApi") as typeof import("../__fakes__/publicApi");
  return {
    ...actual,
    fetchLibrariesNearby: jest.fn(),
    fetchLibrariesNearest: jest.fn(actual.fetchLibrariesNearest),
    locate: jest.fn(),
    getDefaultLibrary: jest.fn(),
    getHeroRule: jest.fn(),
    setHeroRule: jest.fn(),
    getRecentVisitedLibraryId: jest.fn(),
  };
});

const actual = jest.requireActual("../__fakes__/publicApi") as typeof import("../__fakes__/publicApi");
const m = api as unknown as {
  fetchLibrariesNearby: jest.Mock<typeof api.fetchLibrariesNearby>;
  fetchLibrariesNearest: jest.Mock<typeof api.fetchLibrariesNearest>;
  locate: jest.Mock<typeof api.locate>;
  getDefaultLibrary: jest.Mock<typeof api.getDefaultLibrary>;
  getHeroRule: jest.Mock<typeof api.getHeroRule>;
  setHeroRule: jest.Mock<typeof api.setHeroRule>;
  getRecentVisitedLibraryId: jest.Mock<typeof api.getRecentVisitedLibraryId>;
};

const nearby = (items: api.LibrarySummary[]): api.LibraryListResponse => ({
  mode: "nearby",
  radius_km: 3,
  dtl_region: null,
  q: null,
  items,
});

const role = (id: string) => screen.getByTestId(id).props.accessibilityHint as string;

const heroHas = (name: RegExp) => expect(screen.getByTestId("facade-hero")).toHaveTextContent(name);
const chooseRecent = async (heroLabel: string) => {
  await fireEvent(screen.getByLabelText(heroLabel), "longPress");
  await fireEvent.press(screen.getByText("최근 방문한 곳"));
};

beforeEach(() => {
  jest.clearAllMocks();
  mockFocus = null;
  m.locate.mockResolvedValue({ ok: true, lat: 37.5815, lng: 126.9831 });
  m.getDefaultLibrary.mockResolvedValue(null);
  m.fetchLibrariesNearby.mockImplementation(actual.fetchLibrariesNearby);
  m.getHeroRule.mockResolvedValue("nearest");
  m.setHeroRule.mockResolvedValue(undefined);
  m.getRecentVisitedLibraryId.mockResolvedValue(102);
});

// 가짜 #10: 정독(101, 기준 위치, 420m) · 종로(102, 남서 1.3km, 오늘 휴관) · 남산(103, 남쪽 2.9km)
describe("VISIT-1 home cubes", () => {
  test("the nearest library is the hero and every cube carries name, distance, bearing and today", async () => {
    await render(<HomeScreen />);
    await screen.findByText("정독");
    expect(screen.getByTestId("facade-hero")).toHaveTextContent(/정독/);
    expect(screen.getByLabelText("정독도서관 420m")).toBeTruthy();
    // 나머지는 가장자리에 걸친 작은 큐브
    expect(role("facade-cube-102")).toBe("peek");
    expect(role("facade-cube-103")).toBe("peek");
    expect(screen.getByText("1.3km")).toBeTruthy();
    expect(screen.getByText("오늘 휴관")).toBeTruthy();
    expect(screen.getByText("CLOSED")).toBeTruthy();
    expect(screen.getAllByText(/^(N|NE|E|SE|S|SW|W|NW) \d{3}°$/).length).toBe(3);
    expect(screen.getByTestId("facade-grid")).toBeTruthy();
  });

  test("hero origin says 지도 보기 without a radius, and there is no separate axis or ruler (C-96)", async () => {
    await render(<HomeScreen />);
    await screen.findByText("정독");
    expect(screen.getByText("지도 보기")).toBeTruthy();
    expect(screen.queryByText("현위치")).toBeNull();
    expect(screen.queryByText(/^\dKM$/)).toBeNull();
    expect(screen.queryByTestId("facade-ruler")).toBeNull();
    expect(screen.queryByTestId("facade-axis")).toBeNull();
  });

  test("libraries without coords get no cube", async () => {
    const noCoords: api.LibrarySummary = { ...actual.FAKE_LIBRARIES[0]!, id: 104, name: "좌표없는도서관", latitude: null, longitude: null };
    m.fetchLibrariesNearby.mockResolvedValue(nearby([...actual.FAKE_LIBRARIES, noCoords]));
    await render(<HomeScreen />);
    await screen.findByText("정독");
    expect(screen.queryByText("좌표없는")).toBeNull();
  });

  test("results with no coordinates at all show a notice instead of a blank facade (③-3)", async () => {
    const noCoords = (id: number, name: string): api.LibrarySummary => ({
      ...actual.FAKE_LIBRARIES[0]!, id, name, latitude: null, longitude: null,
    });
    m.fetchLibrariesNearby.mockResolvedValue(nearby([noCoords(104, "좌표없는도서관"), noCoords(105, "또없는도서관")]));
    await render(<HomeScreen />);
    expect(await screen.findByText("이 지역 도서관은 위치 정보가 없어 여기에 놓지 못했어요.")).toBeTruthy();
    expect(screen.queryByText("좌표없는")).toBeNull();
  });

  test("find button uses matte primary plate instead of yellow fill (2026-11-18 주 버튼 색 B)", async () => {
    await render(<HomeScreen />);
    await screen.findByText("정독");
    expect(StyleSheet.flatten(screen.getByTestId("home-find-library").props.style).backgroundColor).toBe(theme.colors.panelLit);
    expect(StyleSheet.flatten(screen.getByText("도서관 찾기").props.style).color).toBe(theme.colors.inkStrong);
  });

  test("distance falls back to straight-line when the server gives none", async () => {
    m.fetchLibrariesNearby.mockResolvedValue(nearby([{ ...actual.FAKE_LIBRARIES[0]!, distance_m: null }]));
    await render(<HomeScreen />);
    await screen.findByText("정독");
    expect(screen.getByTestId("facade-hero")).toHaveTextContent(/0m/);
  });

  test("hero press opens visit page without preview", async () => {
    await render(<HomeScreen />);
    await screen.findByText("정독");
    await fireEvent.press(screen.getByLabelText("정독도서관 420m"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/libraries/[libraryId]", params: { libraryId: "101", distanceM: "420" } });
  });

  test("an edge cube becomes the hero without leaving the page, then opens on press", async () => {
    await render(<HomeScreen />);
    await screen.findByText("정독");
    await fireEvent.press(screen.getByLabelText("종로도서관 크게 보기"));
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByTestId("facade-hero")).toHaveTextContent(/종로/);
    expect(role("facade-cube-101")).toBe("peek");
    await fireEvent.press(screen.getByLabelText("종로도서관 1.3km"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/libraries/[libraryId]", params: { libraryId: "102", distanceM: "1310" } });
  });

  test("hero press omits distanceM when distance is null or invalid", async () => {
    m.fetchLibrariesNearby.mockResolvedValue(
      nearby([
        { ...actual.FAKE_LIBRARIES[0]!, id: 201, distance_m: null },
        { ...actual.FAKE_LIBRARIES[1]!, id: 202, distance_m: 12.5 },
        { ...actual.FAKE_LIBRARIES[2]!, id: 203, distance_m: -1 },
      ])
    );
    await render(<HomeScreen />);
    await screen.findByText("정독");
    await fireEvent.press(screen.getByLabelText(/^정독도서관 \d/));
    await fireEvent.press(screen.getByLabelText("종로도서관 크게 보기"));
    await fireEvent.press(screen.getByLabelText(/^종로도서관 \d/));
    await fireEvent.press(screen.getByLabelText("남산도서관 크게 보기"));
    await fireEvent.press(screen.getByLabelText(/^남산도서관 \d/));
    expect(mockPush).toHaveBeenNthCalledWith(1, { pathname: "/libraries/[libraryId]", params: { libraryId: "201" } });
    expect(mockPush).toHaveBeenNthCalledWith(2, { pathname: "/libraries/[libraryId]", params: { libraryId: "202" } });
    expect(mockPush).toHaveBeenNthCalledWith(3, { pathname: "/libraries/[libraryId]", params: { libraryId: "203" } });
  });

  test("지도 보기 opens the map mode: nearest 5 around the origin, name·distance labels, scale, back restores (C-96)", async () => {
    await render(<HomeScreen />);
    await screen.findByText("정독");
    await fireEvent.press(screen.getByLabelText("지도로 주변 도서관 보기"));
    expect(await screen.findByTestId("facade-map")).toBeTruthy();
    await waitFor(() => expect(m.fetchLibrariesNearest).toHaveBeenCalledWith(37.5815, 126.9831, 5, expect.anything()));
    expect(screen.queryByTestId("facade-hero")).toBeNull();
    for (const id of [101, 102, 103]) expect(await screen.findByTestId(`map-cube-${id}`)).toBeTruthy();
    // 이름표: 이름(사람 목소리) + 거리(계기판 목소리, 대문자)
    expect(screen.getByTestId("map-label-101")).toHaveTextContent(/정독도서관/);
    expect(screen.getByTestId("map-label-101")).toHaveTextContent(/\d+M|KM/);
    expect(screen.getByTestId("map-scale")).toHaveTextContent(/반경 .+ · 3곳/);
    expect(screen.getByText("현위치")).toBeTruthy(); // 지도 모드 기점은 위치 이름
    expect(screen.queryByTestId("map-locate")).toBeNull(); // 현위치가 판 안이면 현위치 버튼 없음
    // 큐브를 누르면 그 도서관 방문 화면
    await fireEvent.press(screen.getByTestId("map-cube-103"));
    expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ params: expect.objectContaining({ libraryId: "103" }) }));
    // 기점 다시 → 원래 주인공 보기
    await fireEvent.press(screen.getByLabelText("원래 도서관 크게 보기"));
    expect(screen.getByTestId("facade-hero")).toHaveTextContent(/정독/);
    expect(screen.queryByTestId("facade-map")).toBeNull();
  });

  test("long press on the hero opens the first-hero setting and saves it on the device", async () => {
    await render(<HomeScreen />);
    await screen.findByText("정독");
    await fireEvent(screen.getByLabelText("정독도서관 420m"), "longPress");
    expect(screen.getByTestId("facade-hero-menu")).toBeTruthy();
    expect(screen.getByText("홈을 열면 처음 크게 보일 도서관")).toBeTruthy();
    await fireEvent.press(screen.getByText("최근 방문한 곳"));
    expect(m.setHeroRule).toHaveBeenCalledWith("recent");
    expect(screen.queryByTestId("facade-hero-menu")).toBeNull();
    // 최근 방문(102 종로)이 주인공
    expect(screen.getByTestId("facade-hero")).toHaveTextContent(/종로/);
    expect(mockPush).not.toHaveBeenCalled();
  });

  test("a saved recent-visit setting makes that library the first hero", async () => {
    m.getHeroRule.mockResolvedValue("recent");
    await render(<HomeScreen />);
    await screen.findByText("정독");
    await waitFor(() => expect(screen.getByTestId("facade-hero")).toHaveTextContent(/종로/));
  });

  test("recent-visit setting falls back to the nearest when that library is not on the board", async () => {
    m.getHeroRule.mockResolvedValue("recent");
    m.getRecentVisitedLibraryId.mockResolvedValue(999);
    await render(<HomeScreen />);
    await screen.findByText("정독");
    await act(async () => {});
    expect(screen.getByTestId("facade-hero")).toHaveTextContent(/정독/);
  });
});

// PR 191 리뷰 수정(2026-11-18): 늦은 설정 읽기·홈 복귀 뒤 최근 방문 다시 읽기
describe("VISIT-1 home first-hero setting and recent visit (review fixes)", () => {
  test("a late first read of the saved setting does not undo a newer choice", async () => {
    const rule = deferred<HeroRule>();
    m.getHeroRule.mockReturnValue(rule.promise);
    await render(<HomeScreen />);
    await screen.findByText("정독");
    // 처음 읽기가 끝나기 전에 꾹 누르기로 "최근 방문한 곳"(102 종로)을 고른다
    await chooseRecent("정독도서관 420m");
    // 그 뒤에야 이전 저장값("nearest")이 도착한다
    await act(async () => rule.resolve("nearest"));
    heroHas(/종로/);
    // 저장값과 화면 값이 모두 새 설정이다
    expect(m.setHeroRule.mock.calls).toEqual([["recent"]]);
    await fireEvent(screen.getByLabelText("종로도서관 1.3km"), "longPress");
    const [nearest, recent] = screen.getAllByRole("menuitem");
    expect(recent!.props.accessibilityState).toEqual({ selected: true });
    expect(nearest!.props.accessibilityState).toEqual({ selected: false });
  });

  test("returning home re-reads the recent visit, so choosing it shows the library just visited", async () => {
    m.getRecentVisitedLibraryId.mockResolvedValue(null); // 방문 기록 없음으로 시작
    await render(<HomeScreen />);
    await screen.findByText("정독");
    // 홈을 unmount하지 않은 채 B(103 남산)를 방문하고 돌아온다
    m.getRecentVisitedLibraryId.mockResolvedValue(103);
    await act(async () => {
      await mockFocus?.();
    });
    // 적용할 때의 다시 읽기는 끝나지 않게 붙잡아 둔다 — 홈 복귀 때 읽은 값만으로 B가 나와야 한다
    m.getRecentVisitedLibraryId.mockReturnValue(new Promise<number | null>(() => {}));
    await chooseRecent("정독도서관 420m");
    heroHas(/남산/);
    expect(m.setHeroRule).toHaveBeenCalledWith("recent");
  });

  test("choosing the recent-visit setting reads the latest visit again", async () => {
    m.getRecentVisitedLibraryId.mockResolvedValue(null);
    await render(<HomeScreen />);
    await screen.findByText("정독");
    m.getRecentVisitedLibraryId.mockResolvedValue(103); // 홈 복귀 알림 없이 기록만 바뀜
    await chooseRecent("정독도서관 420m");
    await waitFor(() => heroHas(/남산/));
  });

  test("returning home alone keeps the hero the user picked (V3: only view, list or setting resets it)", async () => {
    m.getHeroRule.mockResolvedValue("recent");
    await render(<HomeScreen />);
    await screen.findByText("정독");
    await waitFor(() => heroHas(/종로/));
    await fireEvent.press(screen.getByLabelText("남산도서관 크게 보기"));
    heroHas(/남산/);
    m.getRecentVisitedLibraryId.mockResolvedValue(101);
    await act(async () => {
      await mockFocus?.();
    });
    heroHas(/남산/);
  });

  test("a late recent-visit answer does not overwrite a newer one", async () => {
    m.getHeroRule.mockResolvedValue("recent");
    const first = deferred<number | null>();
    const second = deferred<number | null>();
    m.getRecentVisitedLibraryId.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    await render(<HomeScreen />);
    await screen.findByText("정독");
    await act(async () => {
      await mockFocus?.();
    });
    await act(async () => second.resolve(103)); // 나중 읽기가 먼저 끝남(남산)
    await act(async () => first.resolve(102)); // 먼저 읽기가 늦게 끝남(종로) — 버린다
    heroHas(/남산/);
  });
});

// L6(2026-11-19 D): 방문 페이지 ⋯ 메뉴에서도 같은 설정을 바꾼다 — 홈은 unmount되지 않으므로 돌아올 때 다시 읽는다
describe("VISIT-1 first-hero setting changed on the visit page (L6)", () => {
  test("returning home applies a setting changed elsewhere and reads the recent visit again", async () => {
    m.getRecentVisitedLibraryId.mockResolvedValue(null);
    await render(<HomeScreen />);
    await screen.findByText("정독");
    heroHas(/정독/);
    // 방문 페이지(103 남산)에서 ⋯ → "최근 방문한 곳"을 고르고 돌아온다
    m.getHeroRule.mockResolvedValue("recent");
    m.getRecentVisitedLibraryId.mockResolvedValue(103);
    await act(async () => {
      await mockFocus?.();
    });
    await waitFor(() => heroHas(/남산/));
    expect(m.setHeroRule).not.toHaveBeenCalled(); // 홈은 읽기만 한다
    // 다시 "가장 가까운 곳"으로 바꾸고 돌아오면 가장 가까운 곳
    m.getHeroRule.mockResolvedValue("nearest");
    await act(async () => {
      await mockFocus?.();
    });
    await waitFor(() => heroHas(/정독/));
  });

  test("a choice made on home is saved before the next focus read, so it is not undone", async () => {
    const save = deferred<void>();
    m.setHeroRule.mockReturnValue(save.promise);
    await render(<HomeScreen />);
    await screen.findByText("정독");
    await chooseRecent("정독도서관 420m");
    heroHas(/종로/);
    // 저장이 끝나기 전에 홈 복귀 → 읽기는 저장 뒤로 미룬다
    let stored: HeroRule = "nearest";
    m.getHeroRule.mockImplementation(async () => stored);
    await act(async () => {
      void mockFocus?.();
    });
    stored = "recent";
    await act(async () => save.resolve());
    heroHas(/종로/);
  });
});

describe("cube lid text", () => {
  test("uses the approved ink for every palette fill and the closed fill", () => {
    const darkInks = new Map([
      ["marshmallow", "#51504D"],
      ["neutral", "#535151"],
      ["porcelain", "#505052"],
      ["eggshell", "#504D4C"],
      ["vanillaCanvas", "#4E4D4A"],
    ]);
    expect(CUBE_PALETTE).toHaveLength(20);
    expect(CUBE_PALETTE.filter(({ name }) => darkInks.has(name))).toHaveLength(5);
    CUBE_PALETTE.forEach(({ name, hex }, index) => {
      expect(cubeLidColors(index)).toEqual({ fill: hex, ink: darkInks.get(name) ?? "#FFFFFF" });
    });
    expect(cubeLidColors("closed")).toEqual({ fill: theme.colors.pinClosed, ink: "#FFFFFF" });
  });
});

describe("cube TODAY", () => {
  test.each([
    { closed: null, hours: "09:00~18:00", badge: "—", text: "09:00~18:00" },
    { closed: true, hours: null, badge: "CLOSED", text: "오늘 휴관" },
    { closed: false, hours: "09:00~18:00", badge: "OPEN", text: "09:00~18:00" },
    { closed: null, hours: null, badge: "—", text: "운영시간 미확인" },
    { closed: false, hours: null, badge: "OPEN", text: "운영시간 미확인" },
  ])("renders $badge and $text independently", async ({ closed, hours, badge, text }) => {
    const result = await actual.fetchLibrariesNearby(37.5815, 126.9831);
    const [library] = result.items;
    if (!library) throw new Error("Missing nearby test library");
    m.fetchLibrariesNearby.mockResolvedValue(nearby([
      { ...library, today: { ...library.today, is_closed: closed, hours_text: hours } },
    ]));

    await render(<HomeScreen />);
    await screen.findByText(text);
    const hero = within(screen.getByTestId("facade-hero"));
    expect(hero.getByText(badge)).toBeOnTheScreen();
    expect(hero.getByText(text)).toBeOnTheScreen();
  });
});
