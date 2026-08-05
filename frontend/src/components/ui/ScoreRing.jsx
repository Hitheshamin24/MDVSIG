// ScoreRing.jsx — Circular progress ring matching StepSync Compare page
import { useState, useEffect } from 'react';

export default function ScoreRing({ score = 0, size = 140, strokeWidth = 8 }) {
  const r = (size - strokeWidth * 2) / 2;
  const circ = 2 * Math.PI * r;
  const [offset, setOffset] = useState(circ);

  useEffect(() => {
    const t = setTimeout(() => {
      setOffset(circ - (score / 100) * circ);
    }, 200);
    return () => clearTimeout(t);
  }, [score, circ]);

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg
        className="score-ring-svg"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
      >
        <circle
          className="score-ring-bg"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={strokeWidth}
        />
        <circle
          className="score-ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={strokeWidth}
          strokeDasharray={circ}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="score-ring-label">
        <span className="score-ring-pct">{Math.round(score)}%</span>
        <span className="score-ring-text">Overall Match</span>
      </div>
    </div>
  );
}
