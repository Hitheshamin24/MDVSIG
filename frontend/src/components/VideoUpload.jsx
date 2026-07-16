import { useState, useRef, useCallback } from 'react';

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function DropZone({ type, file, onFileSelect, onRemove }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const isTeacher = type === 'teacher';
  const label = isTeacher ? 'Teacher / Reference' : 'Student';
  const icon = isTeacher ? '🎓' : '🎯';

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && dropped.type.startsWith('video/')) {
      onFileSelect(dropped);
    }
  }, [onFileSelect]);

  const handleClick = () => inputRef.current?.click();

  const handleChange = (e) => {
    const selected = e.target.files[0];
    if (selected) onFileSelect(selected);
  };

  const zoneClass = [
    'drop-zone',
    dragging && 'dragging',
    file && 'has-file',
  ].filter(Boolean).join(' ');

  return (
    <div
      id={`drop-zone-${type}`}
      className={zoneClass}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        onChange={handleChange}
        style={{ display: 'none' }}
        id={`file-input-${type}`}
      />
      <div className="drop-zone-content">
        <div className={`drop-zone-label ${isTeacher ? 'teacher' : 'student'}`}>
          {label}
        </div>
        <div className={`drop-zone-icon ${isTeacher ? 'teacher' : 'student'}`}>
          {icon}
        </div>

        {file ? (
          <div className="file-preview" onClick={(e) => e.stopPropagation()}>
            <div className="file-preview-icon">🎬</div>
            <div className="file-preview-info">
              <div className="file-preview-name">{file.name}</div>
              <div className="file-preview-size">{formatFileSize(file.size)}</div>
            </div>
            <button
              className="file-preview-remove"
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              title="Remove file"
            >
              ✕
            </button>
          </div>
        ) : (
          <div className="drop-zone-text">
            <h3>Drop your video here</h3>
            <p>or <span>browse</span> to upload</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VideoUpload({ onUpload }) {
  const [video1, setVideo1] = useState(null);
  const [video2, setVideo2] = useState(null);
  const [uploading, setUploading] = useState(false);

  const handleSubmit = async () => {
    if (!video1 || !video2 || uploading) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('video1', video1);
      formData.append('video2', video2);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Upload failed');
      }

      const data = await res.json();
      onUpload(data.job_id);
    } catch (err) {
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const ready = video1 && video2 && !uploading;

  return (
    <div className="upload-section animate-fade-up" id="upload-section">
      <div className="upload-hero">
        <h1>
          Analyse Your <span>Dance Moves</span>
        </h1>
        <p>
          Upload a teacher (reference) video and a student video.
          Our AI will compare poses frame-by-frame using 4 different models
          and generate a detailed performance report.
        </p>
      </div>

      <div className="upload-grid">
        <DropZone
          type="teacher"
          file={video1}
          onFileSelect={setVideo1}
          onRemove={() => setVideo1(null)}
        />
        <DropZone
          type="student"
          file={video2}
          onFileSelect={setVideo2}
          onRemove={() => setVideo2(null)}
        />
      </div>

      <button
        className={`submit-btn ${ready && !uploading ? 'pulse-ready' : ''} animate-fade-up delay-200`}
        onClick={handleSubmit}
        disabled={!ready}
        id="submit-btn"
      >
        <span className="btn-icon">🚀</span>
        {uploading ? 'Uploading...' : 'Start Analysis'}
      </button>
    </div>
  );
}
