import { expect, test, type Page } from '@playwright/test';
import type { AppUpdateState } from '@vcat/shared';
import { installMockWorkspace, openEditor } from './support/mockWorkspace';

interface UpdateMockConfig {
  startupResult: AppUpdateState;
  manualResult?: AppUpdateState;
  autoDownloadTransitions?: boolean;
}

async function setupWithUpdateMock(page: Page, cfg: UpdateMockConfig): Promise<void> {
  await installMockWorkspace(page, { files: { 'a.md': '# Hello\n' } });
  await page.addInitScript((mockCfg: UpdateMockConfig) => {
    const w = window as unknown as {
      electronAPI: Record<string, unknown>;
      __vcatUpdateCalls: string[];
    };
    const calls: string[] = [];
    w.__vcatUpdateCalls = calls;

    let current: AppUpdateState = {
      status: 'idle',
      currentVersion: mockCfg.startupResult.currentVersion,
      mode: mockCfg.startupResult.mode,
    };
    let listeners: Array<(s: AppUpdateState) => void> = [];
    const emit = (next: AppUpdateState) => {
      current = next;
      for (const cb of listeners) cb(next);
    };

    Object.assign(w.electronAPI, {
      getAppUpdateState: async () => current,
      checkAppUpdate: async (opts?: { manual?: boolean }) => {
        const isManual = Boolean(opts?.manual);
        calls.push(isManual ? 'check:manual' : 'check:auto');
        const next = isManual && mockCfg.manualResult ? mockCfg.manualResult : mockCfg.startupResult;
        emit(next);
        return next;
      },
      downloadAppUpdate: async () => {
        calls.push('download');
        if (current.mode === 'auto' && mockCfg.autoDownloadTransitions) {
          emit({ ...current, status: 'downloading', percent: 45 });
          window.setTimeout(() => {
            emit({ ...current, status: 'downloaded', percent: 100 });
          }, 120);
          return current;
        }
        return current;
      },
      installAppUpdate: async () => {
        calls.push('install');
        return { ok: true };
      },
      openAppUpdateRelease: async () => {
        calls.push('openRelease');
        return true;
      },
      onAppUpdateState: (cb: (s: AppUpdateState) => void) => {
        listeners.push(cb);
        return () => {
          listeners = listeners.filter((x) => x !== cb);
        };
      },
    });
  }, cfg);
  await openEditor(page);
}

test.describe('应用更新检测、顶栏徽章与增量更新弹窗', () => {
  test('auto 模式：启动静默检测后只显示顶栏徽章不主动弹窗，点开支持增量下载与一键重启', async ({ page }) => {
    await setupWithUpdateMock(page, {
      startupResult: {
        status: 'available',
        currentVersion: '0.3.0',
        latestVersion: '0.4.0',
        releaseName: 'Vmark v0.4.0',
        releaseNotes: '- 优化表格 Tab 跳转\n- 支持应用内增量更新',
        releaseUrl: 'https://github.com/leileigwl/vmark/releases/tag/v0.4.0',
        mode: 'auto',
      },
      autoDownloadTransitions: true,
    });

    const badge = page.getByRole('button', { name: '有新版本 v0.4.0' });
    await expect(badge).toBeVisible({ timeout: 6000 });
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await badge.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('当前版本 v0.3.0 → 最新版本 v0.4.0');
    await expect(dialog).toContainText('支持应用内增量更新');

    await dialog.getByRole('button', { name: '立即增量更新' }).click();
    await expect(dialog.getByRole('button', { name: '立即重启并安装' })).toBeVisible({ timeout: 3000 });
    await page.keyboard.press('Escape');
    const restartBadge = page.getByRole('button', { name: '重启更新' });
    await expect(restartBadge).toBeVisible();
    await restartBadge.click();

    await page.getByRole('dialog').getByRole('button', { name: '立即重启并安装' }).click();
    const calls = await page.evaluate(() => (window as unknown as { __vcatUpdateCalls: string[] }).__vcatUpdateCalls);
    expect(calls).toContain('download');
    expect(calls).toContain('install');
  });

  test('manual 模式：点击下载新版安装包调用直链下载，点击跳过此版本隐藏顶栏徽章', async ({ page }) => {
    await setupWithUpdateMock(page, {
      startupResult: {
        status: 'available',
        currentVersion: '0.3.0',
        latestVersion: '0.4.0',
        releaseNotes: '- macOS dmg 更新说明',
        releaseUrl: 'https://github.com/leileigwl/vmark/releases/tag/v0.4.0',
        downloadUrl: 'https://github.com/leileigwl/vmark/releases/download/v0.4.0/Vmark-0.4.0-arm64.dmg',
        mode: 'manual',
      },
    });

    const badge = page.getByRole('button', { name: '有新版本 v0.4.0' });
    await expect(badge).toBeVisible({ timeout: 6000 });
    await badge.click();

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: '下载新版安装包' }).click();
    const calls = await page.evaluate(() => (window as unknown as { __vcatUpdateCalls: string[] }).__vcatUpdateCalls);
    expect(calls).toContain('download');

    await dialog.getByRole('button', { name: '跳过此版本' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(badge).toHaveCount(0);
  });

  test('已是最新版本或静默检测失败：不显示徽章与弹窗，偏好设置内可手动检查更新', async ({ page }) => {
    await setupWithUpdateMock(page, {
      startupResult: {
        status: 'idle',
        currentVersion: '0.3.0',
        mode: 'manual',
      },
      manualResult: {
        status: 'not-available',
        currentVersion: '0.3.0',
        mode: 'manual',
      },
    });

    await page.waitForTimeout(3300);
    await expect(page.getByRole('button', { name: /有新版本/ })).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.getByTitle('偏好设置 (图床 / 平台 / GitHub)').click();
    await page.getByRole('button', { name: '文件与启动' }).click();
    await expect(page.getByText('应用版本与更新（v0.3.0）')).toBeVisible();
    await page.getByRole('button', { name: '检查更新' }).click();
    await expect(page.getByText('当前已是最新版本')).toBeVisible();
  });

  test('顶栏右上角常驻关于按钮：展示版本、作者 leileigwl 并可手动检查更新', async ({ page }) => {
    await setupWithUpdateMock(page, {
      startupResult: {
        status: 'idle',
        currentVersion: '0.3.0',
        mode: 'manual',
      },
      manualResult: {
        status: 'not-available',
        currentVersion: '0.3.0',
        mode: 'manual',
      },
    });

    const aboutBtn = page.getByRole('button', { name: '关于 Vmark' });
    await expect(aboutBtn).toBeVisible();
    await aboutBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('关于 Vmark（维记）');
    await expect(dialog).toContainText('v0.3.0');
    await expect(dialog).toContainText('leileigwl');

    await dialog.getByRole('button', { name: '检查更新' }).click();
    await expect(dialog).toContainText('当前已是最新版本');
    const calls = await page.evaluate(() => (window as unknown as { __vcatUpdateCalls: string[] }).__vcatUpdateCalls);
    expect(calls).toContain('check:manual');
  });
});
