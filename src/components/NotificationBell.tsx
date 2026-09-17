'use client';

import { useState } from 'react';
import type { Alert } from '@/features/notifications/types';

export function NotificationBell({ alerts }: { alerts: Alert[] }) {
  const [open, setOpen] = useState(false);
  const critical = alerts.filter((a) => a.level === 'critical').length;
  const unread = alerts.filter((a) => !a.read).length;

  return (
    <div style={{ position: 'relative' }}>
      <button className="btn-ghost bell" onClick={() => setOpen((o) => !o)} title="Notifications">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" style={{ width: 16, height: 16 }}>
          <path d="M18 8a6 6 0 10-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
          <path d="M13.7 21a2 2 0 01-3.4 0" />
        </svg>
        {unread > 0 && (
          <span className={`bell-dot${critical > 0 ? ' crit' : ''}`}>{unread}</span>
        )}
      </button>

      {open && (
        <>
          <div className="bell-scrim" onClick={() => setOpen(false)} />
          <div className="bell-panel">
            <div className="bell-head">
              <strong style={{ fontFamily: "'Fraunces',serif" }}>Notifications</strong>
              <span className="text-muted" style={{ fontSize: 11 }}>{unread} unread · {alerts.length} open</span>
            </div>
            {alerts.length === 0 && <div className="empty" style={{ padding: 22 }}>Nothing needs you right now.</div>}
            {alerts.map((a) => (
              <a key={a.id} href={a.href} className="bell-item" onClick={() => setOpen(false)}>
                <span className={`bell-bar ${a.level}`} />
                <span>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: a.read ? 400 : 600 }}>
                    {!a.read && <span className="unread-dot" />}{a.title}
                  </span>
                  <span className="text-muted" style={{ fontSize: 11.5 }}>{a.detail}</span>
                </span>
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
