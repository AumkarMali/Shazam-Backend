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

  useEffect(() => {
    if (!audioUrl || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    
    // Find any playing audio element in the sidebar
    const sidebar = containerRef.current?.closest('.sidebar-media-players')
    const audioElements = sidebar?.querySelectorAll('audio') || []
    
    // Find the currently playing audio, or use the one matching our audioUrl
    let audioElement = null
    for (const audio of audioElements) {
      if (!audio.paused) {
        audioElement = audio
        break
      }
    }
    // If none playing, use the one matching our audioUrl (prefer denoised if available)
    if (!audioElement && audioElements.length > 0) {
      // Try to match by URL
      const urlToMatch = audioUrl
      audioElement = Array.from(audioElements).find(a => {
        try {
          return a.src && (a.src.includes(urlToMatch) || urlToMatch.includes(a.src.split('/').pop()))
        } catch {
          return false
        }
      }) || audioElements[audioElements.length - 1] // Use last one (denoised) if available
    }
    
    if (!audioElement) return

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

    // Setup Web Audio API
    // Check if this audio element is already connected
    if (connectedAudioElements.has(audioElement)) {
      // Reuse existing connection
      const existing = connectedAudioElements.get(audioElement)
      audioContextRef.current = existing.context
      analyserRef.current = existing.analyser
      dataArrayRef.current = existing.dataArray
    } else {
      // Create new connection
      const audioContext = new (window.AudioContext || window.webkitAudioContext)()
      const analyser = audioContext.createAnalyser()
      
      try {
        const source = audioContext.createMediaElementSource(audioElement)
        // Connect source to analyser for visualization
        source.connect(analyser)
        // CRITICAL: Connect source directly to destination to maintain audio playback
        source.connect(audioContext.destination)
        sourceRef.current = source
        
        // Store connection info
        connectedAudioElements.set(audioElement, {
          context: audioContext,
          analyser: analyser,
          source: source,
          dataArray: null // Will be set below
        })
        
        audioContextRef.current = audioContext
        analyserRef.current = analyser
      } catch (error) {
        // Audio element might already be connected - try to use existing analyser
        console.warn('Audio element connection issue:', error)
        // Try to find existing connection from another visualizer
        const existing = Array.from(connectedAudioElements.values()).find(
          conn => conn.context && conn.context.state !== 'closed'
        )
        if (existing) {
          audioContextRef.current = existing.context
          analyserRef.current = existing.analyser
        } else {
          return // Can't visualize without connection
        }
      }
    }

    // Set up analyser if not already done
    if (analyserRef.current) {
      analyserRef.current.fftSize = 256
    }
    const bufferLength = analyserRef.current ? analyserRef.current.frequencyBinCount : 256
    const dataArray = new Uint8Array(bufferLength)
    dataArrayRef.current = dataArray
    
    // Update stored dataArray if we have a stored connection
    const stored = connectedAudioElements.get(audioElement)
    if (stored) {
      stored.dataArray = dataArray
    }

    let isPlaying = false

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

      if (isPlaying) {
        animationFrameRef.current = requestAnimationFrame(draw)
      }
    }

    // Start drawing when audio plays
    const handlePlay = () => {
      isPlaying = true
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume()
      }
      draw()
    }

      // Stop drawing when audio pauses
      const handlePause = () => {
        isPlaying = false
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current)
        }
        // Clear canvas
        ctx.fillStyle = 'rgba(15, 23, 42, 0.95)'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }

    audioElement.addEventListener('play', handlePlay)
    audioElement.addEventListener('pause', handlePause)
    audioElement.addEventListener('ended', handlePause)

    // Initial draw
    draw()

    // Cleanup
    return () => {
      audioElement.removeEventListener('play', handlePlay)
      audioElement.removeEventListener('pause', handlePause)
      audioElement.removeEventListener('ended', handlePause)
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

