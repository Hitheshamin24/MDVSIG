// ProcessingStatus.jsx — Horizontal stepper pipeline UI
import { useState, useEffect, useRef } from 'react';

const STEP_DEFS = [
  { key: 'upload',    label: 'Upload',      sub: 'Videos received',       icon: '↑' },
  { key: 'normalize', label: 'Normalise',   sub: '30 FPS · H.264',        icon: '⚙' },
  { key: 'audio',     label: 'Audio Sync',  sub: 'Cross-correlation',     icon: '♪' },
  { key: 'pose',      label: 'Pose Extract',sub: 'YOLOv8n keypoints',     icon: '⬡' },
  { key: 'compare',   label: 'Compare',     sub: 'Frame scoring',         icon: '≋' },
  { key: 'output',    label: 'Output',      sub: 'Merging video',         icon: '▶' },
  { key: 'done',      label: 'Complete',    sub: 'Results ready',         icon: '✓' },
];

function resolveStepKey(backendStep) {
  const map = {
    normalise: 'normalize', normalize: 'normalize',
    audio: 'audio', audio_sync: 'audio', sync: 'audio',
    pose: 'pose', extract_v1: 'pose', extract_v2: 'pose', landmarks: 'pose',
    scoring: 'compare', compare: 'compare', comparison: 'compare',
    merge: 'output', output: 'output', video: 'output', render: 'output',
    feedback: 'output',
    done: 'done', complete: 'done',
  };
  return map[backendStep?.toLowerCase()] || null;
}

export default function ProcessingStatus({ jobId, onComplete, onError }) {
  const [steps, setSteps] = useState(
    STEP_DEFS.map(s => ({ ...s, state: 'pending', message: '', percent: 0 }))
  );
  const [overallPct, setOverallPct] = useState(0);
  const [currentMsg, setCurrentMsg] = useState('Starting pipeline…');
  const esRef = useRef(null);

  useEffect(() => {
    if (!jobId) return;

    // Upload is already done when we get here
    setSteps(prev => prev.map(s => s.key === 'upload' ? { ...s, state: 'done', percent: 100 } : s));
    setOverallPct(8);

    const es = new EventSource(`/api/progress/${jobId}`);
    esRef.current = es;

    es.onmessage = (evt) => {
      let data;
      try { data = JSON.parse(evt.data); } catch { return; }

      const { step, percent, message } = data;

      if (step === 'error') {
        es.close();
        onError(message || 'Processing failed');
        return;
      }

      if (message) setCurrentMsg(message);
      if (typeof percent === 'number') setOverallPct(Math.min(100, percent));

      const key = resolveStepKey(step);
      if (!key) return;

      setSteps(prev => {
        const next = [...prev];
        let hitCurrent = false;
        for (let i = 0; i < next.length; i++) {
          if (next[i].key === key) {
            next[i] = {
              ...next[i],
              state: percent >= 100 ? 'done' : 'active',
              message: message || '',
              percent: percent || 0,
            };
            hitCurrent = true;
          } else if (!hitCurrent && next[i].state !== 'done') {
            next[i] = { ...next[i], state: 'done' };
          }
        }
        return next;
      });

      if (step === 'done' || step === 'complete') {
        setOverallPct(100);
        es.close();
        setTimeout(onComplete, 800);
      }
    };

    es.onerror = () => {
      es.close();
      pollResults();
    };

    return () => es.close();
  }, [jobId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function pollResults() {
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 3000));
      try {
        const res = await fetch(`/api/results/${jobId}`);
        if (res.status === 202) continue;
        if (res.ok) { onComplete(); return; }
        const d = await res.json();
        if (d.status === 'error') { onError(d.error || 'Error'); return; }
      } catch { /* ignore */ }
    }
    onError('Timeout — please try again.');
  }

  const doneCount  = steps.filter(s => s.state === 'done').length;
  const activeStep = steps.find(s => s.state === 'active');

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '60px 40px',
      minHeight: '60vh',
    }}>
      {/* Card */}
      <div style={{
        width: '100%',
        maxWidth: 900,
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-xl)',
        padding: '44px 48px',
        animation: 'fade-up 0.4s ease both',
      }}>

        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 40 }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            border: '3px solid var(--border-strong)',
            borderTopColor: 'var(--green)',
            animation: 'ss-spin 0.9s linear infinite',
            flexShrink: 0,
          }} />
          <div>
            <h2 style={{
              fontFamily: 'var(--font-heading)',
              fontSize: '1.3rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
              color: 'var(--text-primary)',
              marginBottom: 4,
            }}>
              Processing
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {currentMsg}
            </p>
          </div>

          {/* Step count badge */}
          <div style={{
            marginLeft: 'auto',
            padding: '6px 16px',
            borderRadius: 100,
            background: 'rgba(163,230,53,0.08)',
            border: '1px solid rgba(163,230,53,0.2)',
            fontSize: '0.8rem',
            fontWeight: 700,
            color: 'var(--green)',
            whiteSpace: 'nowrap',
          }}>
            {doneCount} / {steps.length} steps
          </div>
        </div>

        {/* ── Horizontal Stepper ───────────────────────────────────────────────── */}
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: 36,
          position: 'relative',
        }}>
          {steps.map((s, i) => {
            const isDone   = s.state === 'done';
            const isActive = s.state === 'active';
            const isPending = s.state === 'pending';

            const dotBg    = isDone   ? 'rgba(163,230,53,0.15)'
                           : isActive ? 'rgba(163,230,53,0.1)'
                           : 'rgba(255,255,255,0.03)';
            const dotBorder = isDone   ? '2px solid var(--green)'
                            : isActive ? '2px solid rgba(163,230,53,0.6)'
                            : '2px solid var(--border-strong)';
            const iconColor = isDone   ? 'var(--green)'
                            : isActive ? '#d4f47a'
                            : 'var(--text-muted)';

            return (
              <div key={s.key} style={{ display: 'flex', alignItems: 'flex-start', flex: 1 }}>
                {/* Step */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                  {/* Circle */}
                  <div style={{
                    width: 48, height: 48,
                    borderRadius: '50%',
                    background: dotBg,
                    border: dotBorder,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: isDone ? '1rem' : '1.1rem',
                    color: iconColor,
                    fontWeight: 700,
                    marginBottom: 10,
                    transition: 'all 0.3s ease',
                    boxShadow: isActive ? '0 0 0 4px rgba(163,230,53,0.12)' : 'none',
                    animation: isActive ? 'pulse-dot 1.6s ease-in-out infinite' : 'none',
                    flexShrink: 0,
                  }}>
                    {isDone ? '✓' : s.icon}
                  </div>

                  {/* Label */}
                  <div style={{ textAlign: 'center' }}>
                    <div style={{
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      color: isDone ? 'var(--green)'
                           : isActive ? 'var(--text-primary)'
                           : 'var(--text-muted)',
                      marginBottom: 3,
                      transition: 'color 0.3s ease',
                    }}>
                      {s.label}
                    </div>
                    <div style={{
                      fontSize: '0.68rem',
                      color: isActive ? 'rgba(163,230,53,0.7)' : 'var(--text-muted)',
                      opacity: isPending ? 0.5 : 1,
                    }}>
                      {isActive && s.percent > 0
                        ? `${Math.round(s.percent)}%`
                        : s.sub}
                    </div>
                  </div>
                </div>

                {/* Connector line (not after last step) */}
                {i < steps.length - 1 && (
                  <div style={{
                    flex: 0,
                    width: '100%',
                    marginTop: 23,
                    height: 2,
                    background: isDone
                      ? 'linear-gradient(90deg, var(--green), rgba(163,230,53,0.4))'
                      : 'var(--border)',
                    transition: 'background 0.5s ease',
                    minWidth: 20,
                    maxWidth: 60,
                  }} />
                )}
              </div>
            );
          })}
        </div>

        {/* ── Overall Progress Bar ─────────────────────────────────────────────── */}
        <div>
          <div style={{
            width: '100%', height: 6,
            borderRadius: 3,
            background: 'var(--border)',
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              borderRadius: 3,
              background: 'linear-gradient(90deg, #6ec421, var(--green))',
              width: `${overallPct}%`,
              transition: 'width 0.6s ease',
              position: 'relative',
              boxShadow: '0 0 10px rgba(163,230,53,0.4)',
            }}>
              {/* shimmer */}
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
                animation: 'shimmer 1.8s ease-in-out infinite',
              }} />
            </div>
          </div>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            marginTop: 8, fontSize: '0.75rem', color: 'var(--text-muted)',
          }}>
            <span>
              {activeStep
                ? `${activeStep.label}${activeStep.message ? ` — ${activeStep.message}` : ''}`
                : doneCount === steps.length ? 'All done!' : 'Queued…'
              }
            </span>
            <span style={{ fontWeight: 700, color: overallPct > 0 ? 'var(--green)' : 'var(--text-muted)' }}>
              {Math.round(overallPct)}%
            </span>
          </div>
        </div>

      </div>
    </div>
  );
}
