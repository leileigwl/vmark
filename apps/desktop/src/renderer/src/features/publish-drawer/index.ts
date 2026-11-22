import { useState } from 'react';
import { PLATFORM_CATALOG } from '@vcat/adapters';
import type { PlatformId } from '@vcat/shared';


/** Platforms temporarily hidden from UI until their publish adapters are fully implemented. */
const HIDDEN_PLATFORM_IDS = new Set<PlatformId>(['linuxdo', 'x']);

export const VISIBLE_PLATFORM_CATALOG = PLATFORM_CATALOG.filter(
  (p) => !HIDDEN_PLATFORM_IDS.has(p.id)
);

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
