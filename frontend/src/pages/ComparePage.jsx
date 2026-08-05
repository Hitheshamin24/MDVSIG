// ComparePage.jsx — Results page with 4 tabs, all wired to real backend data
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ScoreRing       from '../components/ui/ScoreRing';
import PlaybackTab     from '../components/tabs/PlaybackTab';
import ScoresTab       from '../components/tabs/ScoresTab';
import FeedbackTab     from '../components/tabs/FeedbackTab';
import AnalyticsTab    from '../components/tabs/AnalyticsTab';
import ProcessingStatus from '../components/ProcessingStatus';

const TABS = ['Playback', 'Scores', 'Feedback', 'Analytics'];

export default function ComparePage({ jobId, processing, onProcessComplete, onProcessError, onReset }) {
  const [activeTab, setActiveTab] = useState('Playback');
  const [results,   setResults]   = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const navigate = useNavigate();

  // Fetch results once processing is done
  useEffect(() => {
    if (!processing && jobId) {
      setLoading(true);
      setError('');
      fetch(`/api/results/${jobId}`)
        .then(r => {
          if (!r.ok) throw new Error(`Server error ${r.status}`);
          return r.json();
        })
        .then(d => {
          if (d.status === 'error') throw new Error(d.error || 'Pipeline error');
          setResults(d);
          setLoading(false);
        })
        .catch(err => {
          setError(String(err.message));
          setLoading(false);
        });
    }
  }, [processing, jobId]);

  function handleNewComparison() {
    onReset();
    navigate('/');
  }

  /* ── Processing state ─────────────────────────────────────────────────────── */
  if (processing && jobId) {
    return (
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: 'var(--bg-base)' }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, width: '40%', height: '300px',
          background: 'radial-gradient(ellipse at 0% 0%, rgba(22,101,52,0.4) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', top: 0, right: 0, width: '40%', height: '300px',
          background: 'radial-gradient(ellipse at 100% 0%, rgba(120,40,15,0.35) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <ProcessingStatus
          jobId={jobId}
          onComplete={onProcessComplete}
          onError={onProcessError}
        />
      </div>
    );
  }

  /* ── Error ─────────────────────────────────────────────────────────────────── */
  if (error) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--r-xl)',
          padding: 40, textAlign: 'center', maxWidth: 440,
        }}>
          <div style={{ fontSize: '2rem', marginBottom: 16 }}>⚠️</div>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', marginBottom: 10 }}>
            Processing Error
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: 24 }}>{error}</p>
          <button className="retry-btn" onClick={handleNewComparison}>↻ Try Again</button>
        </div>
      </div>
    );
  }

  /* ── Loading results spinner ───────────────────────────────────────────────── */
  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div className="ss-spinner" style={{ width: 48, height: 48 }} />
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Loading results…</p>
        </div>
      </div>
    );
  }

  /* ── Results (or demo) ──────────────────────────────────────────────────────── */
  const score   = results?.overall_score ?? 0;
  const isDemoMode = !jobId;

  return (
    <div style={{ flex: 1, background: 'var(--bg-base)', position: 'relative', overflow: 'hidden' }}>
      {/* Hero gradient */}
      <div style={{
        position: 'absolute', top: 0, left: 0, width: '40%', height: '280px',
        background: 'radial-gradient(ellipse at 0% 0%, rgba(22,101,52,0.35) 0%, transparent 70%)',
        pointerEvents: 'none', zIndex: 0,
      }} />
      <div style={{
        position: 'absolute', top: 0, right: 0, width: '40%', height: '280px',
        background: 'radial-gradient(ellipse at 100% 0%, rgba(120,40,15,0.32) 0%, transparent 70%)',
        pointerEvents: 'none', zIndex: 0,
      }} />

      {/* Content */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* Hero row */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          padding: '48px 40px 28px', maxWidth: 1280, margin: '0 auto', gap: 24,
        }}>
          <div>
            <h1 style={{
              fontFamily: 'var(--font-heading)',
              fontSize: 'clamp(1.8rem, 3.5vw, 2.8rem)',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '-0.01em',
              marginBottom: 10,
            }}>
              Comparison Results
            </h1>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {isDemoMode
                ? <>No videos yet — go to the studio to upload a pair. ·{' '}
                    <span style={{ color: 'var(--green)', cursor: 'pointer' }} onClick={() => navigate('/')}>
                      Upload now
                    </span>
                  </>
                : <>Job <code style={{ fontSize: '0.8em', opacity: 0.6 }}>{jobId}</code> ·{' '}
                    <span style={{ color: 'var(--green)', cursor: 'pointer' }} onClick={handleNewComparison}>
                      new comparison
                    </span>
                  </>
              }
            </p>
          </div>

          {/* Score ring — shows real score or 0 */}
          <div style={{ flexShrink: 0 }}>
            <ScoreRing score={score} size={140} />
          </div>
        </div>

        {/* Tabs bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 2,
          padding: '0 40px', borderBottom: '1px solid var(--border)',
          maxWidth: 1280, margin: '0 auto',
        }}>
          {TABS.map(tab => (
            <button
              key={tab}
              id={`tab-${tab.toLowerCase()}`}
              className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ padding: '32px 40px 60px', maxWidth: 1280, margin: '0 auto' }}>
          {activeTab === 'Playback'  && <PlaybackTab  jobId={jobId}  results={results} />}
          {activeTab === 'Scores'    && <ScoresTab    results={results} />}
          {activeTab === 'Feedback'  && <FeedbackTab  results={results} />}
          {activeTab === 'Analytics' && <AnalyticsTab results={results} />}
        </div>
      </div>
    </div>
  );
}
