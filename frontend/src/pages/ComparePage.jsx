import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ScoreRing       from '../components/ui/ScoreRing';
import PlaybackTab     from '../components/tabs/PlaybackTab';
import ScoresTab       from '../components/tabs/ScoresTab';
import FeedbackTab     from '../components/tabs/FeedbackTab';
import AnalyticsTab    from '../components/tabs/AnalyticsTab';
import ProcessingStatus from '../components/ProcessingStatus';
import {
  getLocalStorageHistory,
  saveOutputToLocalStorage,
  removeOutputFromLocalStorage,
} from '../utils/storage';

const TABS = ['Playback', 'Scores', 'Feedback', 'Analytics'];

const DEMO_RESULTS = {
  status: 'complete',
  best_model: 'YOLOv8n-Pose',
  audio_offset: -0.201,
  overall_score: 58.3,
  part_scores: {
    'Left Arm': 42.1,
    'Right Arm': 41.4,
    'Left Leg': 65.0,
    'Right Leg': 65.0,
    'Torso': 77.9,
  },
  output_video: 'merged_dance_with_feedback.mp4',
  chart_image: 'model_comparison_chart.png',
  video1_frames: 1629,
  video2_frames: 1690,
  demo_job_id: '03c9d085',
};

export default function ComparePage({ jobId, processing, onProcessComplete, onProcessError, onReset }) {
  const [activeTab,      setActiveTab]      = useState('Playback');
  const [selectedJobId,  setSelectedJobId]  = useState(jobId);
  const [results,        setResults]        = useState(null);
  const [history,        setHistory]        = useState([]);
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState('');
  const navigate = useNavigate();

  // Keep selectedJobId in sync with incoming prop
  useEffect(() => {
    if (jobId) setSelectedJobId(jobId);
  }, [jobId]);

  // Fetch and merge list of saved recent comparisons (LocalStorage + Backend)
  const fetchHistory = () => {
    fetch('/api/history')
      .then(r => r.ok ? r.json() : [])
      .then(serverData => {
        const localData = getLocalStorageHistory();
        const map = new Map();
        localData.forEach(item => map.set(item.job_id, item));
        if (Array.isArray(serverData)) {
          serverData.forEach(item => {
            if (!map.has(item.job_id)) {
              map.set(item.job_id, item);
            }
          });
        }
        const combined = Array.from(map.values()).sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
        setHistory(combined);
      })
      .catch(() => {
        setHistory(getLocalStorageHistory());
      });
  };

  useEffect(() => {
    fetchHistory();
  }, [processing, selectedJobId]);

  // Fetch results for currently selected job
  useEffect(() => {
    const targetId = selectedJobId || jobId;

    // Check if we have this result cached in LocalStorage first for instant loading
    const localMatches = getLocalStorageHistory().filter(item => item.job_id === targetId);
    if (localMatches.length > 0 && localMatches[0].fullResult) {
      setResults(localMatches[0].fullResult);
    }

    if (!processing && targetId) {
      setLoading(true);
      setError('');
      fetch(`/api/results/${targetId}`)
        .then(r => {
          if (!r.ok) throw new Error(`Server error ${r.status}`);
          return r.json();
        })
        .then(d => {
          if (d.status === 'error') throw new Error(d.error || 'Pipeline error');
          setResults(d);
          saveOutputToLocalStorage(targetId, d);
          setLoading(false);
          fetchHistory();
        })
        .catch(err => {
          setError(String(err.message));
          setLoading(false);
        });
    }
  }, [processing, selectedJobId, jobId]);

  function handleNewComparison() {
    onReset();
    setSelectedJobId(null);
    navigate('/');
  }

  function handleDeleteJob(e, targetJobId) {
    e.stopPropagation();
    removeOutputFromLocalStorage(targetJobId);
    fetch(`/api/history/${targetJobId}`, { method: 'DELETE' }).catch(() => {});
    if (selectedJobId === targetJobId || jobId === targetJobId) {
      setSelectedJobId(null);
      if (onReset) onReset();
    }
    setHistory(prev => prev.filter(item => item.job_id !== targetJobId));
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
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Loading comparison video…</p>
        </div>
      </div>
    );
  }

  /* ── Results (or demo) ──────────────────────────────────────────────────────── */
  const activeJobId = selectedJobId || jobId;
  const isDemoMode = !activeJobId;
  const activeResults = results || DEMO_RESULTS;
  const score = activeResults?.overall_score ?? 0;

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
          padding: '48px 40px 24px', maxWidth: 1520, margin: '0 auto', gap: 24,
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
                ? <>Showing demo comparison output ·{' '}
                    <span style={{ color: 'var(--green)', cursor: 'pointer' }} onClick={() => navigate('/')}>
                      Upload your own videos
                    </span>
                  </>
                : <>Viewing Job <code style={{ fontSize: '0.85em', color: 'var(--green)' }}>{activeJobId}</code> ·{' '}
                    <span style={{ color: 'var(--green)', cursor: 'pointer' }} onClick={handleNewComparison}>
                      + Upload new comparison
                    </span>
                  </>
              }
            </p>
          </div>

          {/* Score ring */}
          <div style={{ flexShrink: 0 }}>
            <ScoreRing score={score} size={140} />
          </div>
        </div>

        {/* Saved Recent Comparisons row */}
        {history.length > 0 && (
          <div style={{
            maxWidth: 1520, margin: '0 auto 24px', padding: '0 40px',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 12,
            }}>
              <span style={{
                fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: 'var(--text-muted)',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
                Saved Recent Videos ({history.length})
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Click any saved video below to reload it
              </span>
            </div>

            <div style={{
              display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8,
              scrollbarWidth: 'thin',
            }}>
              {history.map(item => {
                const isActive = (activeJobId === item.job_id);
                const matchColor = item.overall_score >= 75 ? 'var(--green)' : item.overall_score >= 55 ? 'var(--yellow)' : 'var(--orange)';
                return (
                  <div
                    key={item.job_id}
                    onClick={() => setSelectedJobId(item.job_id)}
                    style={{
                      flexShrink: 0,
                      padding: '12px 18px',
                      borderRadius: 'var(--r-md)',
                      background: isActive ? 'rgba(163,230,53,0.12)' : 'var(--bg-card)',
                      border: isActive ? '1px solid var(--green)' : '1px solid var(--border)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      display: 'flex', flexDirection: 'column', gap: 4, minWidth: 170,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: isActive ? 'var(--green)' : 'var(--text-primary)' }}>
                        Job #{item.job_id}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 800, color: matchColor }}>
                          {item.overall_score.toFixed(1)}%
                        </span>
                        <button
                          onClick={(e) => handleDeleteJob(e, item.job_id)}
                          title="Delete saved video"
                          style={{
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            color: 'var(--text-muted)',
                            fontSize: '0.7rem',
                            width: 20,
                            height: 20,
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = '#ffffff';
                            e.currentTarget.style.background = '#ef4444';
                            e.currentTarget.style.borderColor = '#ef4444';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = 'var(--text-muted)';
                            e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      <span>{item.best_model}</span>
                      <span>{item.date_str}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tabs bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 2,
          padding: '0 40px', borderBottom: '1px solid var(--border)',
          maxWidth: 1520, margin: '0 auto',
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
        <div style={{ padding: '32px 40px 60px', maxWidth: 1520, margin: '0 auto' }}>
          {activeTab === 'Playback'  && <PlaybackTab  jobId={activeJobId}  results={activeResults} />}
          {activeTab === 'Scores'    && <ScoresTab    results={activeResults} />}
          {activeTab === 'Feedback'  && <FeedbackTab  results={activeResults} />}
          {activeTab === 'Analytics' && <AnalyticsTab results={activeResults} />}
        </div>
      </div>
    </div>
  );
}
