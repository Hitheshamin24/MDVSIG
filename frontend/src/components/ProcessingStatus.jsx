import { useState, useEffect, useRef } from 'react';

const PIPELINE_STEPS = [
  { key: 'normalize', label: 'Normalising Videos', icon: '🎞️' },
  { key: 'audio_sync', label: 'Audio Sync Detection', icon: '🎵' },
  { key: 'benchmark', label: 'Benchmarking Models', icon: '⚡' },
  { key: 'extract_v1', label: 'Extracting Teacher Poses', icon: '🎓' },
  { key: 'extract_v2', label: 'Extracting Student Poses', icon: '🎯' },
  { key: 'scoring', label: 'Computing Scores', icon: '📊' },
  { key: 'merge', label: 'Merging Videos', icon: '🎬' },
  { key: 'done', label: 'Complete', icon: '✅' },
];

export default function ProcessingStatus({ jobId, onComplete, onError }) {
  const [stepStates, setStepStates] = useState({});
  const [currentStep, setCurrentStep] = useState(null);
  const [overallPercent, setOverallPercent] = useState(0);
  const eventSourceRef = useRef(null);

  useEffect(() => {
    if (!jobId) return;

    const es = new EventSource(`/api/progress/${jobId}`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.error) {
          onError(data.error);
          es.close();
          return;
        }

        if (data.step === 'complete') {
          setOverallPercent(100);
          es.close();
          // Small delay for animation
          setTimeout(() => onComplete(), 1500);
          return;
        }

        if (data.step === 'error') {
          onError(data.message);
          es.close();
          return;
        }

        // Update step state
        setStepStates((prev) => ({
          ...prev,
          [data.step]: {
            percent: data.percent,
            message: data.message,
          },
        }));
        setCurrentStep(data.step);

        // Calculate overall progress
        const stepIdx = PIPELINE_STEPS.findIndex((s) => s.key === data.step);
        if (stepIdx >= 0) {
          const base = (stepIdx / PIPELINE_STEPS.length) * 100;
          const stepContrib = (data.percent / 100) * (100 / PIPELINE_STEPS.length);
          setOverallPercent(Math.min(base + stepContrib, 99));
        }
      } catch (err) {
        console.error('SSE parse error:', err);
      }
    };

    es.onerror = () => {
      // SSE connection may close when processing is done
      es.close();
    };

    return () => {
      es.close();
    };
  }, [jobId, onComplete, onError]);

  const getStepStatus = (stepKey) => {
    const stepIdx = PIPELINE_STEPS.findIndex((s) => s.key === stepKey);
    const currentIdx = PIPELINE_STEPS.findIndex((s) => s.key === currentStep);

    if (stepKey in stepStates && stepStates[stepKey].percent >= 100) {
      return 'completed';
    }
    if (stepKey === currentStep) {
      return 'active';
    }
    if (currentIdx > stepIdx) {
      return 'completed';
    }
    return 'pending';
  };

  return (
    <div className="processing-section animate-fade-up" id="processing-section">
      <div className="processing-card glass-panel">
        <div className="processing-header">
          <div className="processing-spinner" />
          <h2>Analysing Your Dance</h2>
          <p>This may take a few minutes depending on video length</p>
        </div>

        <div className="progress-steps">
          {PIPELINE_STEPS.map((step) => {
            const status = getStepStatus(step.key);
            const state = stepStates[step.key];

            return (
              <div
                key={step.key}
                className={`progress-step ${status}`}
                id={`step-${step.key}`}
              >
                <div className={`step-icon ${status}`}>
                  {status === 'completed' ? '✓' : step.icon}
                </div>
                <div className="step-info">
                  <div className="step-name">{step.label}</div>
                  {state?.message && (
                    <div className="step-message">{state.message}</div>
                  )}
                </div>
                {status === 'active' && state && (
                  <div className="step-percent">{Math.round(state.percent)}%</div>
                )}
                {status === 'completed' && (
                  <div className="step-percent" style={{ color: 'var(--accent-emerald)' }}>
                    ✓
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="overall-progress">
          <div className="progress-bar-track">
            <div
              className="progress-bar-fill"
              style={{ width: `${overallPercent}%` }}
            />
          </div>
          <div className="progress-label">
            <span>Overall Progress</span>
            <span>{Math.round(overallPercent)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
