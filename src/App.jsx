import { useRef, useState, useEffect } from 'react'
import './App.css'
import Login from './Login'
import Waveform from './components/Waveform'
import Spectrogram from './components/Spectrogram'
import PredictionsPanel from './components/PredictionsPanel'
import AudioVisualizer from './components/AudioVisualizer'
import Decahedron from './components/Decahedron'

// Backend server URL - defaults to localhost for development
const HEROKU_API_URL = import.meta.env.VITE_HEROKU_API_URL || 'http://localhost:5000'

// Log the backend URL for debugging
console.log('Backend API URL:', HEROKU_API_URL)

const PROFILE_TEMPLATE = {
  headline: 'Awaiting Classification',
  displayName: 'Upload an audio sample',
  variant: 'No data yet',
  status: 'Collect more data',
  tone: 'neutral',
  insight: 'Drag an audio clip into the panel to start analysis.',
  metrics: [
    { name: 'Speed', value: 0, max: 100 },
    { name: 'Noise', value: 0, max: 100 },
    { name: 'Variability', value: 0, max: 100 },
    { name: 'Size', value: 0, max: 100 },
    { name: 'Prop Size', value: 0, max: 100 },
  ],
  actions: [
    // 'Drag and drop a file above.',
    // 'Toggle denoise to compare signatures.',
  ],
}

const PROFILE_RULES = [
    {
      id: 'ambient',
      keywords: ['ambient', 'noise', 'none', 'background'],
      overrides: {
        headline: 'No Drone Detected',
        displayName: 'Ambient environmental audio',
        variant: 'Background sound',
        status: 'All clear',
        tone: 'success',
        insight: 'Sample resembles wind, foliage, or urban background noise.',
      },
      metrics: {
        Speed: 0,
        Noise: 0,
        Variability: 0,
        Size: 0,
        'Prop Size': 0,
      },
      actions: [
        'Maintain passive monitoring.',
        'Tag the clip for baseline library comparison.',
        'Recalibrate microphone gain if noise floor drifts.',
      ],
    },
    {
      id: 'heavy',
      keywords: ['heavy', 'industrial', 'hexacopter', 'payload'],
      overrides: {
        headline: 'Heavy Drone Detected',
        displayName: 'Industrial hexacopter',
        variant: 'Payload platform',
        status: 'Investigate immediately',
        tone: 'danger',
        insight: 'Low rotor frequency and sustained tone suggest a heavy-lift craft.',
      },
      metrics: {
        Speed: 54,
        Noise: 82,
        Variability: 38,
        Size: 88,
        'Prop Size': 90,
      },
      actions: [
        'Escalate to security operations immediately.',
        'Check for parallel RF interference within the band.',
        'Prepare counter-UAS mitigation steps if authorized.',
      ],
    },
    {
      id: 'compact',
      keywords: ['mini', 'micro', 'compact', 'small', 'fpv', 'lightweight'],
      overrides: {
        headline: 'Compact Drone Detected',
        displayName: 'Lightweight quadcopter',
        variant: 'Sub-750 g platform',
        status: 'Confident', // Will be overridden by confidence percentage
        tone: 'info',
        insight: 'Short bursts and agile maneuvers indicate a lightweight recreational craft.',
      },
      metrics: {
        Speed: 58,
        Noise: 36,
        Variability: 84,
        Size: 28,
        'Prop Size': 24,
      },
      actions: [
        'Capture a follow-up sample within the next minute.',
        'Request visual confirmation if cameras are available.',
        'Log GPS position for trend analysis.',
      ],
    },
    {
      id: 'quadcopter',
      keywords: ['drone', 'quadcopter', 'surveillance', 'multi-rotor', 'uav'],
      overrides: {
        headline: 'Drone Detected',
        displayName: 'Surveillance quadcopter',
        variant: 'Mid-weight multi-rotor',
        status: 'Confident', // Will be overridden by confidence percentage
        tone: 'warning',
        insight: 'Acoustic fingerprint aligns with a stabilized quadcopter carrying optical payload.',
      },
      metrics: {
        Speed: 72,
        Noise: 48,
        Variability: 78,
        Size: 66,
        'Prop Size': 58,
      },
      actions: [
        'Flag the event and enable a 2-minute recording buffer.',
        'Attempt triangulation using secondary sensors.',
        'Check restricted airspace notifications for conflicts.',
      ],
    },
]

const clampPercentage = (value) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return null
  return Math.max(0, Math.min(100, value))
}

const mergeMetrics = (baseMetrics, overridesMap = {}) => {
  const mapped = baseMetrics.map((metric) => {
    const override = Object.prototype.hasOwnProperty.call(overridesMap, metric.name)
      ? overridesMap[metric.name]
      : null
    if (typeof override === 'number') {
      return { ...metric, value: Math.max(0, Math.min(100, override)) }
    }
    return { ...metric }
  })

  // Include any additional metrics that are not part of the template
  Object.entries(overridesMap).forEach(([name, value]) => {
    if (mapped.some((metric) => metric.name === name)) return
    if (typeof value === 'number') {
      mapped.push({ name, value: Math.max(0, Math.min(100, value)), max: 100 })
    }
  })
  return mapped
}

const mergeActions = (baseActions, extraActions = []) => {
  const set = new Set(baseActions)
  extraActions.forEach((action) => {
    if (action && !set.has(action)) {
      set.add(action)
    }
  })
  return Array.from(set)
}

const buildDynamicProfile = (labelText) => {
  const sanitizedLabel = labelText?.trim() || ''
  const baseProfile = {
    ...PROFILE_TEMPLATE,
    displayName: sanitizedLabel || PROFILE_TEMPLATE.displayName,
    headline: PROFILE_TEMPLATE.headline,
    variant: PROFILE_TEMPLATE.variant,
    status: PROFILE_TEMPLATE.status,
    tone: PROFILE_TEMPLATE.tone,
    insight: sanitizedLabel
      ? `Model returned “${sanitizedLabel}”. Awaiting analyst verification.`
      : PROFILE_TEMPLATE.insight,
    metrics: PROFILE_TEMPLATE.metrics.map((item) => ({ ...item })),
    actions: [...PROFILE_TEMPLATE.actions],
  }

  if (!sanitizedLabel) {
    return { profile: baseProfile, profileKey: 'unknown' }
  }

  const lowerLabel = sanitizedLabel.toLowerCase()
  const matchingRule = PROFILE_RULES.find((rule) =>
    rule.keywords.some((keyword) => lowerLabel.includes(keyword)),
  )

  if (!matchingRule) {
    return {
      profile: {
        ...baseProfile,
        headline: `Detected: ${sanitizedLabel}`,
        variant: 'Uncatalogued signature',
        status: 'Review required',
        tone: 'neutral',
      },
      profileKey: 'unmapped',
    }
  }

  const overrides = matchingRule.overrides || {}
  const profile = {
    ...baseProfile,
    ...overrides,
    metrics: mergeMetrics(baseProfile.metrics, matchingRule.metrics || {}),
    actions: mergeActions(baseProfile.actions, matchingRule.actions),
  }

  if (!profile.displayName) {
    profile.displayName = sanitizedLabel
  }

  return {
    profile,
    profileKey: matchingRule.id,
  }
}

const getConfidenceStatus = (percentage) => {
  console.log('getConfidenceStatus called with:', percentage, typeof percentage)
  
  if (percentage === null || percentage === undefined || Number.isNaN(percentage)) {
    console.log('Returning: Awaiting analysis (null/undefined/NaN)')
    return { status: 'Awaiting analysis', tone: 'neutral' }
  }
  
  const numPercentage = Number(percentage)
  console.log('Processing percentage:', numPercentage)
  
  // Fixed ranges - no gaps between ranges
  if (numPercentage >= 0 && numPercentage <= 25) {
    console.log('Returning: Not confident')
    return { status: 'Not confident', tone: 'error' }
  }
  if (numPercentage > 25 && numPercentage <= 50) {
    console.log('Returning: Satisfactory')
    return { status: 'Satisfactory', tone: 'warning' }
  }
  if (numPercentage > 50 && numPercentage <= 75) {
    console.log('Returning: Somewhat confident')
    return { status: 'Somewhat confident', tone: 'info' }
  }
  if (numPercentage > 75 && numPercentage <= 100) {
    console.log('Returning: Confident')
    return { status: 'Confident', tone: 'success' }
  }
  
  console.log('Returning: Awaiting analysis (fallback) - percentage out of range:', numPercentage)
  return { status: 'Awaiting analysis', tone: 'neutral' }
}

const createPredictionDetails = (rawLabel, confidence) => {
  const labelText = typeof rawLabel === 'string' ? rawLabel : ''
  
  // Convert confidence to number and ensure it's 0-100 range
  let percentage = null
  if (confidence !== null && confidence !== undefined) {
    const numConfidence = typeof confidence === 'number' ? confidence : Number(confidence)
    if (!Number.isNaN(numConfidence)) {
      // If confidence is between 0 and 1, it's a decimal - convert to percentage
      if (numConfidence > 0 && numConfidence <= 1) {
        percentage = Math.round(numConfidence * 100)
      } else {
        percentage = clampPercentage(numConfidence)
      }
    }
  }

  const { profile, profileKey } = buildDynamicProfile(labelText)
  
  // Override status and tone based on confidence percentage - MUST override any rule-based status
  const confidenceInfo = getConfidenceStatus(percentage)
  
  // Create a new profile object to ensure React detects the change
  const updatedProfile = {
    ...profile,
    status: confidenceInfo.status,
    tone: confidenceInfo.tone,
  }

  console.log('=== PREDICTION DETAILS ===')
  console.log('Raw label:', rawLabel)
  console.log('Confidence from server:', confidence, typeof confidence)
  console.log('Calculated percentage:', percentage)
  console.log('Confidence info:', confidenceInfo)
  console.log('Original profile status:', profile.status)
  console.log('Updated profile status:', updatedProfile.status)
  console.log('Full updated profile:', updatedProfile)
  console.log('========================')

  return {
    confidence: percentage,
    rawLabel: labelText,
    label: updatedProfile.headline,
    profile: updatedProfile,
    profileKey,
  }
}

const formatDuration = (seconds) => {
  if (!seconds || !Number.isFinite(seconds)) return '–'
  const minutes = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}

const formatBytes = (bytes) => {
  if (typeof bytes !== 'number' || Number.isNaN(bytes)) return '–'
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.floor(Math.log(bytes) / Math.log(1024))
  const value = bytes / Math.pow(1024, index)
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [currentUser, setCurrentUser] = useState(null)
  const [activeTab, setActiveTab] = useState('Live')
  const [audioFile, setAudioFile] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [audioUrl, setAudioUrl] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState(null)
  const [uploadError, setUploadError] = useState(null)
  const [denoiseEnabled, setDenoiseEnabled] = useState(false)
  const [denoisedAudioUrl, setDenoisedAudioUrl] = useState(null)
  const [denoising, setDenoising] = useState(false)
  const [audioDuration, setAudioDuration] = useState(0)
  const [prediction, setPrediction] = useState(() => createPredictionDetails(null, null))
  const [fileDetails, setFileDetails] = useState(null)
  const [backendConnected, setBackendConnected] = useState(false)
  const [logs, setLogs] = useState([])
  const [probabilities, setProbabilities] = useState({
    A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0, H: 0, I: 0, J: 0
  })
  const fileInputRef = useRef(null)

  // Helper function to add logs
  const addLog = (message, type = 'info', details = null) => {
    setLogs(prev => [
      ...prev,
      {
        message,
        type,
        details,
        timestamp: new Date(),
      }
    ])
  }

  // Test backend connection on mount
  useEffect(() => {
    const testConnection = async () => {
      try {
        console.log('Testing backend connection to:', `${HEROKU_API_URL}/test`)
        addLog('Testing backend connection...', 'analysis')
        const response = await fetch(`${HEROKU_API_URL}/test`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        })
        
        if (response.ok) {
          const data = await response.json()
          console.log('✓ Backend connection successful:', data)
          addLog('Backend connection established', 'success')
          setBackendConnected(true)
        } else {
          console.error('✗ Backend connection failed:', response.status, response.statusText)
          addLog('Backend connection failed', 'error', `Status: ${response.status}`)
          setBackendConnected(false)
        }
      } catch (error) {
        console.error('✗ Backend connection error:', error)
        addLog('Backend connection error', 'error', error.message)
        setBackendConnected(false)
      }
    }
    
    testConnection()
  }, [])

  const uploadFileToServer = async (file) => {
    setUploading(true)
    setUploadStatus('Processing audio sample...')
    setUploadError(null)
    addLog(`Uploading file: ${file.name}`, 'upload', `Size: ${(file.size / 1024).toFixed(2)} KB`)

    try {
      const formData = new FormData()
      formData.append('audio', file)

      console.log('Uploading to:', `${HEROKU_API_URL}/upload`)
      const response = await fetch(`${HEROKU_API_URL}/upload`, {
        method: 'POST',
        body: formData,
      })
      console.log('Upload response status:', response.status, response.statusText)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Upload failed' }))
        throw new Error(errorData.error || `Upload failed with status ${response.status}`)
      }

      const data = await response.json()
      setUploadStatus('Analysis complete')
      console.log('Upload response:', data)
      addLog('Audio analysis complete', 'analysis', `Duration: ${formatDuration(data.duration || 0)}`)
      
      // Update prediction if available
      if (data.prediction) {
        console.log('Received prediction from server:', data.prediction)
        const newPrediction = createPredictionDetails(data.prediction.label, data.prediction.confidence)
        setPrediction(newPrediction)
        addLog(`Detection: ${data.prediction.label}`, 'success', `Confidence: ${Math.round(data.prediction.confidence * 100)}%`)
        
        // Update probabilities for all drones A-J
        const newProbs = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0, H: 0, I: 0, J: 0 }
        
        // If backend provides probabilities for all classes, use them
        if (data.prediction.probabilities) {
          console.log('Received probabilities from backend:', data.prediction.probabilities)
          // Map model labels to drone letters A-J
          // Handle both cases: labels might be "A", "B", "C", etc. or "drone_A", "drone_B", etc.
          Object.entries(data.prediction.probabilities).forEach(([label, prob]) => {
            // Extract drone letter from label (handles "A", "drone_A", "Drone A", etc.)
            const labelUpper = label.toUpperCase().trim()
            let droneLetter = null
            
            // Direct match (e.g., "A", "B", "C")
            if (labelUpper.length === 1 && labelUpper >= 'A' && labelUpper <= 'J') {
              droneLetter = labelUpper
            }
            // Pattern match (e.g., "DRONE_A", "DRONE A", "DRONE-A")
            else if (labelUpper.includes('DRONE')) {
              const match = labelUpper.match(/[A-J]/)
              if (match) droneLetter = match[0]
            }
            // Try to extract single letter from label
            else {
              const match = labelUpper.match(/[A-J]/)
              if (match) droneLetter = match[0]
            }
            
            if (droneLetter && droneLetter >= 'A' && droneLetter <= 'J') {
              newProbs[droneLetter] = Math.round(prob)
            }
          })
        } else {
          // Fallback: use the top prediction if probabilities not available
          const droneIndex = data.prediction.label.charCodeAt(0) - 65
          if (droneIndex >= 0 && droneIndex < 10) {
            const droneLetter = String.fromCharCode(65 + droneIndex)
            newProbs[droneLetter] = Math.round(data.prediction.confidence)
          }
        }
        
        console.log('Setting probabilities:', newProbs)
        setProbabilities(newProbs)
      } else {
        setPrediction(createPredictionDetails(null, null))
        setProbabilities({ A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0, H: 0, I: 0, J: 0 })
        addLog('No drone detected', 'warning', 'Ambient or unknown audio')
      }

      setFileDetails((prev) => ({
        ...(prev || {}),
        serverFilename: data.saved_as,
        uploadedAt: data.timestamp,
        wavPath: data.wav_path,
      }))
    } catch (error) {
      console.error('Upload error:', error)
      setUploadError(error.message || 'Failed to upload file. Please try again.')
      setUploadStatus(null)
      addLog('Upload failed', 'error', error.message)
    } finally {
      setUploading(false)
    }
  }

  const handleFileSelect = (file) => {
    if (file) {
      const allowedExtensions = ['.wav', '.mp3', '.m4a', '.aac', '.ogg', '.flac', '.mpeg']
      const lastDotIndex = file.name.lastIndexOf('.')
      const fileExtension = lastDotIndex > 0 
        ? file.name.toLowerCase().substring(lastDotIndex)
        : ''
      
      const isValidExtension = fileExtension && allowedExtensions.includes(fileExtension)
      const isValidMimeType = file.type.startsWith('audio/') && (
        file.type.includes('mpeg') ||
        file.type.includes('mp3') ||
        file.type.includes('wav') ||
        file.type.includes('wave') ||
        file.type.includes('mp4') ||
        file.type.includes('m4a') ||
        file.type.includes('aac') ||
        file.type.includes('ogg') ||
        file.type.includes('vorbis') ||
        file.type.includes('flac') ||
        file.type === 'audio/x-wav'
      )
      
      if (isValidExtension || isValidMimeType) {
        setAudioFile(file)
        const url = URL.createObjectURL(file)
        setAudioUrl(url)

        setFileDetails({
          name: file.name,
          size: file.size,
          type: file.type,
        })
        
        // Get audio duration
        const audio = new Audio(url)
        audio.addEventListener('loadedmetadata', () => {
          setAudioDuration(audio.duration)
        })
        
        uploadFileToServer(file)
      } else {
        alert('Please select a valid audio file. Supported formats: WAV, MP3, M4A, AAC, OGG, FLAC, MPEG')
      }
    }
  }

  const handleFileInputChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  const denoiseAudio = async (file) => {
    if (!file) return

    setDenoising(true)
    setDenoisedAudioUrl(null)
    addLog('Starting audio denoising', 'denoise')

    try {
      const formData = new FormData()
      formData.append('audio', file)

      console.log('Sending denoise request to:', `${HEROKU_API_URL}/denoise`)
      const response = await fetch(`${HEROKU_API_URL}/denoise`, {
        method: 'POST',
        body: formData,
      })

      console.log('Denoise response status:', response.status, response.statusText)

      if (!response.ok) {
        let errorData
        try {
          errorData = await response.json()
          console.error('Denoise error response:', errorData)
        } catch (e) {
          errorData = { error: `Denoising failed with status ${response.status}` }
          console.error('Failed to parse error response:', e)
        }
        throw new Error(errorData.error || `Denoising failed with status ${response.status}`)
      }

      // Get the response data
      const data = await response.json()
      
      if (data.url) {
        // Fetch the denoised audio file using the URL
        const audioResponse = await fetch(`${HEROKU_API_URL}${data.url}`)
        if (!audioResponse.ok) {
          throw new Error('Failed to fetch denoised audio file')
        }
        const blob = await audioResponse.blob()
        const denoisedUrl = URL.createObjectURL(blob)
        setDenoisedAudioUrl(denoisedUrl)
        console.log('Denoised audio created successfully')
        addLog('Audio denoised successfully', 'success')
      } else {
        throw new Error('No URL returned from denoise endpoint')
      }
    } catch (error) {
      console.error('Denoising error:', error)
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      })
      addLog('Denoising failed', 'error', error.message)
      alert(`Failed to denoise audio: ${error.message || 'Unknown error'}`)
    } finally {
      setDenoising(false)
    }
  }

  const handleDenoiseToggle = async (enabled) => {
    setDenoiseEnabled(enabled)
    
    if (enabled && audioFile) {
      // Call denoise endpoint when enabled
      await denoiseAudio(audioFile)
    } else {
      // Clean up denoised audio URL when disabled
      if (denoisedAudioUrl) {
        URL.revokeObjectURL(denoisedAudioUrl)
        setDenoisedAudioUrl(null)
      }
    }
  }

  const handleRemove = () => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl)
    }
    if (denoisedAudioUrl) {
      URL.revokeObjectURL(denoisedAudioUrl)
    }
    setAudioFile(null)
    setAudioUrl(null)
    setDenoisedAudioUrl(null)
    setDenoiseEnabled(false)
    setUploadStatus(null)
    setUploadError(null)
    setAudioDuration(0)
    setPrediction(createPredictionDetails(null, null))
    setFileDetails(null)
    setProbabilities({ A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0, H: 0, I: 0, J: 0 })
    addLog('Audio file cleared', 'warning')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleLogin = (username) => {
    setCurrentUser(username)
    setIsAuthenticated(true)
  }

  const handleLogout = () => {
    setCurrentUser(null)
    setIsAuthenticated(false)
    handleRemove()
  }

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />
  }

  return (
    <div className="dashboard">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="brand">
            <h1 className="brand-name">WATheDrone</h1>
          </div>
        </div>
        <div className="sidebar-media-players">
          {/* Original Audio Player */}
          <div className="media-player-container">
            <h3 className="media-player-title">Original Audio</h3>
            {audioUrl ? (
              <audio 
                controls 
                src={audioUrl} 
                className="audio-player"
                style={{ width: '100%' }}
              >
                Your browser does not support the audio element.
              </audio>
            ) : (
              <div className="media-player-placeholder">
                <p>No audio file loaded</p>
              </div>
            )}
          </div>

          {/* Denoised Audio Player */}
          <div className="media-player-container">
            <h3 className="media-player-title">Denoised Audio</h3>
            {denoisedAudioUrl ? (
              <audio 
                controls 
                src={denoisedAudioUrl} 
                className="audio-player"
                style={{ width: '100%' }}
              >
                Your browser does not support the audio element.
              </audio>
            ) : denoiseEnabled && denoising ? (
              <div className="media-player-placeholder">
                <p>Processing denoised audio...</p>
              </div>
            ) : denoiseEnabled ? (
              <div className="media-player-placeholder">
                <p>Loading denoised audio...</p>
              </div>
            ) : (
              <div className="media-player-placeholder">
                <p>Enable denoise to play denoised audio</p>
              </div>
            )}
          </div>

          {/* Single Shared Audio Visualizer */}
          <div className="media-player-container visualizer-container">
            <AudioVisualizer 
              audioUrl={denoisedAudioUrl || audioUrl} 
            />
          </div>
        </div>
        <div className="sidebar-footer">
          <div className="user-info">
            <span className="user-name">{currentUser}</span>
            <button className="logout-btn" onClick={handleLogout} aria-label="Logout">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-dashboard">
        {/* Insert Audio Section */}
        <section className="upload-section">
          <div className="section-header">
            <h2 className="section-title">Insert audio</h2>
            <div className="audio-controls">
              <div className="control-group">
                <label className="toggle-label">
                  <span>Denoise</span>
                  <input
                    type="checkbox"
                    checked={denoiseEnabled}
                    onChange={(e) => handleDenoiseToggle(e.target.checked)}
                    disabled={!audioFile || denoising}
                    className="toggle-input"
                  />
                  <span className={`toggle-switch ${denoiseEnabled ? 'active' : ''} ${(!audioFile || denoising) ? 'disabled' : ''}`}>
                    <span className="toggle-slider"></span>
                  </span>
                </label>
              </div>
            </div>
          </div>
        {!audioFile ? (
          <div
            className={`upload-area ${isDragging ? 'dragging' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleClick}
          >
              <p className="upload-text">
                Drag and drop a file or <span className="browse-link">browse</span>
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,.wav,.mp3,.m4a,.aac,.ogg,.flac,.mpeg"
                onChange={handleFileInputChange}
                style={{ display: 'none' }}
              />
          </div>
        ) : (
            <div className="file-info-bar">
              <span className="file-name">{audioFile.name}</span>
              <button className="remove-file-btn" onClick={handleRemove}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
              </button>
            </div>
          )}
          {uploading && (
            <div className="upload-status">
              <div className="status-spinner"></div>
              <span>{uploadStatus || 'Processing audio...'}</span>
            </div>
          )}
          {uploadStatus && !uploading && (
            <div className="upload-status upload-status--success">
              <span className="status-indicator" aria-hidden="true"></span>
              <span>{uploadStatus}</span>
            </div>
          )}
          {uploadError && (
            <div className="upload-error">
              <span>{uploadError}</span>
              <button className="retry-btn" onClick={() => uploadFileToServer(audioFile)}>
                Retry
              </button>
            </div>
          )}
          {audioFile && (
            <div className="audio-meta-grid">
              <div className="meta-item">
                <span className="meta-label">Duration</span>
                <span className="meta-value">{formatDuration(audioDuration)}</span>
              </div>
              <div className="meta-item">
                <span className="meta-label">File Size</span>
                <span className="meta-value">{formatBytes(fileDetails?.size)}</span>
              </div>
              <div className="meta-item">
                <span className="meta-label">Format</span>
                <span className="meta-value">{fileDetails?.type || (fileDetails?.name ? `${fileDetails.name.split('.').pop().toUpperCase()} file` : 'Unknown')}</span>
              </div>
              <div className="meta-item">
                <span className="meta-label">Server ID</span>
                <span className="meta-value">{fileDetails?.serverFilename || 'pending'}</span>
              </div>
            </div>
          )}
        </section>

        {/* Content Grid */}
        <div className="content-grid">
          {/* Left Column */}
          <div className="left-column">
            {/* Waveform Section */}
            <section className="visualization-section">
              <div className="section-header">
                <h2 className="section-title">Waveform</h2>
              </div>
              {audioUrl ? (
                <div className="waveform-group">
                  <Waveform audioUrl={audioUrl} label="Raw" />
                  {denoiseEnabled ? (
                    denoisedAudioUrl ? (
                      <Waveform audioUrl={denoisedAudioUrl} label="Denoised" isDenoised={true} />
                    ) : (
                      <div className="waveform-container">
                        <div className="waveform-header">
                          <span className="waveform-label">Denoised</span>
                        </div>
                        <div className="waveform-placeholder">
                          <p>{denoising ? 'Processing denoised audio...' : 'Loading denoised audio...'}</p>
                        </div>
                      </div>
                    )
                  ) : (
                    <div className="waveform-container">
                      <div className="waveform-header">
                        <span className="waveform-label">Denoised</span>
                      </div>
                      <div className="waveform-placeholder">
                        <p>Enable denoise to view denoised waveform</p>
                      </div>
                      <div className="waveform-spectrogram">
                        <div className="waveform-spectrogram-header">Spectrogram</div>
                        <div className="waveform-spectrogram-placeholder">
                          <p>Enable denoise to view denoised spectrogram</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="placeholder-box">
                  <p>No audio file loaded</p>
              </div>
            )}
            </section>
          </div>

          {/* Right Column - New Layout */}
          <div className="right-column">
            {/* Decahedron Section */}
            <section className="decahedron-section">
              <Decahedron probabilities={probabilities} />
            </section>

            {/* Predictions Panel Below */}
            <section className="predictions-section">
              <PredictionsPanel 
                prediction={prediction}
                isLoading={uploading}
              />
            </section>
          </div>
        </div>
      </main>
    </div>
  )
}

export default App
