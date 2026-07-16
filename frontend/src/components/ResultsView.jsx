import { useState, useEffect } from 'react';

function getGradeClass(score) {
  if (score >= 85) return 'grade-a';
  if (score >= 70) return 'grade-b';
  if (score >= 55) return 'grade-c';
  if (score >= 40) return 'grade-d';
  return 'grade-f';
}

function getGradeLetter(score) {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

function getGradeLabel(score) {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 55) return 'Average';
  if (score >= 40) return 'Needs Work';
  return 'Poor';
}

function getScoreLevel(score) {
  if (score >= 70) return 'high';
  if (score >= 45) return 'mid';
  return 'low';
}

function ScoreCircle({ score }) {
  const gradeClass = getGradeClass(score);
  const radius = 65;
  const circumference = 2 * Math.PI * radius;
  const [offset, setOffset] = useState(circumference);

  useEffect(() => {
    const timer = setTimeout(() => {
      setOffset(circumference - (score / 100) * circumference);
    }, 300);
    return () => clearTimeout(timer);
  }, [score, circumference]);

  return (
    <div className="score-circle">
      <svg viewBox="0 0 160 160">
        <circle className="score-circle-bg" cx="80" cy="80" r={radius} />
        <circle
          className={`score-circle-fill ${gradeClass}`}
          cx="80"
          cy="80"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="score-value">
        <div className="score-number">{Math.round(score)}</div>
        <div className="score-unit">Match %</div>
      </div>
    </div>
  );
}

export default function ResultsView({ jobId, onReset }) {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!jobId) return;

    const fetchResults = async () => {
      try {
        const res = await fetch(`/api/results/${jobId}`);
        if (!res.ok) throw new Error('Failed to fetch results');
        const data = await res.json();
        setResults(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
  }, [jobId]);

  if (loading) {
    return (
      <div className="processing-section">
        <div className="processing-card glass-panel">
          <div className="processing-spinner" />
          <p>Loading results...</p>
        </div>
      </div>
    );
  }

  if (error || !results) {
    return (
      <div className="processing-section">
        <div className="error-card glass-panel">
          <div className="error-icon">⚠️</div>
          <h3>Failed to Load Results</h3>
          <p>{error || 'Unknown error'}</p>
          <button className="retry-btn" onClick={onReset}>
            ↻ Start Over
          </button>
        </div>
      </div>
    );
  }

  const { overall_score, part_scores, best_model, audio_offset,
          output_video, chart_image } = results;
  const gradeClass = getGradeClass(overall_score);
  const gradeLetter = getGradeLetter(overall_score);
  const gradeLabel = getGradeLabel(overall_score);

  const videoUrl = `/api/download/${jobId}/${output_video}`;
  const chartUrl = `/api/download/${jobId}/${chart_image}`;

  return (
    <div className="results-section animate-fade-up" id="results-section">
      <div className="results-header">
        <h2>
          Analysis <span>Complete</span>
        </h2>
        <p>Here&apos;s how the student performed compared to the teacher</p>
      </div>

      {/* ── Score Hero ──────────────────────────────────── */}
      <div className="score-hero glass-panel animate-fade-up delay-100" id="score-hero">
        <ScoreCircle score={overall_score} />
        <div className="score-details">
          <div className={`grade-badge ${gradeClass}`}>
            Grade {gradeLetter} — {gradeLabel}
          </div>
          <div className="model-info">
            Best Model: <strong>{best_model}</strong>
          </div>
          <div className="offset-info">
            Audio Offset: {audio_offset?.toFixed(3)}s
          </div>
        </div>
      </div>

      {/* ── Body Parts + Chart ─────────────────────────── */}
      <div className="results-grid animate-fade-up delay-200">
        <div className="body-parts-card glass-panel" id="body-parts-scores">
          <h3>🦴 Body Part Scores</h3>
          {part_scores && Object.entries(part_scores).map(([part, score]) => {
            const level = getScoreLevel(score);
            return (
              <div key={part} className="part-score-row">
                <span className="part-name">{part}</span>
                <div className="part-bar-track">
                  <div
                    className={`part-bar-fill ${level}`}
                    style={{ width: `${score}%` }}
                  />
                </div>
                <span className={`part-value ${level}`}>{score.toFixed(1)}%</span>
              </div>
            );
          })}
        </div>

        {chart_image && (
          <div className="chart-card glass-panel" id="model-chart">
            <h3>📊 Model Comparison</h3>
            <img
              src={chartUrl}
              alt="Model Comparison Chart"
              loading="lazy"
            />
          </div>
        )}
      </div>

      {/* ── Video Player ───────────────────────────────── */}
      <div className="video-card glass-panel animate-fade-up delay-300" id="result-video">
        <h3>🎬 Merged Feedback Video</h3>
        <div className="video-player-wrapper">
          <video controls preload="metadata">
            <source src={videoUrl} type="video/mp4" />
            Your browser does not support the video tag.
          </video>
        </div>
      </div>

      {/* ── Actions ────────────────────────────────────── */}
      <div className="results-actions animate-fade-up delay-300">
        <a
          href={videoUrl}
          download
          className="download-btn"
          id="download-video-btn"
        >
          ⬇ Download Video
        </a>
        <a
          href={chartUrl}
          download
          className="download-btn"
          id="download-chart-btn"
        >
          ⬇ Download Chart
        </a>
        <button className="new-analysis-btn" onClick={onReset} id="new-analysis-btn">
          ↻ New Analysis
        </button>
      </div>
    </div>
  );
}
