import { useEffect, useRef } from 'react'
import './AudioVisualizer.css'

// Global map to track which audio elements are already connected
const connectedAudioElements = new WeakMap()

function AudioVisualizer({ audioUrl }) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const animationFrameRef = useRef(null)
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const dataArrayRef = useRef(null)
  const sourceRef = useRef(null)
  const activeAudioRef = useRef(null)
  const isAnimatingRef = useRef(false)

  useEffect(() => {
    if (!audioUrl || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    
    const sidebar = containerRef.current?.closest('.sidebar-media-players')
    const audioElements = Array.from(sidebar?.querySelectorAll('audio') || [])
    if (audioElements.length === 0) return undefined

    // Set canvas size to match container (rectangular)
    const updateCanvasSize = () => {
      const container = containerRef.current
      if (container) {
        canvas.width = container.offsetWidth || 200
        canvas.height = container.offsetHeight || 150
      } else {
        canvas.width = 200
        canvas.height = 150
      }
    }
    updateCanvasSize()
    
    // Resize observer to handle container size changes
    let resizeObserver = null
    if (containerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        updateCanvasSize()
      })
      resizeObserver.observe(containerRef.current)
    }

    const ensureConnection = (audioElement) => {
      if (connectedAudioElements.has(audioElement)) {
        return connectedAudioElements.get(audioElement)
      }
      const audioContext = new (window.AudioContext || window.webkitAudioContext)()
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256

      try {
        const source = audioContext.createMediaElementSource(audioElement)
        source.connect(analyser)
        source.connect(audioContext.destination)
        sourceRef.current = source

        const dataArray = new Uint8Array(analyser.frequencyBinCount)
        const entry = { context: audioContext, analyser, source, dataArray }
        connectedAudioElements.set(audioElement, entry)
        return entry
      } catch (error) {
        console.warn('Audio element connection issue:', error)
        return null
      }
    }

    // Draw function - volume bar that goes up with volume
    const draw = () => {
      if (!analyserRef.current || !dataArrayRef.current) return

      analyserRef.current.getByteFrequencyData(dataArrayRef.current)

      // Clear canvas
      ctx.fillStyle = 'rgba(15, 23, 42, 0.95)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Calculate average volume from frequency data
      let sum = 0
      for (let i = 0; i < dataArrayRef.current.length; i++) {
        sum += dataArrayRef.current[i]
      }
      const average = sum / dataArrayRef.current.length
      const volume = average / 255 // Normalize to 0-1

      // Calculate bar height based on volume
      const barHeight = volume * canvas.height * 0.9 // 90% of canvas height max
      const barWidth = canvas.width * 0.6 // 60% of canvas width
      const barX = (canvas.width - barWidth) / 2 // Center the bar
      const barY = canvas.height - barHeight // Start from bottom

      // Create gradient from bottom (blue) to top (purple)
      const gradient = ctx.createLinearGradient(
        barX,
        canvas.height,
        barX,
        barY
      )
      gradient.addColorStop(0, 'hsla(240, 70%, 50%, 0.8)') // Blue at bottom
      gradient.addColorStop(0.5, 'hsla(270, 80%, 55%, 0.9)') // Purple in middle
      gradient.addColorStop(1, 'hsla(300, 90%, 60%, 1)') // Bright purple at top

      // Draw the volume bar
      ctx.fillStyle = gradient
      ctx.fillRect(barX, barY, barWidth, barHeight)

      // Add glow effect
      if (barHeight > 5) {
        ctx.shadowBlur = 15
        ctx.shadowColor = 'hsla(270, 90%, 60%, 0.6)'
        ctx.fillRect(barX, barY, barWidth, barHeight)
        ctx.shadowBlur = 0
      }

      if (isAnimatingRef.current) {
        animationFrameRef.current = requestAnimationFrame(draw)
      }
    }

    const startVisualization = (audioElement) => {
      const entry = ensureConnection(audioElement)
      if (!entry) return

      if (activeAudioRef.current && activeAudioRef.current !== audioElement) {
        stopVisualization(activeAudioRef.current, true)
      }

      activeAudioRef.current = audioElement
      audioContextRef.current = entry.context
      analyserRef.current = entry.analyser
      dataArrayRef.current = entry.dataArray

      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume()
      }

      if (!isAnimatingRef.current) {
        isAnimatingRef.current = true
        draw()
      }
    }

    const stopVisualization = (audioElement, force = false) => {
      if (!force && activeAudioRef.current !== audioElement) return
      isAnimatingRef.current = false
      activeAudioRef.current = null
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      ctx.fillStyle = 'rgba(15, 23, 42, 0.95)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }

    const listeners = audioElements.map((audioElement) => {
      const handlePlay = () => startVisualization(audioElement)
      const handlePause = () => stopVisualization(audioElement)
      const handleEnded = () => stopVisualization(audioElement)

      audioElement.addEventListener('play', handlePlay)
      audioElement.addEventListener('pause', handlePause)
      audioElement.addEventListener('ended', handleEnded)

      if (!audioElement.paused && !audioElement.ended) {
        handlePlay()
      }

      return { audioElement, handlePlay, handlePause, handleEnded }
    })

    if (!isAnimatingRef.current) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.95)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }

    // Cleanup
    return () => {
      listeners.forEach(({ audioElement, handlePlay, handlePause, handleEnded }) => {
        audioElement.removeEventListener('play', handlePlay)
        audioElement.removeEventListener('pause', handlePause)
        audioElement.removeEventListener('ended', handleEnded)
      })
      if (activeAudioRef.current && !sidebar?.contains(activeAudioRef.current)) {
        stopVisualization(activeAudioRef.current, true)
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      // Don't disconnect source or close context - they might be used by other visualizers
      // Only clean up animation and resize observer
      if (resizeObserver) {
        resizeObserver.disconnect()
      }
      // Note: We don't disconnect the source or close the context here
      // because other visualizers might be using the same audio element
    }
  }, [audioUrl])

  return (
    <div ref={containerRef} className="audio-visualizer-container">
      <canvas ref={canvasRef} className="audio-visualizer" />
    </div>
  )
}

export default AudioVisualizer

