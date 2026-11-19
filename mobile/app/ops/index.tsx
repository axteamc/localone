// 운영 화면 경로 `/ops` (core M2-0-P2 Z4). 앱 안 어디에서도 이 경로로 가는 버튼은 없다(운영자가 주소로 연다).
import { Stack } from "expo-router";
import { OpsScreen } from "../../src/features/ops/OpsScreen";

export default function OpsRoute() {
  return (
    <>
      <Stack.Screen options={{ title: "운영" }} />
      <OpsScreen />
    </>
  );
}
