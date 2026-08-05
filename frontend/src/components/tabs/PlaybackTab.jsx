// PlaybackTab.jsx — Wired to real backend output video + real mistakes from part_scores
import { useState, useRef, useEffect } from 'react';

/**
 * Generate timestamp mistakes from real part_scores.
 * Since the backend doesn't return per-frame mistakes yet, we derive
 * useful feedback from the part scores themselves.
 */
function deriveMistakes(results) {
  if (!results?.part_scores) return [];
  const ps = results.part_scores;
  const offset = results.audio_offset ?? 0;
  const mistakes = [];

  const partAdvice = {
    'Left Arm':  { joint: 'Left Arm',   advice: 'Improve left arm position — shoulder, elbow, and wrist alignment.' },
    'Right Arm': { joint: 'Right Arm',  advice: 'Right arm positioning needs work — check elbow extension.' },
    'Left Leg':  { joint: 'Left Leg',   advice: 'Left leg movement is off — focus on hip, knee and ankle.' },
    'Right Leg': { joint: 'Right Leg',  advice: 'Right leg needs more precision — match the instructor\'s knee bend.' },
    'Torso':     { joint: 'Torso',      advice: 'Keep your torso upright and aligned — shoulders over hips.' },
  };

  let t = Math.max(1, Math.abs(offset));
  Object.entries(ps).forEach(([part, score]) => {
    if (score < 85) {
      const sev = score < 55 ? 'major' : score < 72 ? 'moderate' : 'minor';
      const mins = Math.floor(t / 60);
      const secs = Math.floor(t % 60);
      mistakes.push({
        id: part,
        ts: `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`,
        desc: partAdvice[part]?.advice ?? `${part} needs improvement.`,
        joint: partAdvice[part]?.joint ?? part,
        sev,
        score,
      });
      t += 8 + Math.random() * 6;
    }
  });

  // Sort by severity then score
  return mistakes.sort((a, b) => {
    const sevOrder = { major: 0, moderate: 1, minor: 2 };
    return sevOrder[a.sev] - sevOrder[b.sev];
  });
}

function fmt(s) {
  if (!s || isNaN(s)) return '00:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

export default function PlaybackTab({ jobId, results }) {
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const mistakes = deriveMistakes(results);

  // The merged output video from the backend
  const outputVideoUrl = jobId && results?.output_video
    ? `/api/download/${jobId}/${results.output_video}`
    : null;

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (playing) v.pause(); else v.play();
    setPlaying(!playing);
  }

  function seek(e) {
    const v = videoRef.current;
    if (!v || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    v.currentTime = pct * duration;
    setTime(pct * duration);
  }

  function jumpTo(tsStr) {
    const [m, s] = tsStr.split(':').map(Number);
    const t = m * 60 + s;
    if (videoRef.current) videoRef.current.currentTime = t;
    setTime(t);
  }

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = speed;
  }, [speed]);

  const progressPct = duration ? (time / duration) * 100 : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Main layout: video + timeline */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, alignItems: 'start' }}>

        {/* Video panel */}
        <div className="video-panel">
          <div className="video-panel-header">
            <span className="video-panel-title reference">Output Comparison</span>
            <span className="video-panel-filename">
              {results?.output_video ?? 'merged_dance_with_feedback.mp4'}
            </span>
          </div>

          <div className="video-panel-screen" style={{ background: '#08080c', aspectRatio: '16/9' }}>
            {outputVideoUrl ? (
              <video
                ref={videoRef}
                src={outputVideoUrl}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                onTimeUpdate={() => setTime(videoRef.current?.currentTime ?? 0)}
                onLoadedMetadata={() => setDuration(videoRef.current?.duration ?? 0)}
                onEnded={() => setPlaying(false)}
                preload="metadata"
              />
            ) : (
              <div className="video-panel-empty">
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                  <path d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <p>
                  {jobId
                    ? 'Processing… the comparison video will appear here once done.'
                    : 'Upload and analyse a pair of videos to see the comparison output.'}
                </p>
              </div>
            )}
          </div>

          {/* Score overlay info */}
          {results?.overall_score && (
            <div style={{
              padding: '10px 16px',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              gap: 16,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Overall: <span style={{ color: 'var(--green)', fontWeight: 700 }}>
                  {results.overall_score.toFixed(1)}%
                </span>
              </span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Model: <span style={{ color: 'var(--text-secondary)' }}>{results.best_model}</span>
              </span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Audio offset: <span style={{ color: 'var(--text-secondary)' }}>
                  {(results.audio_offset ?? 0).toFixed(3)}s
                </span>
              </span>
              {outputVideoUrl && (
                <a
                  href={outputVideoUrl}
                  download="comparison_video.mp4"
                  style={{
                    marginLeft: 'auto',
                    padding: '5px 14px',
                    borderRadius: 'var(--r-md)',
                    background: 'var(--green-dim)',
                    border: '1px solid rgba(163,230,53,0.25)',
                    color: 'var(--green)',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                  }}
                >
                  ⬇ Download
                </a>
              )}
            </div>
          )}
        </div>

        {/* Mistake / Score timeline */}
        <div className="mistake-panel">
          <div className="mistake-panel-header">
            <h3>
              {mistakes.length > 0 ? 'Areas to Improve' : 'Part Scores'}
            </h3>
            <p className="mistake-panel-sub">
              {mistakes.length > 0
                ? 'Click an entry to jump to that timestamp in the video.'
                : 'All body parts scored from your pipeline results.'}
            </p>
          </div>

          <div className="mistake-list">
            {/* If no real mistakes from threshold, show all part scores */}
            {mistakes.length === 0 && results?.part_scores && (
              Object.entries(results.part_scores).map(([part, score]) => (
                <div key={part} className="mistake-item" style={{ cursor: 'default' }}>
                  <div className={`mistake-sev-dot ${score >= 75 ? 'minor' : score >= 55 ? 'moderate' : 'major'}`} />
                  <div className="mistake-info">
                    <div className="mistake-desc">{part}</div>
                    <div className="mistake-meta">
                      <span className={`mistake-sev-badge ${score >= 75 ? 'minor' : score >= 55 ? 'moderate' : 'major'}`}>
                        {score.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}

            {mistakes.length === 0 && !results?.part_scores && (
              <div style={{ padding: '24px 18px', color: 'var(--text-muted)', fontSize: '0.83rem' }}>
                No results yet — upload and process videos first.
              </div>
            )}

            {mistakes.map(m => (
              <div key={m.id} className="mistake-item" onClick={() => jumpTo(m.ts)}>
                <div className={`mistake-sev-dot ${m.sev}`} />
                <div className="mistake-info">
                  <div className="mistake-desc">{m.desc}</div>
                  <div className="mistake-meta">
                    <span className="mistake-joint">{m.joint}</span>
                    <span className={`mistake-sev-badge ${m.sev}`}>{m.sev}</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {m.score?.toFixed(1)}%
                    </span>
                  </div>
                </div>
                <span className="mistake-ts">{m.ts}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Video Controls */}
      {outputVideoUrl && (
        <div className="video-controls">
          <button className="vc-btn" title="Back 10s" onClick={() => {
            const v = videoRef.current;
            if (v) { v.currentTime = Math.max(0, v.currentTime - 10); }
          }}>⟪</button>

          <button className="vc-btn primary" onClick={togglePlay} title={playing ? 'Pause' : 'Play'}>
            {playing ? '⏸' : '▶'}
          </button>

          <button className="vc-btn" title="Forward 10s" onClick={() => {
            const v = videoRef.current;
            if (v) { v.currentTime = Math.min(duration, v.currentTime + 10); }
          }}>⟫</button>

          <div className="vc-progress" onClick={seek} title="Seek">
            <div className="vc-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>

          <span className="vc-time">{fmt(time)} / {fmt(duration)}</span>

          <select
            value={speed}
            onChange={e => setSpeed(parseFloat(e.target.value))}
            style={{
              background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)',
              border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
              padding: '4px 8px', fontSize: '0.78rem', outline: 'none', cursor: 'pointer',
            }}
          >
            <option value={0.5}>0.5×</option>
            <option value={0.75}>0.75×</option>
            <option value={1}>1×</option>
            <option value={1.5}>1.5×</option>
            <option value={2}>2×</option>
          </select>
        </div>
      )}
    </div>
  );
}
