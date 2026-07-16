import { useState, useCallback } from 'react';
import './App.css';
import Header from './components/Header';
import VideoUpload from './components/VideoUpload';
import ProcessingStatus from './components/ProcessingStatus';
import ResultsView from './components/ResultsView';

// App states: upload → processing → results | error
const STATES = {
  UPLOAD: 'upload',
  PROCESSING: 'processing',
  RESULTS: 'results',
  ERROR: 'error',
};

function App() {
  const [appState, setAppState] = useState(STATES.UPLOAD);
  const [jobId, setJobId] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const handleUpload = useCallback((id) => {
    setJobId(id);
    setAppState(STATES.PROCESSING);
  }, []);

  const handleComplete = useCallback(() => {
    setAppState(STATES.RESULTS);
  }, []);

  const handleError = useCallback((msg) => {
    setErrorMsg(msg);
    setAppState(STATES.ERROR);
  }, []);

  const handleReset = useCallback(() => {
    setJobId(null);
    setErrorMsg('');
    setAppState(STATES.UPLOAD);
  }, []);

  return (
    <>
      <Header />
      <main className="app-main">
        {appState === STATES.UPLOAD && (
          <VideoUpload onUpload={handleUpload} />
        )}

        {appState === STATES.PROCESSING && (
          <ProcessingStatus
            jobId={jobId}
            onComplete={handleComplete}
            onError={handleError}
          />
        )}

        {appState === STATES.RESULTS && (
          <ResultsView jobId={jobId} onReset={handleReset} />
        )}

        {appState === STATES.ERROR && (
          <div className="processing-section">
            <div className="error-card glass-panel">
              <div className="error-icon">⚠️</div>
              <h3>Processing Error</h3>
              <p>{errorMsg}</p>
              <button className="retry-btn" onClick={handleReset}>
                ↻ Try Again
              </button>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

export default App;
