// FeedbackTab.jsx — Generates actionable feedback from real part_scores
/**
 * Derives Strengths and Work-on-This from real backend part_scores.
 * part_scores keys: 'Left Arm', 'Right Arm', 'Left Leg', 'Right Leg', 'Torso'
 * overall_score: float
 * audio_offset: float
 */

const PART_ADVICE = {
  'Left Arm': {
    good:  'Left arm coordination is strong — shoulder, elbow and wrist track well.',
    bad:   'Left arm needs work — focus on extending the elbow fully and matching the shoulder angle.',
  },
  'Right Arm': {
    good:  'Right arm movement closely matches the instructor — clean technique.',
    bad:   'Right arm positioning is off — check elbow extension and wrist angle during transitions.',
  },
  'Left Leg': {
    good:  'Left leg footwork is solid — hip, knee and ankle land in the right positions.',
    bad:   'Left leg placement drifts from the reference — pay attention to knee bend depth.',
  },
  'Right Leg': {
    good:  'Right leg is well-controlled — your stance and footwork are consistent.',
    bad:   'Right leg needs improvement — the knee bend and ankle position diverge from the instructor.',
  },
  'Torso': {
    good:  'Core posture is excellent — your torso stays aligned and stable throughout.',
    bad:   'Torso alignment needs attention — keep shoulders stacked over hips and reduce lateral lean.',
  },
};

const TIMING_ADVICE = {
  good: 'Timing is excellent — your movements land on the beat with minimal delay.',
  okay: 'Timing is decent but there is a slight lag. The audio was shifted by {offset}s to align the videos.',
  bad:  'Timing needs improvement. Audio offset of {offset}s was detected — practise counting along with the music.',
};

function buildFeedback(results) {
  if (!results) {
    return {
      strengths: ['Upload and analyse videos to see personalised feedback.'],
      improve:   [],
      review:    'Your feedback will appear here after processing is complete.',
    };
  }

  const { overall_score = 0, part_scores = {}, audio_offset = 0 } = results;
  const strengths = [];
  const improve   = [];

  // Part-level feedback
  Object.entries(part_scores).forEach(([part, score]) => {
    const advice = PART_ADVICE[part];
    if (!advice) return;
    if (score >= 72) {
      strengths.push(advice.good);
    } else {
      improve.push(advice.bad);
    }
  });

  // Timing feedback from audio offset
  const absOffset = Math.abs(audio_offset);
  if (absOffset < 0.1) {
    strengths.push(TIMING_ADVICE.good);
  } else if (absOffset < 0.5) {
    strengths.push(TIMING_ADVICE.okay.replace('{offset}', absOffset.toFixed(3)));
  } else {
    improve.push(TIMING_ADVICE.bad.replace('{offset}', absOffset.toFixed(3)));
  }

  // Overall score comment
  const scoreStr = overall_score.toFixed(1);
  let review = '';
  if (overall_score >= 85) {
    review = `Outstanding performance! Your dance matches the instructor with ${scoreStr}% overall similarity. `
           + `Your pose accuracy is excellent and your timing is well-aligned. `
           + `Keep pushing — with continued practice you can push past 95%.`;
  } else if (overall_score >= 70) {
    review = `Good performance! Your dance matches the instructor at ${scoreStr}% overall. `
           + `Your strongest areas are highlighted above. Focus your next session on the improvement areas `
           + `and you will quickly reach the 85% milestone.`;
  } else if (overall_score >= 55) {
    review = `You're making progress — ${scoreStr}% overall match. `
           + `There are clear areas to improve (see above). Break the routine into smaller sections `
           + `and practise each part slowly before combining them.`;
  } else {
    review = `You're at ${scoreStr}% — keep going! Every dance skill improves with deliberate practice. `
           + `Start by focusing on just one body part at a time, especially the areas listed above. `
           + `Try slowing the reference video to 0.5× speed when drilling specific moves.`;
  }

  // Fallbacks if everything was good
  if (strengths.length === 0) strengths.push('Keep analysing — more comparisons reveal your patterns over time.');
  if (improve.length === 0)   improve.push('Great work! All body parts are tracking well against the reference.');

  return { strengths, improve, review };
}

export default function FeedbackTab({ results }) {
  const { strengths, improve, review } = buildFeedback(results);
  const hasData = !!results?.overall_score;

  return (
    <div>
      {/* Score context bar */}
      {hasData && (
        <div style={{
          display: 'flex', gap: 16, marginBottom: 20,
          padding: '12px 16px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)',
          flexWrap: 'wrap', alignItems: 'center',
        }}>
          <span style={{ fontSize: '0.83rem', color: 'var(--text-muted)' }}>
            Overall:
            <strong style={{ color: 'var(--green)', marginLeft: 6 }}>
              {results.overall_score.toFixed(1)}%
            </strong>
          </span>
          <span style={{ fontSize: '0.83rem', color: 'var(--text-muted)' }}>
            Model: <span style={{ color: 'var(--text-secondary)' }}>{results.best_model}</span>
          </span>
          <span style={{ fontSize: '0.83rem', color: 'var(--text-muted)' }}>
            Audio offset: <span style={{ color: 'var(--text-secondary)' }}>
              {(results.audio_offset ?? 0).toFixed(3)}s
            </span>
          </span>
          <span style={{ fontSize: '0.83rem', color: 'var(--text-muted)' }}>
            Frames analysed:&nbsp;
            <span style={{ color: 'var(--text-secondary)' }}>
              {results.video1_frames ?? '—'} T / {results.video2_frames ?? '—'} S
            </span>
          </span>
        </div>
      )}

      <div className="feedback-grid anim-fade-up">
        {/* Strengths */}
        <div className="feedback-card">
          <div className="feedback-card-title strengths">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7.493 18.75c-.425 0-.82-.236-.975-.632A7.48 7.48 0 016 15.375c0-1.75.599-3.358 1.602-4.634.151-.192.373-.309.6-.397.473-.183.89-.514 1.212-.924a9.042 9.042 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V3a.75.75 0 01.75-.75 2.25 2.25 0 012.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 01-2.649 7.521c-.388.482-.987.729-1.605.729H14.23c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 00-1.423-.23h-.777zM2.331 10.977a11.969 11.969 0 00-.831 4.398 12 12 0 00.52 3.507c.26.85 1.084 1.368 1.973 1.368H4.9c.445 0 .72-.498.523-.898a8.963 8.963 0 01-.924-3.977c0-1.708.476-3.305 1.302-4.666.245-.403-.028-.959-.5-.959H4.25c-.832 0-1.612.453-1.918 1.227z" />
            </svg>
            Strengths
          </div>
          <ul className="feedback-list strengths">
            {strengths.map((s, i) => (
              <li key={i}>
                <div className="feedback-bullet" />
                {s}
              </li>
            ))}
          </ul>
        </div>

        {/* Work on This */}
        <div className="feedback-card">
          <div className="feedback-card-title improve">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path fillRule="evenodd" d="M12 6.75a5.25 5.25 0 016.775-5.025.75.75 0 01.313 1.248l-3.32 3.319c.063.475.276.934.641 1.299.365.365.824.578 1.3.641l3.318-3.319a.75.75 0 011.248.313 5.25 5.25 0 01-5.472 6.756c-1.018-.086-1.87.1-2.309.634L7.344 21.3A3.298 3.298 0 112.7 16.657l8.684-7.151c.533-.44.72-1.291.634-2.309A5.342 5.342 0 0112 6.75zM4.117 19.125a.75.75 0 01.75-.75h.008a.75.75 0 01.75.75v.008a.75.75 0 01-.75.75h-.008a.75.75 0 01-.75-.75v-.008z" clipRule="evenodd" />
            </svg>
            Work on This
          </div>
          {improve.length === 0 ? (
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              {hasData
                ? '🎉 All body parts are performing well — keep it up!'
                : 'Improvement areas will appear here after analysis.'}
            </p>
          ) : (
            <ul className="feedback-list improve">
              {improve.map((s, i) => (
                <li key={i}>
                  <div className="feedback-bullet" />
                  {s}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Overall Review */}
      <div className="review-card anim-fade-up delay-100">
        <div className="review-card-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path fillRule="evenodd" d="M9 4.5a.75.75 0 01.721.544l.813 2.846a3.75 3.75 0 002.576 2.576l2.846.813a.75.75 0 010 1.442l-2.846.813a3.75 3.75 0 00-2.576 2.576l-.813 2.846a.75.75 0 01-1.442 0l-.813-2.846a3.75 3.75 0 00-2.576-2.576l-2.846-.813a.75.75 0 010-1.442l2.846-.813A3.75 3.75 0 007.466 7.89l.813-2.846A.75.75 0 019 4.5zM18 1.5a.75.75 0 01.728.568l.258 1.036c.236.94.97 1.674 1.91 1.91l1.036.258a.75.75 0 010 1.456l-1.036.258c-.94.236-1.674.97-1.91 1.91l-.258 1.036a.75.75 0 01-1.456 0l-.258-1.036a2.625 2.625 0 00-1.91-1.91l-1.036-.258a.75.75 0 010-1.456l1.036-.258a2.625 2.625 0 001.91-1.91l.258-1.036A.75.75 0 0118 1.5z" clipRule="evenodd" />
          </svg>
          Overall Review
        </div>
        <p className="review-text">{review}</p>
      </div>

      {/* Part scores table */}
      {results?.part_scores && (
        <div className="review-card anim-fade-up delay-200" style={{ marginTop: 16 }}>
          <div className="review-card-title" style={{ marginBottom: 16 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Raw Scores from Pipeline
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {Object.entries(results.part_scores).map(([part, score]) => {
              const color = score >= 75 ? 'var(--green)' : score >= 55 ? 'var(--yellow)' : 'var(--orange)';
              return (
                <div key={part} style={{
                  padding: '8px 16px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-md)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 110,
                }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{part}</span>
                  <span style={{ fontSize: '1.1rem', fontWeight: 700, color }}>{score.toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
