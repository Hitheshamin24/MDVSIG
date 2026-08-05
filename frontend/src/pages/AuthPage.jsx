// AuthPage.jsx — StepSync Sign In / Register page
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function AuthPage() {
  const [mode, setMode] = useState('signin'); // 'signin' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const navigate = useNavigate();

  function handleSubmit(e) {
    e.preventDefault();
    // Placeholder — wire to real auth endpoint when ready
    alert(`${mode === 'signin' ? 'Sign in' : 'Register'} clicked — connect to your auth backend.`);
  }

  return (
    <div className="ss-page ss-hero-bg auth-page">
      <div className="auth-card anim-fade-up">
        <h2>Welcome Back</h2>
        <p className="auth-sub">
          Save comparisons, track progress and share reports with your students.
        </p>

        {/* Mode toggle */}
        <div className="auth-tabs">
          <button
            className={`auth-tab ${mode === 'signin' ? 'active' : ''}`}
            onClick={() => setMode('signin')}
          >
            Sign in
          </button>
          <button
            className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
            onClick={() => setMode('register')}
          >
            Register
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === 'register' && (
            <div className="auth-field">
              <label htmlFor="auth-name">Full Name</label>
              <input
                id="auth-name"
                type="text"
                placeholder="Your name"
                value={name}
                onChange={e => setName(e.target.value)}
                autoComplete="name"
              />
            </div>
          )}

          <div className="auth-field">
            <label htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              type="email"
              placeholder="you@studio.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>

          <div className="auth-field">
            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            />
          </div>

          <button type="submit" className="auth-submit" id="auth-submit-btn">
            {mode === 'signin' ? 'Sign in' : 'Create Account'}
          </button>
        </form>

        <p className="auth-footer">
          Just exploring?{' '}
          <span onClick={() => navigate('/compare')}>View a demo comparison</span>
        </p>
      </div>
    </div>
  );
}
