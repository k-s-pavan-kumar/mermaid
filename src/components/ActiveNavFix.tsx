'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/** The loading skeleton renders the sidebar without knowing which page is
 *  current; this marks the right item so the highlight doesn't blink off. */
export function ActiveNavFix() {
  const pathname = usePathname();
  useEffect(() => {
    const items = Array.from(document.querySelectorAll<HTMLAnchorElement>('.nav-item[href]'));
    const best = items
      .filter((a) => pathname === a.getAttribute('href') || pathname.startsWith(`${a.getAttribute('href')}/`))
      .sort((a, b) => (b.getAttribute('href')?.length ?? 0) - (a.getAttribute('href')?.length ?? 0))[0];
    best?.classList.add('active');
  }, [pathname]);
  return null;
}
