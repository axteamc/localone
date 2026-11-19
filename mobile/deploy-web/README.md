# 모바일 웹 배포 (Cloud Run: localone-web)

```bash
cd mobile
EXPO_PUBLIC_API_URL=<운영 API 주소> npx expo export --platform web --output-dir dist-web
# gcloud --source는 맨 위 Dockerfile만 읽으므로, 임시 폴더에 dist-web과 deploy-web을 복사하고 Dockerfile을 맨 위에 둔다
gcloud run deploy localone-web --source <임시 폴더> --region asia-northeast3 --project localone-515014 --allow-unauthenticated --port 8080
# 배포 뒤: API 서비스 CORS 허용 출처에 웹 주소를 넣는다
gcloud run services update localone-api --region asia-northeast3 --project localone-515014 --update-env-vars CORS_ALLOWED_ORIGINS=<웹 주소>
```
카카오맵 JS 키를 쓰는 화면은 카카오 개발자 콘솔 웹 도메인에 웹 주소를 등록해야 지도가 나온다.
