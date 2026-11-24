import { useEffect, useState } from 'react';
import type { ImageBedConfig, StartupConfig } from '@vcat/shared';

/** Manages image bed settings and startup behavior. 平台登录状态只在 features/platform-auth 的 store 里。 */
export function useAuthSettings(showToast: (errOrMsg: unknown) => void) {
  const [startupConfig, setStartupConfig] = useState<StartupConfig>({ mode: 'last_opened' });
  const [imageBed, setImageBed] = useState<ImageBedConfig>({
    strategy: 'platform_private',
    provider: 'picgo_core',
    defaultImageScale: 50,
  });
  const [imageBedTestMsg, setImageBedTestMsg] = useState<string>('');

  useEffect(() => {
    document.documentElement.setAttribute(
      'data-img-scale',
      String(imageBed.defaultImageScale ?? 50)
    );
  }, [imageBed.defaultImageScale]);

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

  return {
    startupConfig,
    setStartupConfig,
    saveStartupConfig,
    imageBed,
    setImageBed,
    imageBedTestMsg,
    updateImageBed,
    testImageBed,
  };
}
