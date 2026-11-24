#!/bin/sh
# 비공개 기술 계약이 필요한 작업에서만 보조 레포를 체크아웃한다.
set -e
code_dir="$(cd "$(dirname "$0")" && pwd)"
team_dir="$code_dir/../team"

if [ -d "$team_dir/.git" ] || [ -f "$team_dir/.git" ]; then
  echo "기술 계약 체크아웃: $team_dir"
  exit 0
fi

if ! command -v gh >/dev/null 2>&1; then echo "gh(GitHub CLI)가 필요해요. https://cli.github.com 에서 설치해 주세요."; exit 1; fi
if ! gh auth status >/dev/null 2>&1; then echo "먼저 'gh auth login'으로 로그인해 주세요."; exit 1; fi

if ! gh repo clone axteamc/team "$team_dir"; then
  echo "기술 계약을 받지 못했어요. axteamc/team 읽기 권한을 확인해 주세요."
  exit 1
fi

echo "기술 계약 체크아웃: $team_dir"
