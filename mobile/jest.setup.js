jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("react-native-safe-area-context", () => {
  const actual = jest.requireActual("react-native-safe-area-context");
  return {
    ...actual,
    useSafeAreaInsets: jest.fn(() => ({ top: 0, bottom: 0, left: 0, right: 0 })),
  };
});

// 화면 테스트에서 간접 생성된 인증 클라이언트의 갱신 타이머도 suite와 함께 끝낸다.
const mockAuthClients = new Set();
jest.mock("./src/auth/supabase", () => {
  const module = jest.requireActual("./src/auth/supabase");
  mockAuthClients.add(module.supabase.auth);
  return module;
});
afterAll(async () => {
  await Promise.all([...mockAuthClients].map((auth) => auth.dispose()));
  mockAuthClients.clear();
});
