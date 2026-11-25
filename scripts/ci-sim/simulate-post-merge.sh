#!/usr/bin/env bash
# 本地演练 daily-release-pr.yml 的 post-merge-syncback：从 workflow 里原样取出 run 脚本，
# 在临时的 origin（裸仓库，test 分支用 pre-receive 模拟分支保护）上跑，gh 用假命令记录调用。
# 用法：bash scripts/ci-sim/simulate-post-merge.sh   （需要 python3 + PyYAML、git、node）
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
WF="$ROOT/.github/workflows/daily-release-pr.yml"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
pass=0
fail=0

step() { # step <name>：取出 post-merge-syncback 里同名 step 的 run 脚本
  python3 - "$WF" "$1" <<'PY'
import sys, yaml
wf = yaml.safe_load(open(sys.argv[1]))
for s in wf['jobs']['post-merge-syncback']['steps']:
    if s.get('name') == sys.argv[2]:
        print(s['run'].replace('${{ github.run_id }}', '4242'))
        break
else:
    sys.exit(f'step not found: {sys.argv[2]}')
PY
}

setup() { # setup <scenario>
  rm -rf "$WORK/s" && mkdir -p "$WORK/s/bin" && cd "$WORK/s"
  git init -q --bare -b master origin.git
  cat > bin/gh <<'GH'
#!/bin/sh
echo "gh $*" >> "$GH_LOG"
case "$1 $2" in "pr create") echo "https://github.com/x/vmark/pull/999";; esac
GH
  chmod +x bin/gh
  git clone -q origin.git seed 2>/dev/null && cd seed
  git config user.email t@e && git config user.name t
  mkdir -p apps/desktop/scripts && cp "$ROOT/apps/desktop/scripts/release-plan.mjs" apps/desktop/scripts/
  git add . && git commit -qm "feat: 初始" && git tag -a v0.2.0 -m v0.2.0
  echo a > a && git add a && git commit -qm "fix: 修 a" && git tag -a v0.3.0-rc.1 -m rc
  git checkout -qb test && echo b > b && git add b && git commit -qm "fix(editor): 修 b"
  git checkout -q master && git merge -q --no-ff test -m "Merge pull request #128 from leileigwl/test"
  if [ "$1" = current ]; then # 现状：v0.4.0 打在上一次 master 合并上，test 之后只有 fix
    git tag -a v0.4.0 -m v0.4.0 && git checkout -q test && echo c > c && git add c && git commit -qm "fix(editor): v0.4.0 之后的修复"
    git checkout -q master && git merge -q --no-ff test -m "Merge pull request #150 from leileigwl/test"
  fi
  if [ "$1" = hotfix ]; then echo hot > hot && git add hot && git commit -qm "fix: master 热修复"; fi
  if [ "$1" = tagged ]; then git tag -a v0.3.0 -m "done"; fi
  git push -q origin master test --tags
  cat > ../origin.git/hooks/pre-receive <<'HOOK'
#!/bin/sh
while read -r old new ref; do
  if [ "$ref" = refs/heads/test ]; then echo 'GH006: Protected branch update failed for refs/heads/test.'; exit 1; fi
done
exit 0
HOOK
  chmod +x ../origin.git/hooks/pre-receive
  cd .. && git clone -q -b test origin.git runner && cd runner
}

run_job() { # 依次执行与 workflow 相同的 step；返回 plan 输出
  export PATH="$WORK/s/bin:$PATH" GH_LOG="$WORK/s/gh.log" HAS_BOT_TOKEN=false GITHUB_OUTPUT="$WORK/s/out" GITHUB_STEP_SUMMARY="$WORK/s/summary"
  : > "$GH_LOG"; : > "$GITHUB_OUTPUT"
  local body
  body=$(step 'Merge master back into test (skip when master adds nothing)') || return 1
  bash -e -c "$body" > "$WORK/s/sync.log" 2>&1 || return 1
  body=$(step 'Compute next release tag') || return 1
  bash -e -c "$body" > /dev/null || return 1
  NEXT_TAG=$(sed -n 's/^tag=//p' "$GITHUB_OUTPUT" | tail -1)
  REASON=$(sed -n 's/^reason=//p' "$GITHUB_OUTPUT" | tail -1)
  export NEXT_TAG REASON
  if [ -n "$NEXT_TAG" ]; then
    body=$(step 'Tag master and dispatch packaging') || return 1
    bash -e -c "$body" > /dev/null || return 1
  fi
  return 0
}

expect() { # expect <描述> <命令…>
  local desc=$1; shift
  if "$@" >/dev/null 2>&1; then echo "  ✓ $desc"; pass=$((pass + 1)); else echo "  ✗ $desc"; fail=$((fail + 1)); fi
}

echo "场景 1：日常 test→master 合并（master 无新内容，最新 tag 是 v0.3.0-rc.1）"
setup normal; run_job || true
expect "不回同步、不开 PR" grep -q "不需要回同步" "$WORK/s/sync.log"
expect "没有调用 gh pr create" bash -c "! grep -q 'pr create' '$WORK/s/gh.log'"
expect "rc 转正为 v0.3.0 并推到 origin" git -C "$WORK/s/origin.git" rev-parse -q --verify refs/tags/v0.3.0
expect "派发 release.yml（tag=v0.3.0）" grep -q "workflow run release.yml --ref v0.3.0 -f tag=v0.3.0" "$WORK/s/gh.log"

echo "场景 2：master 上有热修复（需要回同步，test 受保护）"
setup hotfix; run_job || true
expect "直推 test 被拒后推备用分支" git -C "$WORK/s/origin.git" rev-parse -q --verify refs/heads/sync/master-to-test-4242
expect "开回同步 PR 并开启自动合并" grep -q "pr merge https://github.com/x/vmark/pull/999 --auto --merge --delete-branch" "$WORK/s/gh.log"
expect "无 PAT 时为备用分支派发 CI" grep -q "workflow run ci.yml --ref sync/master-to-test-4242" "$WORK/s/gh.log"
expect "照常打 v0.3.0" git -C "$WORK/s/origin.git" rev-parse -q --verify refs/tags/v0.3.0

echo "场景 3：master 已有正式版 tag（重复触发）"
setup tagged; run_job || true
expect "不再打 tag、不派发发布" bash -c "! grep -q 'release.yml' '$WORK/s/gh.log'"
expect "输出不打 tag 的原因" grep -q "reason=该提交已有正式版 tag v0.3.0" "$WORK/s/out"

echo "场景 4：现状（最新正式版 v0.4.0，之后 test 只有 fix）"
setup current; run_job || true
expect "打 v0.4.1（不再去转正 v0.3.0-rc.1）" git -C "$WORK/s/origin.git" rev-parse -q --verify refs/tags/v0.4.1
expect "没有误打 v0.3.0" bash -c "! git -C '$WORK/s/origin.git' rev-parse -q --verify refs/tags/v0.3.0"
expect "派发 release.yml（tag=v0.4.1）" grep -q "workflow run release.yml --ref v0.4.1 -f tag=v0.4.1" "$WORK/s/gh.log"

echo "结果：通过 $pass，失败 $fail"
[ "$fail" -eq 0 ]
