#!/usr/bin/env bash
# 本地演练 risk-gate.yml 的自动合并：从 workflow 里原样取出 github-script，用假 github 对象运行。
# 关注点：GITHUB_TOKEN 合并后 test 头不会触发 push CI，必须由工作流自己派发 ci.yml。
# 用法：bash scripts/ci-sim/simulate-risk-gate-merge.sh   （需要 python3 + PyYAML、node）
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
WF="$ROOT/.github/workflows/risk-gate.yml"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
pass=0
fail=0

python3 - "$WF" > "$WORK/gate.js" <<'PY'
import sys, yaml
wf = yaml.safe_load(open(sys.argv[1]))
for s in wf['jobs']['evaluate-and-merge']['steps']:
    if s.get('name') == 'Run risk gate and controlled merge decision':
        print(s['with']['script'])
        break
else:
    sys.exit('step not found')
PY
python3 - "$WF" > "$WORK/perms.txt" <<'PY'
import sys, yaml
wf = yaml.safe_load(open(sys.argv[1]))
print(wf.get('permissions', {}).get('actions', 'none'))
PY

cat > "$WORK/run.js" <<'JS'
// 用法：node run.js <场景>；把 github 调用逐行写到 stdout
const fs = require('node:fs');
const scenario = process.argv[2];
const calls = [];
const log = (name, args) => calls.push(`${name} ${JSON.stringify(args)}`);
const owner = 'leileigwl', repo = 'vmark';
const pr = {
  number: 7, state: 'open', draft: false, title: 'fix: x', additions: 3, deletions: 1,
  labels: [{ name: scenario === 'high' ? 'risk:high' : 'risk:low' }],
  head: { sha: 'abc', ref: 'fix/x', repo: { full_name: `${owner}/${repo}` } },
  base: { ref: 'test' }, user: { login: owner }, mergeable_state: 'clean',
};
const ok = (data) => Promise.resolve({ data });
const github = { rest: {
  pulls: {
    get: (a) => { log('pulls.get', a); return ok(pr); },
    list: () => ok([pr]),
    merge: (a) => { log('pulls.merge', a); return ok({ merged: true, sha: 'merged123' }); },
    updateBranch: (a) => { log('pulls.updateBranch', a); return ok({}); },
  },
  issues: {
    removeLabel: () => ok({}), addLabels: () => ok({}),
    listComments: () => ok([]),
    createComment: (a) => { log('issues.createComment', { issue_number: a.issue_number }); return ok({}); },
    listForRepo: () => ok([]),
  },
  checks: { listForRef: () => ok({ check_runs: [{ name: 'ci-gate', status: 'completed', conclusion: 'success' }] }) },
  git: { deleteRef: (a) => { log('git.deleteRef', a); return ok({}); } },
  actions: {
    createWorkflowDispatch: (a) => {
      log('actions.createWorkflowDispatch', a);
      if (scenario === 'dispatch-fails') return Promise.reject(Object.assign(new Error('Resource not accessible by integration'), { status: 403 }));
      return ok({});
    },
  },
} };
const context = {
  eventName: 'workflow_run', repo: { owner, repo },
  payload: { workflow_run: { pull_requests: [{ number: 7 }], head_sha: 'abc' } },
};
const core = {
  warning: (m) => log('core.warning', String(m)),
  setFailed: (m) => log('core.setFailed', String(m)),
  info: () => {}, notice: (m) => log('core.notice', String(m)),
};
fs.writeFileSync('risk-from-ci.json', JSON.stringify({ level: scenario === 'high' ? 'high' : 'low' }));
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const body = fs.readFileSync(process.argv[3], 'utf8');
const origLog = console.log; console.log = () => {};
new AsyncFunction('require', 'github', 'context', 'core', body)(require, github, context, core)
  .then(() => { console.log = origLog; calls.push('RESULT ok'); })
  .catch((e) => { console.log = origLog; calls.push(`RESULT threw ${e.message}`); })
  .finally(() => process.stdout.write(calls.join('\n') + '\n'));
JS

run() { (cd "$WORK" && node run.js "$1" gate.js > "$WORK/$1.log" 2>&1) || true; }
expect() { # expect <描述> <命令…>
  local desc=$1; shift
  if "$@" >/dev/null 2>&1; then echo "  ✓ $desc"; pass=$((pass + 1)); else echo "  ✗ $desc"; fail=$((fail + 1)); fi
}

echo "场景 0：工作流权限"
expect "permissions 含 actions: write（派发 ci.yml 需要）" grep -qx write "$WORK/perms.txt"

echo "场景 1：risk:low、CI 全绿，自动合并"
run low
expect "squash 合入 test" grep -q '^pulls.merge .*"merge_method":"squash"' "$WORK/low.log"
expect "合并后在 test 上派发 ci.yml（补 push CI）" grep -q '^actions.createWorkflowDispatch .*"workflow_id":"ci.yml".*"ref":"test"' "$WORK/low.log"
expect "派发发生在合并之后" bash -c "grep -n '' '$WORK/low.log' | awk -F: '/pulls.merge/{m=\$1} /createWorkflowDispatch/{d=\$1} END{exit !(m && d && d>m)}'"
expect "脚本正常结束" grep -q '^RESULT ok' "$WORK/low.log"

echo "场景 2：risk:high 未 /approve"
run high
expect "不合并" bash -c "! grep -q '^pulls.merge' '$WORK/high.log'"
expect "不派发 ci.yml" bash -c "! grep -q 'createWorkflowDispatch' '$WORK/high.log'"

echo "场景 3：合并成功但派发被拒（如缺权限）"
run dispatch-fails
expect "合并照常完成" grep -q '^pulls.merge' "$WORK/dispatch-fails.log"
expect "给出 warning（说明需手动补跑 CI）" grep -q '^core.warning .*ci.yml' "$WORK/dispatch-fails.log"
expect "不让整个 job 失败" grep -q '^RESULT ok' "$WORK/dispatch-fails.log"

echo "结果：通过 $pass，失败 $fail"
[ "$fail" -eq 0 ]
