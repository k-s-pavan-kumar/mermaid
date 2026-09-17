import { getSessionEmail } from '@/lib/auth/session';

const LINKS = [
  { href: '/today', label: 'Today' },
  { href: '/projects', label: 'Projects' },
  { href: '/clients', label: 'Clients' },
  { href: '/notes', label: 'Notes' },
];

export async function AppNav() {
  const email = await getSessionEmail();
  if (!email) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 28px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        flexWrap: 'wrap',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              background: 'var(--pine)',
              display: 'inline-block',
            }}
          />
          Meridian
        </span>
        {LINKS.map((l) => (
          <a key={l.href} href={l.href} style={{ textDecoration: 'none', fontSize: 13.5, color: 'var(--ink)' }}>
            {l.label}
          </a>
        ))}
      </div>
      <form method="POST" action="/api/auth/logout">
        <button
          type="submit"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--muted)',
            fontSize: 12,
            padding: 0,
            cursor: 'pointer',
          }}
        >
          Log out ({email})
        </button>
      </form>
    </div>
  );
}
