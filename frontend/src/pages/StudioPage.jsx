// StudioPage.jsx — StepSync upload page
import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" width="36" height="36">
      <path d="M12 16.5V9.75m0 0l-3 3m3-3l3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.338-2.32 5.75 5.75 0 011.322 11.095" />
    </svg>
  );
}

function DropCard({ label, labelClass, file, onFile, onRemove, id }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith('video/')) onFile(f);
  }, [onFile]);

  const classes = [
    'drop-card',
    dragging && 'drag-over',
    file && 'has-file',
  ].filter(Boolean).join(' ');

  return (
    <div
      id={id}
      className={classes}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/mov,video/avi,video/*"
        style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files[0]; if (f) onFile(f); }}
      />

      <div className={`drop-card-label ${labelClass}`}>{label}</div>

      {file ? (
        <>
          <div className="drop-card-icon" style={{ color: 'var(--green)' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="file-chip" onClick={(e) => e.stopPropagation()}>
            <span className="file-chip-icon">🎬</span>
            <div className="file-chip-info">
              <div className="file-chip-name">{file.name}</div>
              <div className="file-chip-size">{formatSize(file.size)}</div>
            </div>
            <button
              className="file-chip-remove"
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              title="Remove"
            >✕</button>
          </div>
        </>
      ) : (
        <>
          <div className="drop-card-icon"><UploadIcon /></div>
          <p className="drop-card-text">Drag a clip here or click to browse</p>
          <p className="drop-card-hint">MP4 / MOV · up to 5 minutes</p>
        </>
      )}
    </div>
  );
}

const PIPELINE_STEPS = [
  'Normalise 30 FPS',
  'Sync Audio',
  'Extract Pose',
  'Compare Frames',
  'Generate Output Video',
];

export default function StudioPage({ onJobStart }) {
  const [teacher, setTeacher] = useState(null);
  const [student, setStudent] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const ready = teacher && student && !uploading;

  async function handleAnalyse() {
    if (!ready) return;
    setError('');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('video1', teacher);
      fd.append('video2', student);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Upload failed');
      }
      const { job_id } = await res.json();
      onJobStart(job_id);
      navigate('/compare');
    } catch (err) {
      setError(err.message);
      setUploading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', position: 'relative', overflow: 'hidden' }}>
      {/* Hero gradient mesh */}
      <div style={{
        position: 'absolute', top: 0, left: 0, width: '40%', height: '320px',
        background: 'radial-gradient(ellipse at 0% 0%, rgba(22,101,52,0.45) 0%, transparent 70%)',
        pointerEvents: 'none', zIndex: 0,
      }} />
      <div style={{
        position: 'absolute', top: 0, right: 0, width: '40%', height: '320px',
        background: 'radial-gradient(ellipse at 100% 0%, rgba(120,40,15,0.40) 0%, transparent 70%)',
        pointerEvents: 'none', zIndex: 0,
      }} />

      {/* Content */}
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1280, margin: '0 auto', padding: '0 40px' }}>

        {/* Hero text */}
        <div style={{ paddingTop: 64, paddingBottom: 40 }}>
          {/* AI Dance Coach badge */}
          <div className="studio-badge">
            <svg viewBox="0 0 18 18" fill="none" width="13" height="13">
              <path d="M1 9h2.5l2-5 2.5 10 2-8 1.5 6 1.5-3H17" stroke="#a3e635"
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            AI Dance Coach
          </div>

          <h1 className="studio-heading">
            Compare Every Move{' '}
            <em>Frame&nbsp;by<br />Frame</em>
          </h1>

          <p className="studio-subheading">
            Drop in the choreographer's reference clip and the student's attempt. StepSync
            extracts pose landmarks, aligns the routines using audio cross-correlation, and
            returns a graded, frame-by-frame critique like a studio instructor would.
          </p>
        </div>

        {/* Drop zones */}
        <div className="upload-grid" style={{ padding: '0 0 32px' }}>
          <DropCard
            id="drop-reference"
            label="Reference · Instructor"
            labelClass="reference"
            file={teacher}
            onFile={setTeacher}
            onRemove={() => setTeacher(null)}
          />
          <DropCard
            id="drop-student"
            label="Student · Attempt"
            labelClass="student"
            file={student}
            onFile={setStudent}
            onRemove={() => setStudent(null)}
          />
        </div>

        {/* Error */}
        {error && (
          <p style={{ color: 'var(--red)', marginBottom: 16, fontSize: '0.875rem' }}>⚠ {error}</p>
        )}

        {/* Analyse button */}
        <div style={{ marginBottom: 40 }}>
          <button
            id="analyse-btn"
            className="analyze-btn"
            disabled={!ready}
            onClick={handleAnalyse}
          >
            {uploading ? (
              <>
                <div className="ss-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                Uploading…
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                  <path d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                </svg>
                Analyse
              </>
            )}
          </button>
        </div>

        {/* Pipeline steps hint */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', paddingBottom: 60 }}>
          {PIPELINE_STEPS.map((step, i) => (
            <div key={step} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="pipeline-step">
                <div className="pipeline-step-num">{i + 1}</div>
                <span>{step}</span>
              </div>
              {i < PIPELINE_STEPS.length - 1 && <span className="pipeline-arrow">→</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
