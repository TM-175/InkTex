/**
 * Shell state: pane layout, which overlays are open, and transient toasts.
 *
 * Deliberately separate from project and compile state so that opening a
 * dialog never re-renders the editor or the preview.
 */

import { create } from 'zustand';
import type { BottomPanelTab, Toast } from '@/types/editor';
import type { CodeAsset, ListingSpec } from '@/types/listing';

/** Which browser the left sidebar shows. */
export type SidebarView = 'files' | 'code';

/** Overlays that can be open; only one at a time. */
export type OverlayKind =
  | 'codeBlock'
  | 'codeImport'
  | 'listingSearch'
  | 'commandPalette'
  | 'quickOpen'
  | 'settings'
  | 'newProject'
  | 'shortcuts'
  | 'snippets'
  | null;

interface UiState {
  // --- Panes --------------------------------------------------------------
  explorerVisible: boolean;
  previewVisible: boolean;
  bottomPanelVisible: boolean;
  /** Explorer width in pixels. */
  explorerWidth: number;
  /** Preview width as a fraction of the editor+preview area. */
  previewFraction: number;
  /** Bottom panel height in pixels. */
  bottomPanelHeight: number;
  bottomTab: BottomPanelTab;
  /** Which browser the left sidebar shows. */
  sidebarView: SidebarView;
  /** The listing inspector is docked beside the editor when open. */
  inspectorOpen: boolean;

  // --- Overlays -----------------------------------------------------------
  overlay: OverlayKind;
  /** Pre-filled fields for the code-block wizard, set by whatever opened it. */
  codeBlockSeed: Partial<ListingSpec> | null;
  /** The asset the import dialog is working on. */
  importTarget: CodeAsset | null;

  // --- Toasts -------------------------------------------------------------
  toasts: Toast[];

  /** The confirmation currently being shown, if any. */
  confirmRequest: ConfirmRequest | null;

  toggleExplorer: () => void;
  togglePreview: () => void;
  toggleBottomPanel: () => void;
  setExplorerWidth: (width: number) => void;
  setPreviewFraction: (fraction: number) => void;
  setBottomPanelHeight: (height: number) => void;
  /** Show the bottom panel on a given tab, opening it if collapsed. */
  showBottomTab: (tab: BottomPanelTab) => void;

  openOverlay: (overlay: Exclude<OverlayKind, null>) => void;
  closeOverlay: () => void;
  /** Open the code-block wizard, optionally pre-filled. */
  openCodeBlock: (seed?: Partial<ListingSpec>) => void;
  /** Open the import dialog for one source file. */
  openCodeImport: (asset: CodeAsset) => void;
  setSidebarView: (view: SidebarView) => void;
  toggleInspector: () => void;

  pushToast: (toast: Omit<Toast, 'id'>) => string;
  dismissToast: (id: string) => void;

  /** Resolve the open confirmation with the chosen action id (null = dismiss). */
  resolveConfirm: (actionId: string | null) => void;
}

/** One button in a confirmation dialog. */
export interface ConfirmAction {
  id: string;
  label: string;
  variant?: 'primary' | 'danger' | 'ghost';
}

export interface ConfirmRequest {
  title: string;
  message: string;
  actions: ConfirmAction[];
  /** Set internally by {@link confirm}. */
  resolve: (actionId: string | null) => void;
}

/** Layout bounds, also enforced by the resize handles. */
export const LAYOUT_LIMITS = {
  explorerWidth: { min: 160, max: 520 },
  previewFraction: { min: 0.15, max: 0.85 },
  bottomPanelHeight: { min: 100, max: 600 },
} as const;

const clamp = (value: number, { min, max }: { min: number; max: number }): number =>
  Math.min(max, Math.max(min, value));

let toastCounter = 0;

export const useUiStore = create<UiState>((set, get) => ({
  explorerVisible: true,
  previewVisible: true,
  bottomPanelVisible: false,
  explorerWidth: 260,
  previewFraction: 0.5,
  bottomPanelHeight: 220,
  bottomTab: 'problems',
  sidebarView: 'files',
  inspectorOpen: false,

  overlay: null,
  codeBlockSeed: null,
  importTarget: null,
  toasts: [],
  confirmRequest: null,

  toggleExplorer: () => set((state) => ({ explorerVisible: !state.explorerVisible })),
  togglePreview: () => set((state) => ({ previewVisible: !state.previewVisible })),
  toggleBottomPanel: () =>
    set((state) => ({ bottomPanelVisible: !state.bottomPanelVisible })),

  setExplorerWidth: (width) =>
    set({ explorerWidth: clamp(width, LAYOUT_LIMITS.explorerWidth) }),
  setPreviewFraction: (fraction) =>
    set({ previewFraction: clamp(fraction, LAYOUT_LIMITS.previewFraction) }),
  setBottomPanelHeight: (height) =>
    set({ bottomPanelHeight: clamp(height, LAYOUT_LIMITS.bottomPanelHeight) }),

  showBottomTab: (tab) => set({ bottomTab: tab, bottomPanelVisible: true }),

  openOverlay: (overlay) => set({ overlay }),
  closeOverlay: () => set({ overlay: null }),

  openCodeBlock: (seed) => set({ overlay: 'codeBlock', codeBlockSeed: seed ?? null }),
  openCodeImport: (asset) => set({ overlay: 'codeImport', importTarget: asset }),

  setSidebarView: (sidebarView) => set({ sidebarView, explorerVisible: true }),
  toggleInspector: () => set((state) => ({ inspectorOpen: !state.inspectorOpen })),

  pushToast: (toast) => {
    toastCounter += 1;
    const id = `toast-${toastCounter}`;
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }));

    if (toast.duration > 0) {
      setTimeout(() => get().dismissToast(id), toast.duration);
    }
    return id;
  },

  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),

  resolveConfirm: (actionId) => {
    const request = get().confirmRequest;
    set({ confirmRequest: null });
    request?.resolve(actionId);
  },
}));

/**
 * Show a modal confirmation and wait for the user's choice.
 *
 * Resolves to the chosen action id, or null if the dialog was dismissed.
 * Modelled as a promise so call sites read linearly:
 *
 * ```ts
 * const choice = await confirm({ title: 'Delete file?', ... });
 * if (choice === 'delete') { ... }
 * ```
 */
export function confirm(request: Omit<ConfirmRequest, 'resolve'>): Promise<string | null> {
  return new Promise((resolve) => {
    const state = useUiStore.getState();

    // Only one confirmation can be pending; dismiss any earlier one.
    state.confirmRequest?.resolve(null);
    useUiStore.setState({ confirmRequest: { ...request, resolve } });
  });
}

/** Convenience wrappers so call sites read as `notify.error(...)`. */
export const notify = {
  info(title: string, detail?: string): void {
    useUiStore.getState().pushToast({ kind: 'info', title, detail, duration: 4000 });
  },
  success(title: string, detail?: string): void {
    useUiStore.getState().pushToast({ kind: 'success', title, detail, duration: 3000 });
  },
  warning(title: string, detail?: string): void {
    useUiStore.getState().pushToast({ kind: 'warning', title, detail, duration: 6000 });
  },
  /** Errors stay until dismissed — they usually need a decision. */
  error(title: string, detail?: string): void {
    useUiStore.getState().pushToast({ kind: 'error', title, detail, duration: 0 });
  },
};
