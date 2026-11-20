import { useState } from 'react';

export { PlatformPreviewPane, type PreviewPlatform } from './PlatformPreviewPane';
export { PreflightBanner } from './PreflightBanner';
export { PublishResultRow } from './PublishResultRow';

/** Manages open/close state for the multi-platform publish drawer modal. */
export function usePublishDrawer() {
  const [publishModalOpen, setPublishModalOpen] = useState<boolean>(false);

  return {
    publishModalOpen,
    setPublishModalOpen,
    openPublishModal: () => setPublishModalOpen(true),
    closePublishModal: () => setPublishModalOpen(false),
  };
}
