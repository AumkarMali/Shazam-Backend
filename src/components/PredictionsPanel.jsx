import RadarChart from './RadarChart'
import './PredictionsPanel.css'

function PredictionsPanel({ prediction, isLoading = false }) {
  const circumference = 2 * Math.PI * 70
  const confidenceValue =
    typeof prediction?.confidence === 'number'
      ? Math.max(0, Math.min(100, prediction.confidence))
      : null
  const offset = confidenceValue === null
    ? circumference
    : circumference - (confidenceValue / 100) * circumference

  const profile = prediction?.profile
  const statusTone = profile?.tone || 'neutral'
  const toneClass = statusTone ? `tone-${statusTone}` : ''
  const metrics = profile?.metrics || []
  const actions = profile?.actions || []
  
  // Debug logging
  console.log('PredictionsPanel render:', {
    profileStatus: profile?.status,
    profileTone: profile?.tone,
    confidence: prediction?.confidence,
    fullProfile: profile
  })

  return (
    <div className={`predictions-panel ${toneClass}`}>
      <div className="predictions-header">
        <h3 className="predictions-title">Analysis Summary</h3>
        <span className={`status-pill ${statusTone}`}>
          {profile?.status || 'Idle'}
        </span>
      </div>

      {isLoading && (
        <div className="panel-banner" role="status">
          <span className="panel-spinner" aria-hidden="true"></span>
          <span>Analyzing audio sample…</span>
        </div>
      )}

      <div className="confidence-card">
        <div className={`gauge-container ${confidenceValue === null ? 'gauge-container--empty' : ''}`}>
          <svg className="gauge-svg" viewBox="0 0 160 160" role="img" aria-label="Detection confidence gauge">
            <title>Detection confidence</title>
            <circle
              className="gauge-background"
              cx="80"
              cy="80"
              r="70"
              fill="none"
              stroke="rgba(148, 163, 184, 0.15)"
              strokeWidth="12"
            />
            <circle
              className="gauge-fill"
              cx="80"
              cy="80"
              r="70"
              fill="none"
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              transform="rotate(-90 80 80)"
            />
            <text x="80" y="85" textAnchor="middle" className="gauge-percentage">
              {confidenceValue === null ? '--' : `${Math.round(confidenceValue)}%`}
            </text>
          </svg>
        </div>
        <div className="confidence-meta">
          <p className="prediction-headline">{profile?.headline || 'Awaiting analysis'}</p>
          <p className="prediction-variant">
            {profile?.displayName || 'No data yet'}
            {profile?.variant ? ` · ${profile.variant}` : ''}
          </p>
          {prediction?.rawLabel && (
            <div className="prediction-raw">
              Model classified as <span>{prediction.rawLabel}</span>
            </div>
          )}
          <p className="prediction-insight">{profile?.insight}</p>
        </div>
      </div>

      <div className="radar-card">
        <div className="radar-card-header">
          <h4 className="subheading">Capability profile</h4>
          <span className="radar-note">Relative scale · higher is stronger</span>
        </div>
        <RadarChart metrics={metrics} />
      </div>

      {actions.length > 0 && (
        <div className="actions-card">
          <h4 className="subheading">Recommended actions</h4>
          <ul>
            {actions.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default PredictionsPanel

