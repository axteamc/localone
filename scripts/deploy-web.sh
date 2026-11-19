#!/usr/bin/env bash
# 모바일 웹 빌드 + Cloud Run(localone-web) 배포 + API CORS 연결. 어느 PC에서 돌려도 같은 결과(mobile/.env.production 사용).
# 사용: bash scripts/deploy-web.sh
set -euo pipefail
PROJECT=localone-515014
REGION=asia-northeast3
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

cd "$ROOT/mobile"
npm ci --no-audit --no-fund
rm -rf dist-web
CI=1 npx expo export --platform web --output-dir dist-web

# 번들에 운영 API 주소가 들어갔는지, 사설 IP(개발 주소)가 없는지 확인
API_URL="$(grep '^EXPO_PUBLIC_API_URL=' .env.production | cut -d= -f2-)"
grep -rqF "$API_URL" dist-web/_expo || { echo "번들에 운영 API 주소가 없어요"; exit 1; }
if grep -rqE '(172\.(1[6-9]|2[0-9]|3[01])|192\.168|10\.[0-9]+\.[0-9]+)\.[0-9]+:[0-9]+' dist-web/_expo; then
  echo "번들에 사설 IP 개발 주소가 남아 있어요"; exit 1
fi

# gcloud --source는 맨 위 Dockerfile만 읽으므로 임시 폴더에 모아 올린다
mkdir -p "$STAGE/deploy-web"
cp -r dist-web "$STAGE/dist-web"
cp deploy-web/Dockerfile deploy-web/nginx.conf.template "$STAGE/deploy-web/"
cp deploy-web/Dockerfile "$STAGE/Dockerfile"
gcloud run deploy localone-web --source "$STAGE" --region "$REGION" --project "$PROJECT" \
  --allow-unauthenticated --port 8080 --quiet

WEB_URL="$(gcloud run services describe localone-web --region "$REGION" --project "$PROJECT" --format='value(status.url)')"
# 서비스 URL 두 형식 중 번들·브라우저가 쓰는 형식(프로젝트번호 기반)도 허용
gcloud run services update localone-api --region "$REGION" --project "$PROJECT" \
  --update-env-vars "^|^CORS_ALLOWED_ORIGINS=$WEB_URL" --quiet
echo "웹: $WEB_URL"
