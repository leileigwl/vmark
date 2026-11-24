/**
 * onMenuAction payload marking a menu action that fired from its keyboard accelerator.
 * Mirrored in renderer `features/editor-ir/shortcutGuards.ts` (MENU_ACCELERATOR_PAYLOAD); a test keeps them equal.
 */
export const MENU_ACCELERATOR_PAYLOAD = 'accelerator';

/**
 * For menu items whose shortcut the renderer also handles on keydown (⌘/Ctrl+S, N, F, ⇧L, ⌘,):
 * tag accelerator-triggered clicks so the renderer can drop that second copy of the keystroke.
 * Mouse clicks carry no tag and always run.
 */
export function acceleratorPayload(event?: { triggeredByAccelerator?: boolean }): string | undefined {
  return event?.triggeredByAccelerator ? MENU_ACCELERATOR_PAYLOAD : undefined;
}
