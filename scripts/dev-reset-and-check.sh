#!/usr/bin/env bash
# 실기기·에뮬레이터·웹 테스트 전 구버전 서버/Metro/DB 잔존 문제를 방지하는 초기화 스크립트
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_DIR="$ROOT_DIR/server"
MOBILE_DIR="$ROOT_DIR/mobile"

echo "[1/5] 기존 8081(Metro)·8000(uvicorn) 구버전 프로세스 정리..."
for port in 8081 8000; do
  pids="$(lsof -tiTCP:$port -sTCP:LISTEN 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    echo "  - port $port 종료: $pids"
    kill $pids 2>/dev/null || true
    sleep 1
  fi
done

echo "[2/5] DB 마이그레이션(alembic upgrade head) 확인..."
if [ -x "$SERVER_DIR/.venv/bin/alembic" ]; then
  (cd "$SERVER_DIR" && .venv/bin/alembic upgrade head)
  cur="$(cd "$SERVER_DIR" && .venv/bin/alembic current | awk '{print $1}' | head -n 1)"
  head_rev="$(cd "$SERVER_DIR" && .venv/bin/alembic heads | awk '{print $1}' | head -n 1)"
  echo "  - alembic current=$cur, head=$head_rev"
  if [ "$cur" != "$head_rev" ]; then
    echo "오류: DB 마이그레이션이 head와 일치하지 않습니다." >&2
    exit 1
  fi
else
  echo "경고: $SERVER_DIR/.venv/bin/alembic 을 찾지 못했습니다." >&2
fi

echo "[3/5] 최신 백엔드(uvicorn :8000) 기동 및 라우트 확인..."
if [ -x "$SERVER_DIR/.venv/bin/uvicorn" ]; then
  (cd "$SERVER_DIR" && nohup .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 >/tmp/localone-uvicorn.log 2>&1 &)
  for _ in $(seq 1 20); do
    code="$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/api/v1/me/profile || true)"
    if [ "$code" = "401" ]; then
      echo "  - 백엔드 준비 완료 (/api/v1/me/profile -> HTTP $code)"
      break
    fi
    sleep 0.5
  done
  if [ "${code:-}" != "401" ]; then
    echo "오류: 백엔드 라우트 확인 실패 (HTTP ${code:-none}). 로그: /tmp/localone-uvicorn.log" >&2
    exit 1
  fi
fi

echo "[4/5] iOS 네이티브 Pod/의존성 동기화 여부 점검..."
if [ -f "$MOBILE_DIR/ios/Podfile.lock" ] && [ -f "$MOBILE_DIR/ios/Pods/Manifest.lock" ]; then
  if ! cmp -s "$MOBILE_DIR/ios/Podfile.lock" "$MOBILE_DIR/ios/Pods/Manifest.lock"; then
    echo "경고: Podfile.lock과 Pods/Manifest.lock이 다릅니다. 실기기 테스트 전 'cd mobile && npx expo run:ios --device' 재빌드가 필요합니다." >&2
  else
    echo "  - iOS Pods 동기화 일치"
  fi
fi

echo "[5/5] Metro 기동 안내 (--clear 필수)"
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || echo "localhost")"
if [ "${1:-}" = "--start-metro" ]; then
  cd "$MOBILE_DIR"
  exec env REACT_NATIVE_PACKAGER_HOSTNAME="$LAN_IP" npx expo start --lan --clear
else
  echo "  - 다음 명령으로 캐시 없이 최신 Metro를 띄우세요:"
  echo "    cd mobile && REACT_NATIVE_PACKAGER_HOSTNAME=$LAN_IP npx expo start --lan --clear"
fi
