export default function NotFound() {
  return (
    <div style={{ maxWidth: 520, margin: '12vh auto', padding: '0 20px' }}>
      <div className="card">
        <h3 style={{ fontSize: 18 }}>Not found</h3>
        <p className="text-muted" style={{ fontSize: 14 }}>That page doesn&apos;t exist, or it isn&apos;t yours.</p>
        <a className="btn" href="/today" style={{ textDecoration: 'none', display: 'inline-block' }}>Go to Today</a>
      </div>
    </div>
  );
}
