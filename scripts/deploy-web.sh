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
# Cloud Run 서비스 URL은 두 형식(해시형 status.url, 프로젝트번호형)이 모두 열린다. 브라우저는 프로젝트번호형으로
# 여는 일이 많으므로 둘 다 허용한다(하나만 넣으면 그 주소에서 모든 API가 CORS로 막힌다 — 2026-11-25 장애).
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
NUMBER_URL="https://localone-web-$PROJECT_NUMBER.$REGION.run.app"
ORIGINS="$NUMBER_URL,$WEB_URL"
gcloud run services update localone-api --region "$REGION" --project "$PROJECT" \
  --update-env-vars "^|^CORS_ALLOWED_ORIGINS=$ORIGINS" --quiet

# 두 주소 모두 사전 요청(OPTIONS)이 통과하는지 확인
API_BASE="${API_URL%/}"
for origin in "$NUMBER_URL" "$WEB_URL"; do
  code="$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS "$API_BASE/api/v1/libraries" \
    -H "Origin: $origin" -H 'Access-Control-Request-Method: GET' -H 'Access-Control-Request-Headers: authorization')"
  [ "$code" = 200 ] || { echo "CORS 사전 요청 실패($code): $origin"; exit 1; }
done
echo "웹: $WEB_URL (CORS 허용: $ORIGINS)"
