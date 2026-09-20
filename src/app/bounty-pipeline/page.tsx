import { redirect } from 'next/navigation';
import { getSessionEmail } from '@/lib/auth/session';
import { getBountyCases, getBountyStats } from '@/features/bounty-pipeline/queries';
import { BountyBoard } from '@/features/bounty-pipeline/components/BountyBoard';
import { Shell } from '@/components/Shell';

function fmt(n: number, ccy = 'INR') {
  return (ccy === 'INR' ? '₹' : ccy + ' ') + Math.round(n).toLocaleString('en-IN');
}

export default async function BountyPipelinePage() {
  const email = await getSessionEmail();
  if (!email) redirect('/login');

  const [cases, stats] = await Promise.all([getBountyCases(email), getBountyStats(email)]);

  return (
    <Shell active="bounty-pipeline" title="Bug Bounty Pipeline" crumb="Personal">
      <p className="text-muted" style={{ marginTop: -8, marginBottom: 20, maxWidth: 520 }}>
        A different shape than client work — no invoice, and the payout stays a guess
        until a program confirms it.
      </p>

      <div className="stats" style={{ marginBottom: 20 }}>
        <div className="stat"><div className="lbl">Open submissions</div><div className="val">{stats.open}</div></div>
        <div className="stat"><div className="lbl">Accepted this year</div><div className="val">{stats.acceptedThisYear}</div></div>
        <div className="stat"><div className="lbl">Paid out YTD</div><div className="val pos">{fmt(stats.paidYtd, stats.currency)}</div></div>
        <div className="stat"><div className="lbl">Pending payout (est.)</div><div className="val">{fmt(stats.pendingPayoutEstimate, stats.currency)}</div></div>
      </div>

      <BountyBoard cases={cases} />

      <p className="text-muted" style={{ fontSize: 12, marginTop: 20, maxWidth: 700, lineHeight: 1.6 }}>
        Payout figures change meaning as a card moves right. &ldquo;Submitted&rdquo; and
        &ldquo;Triaged&rdquo; show your own estimate; &ldquo;Accepted&rdquo; shows what the program
        actually confirmed; &ldquo;Paid&rdquo; is the real number, and — like a Reward Vault
        purchase — it auto-posts as income in Daily Finance under &ldquo;Bug bounty&rdquo;.
      </p>
    </Shell>
  );
}
