import { create } from 'zustand';

export type ToastVariant = 'info' | 'success' | 'warning' | 'error';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface UiToast {
  id: string;
  message: string;
  variant: ToastVariant;
  duration: number;
  action?: ToastAction;
}

export interface UiHud {
  id: string;
  label: string;
  tone: 'neutral' | 'accent' | 'ok' | 'danger';
}

export interface FloatingReaction {
  id: string;
  emoji: string;
  name: string;
  x: number;
}

export interface UiDialog {
  type: 'confirm' | 'prompt';
  title?: string;
  message: string;
  placeholder?: string;
  inputType?: 'text' | 'password';
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  resolve: (value: any) => void;
}

interface UiState {
  toasts: UiToast[];
  dialog: UiDialog | null;
  hud: UiHud | null;
  reactions: FloatingReaction[];
  shortcutsOpen: boolean;
  pushToast: (message: string, variant?: ToastVariant, opts?: { duration?: number; action?: ToastAction }) => void;
  dismissToast: (id: string) => void;
  openDialog: (dialog: UiDialog) => void;
  closeDialog: () => void;
  showHud: (label: string, tone?: UiHud['tone']) => void;
  pushReaction: (emoji: string, name: string) => void;
  setShortcutsOpen: (open: boolean) => void;
  toggleShortcuts: () => void;
}

let hudTimer: ReturnType<typeof setTimeout> | null = null;

export const useUiStore = create<UiState>((set) => ({
  toasts: [],
  dialog: null,
  hud: null,
  reactions: [],
  shortcutsOpen: false,

  pushToast: (message, variant = 'info', opts) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const duration = opts?.duration ?? (variant === 'error' ? 4600 : 3800);
    set((s) => ({
      toasts: [...s.toasts.slice(-4), { id, message, variant, duration, action: opts?.action }],
    }));
  },

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  openDialog: (dialog) => set({ dialog }),
  closeDialog: () => set({ dialog: null }),

  showHud: (label, tone = 'neutral') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    if (hudTimer) clearTimeout(hudTimer);
    set({ hud: { id, label, tone } });
    hudTimer = setTimeout(() => {
      set((s) => (s.hud?.id === id ? { hud: null } : s));
    }, 1350);
  },

  pushReaction: (emoji, name) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    // Phân bố ngẫu nhiên đẹp mắt quanh vùng trung tâm (22%..78%)
    const x = 22 + Math.random() * 56;
    set((s) => ({
      reactions: [...s.reactions.slice(-15), { id, emoji, name, x }],
    }));
    setTimeout(() => {
      set((s) => ({ reactions: s.reactions.filter((r) => r.id !== id) }));
    }, 2700);
  },

  setShortcutsOpen: (open) => set({ shortcutsOpen: open }),
  toggleShortcuts: () => set((s) => ({ shortcutsOpen: !s.shortcutsOpen })),
}));

export const toast = {
  info: (msg: string, opts?: { duration?: number; action?: ToastAction }) =>
    useUiStore.getState().pushToast(msg, 'info', opts),
  success: (msg: string, opts?: { duration?: number; action?: ToastAction }) =>
    useUiStore.getState().pushToast(msg, 'success', opts),
  warning: (msg: string, opts?: { duration?: number; action?: ToastAction }) =>
    useUiStore.getState().pushToast(msg, 'warning', opts),
  error: (msg: string, opts?: { duration?: number; action?: ToastAction }) =>
    useUiStore.getState().pushToast(msg, 'error', opts),
};

export const showActionHud = (label: string, tone: UiHud['tone'] = 'neutral') => {
  useUiStore.getState().showHud(label, tone);
};

export function uiConfirm(
  message: string,
  opts?: {
    title?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
  },
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const prev = useUiStore.getState().dialog;
    if (prev) prev.resolve(prev.type === 'confirm' ? false : null);
    useUiStore.getState().openDialog({
      type: 'confirm',
      title: opts?.title || 'Xác nhận',
      message,
      confirmLabel: opts?.confirmLabel || 'Xác nhận',
      cancelLabel: opts?.cancelLabel || 'Huỷ',
      danger: opts?.danger,
      resolve,
    });
  });
}

export function uiPrompt(
  message: string,
  opts?: {
    title?: string;
    placeholder?: string;
    inputType?: 'text' | 'password';
    defaultValue?: string;
    confirmLabel?: string;
    cancelLabel?: string;
  },
): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    const prev = useUiStore.getState().dialog;
    if (prev) prev.resolve(prev.type === 'confirm' ? false : null);
    useUiStore.getState().openDialog({
      type: 'prompt',
      title: opts?.title || 'Nhập thông tin',
      message,
      placeholder: opts?.placeholder || '',
      inputType: opts?.inputType || 'text',
      defaultValue: opts?.defaultValue || '',
      confirmLabel: opts?.confirmLabel || 'Tiếp tục',
      cancelLabel: opts?.cancelLabel || 'Huỷ',
      resolve,
    });
  });
}
