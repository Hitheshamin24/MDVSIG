// AnalyticsTab.jsx — Wired to real backend part_scores and overall_score
import {
  BarChart, Bar, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';


/**
 * Returns bar chart data for part_scores.
 * Each bar = one body part score (0-100).
 */
function buildPartBarData(part_scores) {
  if (!part_scores) return [];
  return Object.entries(part_scores).map(([part, score]) => ({
    part: part.replace(' Arm', ' Arm').replace(' Leg', ' Leg'),
    score: Math.round(score * 10) / 10,
  }));
}

/**
 * Radar chart — maps the 5 body parts + overall to radar axes.
 */
function buildRadarData(results) {
  const ps = results?.part_scores ?? {};
  const overall = results?.overall_score ?? 0;
  return [
    { metric: 'Left Arm',  value: Math.round(ps['Left Arm']  ?? 0) },
    { metric: 'Right Arm', value: Math.round(ps['Right Arm'] ?? 0) },
    { metric: 'Left Leg',  value: Math.round(ps['Left Leg']  ?? 0) },
    { metric: 'Right Leg', value: Math.round(ps['Right Leg'] ?? 0) },
    { metric: 'Torso',     value: Math.round(ps['Torso']     ?? 0) },
    { metric: 'Overall',   value: Math.round(overall) },
  ];
}

/* ── Custom tooltip ─────────────────────────────────────────────────────────── */
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-strong)',
      borderRadius: 'var(--r-md)', padding: '10px 14px', fontSize: '0.8rem',
    }}>
      <p style={{ color: 'var(--text-muted)', marginBottom: 4 }}>{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color ?? 'var(--green)', fontWeight: 600 }}>
          {p.name}: {p.value}{typeof p.value === 'number' ? '%' : ''}
        </p>
      ))}
    </div>
  );
};

/* ── Bar fill color based on score value ───────────────────────────────────── */
const getBarColor = (value) =>
  value >= 75 ? '#a3e635' : value >= 55 ? '#eab308' : '#f97316';

export default function AnalyticsTab({ results }) {
  const partBarData = buildPartBarData(results?.part_scores);
  const radarData   = buildRadarData(results);
  const hasData     = !!results?.part_scores;

  // Summary stats
  const scores = Object.values(results?.part_scores ?? {});
  const maxScore  = scores.length ? Math.max(...scores).toFixed(1) : '—';
  const minScore  = scores.length ? Math.min(...scores).toFixed(1) : '—';
  const avgScore  = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '—';

  return (
    <div className="analytics-grid">
      {/* Summary stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 4 }}>
        {[
          { label: 'Overall Match', val: results?.overall_score != null ? `${results.overall_score.toFixed(1)}%` : '—', color: 'var(--green)' },
          { label: 'Best Body Part',  val: maxScore !== '—' ? `${maxScore}%` : '—', color: 'var(--green)' },
          { label: 'Weakest Part',    val: minScore !== '—' ? `${minScore}%` : '—', color: 'var(--orange)' },
          { label: 'Avg Part Score',  val: avgScore !== '—' ? `${avgScore}%` : '—', color: 'var(--yellow)' },
        ].map(s => (
          <div key={s.label} className="analytics-card" style={{ padding: '16px 20px' }}>
            <p style={{ fontSize: '0.73rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              {s.label}
            </p>
            <p style={{ fontSize: '1.6rem', fontWeight: 800, color: s.color, fontFamily: 'var(--font-heading)', lineHeight: 1 }}>
              {s.val}
            </p>
          </div>
        ))}
      </div>

      {/* Body Part Scores bar chart */}
      <div className="analytics-card full anim-fade-up">
        <h3>Body Part Similarity Scores</h3>
        {!hasData ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Process videos to see analytics.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={partBarData} margin={{ top: 5, right: 16, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="part" tick={{ fill: '#888', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: '#888', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="score" name="Score" radius={[4, 4, 0, 0]}>
                {partBarData.map((entry) => (
                  <Cell key={entry.part} fill={getBarColor(entry.score)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Radar + Summary */}
      <div className="analytics-row">
        <div className="analytics-card anim-fade-up delay-100">
          <h3>Performance Radar</h3>
          {!hasData ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={radarData} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
                <PolarGrid stroke="rgba(255,255,255,0.07)" />
                <PolarAngleAxis dataKey="metric" tick={{ fill: '#999', fontSize: 11 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Radar
                  name="Score"
                  dataKey="value"
                  stroke="#a3e635"
                  fill="#a3e635"
                  fillOpacity={0.18}
                  strokeWidth={2}
                />
                <Tooltip content={<CustomTooltip />} />
              </RadarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="analytics-card anim-fade-up delay-200">
          <h3>Pipeline Summary</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { label: 'Pose Model',     val: results?.best_model ?? '—' },
              { label: 'Audio Offset',   val: results?.audio_offset != null ? `${results.audio_offset.toFixed(3)}s` : '—' },
              { label: 'Teacher Frames', val: results?.video1_frames ?? '—' },
              { label: 'Student Frames', val: results?.video2_frames ?? '—' },
              { label: 'Overall Score',  val: results?.overall_score != null ? `${results.overall_score.toFixed(1)}%` : '—' },
            ].map(row => (
              <div key={row.label} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '8px 0', borderBottom: '1px solid var(--border)',
              }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{row.label}</span>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {String(row.val)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
