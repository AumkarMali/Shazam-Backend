import { useEffect, useRef } from 'react'
import './AudioVisualizer.css'

// Global map to track which audio elements are already connected
const connectedAudioElements = new WeakMap()
const BAR_COUNT = 24

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
  const barLevelsRef = useRef(new Array(BAR_COUNT).fill(0))

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

    const repaintBackground = () => {
      const backgroundGradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
      backgroundGradient.addColorStop(0, 'rgba(5, 7, 17, 0.96)')
      backgroundGradient.addColorStop(1, 'rgba(4, 8, 20, 0.99)')
      ctx.fillStyle = backgroundGradient
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      ctx.save()
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.04)'
      ctx.lineWidth = 1
      for (let y = 0; y <= canvas.height; y += canvas.height / 5) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(canvas.width, y)
        ctx.stroke()
      }
      for (let x = 0; x <= canvas.width; x += canvas.width / 8) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, canvas.height)
        ctx.stroke()
      }
      ctx.restore()
    }

    const drawRoundedRect = (x, y, width, height, radius) => {
      const clampedRadius = Math.min(radius, width / 2, height / 2)
      ctx.beginPath()
      ctx.moveTo(x + clampedRadius, y)
      ctx.lineTo(x + width - clampedRadius, y)
      ctx.quadraticCurveTo(x + width, y, x + width, y + clampedRadius)
      ctx.lineTo(x + width, y + height - clampedRadius)
      ctx.quadraticCurveTo(x + width, y + height, x + width - clampedRadius, y + height)
      ctx.lineTo(x + clampedRadius, y + height)
      ctx.quadraticCurveTo(x, y + height, x, y + height - clampedRadius)
      ctx.lineTo(x, y + clampedRadius)
      ctx.quadraticCurveTo(x, y, x + clampedRadius, y)
      ctx.closePath()
    }

    // Draw function - stacked vertical bars
    const draw = () => {
      if (!analyserRef.current || !dataArrayRef.current) return

      analyserRef.current.getByteFrequencyData(dataArrayRef.current)

      if (barLevelsRef.current.length !== BAR_COUNT) {
        barLevelsRef.current = new Array(BAR_COUNT).fill(0)
      }

      const frequencies = dataArrayRef.current
      const segmentSize = Math.max(1, Math.floor(frequencies.length / BAR_COUNT))
      for (let i = 0; i < BAR_COUNT; i += 1) {
        const start = i * segmentSize
        const end = Math.min(frequencies.length, start + segmentSize)
        let sum = 0
        for (let j = start; j < end; j += 1) {
          sum += frequencies[j]
        }
        const avg = sum / Math.max(1, end - start)
        const normalized = Math.pow(avg / 255, 0.9)
        const current = barLevelsRef.current[i]
        const speed = normalized > current ? 0.35 : 0.08
        barLevelsRef.current[i] = current + (normalized - current) * speed
      }

      repaintBackground()

      const paddingX = Math.max(28, canvas.width * 0.14)
      const baseY = canvas.height * 0.94
      const maxHeight = canvas.height * 0.82
      const availableWidth = Math.max(40, canvas.width - paddingX * 2)
      const gap = Math.max(6, availableWidth * 0.02)
      const usableWidth = Math.max(20, availableWidth - gap * (BAR_COUNT - 1))
      const barWidth = Math.max(5, usableWidth / BAR_COUNT)
      const radius = Math.min(8, barWidth / 2)

      ctx.save()
      ctx.shadowColor = 'rgba(99, 102, 241, 0.35)'
      ctx.shadowBlur = 12
      for (let i = 0; i < BAR_COUNT; i += 1) {
        const height = Math.max(4, barLevelsRef.current[i] * maxHeight)
        const x = paddingX + i * (barWidth + gap)
        const y = baseY - height

        const gradient = ctx.createLinearGradient(x, y, x, baseY)
        gradient.addColorStop(0, 'rgba(236, 72, 153, 0.95)')
        gradient.addColorStop(0.5, 'rgba(139, 92, 246, 0.9)')
        gradient.addColorStop(1, 'rgba(56, 189, 248, 0.85)')
        ctx.fillStyle = gradient
        drawRoundedRect(x, y, barWidth, height, radius)
        ctx.fill()

        ctx.fillStyle = 'rgba(255, 255, 255, 0.18)'
        ctx.fillRect(x + barWidth * 0.25, y + 4, barWidth * 0.1, height - 8)
      }
      ctx.restore()

      // Base reflection
      const baseGradient = ctx.createLinearGradient(0, baseY, 0, canvas.height)
      baseGradient.addColorStop(0, 'rgba(148, 163, 184, 0.2)')
      baseGradient.addColorStop(1, 'rgba(15, 23, 42, 0)')
      ctx.fillStyle = baseGradient
      ctx.fillRect(0, baseY, canvas.width, canvas.height - baseY)

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
      barLevelsRef.current = new Array(BAR_COUNT).fill(0)
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      repaintBackground()
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
      repaintBackground()
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

