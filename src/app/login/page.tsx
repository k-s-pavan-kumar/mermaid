import { todayIso } from '@/lib/tz/today';

const LINES = [
  'Pick one thing. The rest can wait.',
  'Half a focus block still counts.',
  'Finished beats perfect. Started beats finished.',
  'A project you shelved on purpose is not a failure.',
];

/**
 * Split login screen: the mascot and the app's actual premise on one side,
 * the form on the other. The rotating line is chosen by date rather than at
 * random so it doesn't flicker between renders.
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const today = todayIso();
  const line = LINES[Number(today.slice(-2)) % LINES.length]!;

  return (
    <div className="login">
      <aside className="login-art">
        <div className="login-brand">
          <img src="/mascot/meri-sm.png" alt="" width={44} height={44} />
          <div>
            <div className="ws-name" style={{ fontSize: 20 }}>Meridian</div>
            <div className="ws-sub">Studio workspace</div>
          </div>
        </div>

        <img className="login-hero" src="/mascot/meri.png" alt="Meri, the Meridian mascot" width={260} height={260} />

        <p className="login-line">{line}</p>

        <ul className="login-points">
          <li><b>One board</b> for client work, side projects, teaching and writing</li>
          <li><b>Invoices and quotations</b> with PDF export built in</li>
          <li><b>Meri</b> can summarise your day or write the whole handover doc</li>
        </ul>
      </aside>

      <main className="login-form-side">
        <div className="login-card">
          <h1 className="login-title">Welcome back</h1>
          <p className="text-muted text-sm" style={{ marginTop: -6 }}>Sign in to pick up where you left off.</p>

          {error && <p className="login-error">Wrong email or password.</p>}

          <form method="POST" action="/api/auth/login" className="form-grid" style={{ maxWidth: '100%', marginTop: 14 }}>
            <div>
              <label className="field-label" htmlFor="email">Email</label>
              <input id="email" name="email" type="email" placeholder="you@example.com" required style={{ width: '100%' }} autoFocus />
            </div>
            <div>
              <label className="field-label" htmlFor="password">Password</label>
              <input id="password" name="password" type="password" placeholder="••••••••" required style={{ width: '100%' }} />
            </div>
            <button type="submit" className="btn">Sign in</button>
          </form>

        </div>
      </main>
    </div>
  );
}
