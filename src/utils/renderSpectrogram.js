const DEFAULT_PALETTE = [
  { stop: 0, r: 8, g: 10, b: 26 },
  { stop: 0.18, r: 30, g: 52, b: 102 },
  { stop: 0.38, r: 56, g: 104, b: 173 },
  { stop: 0.58, r: 102, g: 173, b: 204 },
  { stop: 0.78, r: 188, g: 221, b: 138 },
  { stop: 1, r: 250, g: 244, b: 140 },
]

const DENOISED_PALETTE = [
  { stop: 0, r: 18, g: 12, b: 46 },
  { stop: 0.18, r: 66, g: 34, b: 111 },
  { stop: 0.38, r: 112, g: 58, b: 166 },
  { stop: 0.58, r: 170, g: 104, b: 219 },
  { stop: 0.78, r: 222, g: 178, b: 250 },
  { stop: 1, r: 245, g: 236, b: 255 },
]

function interpolateColor(value, palette) {
  if (Number.isNaN(value)) return { r: 0, g: 0, b: 0 }
  const clamped = Math.min(1, Math.max(0, value))
  for (let i = 0; i < palette.length - 1; i += 1) {
    const current = palette[i]
    const next = palette[i + 1]
    if (clamped >= current.stop && clamped <= next.stop) {
      const range = next.stop - current.stop
      const localT = range === 0 ? 0 : (clamped - current.stop) / range
      const r = Math.round(current.r + (next.r - current.r) * localT)
      const g = Math.round(current.g + (next.g - current.g) * localT)
      const b = Math.round(current.b + (next.b - current.b) * localT)
      return { r, g, b }
    }
  }
  const last = palette[palette.length - 1]
  return { r: last.r, g: last.g, b: last.b }
}

function bitReverse(value, bits) {
  let reversed = 0
  for (let i = 0; i < bits; i += 1) {
    reversed = (reversed << 1) | (value & 1)
    value >>= 1
  }
  return reversed
}

function fftRadix2(real, imag) {
  const n = real.length
  if (n !== imag.length) {
    throw new Error('Real and imaginary arrays must have the same length')
  }
  const levels = Math.log2(n)
  if (Math.round(levels) !== levels) {
    throw new Error('FFT size must be a power of 2')
  }

  for (let i = 0; i < n; i += 1) {
    const j = bitReverse(i, levels)
    if (j > i) {
      const tempReal = real[i]
      real[i] = real[j]
      real[j] = tempReal
      const tempImag = imag[i]
      imag[i] = imag[j]
      imag[j] = tempImag
    }
  }

  for (let size = 2; size <= n; size <<= 1) {
    const halfSize = size >> 1
    const tableStep = n / size
    for (let i = 0; i < n; i += size) {
      for (let j = 0; j < halfSize; j += 1) {
        const k = j * tableStep
        const angle = (2 * Math.PI * k) / n
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)
        const tReal = real[i + j + halfSize]
        const tImag = imag[i + j + halfSize]
        const rotatedReal = tReal * cos + tImag * sin
        const rotatedImag = tImag * cos - tReal * sin

        real[i + j + halfSize] = real[i + j] - rotatedReal
        imag[i + j + halfSize] = imag[i + j] - rotatedImag
        real[i + j] += rotatedReal
        imag[i + j] += rotatedImag
      }
    }
  }
}

function buildHannWindow(size) {
  const window = new Float32Array(size)
  const factor = (2 * Math.PI) / (size - 1)
  for (let i = 0; i < size; i += 1) {
    window[i] = 0.5 * (1 - Math.cos(factor * i))
  }
  return window
}

function mixToMono(audioBuffer) {
  if (audioBuffer.numberOfChannels === 1) {
    return audioBuffer.getChannelData(0)
  }
  const length = audioBuffer.length
  const mono = new Float32Array(length)
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
    const channelData = audioBuffer.getChannelData(channel)
    for (let i = 0; i < length; i += 1) {
      mono[i] += channelData[i]
    }
  }
  const scale = 1 / audioBuffer.numberOfChannels
  for (let i = 0; i < length; i += 1) {
    mono[i] *= scale
  }
  return mono
}

function parseHexColor(value) {
  if (typeof value !== 'string') return { r: 0, g: 0, b: 0 }
  let hex = value.trim()
  if (!hex.startsWith('#')) return { r: 0, g: 0, b: 0 }
  hex = hex.slice(1)
  if (hex.length === 3) {
    const r = parseInt(hex.charAt(0) + hex.charAt(0), 16)
    const g = parseInt(hex.charAt(1) + hex.charAt(1), 16)
    const b = parseInt(hex.charAt(2) + hex.charAt(2), 16)
    return { r, g, b }
  }
  if (hex.length === 6) {
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
      return { r: 0, g: 0, b: 0 }
    }
    return { r, g, b }
  }
  return { r: 0, g: 0, b: 0 }
}

export function renderSpectrogramToCanvas(canvas, audioBuffer, options = {}) {
  if (!canvas || !audioBuffer) return

  const {
    fftSize = 1024,
    hopLength = Math.max(1, Math.floor((options.fftSize || 1024) / 4)),
    minDecibels = -90,
    maxDecibels = -5,
    isDenoised = false,
    minFrequency = 0,
    maxFrequency = null,
    background = '#050915',
    minWidth = 720,
    height = 260,
  } = options

  const clampedFftSize = Math.pow(2, Math.round(Math.log2(fftSize)))
  const frameStep = hopLength || Math.floor(clampedFftSize / 4)
  const monoData = mixToMono(audioBuffer)
  if (!monoData || monoData.length === 0) {
    const ctx = canvas.getContext('2d')
    canvas.width = minWidth
    canvas.height = height
    ctx.fillStyle = background
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    return
  }

  const freqBins = clampedFftSize / 2
  const totalFrames = Math.max(1, Math.floor((monoData.length - clampedFftSize) / frameStep) + 1)
  const plotWidth = Math.max(minWidth, totalFrames)
  const plotHeight = height

  canvas.width = plotWidth
  canvas.height = plotHeight
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = background
  ctx.fillRect(0, 0, plotWidth, plotHeight)

  const imageData = ctx.createImageData(plotWidth, plotHeight)
  const data = imageData.data
  const backgroundRgb = parseHexColor(background)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = backgroundRgb.r
    data[i + 1] = backgroundRgb.g
    data[i + 2] = backgroundRgb.b
    data[i + 3] = 255
  }
  const window = buildHannWindow(clampedFftSize)

  const magnitudes = new Array(totalFrames)
  let maxMagnitude = Number.MIN_VALUE

  for (let frame = 0; frame < totalFrames; frame += 1) {
    const offset = frame * frameStep
    const real = new Float32Array(clampedFftSize)
    const imag = new Float32Array(clampedFftSize)

    for (let i = 0; i < clampedFftSize; i += 1) {
      const sample = monoData[offset + i] || 0
      real[i] = sample * window[i]
      imag[i] = 0
    }

    fftRadix2(real, imag)

    const frameMagnitudes = new Float32Array(freqBins)
    for (let bin = 0; bin < freqBins; bin += 1) {
      const re = real[bin]
      const im = imag[bin]
      const magnitude = Math.sqrt(re * re + im * im)
      frameMagnitudes[bin] = magnitude
      if (magnitude > maxMagnitude) {
        maxMagnitude = magnitude
      }
    }
    magnitudes[frame] = frameMagnitudes
  }

  if (maxMagnitude <= 0) {
    ctx.fillStyle = background
    ctx.fillRect(0, 0, plotWidth, plotHeight)
    return
  }

  const palette = isDenoised ? DENOISED_PALETTE : DEFAULT_PALETTE
  const clampFreq = maxFrequency ? Math.min(maxFrequency, audioBuffer.sampleRate / 2) : audioBuffer.sampleRate / 2
  const minFreq = Math.max(0, minFrequency)
  const freqRange = clampFreq - minFreq || 1

  const topPadding = 0
  const bottomPadding = 0
  const leftPadding = 0
  const rightPadding = 0
  const usableWidth = plotWidth - leftPadding - rightPadding
  const usableHeight = plotHeight - topPadding - bottomPadding

  const minFreqBin = Math.max(0, Math.floor((minFreq / (audioBuffer.sampleRate / 2)) * freqBins))
  const maxFreqBin = Math.min(freqBins - 1, Math.floor((clampFreq / (audioBuffer.sampleRate / 2)) * freqBins))
  const drawBins = Math.max(1, maxFreqBin - minFreqBin)

  const normalizedFrames = magnitudes.map((frameMagnitudes) => {
    const slice = new Float32Array(drawBins + 1)
    for (let i = 0; i <= drawBins; i += 1) {
      const bin = Math.min(maxFreqBin, minFreqBin + i)
      const magnitude = frameMagnitudes[bin] / maxMagnitude
      const magnitudeDb = 20 * Math.log10(Math.max(magnitude, Number.EPSILON))
      const normalized = (magnitudeDb - minDecibels) / (maxDecibels - minDecibels)
      slice[i] = Math.min(1, Math.max(0, normalized))
    }
    return slice
  })

  const framesMinusOne = Math.max(1, totalFrames - 1)
  const binsMinusOne = Math.max(1, drawBins - 1)

  for (let py = topPadding; py < topPadding + usableHeight; py += 1) {
    const freqRatio = 1 - (py - topPadding) / Math.max(1, usableHeight - 1)
    const binFloat = freqRatio * binsMinusOne
    const binIndex = Math.floor(binFloat)
    const nextBinIndex = Math.min(drawBins, binIndex + 1)
    const binT = binFloat - binIndex

    for (let px = leftPadding; px < leftPadding + usableWidth; px += 1) {
      const frameRatio = (px - leftPadding) / Math.max(1, usableWidth - 1)
      const frameFloat = frameRatio * framesMinusOne
      const frameIndex = Math.floor(frameFloat)
      const nextFrameIndex = Math.min(totalFrames - 1, frameIndex + 1)
      const frameT = frameFloat - frameIndex

      const frameSlice = normalizedFrames[frameIndex]
      const nextFrameSlice = normalizedFrames[nextFrameIndex]

      const topValue = frameSlice[binIndex] * (1 - binT) + frameSlice[nextBinIndex] * binT
      const bottomValue = nextFrameSlice[binIndex] * (1 - binT) + nextFrameSlice[nextBinIndex] * binT
      const value = topValue * (1 - frameT) + bottomValue * frameT

      const { r, g, b } = interpolateColor(value, palette)
      const index = (py * plotWidth + px) * 4
      data[index] = r
      data[index + 1] = g
      data[index + 2] = b
      data[index + 3] = 255
    }
  }

  ctx.putImageData(imageData, 0, 0)

  ctx.save()
  const vignetteGradient = ctx.createRadialGradient(
    usableWidth / 2,
    usableHeight / 2,
    Math.min(usableWidth, usableHeight) / 4,
    usableWidth / 2,
    usableHeight / 2,
    Math.max(usableWidth, usableHeight) / 1.2,
  )
  vignetteGradient.addColorStop(0, 'rgba(15, 23, 42, 0)')
  vignetteGradient.addColorStop(1, 'rgba(15, 23, 42, 0.45)')
  ctx.fillStyle = vignetteGradient
  ctx.fillRect(leftPadding, topPadding, usableWidth, usableHeight)
  ctx.restore()

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)'
  ctx.lineWidth = 1
  const frameWidth = Math.max(0, usableWidth - 1)
  const frameHeight = Math.max(0, usableHeight - 1)
  ctx.strokeRect(leftPadding + 0.5, topPadding + 0.5, frameWidth, frameHeight)
}
