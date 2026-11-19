import { useEffect, useState } from 'react';
import type { ImageBedConfig, PlatformId, StartupConfig } from '@vcat/shared';

const PLATFORM_LOGIN_URLS: Partial<Record<PlatformId, string>> = {
  weixin: 'https://mp.weixin.qq.com/',
  cnblogs: 'https://account.cnblogs.com/signin',
  linuxdo: 'https://linux.do/login',
  juejin: 'https://juejin.cn/login',
  csdn: 'https://passport.csdn.net/login',
  zhihu: 'https://www.zhihu.com/signin',
  baijiahao: 'https://baijiahao.baidu.com/builder/theme/bjh/login',
  weibo: 'https://weibo.com/login.php',
  bilibili: 'https://passport.bilibili.com/login',
  douyin: 'https://creator.douyin.com/',
  x: 'https://x.com/i/flow/login',
  xiaohongshu: 'https://creator.xiaohongshu.com/login',
};

/** Manages image bed settings, startup behavior, and platform auth partition states. */
export function useAuthSettings(showToast: (errOrMsg: unknown) => void) {
  const [startupConfig, setStartupConfig] = useState<StartupConfig>({ mode: 'last_opened' });
  const [imageBed, setImageBed] = useState<ImageBedConfig>({
    strategy: 'platform_private',
    provider: 'picgo_core',
    defaultImageScale: 50,
  });
  const [imageBedTestMsg, setImageBedTestMsg] = useState<string>('');
  const [authStates, setAuthStates] = useState<Partial<Record<PlatformId, boolean>>>({});

  useEffect(() => {
    document.documentElement.setAttribute(
      'data-img-scale',
      String(imageBed.defaultImageScale ?? 50)
    );
  }, [imageBed.defaultImageScale]);

  useEffect(() => {
    void window.electronAPI?.getPlatformAuthStates?.().then((states) => {
      if (states) setAuthStates(states);
    });
    const unsub = window.electronAPI?.onPlatformAuthUpdated?.((states) => {
      setAuthStates((prev) => ({ ...prev, ...states }));
    });
    return () => unsub?.();
  }, []);

  function saveStartupConfig(next: StartupConfig) {
    setStartupConfig(next);
    void window.electronAPI.saveStartupConfig(next);
  }

  function updateImageBed(next: ImageBedConfig, persist?: boolean) {
    setImageBed(next);
    if (persist) {
      void window.electronAPI.saveImageBedConfig(next).then(() => {
        setImageBedTestMsg('配置已保存');
      });
    }
  }

  async function testImageBed() {
    await window.electronAPI.saveImageBedConfig(imageBed);
    const res = await window.electronAPI.testImageBedUpload(imageBed);
    setImageBedTestMsg(res.message);
  }

  async function loginPlatform(pid: PlatformId) {
    const url = PLATFORM_LOGIN_URLS[pid] ?? 'https://www.cnblogs.com';
    const ok = await window.electronAPI.openPlatformLogin(pid, url);
    const refreshed = await window.electronAPI.getPlatformAuthStates();
    setAuthStates(refreshed);
    if (ok) {
      showToast('平台授权已完成并同步');
    } else {
      showToast('未检测到登录授权票据，已保持未授权状态');
    }
  }

  async function logoutPlatform(pid: PlatformId) {
    const ok = await window.electronAPI.logoutPlatform(pid);
    const refreshed = await window.electronAPI.getPlatformAuthStates();
    setAuthStates(refreshed);
    if (ok) {
      showToast('已退出平台授权并清除会话 Cookie');
    }
  }

  return {
    startupConfig,
    setStartupConfig,
    saveStartupConfig,
    imageBed,
    setImageBed,
    imageBedTestMsg,
    authStates,
    setAuthStates,
    updateImageBed,
    testImageBed,
    loginPlatform,
    logoutPlatform,
  };
}
