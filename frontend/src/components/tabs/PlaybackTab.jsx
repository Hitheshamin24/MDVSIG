import { useState, useRef, useEffect } from 'react';
import { saveOutputToLocalStorage } from '../../utils/storage';

/**
 * Generate timestamp mistakes from real part_scores.
 * Since the backend doesn't return per-frame mistakes yet, we derive
 * useful feedback from the part scores themselves.
 */
function deriveMistakes(results, videoDuration = 0) {
  if (!results?.part_scores) return [];
  const ps = results.part_scores;
  const mistakes = [];

  const partAdvice = {
    'Left Arm':  { joint: 'Left Arm',   advice: 'Improve left arm position — shoulder, elbow, and wrist alignment.' },
    'Right Arm': { joint: 'Right Arm',  advice: 'Right arm positioning needs work — check elbow extension.' },
    'Left Leg':  { joint: 'Left Leg',   advice: 'Left leg movement is off — focus on hip, knee and ankle.' },
    'Right Leg': { joint: 'Right Leg',  advice: 'Right leg needs more precision — match the instructor\'s knee bend.' },
    'Torso':     { joint: 'Torso',      advice: 'Keep your torso upright and aligned — shoulders over hips.' },
  };

  // Estimate total video duration in seconds (from metadata or video frames at 30fps)
  const frameBasedDuration = (results.video1_frames && results.video1_frames > 0)
    ? (results.video1_frames / 30)
    : 20;
  const totalDuration = videoDuration > 0 ? videoDuration : frameBasedDuration;

  const needyParts = Object.entries(ps).filter(([_, score]) => score < 85);
  const count = needyParts.length;

  // Distribute timestamps within [startT, endT] (10% to 85% of total video duration)
  const startT = Math.min(2, totalDuration * 0.1);
  const endT   = Math.max(startT + 1, totalDuration * 0.85);

  needyParts.forEach(([part, score], index) => {
    const sev = score < 55 ? 'major' : score < 72 ? 'moderate' : 'minor';
    const tSeconds = count > 1
      ? startT + (index / (count - 1)) * (endT - startT)
      : (startT + endT) / 2;

    const mins = Math.floor(tSeconds / 60);
    const secs = Math.floor(tSeconds % 60);

    mistakes.push({
      id: part,
      ts: `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`,
      tInSeconds: tSeconds,
      desc: partAdvice[part]?.advice ?? `${part} needs improvement.`,
      joint: partAdvice[part]?.joint ?? part,
      sev,
      score,
    });
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
  const [savedToast, setSavedToast] = useState(false);
  const mistakes = deriveMistakes(results, duration);

  // Merged output video — served from Cloudinary (no local /api/download needed)
  const outputVideoUrl = results?.output_video_url || null;

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

  function jumpTo(target) {
    const v = videoRef.current;
    if (!v) return;
    let t = 0;
    if (typeof target === 'number') {
      t = target;
    } else if (typeof target === 'string') {
      const [m, s] = target.split(':').map(Number);
      t = m * 60 + s;
    }
    if (duration > 0 && t >= duration) {
      t = Math.max(0, duration - 1);
    }
    v.currentTime = t;
    v.pause();
    setPlaying(false);
    setTime(t);
  }

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = speed;
  }, [speed]);

  const progressPct = duration ? (time / duration) * 100 : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Top: 100% Full-Width Output Comparison Video Player */}
      <div className="video-panel" style={{ width: '100%' }}>
        <div className="video-panel-header">
          <span className="video-panel-title reference">Output Comparison (Teacher vs Student)</span>
          <span className="video-panel-filename">
            {results?.output_video ?? 'merged_dance_with_feedback.mp4'}
          </span>
        </div>

        <div className="video-panel-screen" style={{ background: '#000', width: '100%', aspectRatio: 'auto', display: 'flex', justifyContent: 'center' }}>
          {outputVideoUrl ? (
            <video
              ref={videoRef}
              src={outputVideoUrl}
              style={{ width: '100%', height: 'auto', maxHeight: '760px', display: 'block', cursor: 'pointer' }}
              onClick={togglePlay}
              onTimeUpdate={() => setTime(videoRef.current?.currentTime ?? 0)}
              onLoadedMetadata={() => setDuration(videoRef.current?.duration ?? 0)}
              onEnded={() => setPlaying(false)}
              preload="metadata"
            />
          ) : (
            <div className="video-panel-empty" style={{ padding: '60px 20px' }}>
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

        {/* Integrated Video Controls Bar */}
        {outputVideoUrl && (
          <div className="video-controls" style={{ borderRadius: 0, borderLeft: 'none', borderRight: 'none', borderBottom: 'none' }}>
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

            <button
              onClick={() => {
                if (effectiveJobId && results) {
                  saveOutputToLocalStorage(effectiveJobId, results);
                  setSavedToast(true);
                  setTimeout(() => setSavedToast(false), 2500);
                }
              }}
              style={{
                marginLeft: 'auto',
                padding: '6px 14px',
                borderRadius: 'var(--r-md)',
                background: savedToast ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.06)',
                border: savedToast ? '1px solid #3b82f6' : '1px solid var(--border)',
                color: savedToast ? '#60a5fa' : 'var(--text-secondary)',
                fontSize: '0.78rem',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              {savedToast ? '💾 Saved to LocalStorage ✓' : '💾 Save Output'}
            </button>

            {outputVideoUrl && (
              <a
                href={outputVideoUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  marginLeft: 10,
                  padding: '6px 14px',
                  borderRadius: 'var(--r-md)',
                  background: 'var(--green-dim)',
                  border: '1px solid rgba(163,230,53,0.25)',
                  color: 'var(--green)',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                ⬇ Download Video
              </a>
            )}
          </div>
        )}
      </div>

      {/* Bottom Grid: Areas to Improve (Left) + Overview Cards (Right) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20, alignItems: 'start' }}>
        {/* Mistake / Score timeline */}
        <div className="mistake-panel">
          <div className="mistake-panel-header">
            <h3>
              {mistakes.length > 0 ? 'Areas to Improve' : 'Part Scores'}
            </h3>
            <p className="mistake-panel-sub">
              {mistakes.length > 0
                ? 'Click an entry to jump to that timestamp and inspect the frame (video will stay paused).'
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
              <div key={m.id} className="mistake-item" onClick={() => jumpTo(m.tInSeconds ?? m.ts)}>
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

        {/* Pipeline / Match Overview Panel */}
        <div className="video-panel" style={{ padding: 20 }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 16, fontFamily: 'var(--font-heading)' }}>
            Pipeline Overview
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Overall Match</span>
              <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--green)' }}>
                {results?.overall_score ? `${results.overall_score.toFixed(1)}%` : '—'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Pose Model</span>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {results?.best_model ?? '—'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Audio Sync Offset</span>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {results?.audio_offset != null ? `${results.audio_offset.toFixed(3)}s` : '—'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 4 }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Frames Processed</span>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {results?.video1_frames ? `${results.video1_frames} Ref / ${results.video2_frames} Stu` : '—'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
