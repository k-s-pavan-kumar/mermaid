import { redirect } from 'next/navigation';
import { getSessionEmail } from '@/lib/auth/session';
import { Shell } from '@/components/Shell';
import { SubmitButton } from '@/components/SubmitButton';
import { getProjects } from '@/features/projects/queries';
import { getProducts } from '@/features/products/queries';
import { createProduct } from '@/features/products/actions';
import { LANES, productProgress, roleInfo, type Product } from '@/features/products/types';

export default async function ProductsPage() {
  const email = await getSessionEmail();
  if (!email) redirect('/login');

  let products: Product[] = [];
  let missing = false;
  try { products = await getProducts(email); } catch { missing = true; }
  const projects = missing ? [] : await getProjects();

  return (
    <Shell active="products" title="Products" crumb="Workspace">
      {missing && (
        <div className="card" style={{ marginBottom: 14, borderColor: 'var(--crimson)' }}>
          The products table isn&apos;t in your database yet. Run <code>supabase/APPLY_PENDING.sql</code> in the Supabase SQL editor, then reload.
        </div>
      )}
      <p className="text-muted" style={{ marginTop: 0, fontSize: 13, maxWidth: 680 }}>
        One product is one idea shipped as a family — the SaaS, an app, a book, a game and the marketing around it. Each piece is a normal project; here they sit together in four lanes: <strong>Tech</strong>, <strong>Education</strong>, <strong>Fun to learn</strong> and <strong>Marketing</strong>.
      </p>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3>New product</h3>
        <form action={createProduct} className="form-grid" style={{ maxWidth: '100%' }}>
          <input name="name" placeholder="e.g. Inside Students Mind" required maxLength={100} style={{ width: '100%' }} />
          <input name="description" placeholder="What it is, in a line (optional)" style={{ width: '100%' }} />
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" name="create_all" defaultChecked />
            Create the whole set now — SaaS, App, Book, Game and Marketing projects
          </label>
          <div><SubmitButton className="btn-inline" pendingLabel="Creating…">Create product</SubmitButton></div>
        </form>
      </div>

      {!missing && products.length === 0 && (
        <div className="card"><div className="empty"><div className="big">No products yet</div>Create your first one above.</div></div>
      )}

      {products.map((p) => {
        const pieces = projects.filter((x) => x.product_id === p.id);
        const pct = productProgress(pieces.map((x) => x.status));
        return (
          <a key={p.id} href={`/products/${p.id}`} className="card" style={{ display: 'block', marginBottom: 12, textDecoration: 'none', color: 'inherit' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontFamily: "'Fraunces',serif", fontSize: 17 }}>{p.name}</div>
                {p.description && <div className="text-muted" style={{ fontSize: 12.5, marginTop: 2 }}>{p.description}</div>}
              </div>
              <div className="text-muted" style={{ fontSize: 12.5, alignSelf: 'center' }}>{pieces.length} piece{pieces.length === 1 ? '' : 's'} · {pct}% done</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              {LANES.map((l) => {
                const n = pieces.filter((x) => l.roles.includes(x.product_role as never)).length;
                return <span key={l.lane} className={`tag ${n ? 'ontrack' : 'idea'}`}>{l.label} {n}</span>;
              })}
            </div>
            <div className="goal-bar" style={{ marginTop: 10 }}><span style={{ width: `${pct}%` }} /></div>
            <span hidden>{pieces.map((x) => roleInfo(x.product_role)?.label).join(',')}</span>
          </a>
        );
      })}
    </Shell>
  );
}
