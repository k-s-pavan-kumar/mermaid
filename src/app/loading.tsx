import { Sidebar } from '@/components/Sidebar';
import { ActiveNavFix } from '@/components/ActiveNavFix';

// Shown the instant a page starts rendering on the server (and while a
// client-side navigation is in flight) so the screen is never blank or
// frozen. Same chrome as Shell, with placeholder content.
export default function Loading() {
  return (
    <div className="os" aria-busy="true" aria-label="Loading page">
      <ActiveNavFix />
      <Sidebar />
      <div className="main">
        <div className="topbar">
          <div className="topbar-lead">
            <div>
              <div className="sk sk-line" style={{ width: 70, height: 10, marginBottom: 8 }} />
              <div className="sk sk-line" style={{ width: 190, height: 24 }} />
            </div>
          </div>
        </div>
        <div className="content">
          <div className="sk-row">
            <div className="sk sk-card" style={{ height: 78 }} />
            <div className="sk sk-card" style={{ height: 78 }} />
            <div className="sk sk-card" style={{ height: 78 }} />
          </div>
          <div className="sk sk-card" style={{ height: 150, marginBottom: 12 }} />
          <div className="sk sk-card" style={{ height: 150, marginBottom: 12 }} />
          <div className="sk sk-card" style={{ height: 110 }} />
        </div>
      </div>
    </div>
  );
}
