import { useState } from 'react'
import './Login.css'
import logoImage from './assets/logo_transparent.png'

const HARDCODED_USERS = {
  'admin': 'admin123',
  'user': 'user123',
  'wathedrone': 'drone2024',
  'test': 'test123'
}

function Login({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    // Simulate API call delay
    setTimeout(() => {
      if (HARDCODED_USERS[username.toLowerCase()] === password) {
        setIsLoading(false)
        onLogin(username)
      } else {
        setIsLoading(false)
        setError('Invalid username or password')
      }
    }, 500)
  }

  return (
    <div className="login-page">
      <div className="login-container">
        {/* Left side - Image/Content area */}
        <div className="login-visual">
          <div className="visual-content">
            <div className="brand-section">
              <h1 className="brand-title">WATheDrone</h1>
              <p className="brand-tagline">Audio Processing Platform</p>
            </div>
            
            {/* WATheDrone Logo */}
            <div className="logo-container">
              <img 
                src={logoImage} 
                alt="WATheDrone Logo" 
                className="wathedrone-logo"
              />
            </div>
          </div>
        </div>

        {/* Right side - Login form */}
        <div className="login-form-section">
          <div className="login-form-wrapper">
            <div className="login-header">
              <h2 className="login-title">Welcome Back</h2>
              <p className="login-subtitle">Sign in to continue</p>
            </div>

            <form onSubmit={handleSubmit} className="login-form">
              <div className="form-group">
                <label htmlFor="username" className="form-label">Username</label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value)
                    setError('')
                  }}
                  className="form-input"
                  placeholder="Enter your username"
                  required
                  autoComplete="username"
                />
              </div>

              <div className="form-group">
                <label htmlFor="password" className="form-label">Password</label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    setError('')
                  }}
                  className="form-input"
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                />
              </div>

              {error && (
                <div className="error-message">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  <span>{error}</span>
                </div>
              )}

              <button 
                type="submit" 
                className="login-button"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <div className="button-spinner"></div>
                    <span>Signing in...</span>
                  </>
                ) : (
                  <span>Sign In</span>
                )}
              </button>
            </form>

            <div className="guest-section">
              <div className="divider">
                <span>or</span>
              </div>
              <button 
                type="button"
                className="guest-button"
                onClick={() => onLogin('guest')}
                disabled={isLoading}
              >
                Continue as Guest
              </button>
            </div>

            <div className="login-footer">
              <p className="demo-info">Demo Credentials:</p>
              <div className="demo-credentials">
                <div className="credential-item">
                  <span className="cred-label">admin</span>
                  <span className="cred-value">admin123</span>
                </div>
                <div className="credential-item">
                  <span className="cred-label">user</span>
                  <span className="cred-value">user123</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Login

