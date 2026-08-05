// ScoresTab.jsx — Wired to real backend data
// Backend part_scores keys: 'Left Arm', 'Right Arm', 'Left Leg', 'Right Leg', 'Torso'
import ScoreRing from '../ui/ScoreRing';

/**
 * Maps the backend part_scores dict → display rows with max points.
 * Backend values are already 0-100 (similarity %).
 * We display them as X/100 bars.
 */
function buildBreakdown(part_scores) {
  const rows = [
    { key: 'Left Arm',   label: 'Left Arm',   desc: 'Left shoulder → elbow → wrist alignment' },
    { key: 'Right Arm',  label: 'Right Arm',   desc: 'Right shoulder → elbow → wrist alignment' },
    { key: 'Left Leg',   label: 'Left Leg',    desc: 'Left hip → knee → ankle position' },
    { key: 'Right Leg',  label: 'Right Leg',   desc: 'Right hip → knee → ankle position' },
    { key: 'Torso',      label: 'Torso',       desc: 'Shoulder & hip alignment — core posture' },
  ];

  return rows.map(r => ({
    name: r.label,
    score: part_scores?.[r.key] ?? null,
    desc: r.desc,
  }));
}

export default function ScoresTab({ results }) {
  const score = results?.overall_score ?? null;
  const hasData = score !== null;
  const breakdown = buildBreakdown(results?.part_scores);

  return (
    <div className="scores-layout">
      {/* Ring */}
      <div className="scores-ring-card anim-fade-up">
        <ScoreRing score={score ?? 0} size={160} />
        <p className="overall-label">Overall Match</p>
        {results?.best_model && (
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
            Model: <span style={{ color: 'var(--green)' }}>{results.best_model}</span>
          </p>
        )}
        {results?.audio_offset !== undefined && (
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
            Audio offset: <span style={{ color: 'var(--text-secondary)' }}>
              {results.audio_offset.toFixed(3)}s
            </span>
          </p>
        )}
        {results?.video1_frames && (
          <p style={{ fontSize: '0.73rem', color: 'var(--text-muted)', textAlign: 'center' }}>
            {results.video1_frames} teacher frames · {results.video2_frames} student frames
          </p>
        )}
      </div>

      {/* Breakdown */}
      <div className="score-breakdown-card anim-fade-up delay-100">
        <h3>Body Part Scores</h3>

        {!hasData && (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Upload and analyse videos to see your score breakdown.
          </p>
        )}

        {breakdown.map(row => {
          const val = row.score;
          const pct = val !== null ? val : 0;
          const color = pct >= 75 ? 'var(--green)'
                      : pct >= 50 ? 'var(--yellow)'
                      : 'var(--orange)';
          return (
            <div key={row.name} className="score-row">
              <div className="score-row-header">
                <span className="score-row-name">{row.name}</span>
                <span className="score-row-val" style={{ color }}>
                  {val !== null ? `${val.toFixed(1)}%` : '—'}
                </span>
              </div>
              <div className="score-bar-track">
                <div
                  className="score-bar-fill"
                  style={{ width: `${pct}%`, background: color, transition: 'width 1s ease' }}
                />
              </div>
              <p className="score-row-desc">{row.desc}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
