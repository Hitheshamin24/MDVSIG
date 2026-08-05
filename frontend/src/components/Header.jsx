// Header.jsx — StepSync sticky navigation bar
import { useNavigate, useLocation } from 'react-router-dom';

function WaveformIcon() {
  return (
    <svg viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M1 9h2.5l2-5 2.5 10 2-8 1.5 6 1.5-3H17"
        stroke="#a3e635"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const path = location.pathname;

  return (
    <header className="ss-header">
      <div className="ss-logo" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
        <div className="ss-logo-icon">
          <WaveformIcon />
        </div>
        <span className="ss-logo-text">STEP<span>SYNC</span></span>
      </div>

      <nav className="ss-nav">
        <button
          className={`ss-nav-link ${path === '/' ? 'active' : ''}`}
          onClick={() => navigate('/')}
        >
          Studio
        </button>
        <button
          className={`ss-nav-link ${path === '/compare' ? 'active' : ''}`}
          onClick={() => navigate('/compare')}
        >
          Compare
        </button>
        <button
          className={`ss-nav-link ${path === '/auth' ? 'active' : ''}`}
          onClick={() => navigate('/auth')}
        >
          Sign in
        </button>
      </nav>
    </header>
  );
}
