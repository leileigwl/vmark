#!/usr/bin/env bash
# 本地演练 release.yml 的 publish job：原样取出 run 脚本，用假 gh 模拟 GitHub Release（上传 = 拷到 remote/，
# 资产列表 = 按 remote/ 现算 sha256 digest），检查「齐全 → SHA256SUMS → 上传草稿 → 核对 → 公开」的顺序和拦截。
# 用法：bash scripts/ci-sim/simulate-release-publish.sh   （需要 python3 + PyYAML、git、node）
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
WF="$ROOT/.github/workflows/release.yml"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
pass=0
fail=0

step() {
  python3 - "$WF" "$1" <<'PY'
import sys, yaml
wf = yaml.safe_load(open(sys.argv[1]))
for s in wf['jobs']['publish']['steps']:
    if s.get('name') == sys.argv[2]:
        print(s['run'])
        break
else:
    sys.exit(f'step not found: {sys.argv[2]}')
PY
}

setup() { # setup <win 安装包文件名> <tamper:yes|no>
  rm -rf "$WORK/s" && mkdir -p "$WORK/s/bin" "$WORK/s/remote" && cd "$WORK/s"
  cat > bin/gh <<'GH'
#!/usr/bin/env bash
echo "gh $*" >> "$GH_LOG"
case "$*" in
  *"--json isDraft"*) echo true ;;
  *"--json databaseId"*) echo 1 ;;
  "release upload"*) shift 3; for f in "$@"; do [ "$f" = --clobber ] || cp "$f" "$REMOTE/"; done
                     [ "$TAMPER" = yes ] && echo corrupt >> "$REMOTE/latest.yml"; true ;;
  "api "*) node -e '
      const fs=require("fs"),c=require("crypto"),d=process.argv[1];
      console.log(JSON.stringify(fs.readdirSync(d).map(n=>({name:n,state:"uploaded",
        digest:"sha256:"+c.createHash("sha256").update(fs.readFileSync(d+"/"+n)).digest("hex")}))));' "$REMOTE" ;;
esac
GH
  printf '#!/bin/sh\nexit 0\n' > bin/sleep
  chmod +x bin/gh bin/sleep
  git init -q repo && cd repo && git config user.email t@e && git config user.name t
  mkdir -p apps/desktop/scripts && cp "$ROOT"/apps/desktop/scripts/release-{plan,assets}.mjs apps/desktop/scripts/
  git add . && git commit -qm init && git tag v0.4.0 && git tag v0.5.0
  mkdir dist && cd dist
  local v=0.5.0
  for f in "Vmark-$v-arm64.dmg" "Vmark-$v-arm64-mac.zip" "$1" "Vmark-$v-x86_64.AppImage" "Vmark-$v-amd64.deb"; do echo "$f" > "$f"; done
  printf 'version: %s\nfiles:\n  - url: Vmark-%s-arm64-mac.zip\n  - url: Vmark-%s-arm64.dmg\npath: Vmark-%s-arm64-mac.zip\n' $v $v $v $v > latest-mac.yml
  printf 'version: %s\nfiles:\n  - url: Vmark-Setup-%s.exe\npath: Vmark-Setup-%s.exe\n' $v $v $v > latest.yml
  printf 'version: %s\nfiles:\n  - url: Vmark-%s-x86_64.AppImage\n  - url: Vmark-%s-amd64.deb\npath: Vmark-%s-x86_64.AppImage\n' $v $v $v $v > latest-linux.yml
  cd ..
  export TAMPER=$2
}

run_publish() {
  export PATH="$WORK/s/bin:$PATH" GH_LOG="$WORK/s/gh.log" REMOTE="$WORK/s/remote" TAG=v0.5.0 PRERELEASE=false \
    GH_REPO=x/vmark GITHUB_STEP_SUMMARY="$WORK/s/summary"
  : > "$GH_LOG"
  for s in 'Check all three platforms together' 'Generate SHA256SUMS.txt' 'Upload assets to the draft' 'Verify uploaded sha256' 'Publish release'; do
    local body
    if ! body=$(step "$s") || ! bash -e -c "$body" >> "$WORK/s/run.log" 2>&1; then echo "$s" > "$WORK/s/failed"; return 0; fi
  done
}

expect() {
  local desc=$1; shift
  if "$@" >/dev/null 2>&1; then echo "  ✓ $desc"; pass=$((pass + 1)); else echo "  ✗ $desc"; fail=$((fail + 1)); fi
}

echo "场景 1：三平台齐全"
setup "Vmark-Setup-0.5.0.exe" no; run_publish
expect "全部步骤通过" test ! -e "$WORK/s/failed"
expect "SHA256SUMS.txt 一起上传" test -s "$WORK/s/remote/SHA256SUMS.txt"
expect "公开并标为 Latest" grep -q "release edit v0.5.0 --draft=false --prerelease=false --latest=true" "$WORK/s/gh.log"

echo "场景 2：Windows 安装包名带空格（v0.4.0 的问题）"
setup "Vmark Setup 0.5.0.exe" no; run_publish
expect "在合并检查就失败" grep -qx "Check all three platforms together" "$WORK/s/failed"
expect "什么都没上传、没公开" bash -c "! grep -qE 'release (upload|edit)' '$WORK/s/gh.log'"

echo "场景 3：上传后 GitHub 上的文件与本地不一致"
setup "Vmark-Setup-0.5.0.exe" yes; run_publish
expect "核对 sha256 失败" grep -qx "Verify uploaded sha256" "$WORK/s/failed"
expect "Release 保持草稿（没有 release edit）" bash -c "! grep -q 'release edit' '$WORK/s/gh.log'"

echo "结果：通过 $pass，失败 $fail"
[ "$fail" -eq 0 ]
