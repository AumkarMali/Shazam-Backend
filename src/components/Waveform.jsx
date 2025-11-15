import { useEffect, useRef, useState } from 'react'
import './Waveform.css'
import { renderSpectrogramToCanvas } from '../utils/renderSpectrogram'

function Waveform({ audioUrl, label, isDenoised = false }) {
  const canvasRef = useRef(null)
  const spectrogramCanvasRef = useRef(null)
  const audioRef = useRef(null)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    if (!audioUrl) {
      // Clear canvas if no audio
      const canvas = canvasRef.current
      if (canvas) {
        const ctx = canvas.getContext('2d')
        canvas.width = 800
        canvas.height = 300
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }
      const spectrogramCanvas = spectrogramCanvasRef.current
      if (spectrogramCanvas) {
        const spectroCtx = spectrogramCanvas.getContext('2d')
        spectrogramCanvas.width = 800
          spectrogramCanvas.height = 220
        spectroCtx.fillStyle = '#0b1120'
        spectroCtx.fillRect(0, 0, spectrogramCanvas.width, spectrogramCanvas.height)
      }
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return

    // Initialize canvas dimensions
    canvas.width = 800
    canvas.height = 300
    const ctx = canvas.getContext('2d')
    
    // Cleanup previous audio
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
    }
    
    const audio = new Audio(audioUrl)
    audioRef.current = audio

    // Generate waveform when audio loads
    const generateWaveform = async () => {
      try {
        console.log('Generating waveform for:', audioUrl)
        
        const response = await fetch(audioUrl)
        if (!response.ok) throw new Error('Failed to fetch audio')

        const arrayBuffer = await response.arrayBuffer()
        let audioContext
        try {
          audioContext = new (window.AudioContext || window.webkitAudioContext)()
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

          const sampleRate = audioBuffer.sampleRate
          const duration = audioBuffer.duration || 0
          setDuration(duration)

          console.log('Audio loaded:', { sampleRate, duration, channels: audioBuffer.numberOfChannels })

          if (duration === 0 || !isFinite(duration)) {
            throw new Error('Invalid audio duration')
          }

          // Adjust canvas width based on duration
          canvas.width = Math.max(800, Math.min(2000, Math.floor(duration * 150)))
          canvas.height = 300

          const channelData = audioBuffer.getChannelData(0)
          const numSamples = channelData.length

          console.log('Audio samples:', numSamples)

          if (numSamples === 0) {
            throw new Error('Empty audio buffer')
          }

          // Downsample for visualization - don't draw every sample
          const samplesPerPixel = Math.max(1, Math.floor(numSamples / canvas.width))
          const numPoints = Math.floor(numSamples / samplesPerPixel)

          console.log('Waveform params:', { samplesPerPixel, numPoints, canvasWidth: canvas.width })

          // White background
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, canvas.width, canvas.height)

          // Calculate range and amplitude first (needed for grid)
          // Find actual min/max for auto-scaling
          let min = 0
          let max = 0
          for (let i = 0; i < numSamples; i++) {
            min = Math.min(min, channelData[i])
            max = Math.max(max, channelData[i])
          }

          // Use actual min/max to set the Y-axis range
          // Add padding and apply zoom factor to make waves fatter
          const padding = 0.1
          const zoomFactor = 0.7 // Zoom in by 30% to make waves fatter (smaller range = more zoom)
          const actualMin = min
          const actualMax = max

          // Calculate range that includes both min and max with padding
          const rangeSize = Math.max(Math.abs(actualMin), Math.abs(actualMax))

          // If range is very small, use a minimum range to avoid over-zooming
          const minRange = 0.01
          // Apply zoom factor to make waves appear fatter (smaller display range = more vertical stretch)
          const paddedRange = Math.max(rangeSize * (1 + padding) * zoomFactor, minRange)

          // Set Y-axis range to match actual waveform with padding (symmetric around 0)
          const yAxisMin = -paddedRange
          const yAxisMax = paddedRange
          const displayRange = paddedRange // Half-range for calculations
          const centerY = canvas.height / 2
          const amplitude = (canvas.height * 0.95) / 2 // Use 95% of height for amplitude (maximum vertical stretch)
          const leftMargin = 90 // Increased space to separate waveform from "Amplitude" label
          const rightMargin = 20 // Space at the end so waveform isn't cut off
          const bottomMargin = 30 // Space for X-axis labels

          // Draw grid lines
          ctx.strokeStyle = '#e8e8e8'
          ctx.lineWidth = 1

          // Calculate appropriate step size for Y-axis markers based on range
          // Use larger steps to reduce number of labels
          let stepSize = 0.05
          if (displayRange > 0.5) {
            stepSize = 0.1
          } else if (displayRange > 0.2) {
            stepSize = 0.05
          } else if (displayRange > 0.1) {
            stepSize = 0.02
          } else if (displayRange > 0.05) {
            stepSize = 0.01
          } else {
            stepSize = 0.005
          }

          // Generate Y-axis markers based on actual range
          const majorYMarkers = []
          for (let val = yAxisMax; val >= yAxisMin; val -= stepSize) {
            const rounded = Math.round(val / stepSize) * stepSize
            majorYMarkers.push(Math.round(rounded * 1000) / 1000) // Round to avoid floating point issues
          }

          // Draw grid lines
          majorYMarkers.forEach(value => {
            // Since range is symmetric around 0, map value directly
            const y = centerY - (value / displayRange) * amplitude
            if (y >= 0 && y <= canvas.height - bottomMargin) {
              ctx.beginPath()
              ctx.moveTo(leftMargin, y)
              ctx.lineTo(canvas.width - rightMargin, y)
              ctx.stroke()
            }
          })

          // Vertical grid lines (time) - more lines for better reference
          const numTimeMarkers = Math.min(12, Math.ceil(duration) + 1)
          for (let i = 0; i <= numTimeMarkers; i++) {
            const x = leftMargin + ((i / numTimeMarkers) * (canvas.width - leftMargin - rightMargin))
            ctx.beginPath()
            ctx.moveTo(x, 0)
            ctx.lineTo(x, canvas.height - bottomMargin)
            ctx.stroke()
          }

          // Draw center line (amplitude = 0) with different color
          // Since range is symmetric, 0 is always at centerY
          ctx.strokeStyle = '#cccccc'
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.moveTo(leftMargin, centerY)
          ctx.lineTo(canvas.width - rightMargin, centerY)
          ctx.stroke()

          // Draw waveform
          ctx.strokeStyle = isDenoised ? '#a855f7' : '#6366f1' // Purple for denoised, blue for raw
          ctx.lineWidth = 2
          ctx.beginPath()

          for (let i = 0; i < numPoints; i++) {
            const sampleIdx = i * samplesPerPixel
            if (sampleIdx >= numSamples) break

            // Average samples for this pixel column (smoothing)
            let sum = 0
            let count = 0
            for (let j = 0; j < samplesPerPixel && (sampleIdx + j) < numSamples; j++) {
              sum += channelData[sampleIdx + j]
              count++
            }
            const avgValue = count > 0 ? sum / count : 0

            // Convert to y position using actual amplitude range
            // Scale the value to fit the actual Y-axis range (symmetric around 0)
            const normalized = avgValue / displayRange
            const y = centerY - (normalized * amplitude)
            const x = leftMargin + ((i / numPoints) * (canvas.width - leftMargin - rightMargin))

            if (i === 0) {
              ctx.moveTo(x, y)
            } else {
              ctx.lineTo(x, y)
            }
          }

          ctx.stroke()

          // Draw axis labels and markers
          ctx.fillStyle = '#666666'
          ctx.font = '11px Arial'

          // Y-axis label - positioned further left with more spacing
          ctx.save()
          ctx.translate(25, canvas.height / 2)
          ctx.rotate(-Math.PI / 2)
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.font = '12px Arial' // Slightly larger font for better readability
          ctx.fillText('Amplitude', 0, 0)
          ctx.restore()

          // Y-axis markers and labels (amplitude)
          ctx.textAlign = 'right'
          ctx.textBaseline = 'middle'
          // Show labels for all major markers
          majorYMarkers.forEach(value => {
            // Since range is symmetric around 0, map value directly
            const y = centerY - (value / displayRange) * amplitude
            if (y >= 0 && y <= canvas.height - bottomMargin) {
              // Draw tick mark - positioned further right to give label space
              ctx.strokeStyle = '#cccccc'
              ctx.lineWidth = 1
              ctx.beginPath()
              ctx.moveTo(leftMargin - 20, y)
              ctx.lineTo(leftMargin - 10, y)
              ctx.stroke()

              // Draw label with appropriate precision based on step size
              ctx.fillStyle = '#666666'
              ctx.font = '11px Arial'
              // Determine decimal places based on step size
              let decimals = 2
              if (stepSize >= 0.1) decimals = 1
              else if (stepSize >= 0.01) decimals = 2
              else if (stepSize >= 0.001) decimals = 3
              else decimals = 4
              ctx.fillText(value.toFixed(decimals), leftMargin - 25, y)
            }
          })

          // X-axis label
          ctx.textAlign = 'center'
          ctx.textBaseline = 'top'
          ctx.fillText('Time (seconds)', canvas.width / 2, canvas.height - 10)

          // X-axis markers and labels (time)
          // Reuse numTimeMarkers declared earlier for grid lines
          for (let i = 0; i <= numTimeMarkers; i++) {
            const time = (i / numTimeMarkers) * duration
            const x = leftMargin + ((i / numTimeMarkers) * (canvas.width - leftMargin - rightMargin))

            if (x >= leftMargin && x <= canvas.width - rightMargin) {
              // Draw tick mark
              ctx.strokeStyle = '#cccccc'
              ctx.lineWidth = 1
              ctx.beginPath()
              ctx.moveTo(x, canvas.height - bottomMargin)
              ctx.lineTo(x, canvas.height - (bottomMargin - 10))
              ctx.stroke()

              // Draw label
              ctx.fillStyle = '#666666'
              ctx.fillText(time.toFixed(1), x, canvas.height - (bottomMargin - 12))
            }
          }

          console.log('Waveform rendered!')

          if (spectrogramCanvasRef.current) {
            renderSpectrogramToCanvas(spectrogramCanvasRef.current, audioBuffer, {
              isDenoised,
              minDecibels: -95,
              maxDecibels: -8,
              minWidth: Math.max(960, Math.min(2400, Math.floor(duration * 180))),
              height: 240,
              background: '#04070f',
              maxFrequency: audioBuffer.sampleRate / 2,
            })
          }
        } finally {
          if (audioContext) {
            audioContext.close()
          }
        }
      } catch (error) {
        console.error('Error generating waveform:', error)
        // Fallback visualization
        const dur = audio.duration || 0
        setDuration(dur)
        canvas.width = Math.max(800, Math.floor(dur * 150))
        canvas.height = 300
        
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        
        // Draw simple test line
        ctx.strokeStyle = isDenoised ? '#a855f7' : '#6366f1'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(0, canvas.height / 2)
        ctx.lineTo(canvas.width, canvas.height / 2)
        ctx.stroke()

        const spectrogramCanvas = spectrogramCanvasRef.current
        if (spectrogramCanvas) {
          const spectroCtx = spectrogramCanvas.getContext('2d')
          spectrogramCanvas.width = Math.max(720, Math.floor(dur * 120) || 720)
          spectrogramCanvas.height = 240
          spectroCtx.fillStyle = '#0b1120'
          spectroCtx.fillRect(0, 0, spectrogramCanvas.width, spectrogramCanvas.height)
          spectroCtx.fillStyle = 'rgba(148, 163, 184, 0.75)'
          spectroCtx.font = '12px Inter, system-ui, sans-serif'
          spectroCtx.textAlign = 'center'
          spectroCtx.fillText('Unable to render spectrogram', spectrogramCanvas.width / 2, 110)
        }
      }
    }

    audio.addEventListener('loadedmetadata', () => {
      const dur = audio.duration || 0
      setDuration(dur)
      if (dur > 0 && isFinite(dur)) {
        generateWaveform().catch((error) => {
          console.error('Failed to generate waveform:', error)
          // Ensure canvas is visible even on error
          const ctx = canvas.getContext('2d')
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
        })
      } else {
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }
    })

    audio.addEventListener('error', (e) => {
      console.error('Audio error:', e)
      setDuration(0)
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      const spectrogramCanvas = spectrogramCanvasRef.current
      if (spectrogramCanvas) {
        const spectroCtx = spectrogramCanvas.getContext('2d')
        spectrogramCanvas.width = 800
        spectrogramCanvas.height = 220
        spectroCtx.fillStyle = '#0b1120'
        spectroCtx.fillRect(0, 0, spectrogramCanvas.width, spectrogramCanvas.height)
      }
    })

    // Also try to generate immediately if audio is already loaded
    if (audio.readyState >= 2) {
      const dur = audio.duration || 0
      setDuration(dur)
      if (dur > 0 && isFinite(dur)) {
        generateWaveform().catch((error) => {
          console.error('Failed to generate waveform:', error)
        })
      }
    }

    return () => {
      if (audio) {
        audio.pause()
        audio.src = ''
      }
    }
  }, [audioUrl, isDenoised])

  return (
    <div className="waveform-container">
      <div className="waveform-header">
        <span className="waveform-label">{label}</span>
      </div>
      <div className="waveform-visual">
        <canvas ref={canvasRef} className="waveform-canvas" style={{ background: '#ffffff' }} />
      </div>
      <div className="waveform-spectrogram">
        <div className="waveform-spectrogram-header">Spectrogram</div>
        <canvas
          ref={spectrogramCanvasRef}
          className="waveform-spectrogram-canvas"
          aria-label="Spectrogram visualization"
        />
      </div>
    </div>
  )
}

export default Waveform
