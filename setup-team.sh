#!/bin/sh
# 팀 규칙(private 레포 axteamc/team)을 이 PC에만 가져온다. 조직 멤버가 아니면 clone 단계에서 거부된다.
# 만드는 파일(CLAUDE.md, .claude/)은 .gitignore 대상이라 이 레포에 올라가지 않는다.
# 다시 실행해도 안전하다(이미 있으면 건너뛴다).
set -e
code_dir="$(cd "$(dirname "$0")" && pwd)"
team_dir="$code_dir/../team"

if ! command -v gh >/dev/null 2>&1; then echo "gh(GitHub CLI)가 필요해요. https://cli.github.com 에서 설치해 주세요."; exit 1; fi
if ! gh auth status >/dev/null 2>&1; then echo "먼저 'gh auth login'으로 로그인해 주세요."; exit 1; fi

if [ ! -d "$team_dir/.git" ]; then
  if ! gh repo clone axteamc/team "$team_dir"; then
    echo "team 레포를 받지 못했어요. 조직(axteamc) 멤버이고 team 레포 읽기 권한이 있어야 해요. D에게 초대를 요청해 주세요."
    exit 1
  fi
  # 팀원 PC의 team은 읽기 전용. D는 쓰기 가능하게 두려면 이 줄을 건너뛰고 직접 되돌린다.
  if [ "$(git -C "$code_dir" config --local team.role 2>/dev/null)" != "D" ]; then
    git -C "$team_dir" remote set-url --push origin DISABLED_READ_ONLY
  fi
fi

[ -f "$code_dir/CLAUDE.md" ] || cp "$team_dir/setup/CLAUDE.md.template" "$code_dir/CLAUDE.md"
mkdir -p "$code_dir/.claude/skills"
[ -f "$code_dir/.claude/settings.json" ] || cp "$team_dir/setup/claude-settings.json" "$code_dir/.claude/settings.json"
[ -d "$code_dir/.claude/skills/pr-review" ] || cp -R "$team_dir/setup/skills/pr-review" "$code_dir/.claude/skills/pr-review"

echo "team 규칙 준비 완료: $team_dir"
echo "역할 설정: git config --local team.role <A|B|C|D>"
