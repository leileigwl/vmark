import { useState } from 'react';

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
