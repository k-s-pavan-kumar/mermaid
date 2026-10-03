export type ToastKind = 'success' | 'error' | 'info';
export interface ToastDetail { id: number; kind: ToastKind; message: string; detail?: string }

let seq = 0;

/** Fire-and-forget toast from any client code: toast('Synced 3 packages'). */
export function toast(message: string, kind: ToastKind = 'success', detail?: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ToastDetail>('meridian:toast', { detail: { id: ++seq, kind, message, detail } }));
}
