# 모바일 웹(expo export --platform web 결과 dist-web)을 정적 서버로 서비스한다. Cloud Run: localone-web
FROM nginx:1.27-alpine
COPY deploy-web/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY dist-web /usr/share/nginx/html
ENV PORT=8080
