// App.jsx — StepSync root: routing + shared job state
import { useState, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './App.css';

import Header      from './components/Header';
import StudioPage  from './pages/StudioPage';
import ComparePage from './pages/ComparePage';
import AuthPage    from './pages/AuthPage';

export default function App() {
  const [jobId,      setJobId]      = useState(null);
  const [processing, setProcessing] = useState(false);

  const handleJobStart = useCallback((id) => {
    setJobId(id);
    setProcessing(true);
  }, []);

  const handleProcessComplete = useCallback(() => {
    setProcessing(false);
  }, []);

  const handleProcessError = useCallback((msg) => {
    setProcessing(false);
    console.error('Pipeline error:', msg);
  }, []);

  const handleReset = useCallback(() => {
    setJobId(null);
    setProcessing(false);
  }, []);

  return (
    <BrowserRouter>
      <Header />
      <Routes>
        {/* Studio — upload page */}
        <Route
          path="/"
          element={
            <StudioPage onJobStart={handleJobStart} />
          }
        />

        {/* Compare — results + processing */}
        <Route
          path="/compare"
          element={
            <ComparePage
              jobId={jobId}
              processing={processing}
              onProcessComplete={handleProcessComplete}
              onProcessError={handleProcessError}
              onReset={handleReset}
            />
          }
        />

        {/* Auth */}
        <Route path="/auth"  element={<AuthPage />} />
        <Route path="/login" element={<Navigate to="/auth" replace />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
