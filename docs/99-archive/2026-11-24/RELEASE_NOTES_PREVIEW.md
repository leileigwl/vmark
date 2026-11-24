# Vmark v0.2.0 发布说明 (2026-11-20)

> **Local-First 多平台创作者排版与一键草稿分发桌面工作台**（支持 macOS / Windows / Linux）

## 🎨 多平台排版与 3:4 满版视觉卡片引擎
- docs(social): add visual card generator script, real screenshots, and full test report (`1d86589`)
- feat(core,desktop): refactor card engine with Guizang Editorial x Ray.so design system (`19aff0b`)
- feat(social,core): add Xiaohongshu/Douyin card template engine and offline card rasterization (`3755012`)
- fix(adapters): bilibili new-edit URL, csdn auth/blog error & baijiahao image error (#23) [risk:high] (`21d7e20`)
- fix(publish): baijiahao [!NOTE], bilibili referer, csdn cookie check & cover guides (#22) [risk:high] (`7a4823a`)
- fix(publish): weixin referrer, bilibili draft push, and zhihu [!NOTE] callouts (#20) [risk:high] (`f41d496`)
- fix(auth): live session verification for linuxdo, weibo, douyin, xiaohongshu (#18) [risk:high] (`9305d52`)

## ✨ 核心新特性与平台分发
- feat(auth): replace external Chrome & proxy UI with built-in isolated platform browser [risk:high] (#30) [risk:high] (`d0410d6`)
- feat(auth): harden browser stealth, add per-platform proxy, and isolate Chrome profiles [risk:high] (#29) [risk:high] (`fc40521`)
- feat(renderer): hide unfinished linuxdo and x platforms from UI [risk:mid] (#27) [risk:high] (`d195716`)
- feat(preview): [!NOTE] callouts & local image resolution in preview (#19) [risk:high] (`e0e5168`)
- feat(renderer): multi-platform layout preview & dispatch result links (#16) [risk:high] (`3f714dd`)
- feat(harness): AI harness, shift-left risk, vertical islands & tiered Ubuntu CI/CD (#2) (`30d66bb`)

## 🐛 问题修复与稳定性增强
- fix(auth): parallelize juejin auth check & recognize logged-in cnblogs (#26) [risk:high] (`41b1c66`)
- fix(auth): linuxdo cloudflare handling, login sync & 13-platform E2E (#21) [risk:high] (`3490a49`)
- fix(auth): eliminate false-positive auth for cnblogs and juejin (#17) [risk:high] (`2003c04`)
- fix(ci): deduplicate slice push CI and harden risk-gate ci-gate polling (`9ae377c`)

## 🔧 工程护栏与文档演进
- Merge pull request #28 from leileigwl/sync/master-to-test-44729464258 (`c93e981`)
- Merge pull request #25 from leileigwl/test (`5c51dde`)
- Merge pull request #14 from leileigwl/sync/master-to-test-44564705145 (`3b5e141`)
- Merge pull request #13 from leileigwl/test (`908b858`)
- Merge pull request #12 from leileigwl/release/step1-unlocked (`188b1c1`)
- chore(harness): re-lock bootstrap protections after Slop 0 & hook fix (`a329d42`)
- refactor(slop): fix .agents hooks CWD path, clean harness slop, and split 5 ratchet hubs to <=469 lines (Closes #4) (#11) (`2b08904`)
- chore(slop): clean 19 non-locked dead exports, empty catches, and digest duplication (Refs #4) (#10) (`4007bea`)
- Merge pull request #9 from leileigwl/sync/master-to-test-44494908859 (`82a2cf5`)
- Merge pull request #8 from leileigwl/test (`07ba273`)
- docs(handoff): verify shift-left risk:low auto-merge [risk:low] (#5) [risk:low] (`f3a0142`)
- chore(harness): lock bootstrap protections after risk-gate fix (`e3a25a7`)
- Merge pull request #3 from leileigwl/test (`0d5be0e`)
- chore: sync Phase 0 AGPL-3.0 dual license & OpenSpec baseline before publicizing (`d0c56c0`)
- chore(compliance): add AGPL-3.0 dual license, sanitize local paths, slim docs & archive init-cat-publisher (`5f58751`)
- docs(openspec): add native hooks for small-model orchestrator, AST risk/island gates, bootstrap lock & daily playbook (`13eb543`)
- docs(openspec): propose agent harness, tiered testing & risk-gated cicd redesign (`2c9939b`)

## 📦 三端安装包下载与安装指南
| 操作系统 | 安装包格式 | 安装与启动说明 |
| :--- | :--- | :--- |
| **macOS (Apple Silicon / Intel)** | `.dmg` / `.zip` | 下载后拖入 `Applications`，首次打开如遇 Gatekeeper 提示请在「系统设置 -> 隐私与安全性」点仍要打开 |
| **Windows 10 / 11 (x64)** | `.exe` | 双击安装包即可完成桌面快捷方式配置，凭据由系统 DPAPI (`safeStorage`) 加密保护 |
| **Linux (Ubuntu / Debian)** | `.AppImage` / `.deb` | `chmod +x *.AppImage` 直接运行，或使用 `sudo dpkg -i *.deb` 安装 |
