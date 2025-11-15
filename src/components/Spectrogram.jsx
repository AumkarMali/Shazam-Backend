import { useEffect, useRef, useState } from 'react'
import './Spectrogram.css'
import { renderSpectrogramToCanvas } from '../utils/renderSpectrogram'

function Spectrogram({ audioUrl, label, isDenoised = false }) {
  const canvasRef = useRef(null)
  const axesRef = useRef(null)
  const [duration, setDuration] = useState(0)
  const [maxFrequency, setMaxFrequency] = useState(0)
  const [axesSize, setAxesSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    if (!audioUrl) {
      // Clear canvas if no audio
      const canvas = canvasRef.current
      if (canvas) {
        const ctx = canvas.getContext('2d')
        canvas.width = 1200
        canvas.height = 440
        ctx.fillStyle = '#0b1120'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }
      setDuration(0)
      setMaxFrequency(0)
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return

    let cancelled = false
    const controller = new AbortController()

    const render = async () => {
      let audioContext
      try {
        const response = await fetch(audioUrl, { signal: controller.signal })
        if (!response.ok) throw new Error('Failed to fetch audio')
        const arrayBuffer = await response.arrayBuffer()
        if (cancelled) return
        audioContext = new (window.AudioContext || window.webkitAudioContext)()
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
        if (cancelled) {
          audioContext.close()
          return
        }

        setDuration(audioBuffer.duration || 0)
        setMaxFrequency(audioBuffer.sampleRate ? audioBuffer.sampleRate / 2 : 0)
        renderSpectrogramToCanvas(canvas, audioBuffer, {
          isDenoised,
          minDecibels: -95,
          maxDecibels: -8,
          minWidth: Math.max(1200, Math.min(3600, Math.floor((audioBuffer.duration || 0) * 220))),
          height: 460,
          background: '#04070f',
          maxFrequency: audioBuffer.sampleRate / 2,
        })
      } catch (error) {
        if (error.name === 'AbortError') return
        console.error('Error generating spectrogram:', error)
        setDuration(0)
        setMaxFrequency(0)
        const ctx = canvas.getContext('2d')
        canvas.width = 1200
        canvas.height = 440
        ctx.fillStyle = '#0b1120'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.fillStyle = 'rgba(148, 163, 184, 0.75)'
        ctx.font = '14px Inter, system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('Unable to render spectrogram', canvas.width / 2, canvas.height / 2)
      } finally {
        if (audioContext) {
          audioContext.close()
        }
      }
    }

    render()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [audioUrl, isDenoised])

  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0
  const hasFrequencyData = Number.isFinite(maxFrequency) && maxFrequency > 0
  const showAxes = safeDuration > 0 && hasFrequencyData
  const baseDuration = safeDuration || 1
  const topFrequency = hasFrequencyData ? maxFrequency : 22000

  useEffect(() => {
    if (!showAxes) {
      setAxesSize({ width: 0, height: 0 })
      return undefined
    }

    const target = axesRef.current
    if (!target) return undefined

    const applySize = (width, height) => {
      setAxesSize((prev) =>
        prev.width === width && prev.height === height ? prev : { width, height },
      )
    }

    const updateFromRect = () => {
      const rect = target.getBoundingClientRect()
      applySize(rect.width, rect.height)
    }

    if (typeof ResizeObserver === 'undefined') {
      updateFromRect()
      if (typeof window !== 'undefined') {
        window.addEventListener('resize', updateFromRect)
        return () => window.removeEventListener('resize', updateFromRect)
      }
      return undefined
    }

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      const { width, height } = entry.contentRect
      applySize(width, height)
    })
    observer.observe(target)

    return () => observer.disconnect()
  }, [showAxes])

  const formatFrequency = (hz) => {
    if (!Number.isFinite(hz) || hz <= 0) return '0 Hz'
    if (hz >= 1000) {
      const value = hz / 1000
      return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} kHz`
    }
    return `${Math.round(hz)} Hz`
  }

  const formatTime = (seconds) => {
    if (!Number.isFinite(seconds) || seconds < 0) return '0.0s'
    const precision = baseDuration >= 10 ? 0 : 1
    return `${seconds.toFixed(precision)}s`
  }

  const timeTicks = showAxes
    ? [0, 0.25, 0.5, 0.75, 1].map((fraction) => ({
        fraction,
        value: baseDuration * fraction,
      }))
    : []

  const freqTicks = showAxes
    ? [1, 0.5, 0].map((ratio) => ({
        ratio,
        value: topFrequency * ratio,
      }))
    : []

  return (
    <div className="spectrogram-container">
      <div className="spectrogram-header">
        <span className="spectrogram-label">
          {label}
          {isDenoised ? ' · Denoised preview' : ''}
        </span>
      </div>
      <div className="spectrogram-wrapper">
        <canvas ref={canvasRef} className="spectrogram-canvas" />
        {showAxes && (
          <div className="spectrogram-axes" aria-hidden="true" ref={axesRef}>
            {axesSize.width > 0 && axesSize.height > 0 && (
              <svg viewBox={`0 0 ${axesSize.width} ${axesSize.height}`} preserveAspectRatio="none">
                <rect
                  className="spectrogram-frame"
                  x="0.5"
                  y="0.5"
                  width={Math.max(0, axesSize.width - 1)}
                  height={Math.max(0, axesSize.height - 1)}
                  rx="8"
                  ry="8"
                />
                {timeTicks
                  .filter((tick) => tick.fraction > 0 && tick.fraction < 1)
                  .map((tick) => {
                    const x = tick.fraction * axesSize.width
                    return (
                      <g key={`time-line-${tick.fraction}`}>
                        <line x1={x} y1={axesSize.height} x2={x} y2={axesSize.height - 18} />
                      </g>
                    )
                  })}
                {freqTicks
                  .filter((tick) => tick.ratio > 0 && tick.ratio < 1)
                  .map((tick) => {
                    const y = axesSize.height - tick.ratio * axesSize.height
                    return <line key={`freq-line-${tick.ratio}`} x1="0" y1={y} x2={axesSize.width} y2={y} />
                  })}
                {freqTicks.map((tick) => {
                  const y = axesSize.height - tick.ratio * axesSize.height - 6
                  return (
                    <text key={`freq-label-${tick.ratio}`} x="10" y={Math.max(14, y)} textAnchor="start">
                      {formatFrequency(tick.value)}
                    </text>
                  )
                })}
                {timeTicks.map((tick) => {
                  const x = tick.fraction * axesSize.width
                  const anchor = tick.fraction === 0 ? 'start' : tick.fraction === 1 ? 'end' : 'middle'
                  const dx = tick.fraction === 0 ? 12 : tick.fraction === 1 ? -12 : 0
                  return (
                    <text
                      key={`time-label-${tick.fraction}`}
                      x={x + dx}
                      y={Math.max(axesSize.height - 10, 12)}
                      textAnchor={anchor}
                    >
                      {formatTime(tick.value)}
                    </text>
                  )
                })}
              </svg>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default Spectrogram
