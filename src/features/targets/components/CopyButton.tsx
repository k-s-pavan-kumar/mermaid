'use client';

import { useState } from 'react';
import { toast } from '@/lib/toast';

/** Copies text to the clipboard (with a fallback for browsers that block the API). */
export function CopyButton({ text, label = 'Copy', done = 'Copied', className = 'btn-link' }: { text: string; label?: string; done?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } finally { document.body.removeChild(ta); }
    }
    setCopied(true);
    toast(done);
    setTimeout(() => setCopied(false), 1800);
  }
  return <button type="button" className={className} onClick={copy}>{copied ? `${done} ✓` : label}</button>;
}
