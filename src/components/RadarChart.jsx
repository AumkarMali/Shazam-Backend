import './RadarChart.css'

function RadarChart({ metrics = [], size = 260, levels = 4 }) {
  if (!metrics.length) {
    return (
      <div className="radar-chart radar-chart--empty">
        <span>No metrics available</span>
      </div>
    )
  }

  const dimension = size
  const radius = dimension / 2
  const angleSlice = (Math.PI * 2) / metrics.length

  const levelShapes = Array.from({ length: levels }, (_, levelIndex) => {
    const levelRadius = radius * ((levelIndex + 1) / levels)
    const points = metrics.map((_, metricIndex) => {
      const angle = angleSlice * metricIndex - Math.PI / 2
      const x = radius + levelRadius * Math.cos(angle)
      const y = radius + levelRadius * Math.sin(angle)
      return `${x},${y}`
    })
    return points.join(' ')
  })

  const dataPoints = metrics.map((metric, index) => {
    const max = metric.max || 100
    const clampedValue = Math.max(0, Math.min(max, metric.value || 0))
    const valueRadius = radius * (clampedValue / max)
    const angle = angleSlice * index - Math.PI / 2
    const x = radius + valueRadius * Math.cos(angle)
    const y = radius + valueRadius * Math.sin(angle)
    return { x, y, label: metric.name, value: clampedValue, max }
  })

  const polygonPoints = dataPoints.map((point) => `${point.x},${point.y}`).join(' ')

  const labelPositions = dataPoints.map((point, index) => {
    const angle = angleSlice * index - Math.PI / 2
    const labelRadius = radius + 26
    const x = radius + labelRadius * Math.cos(angle)
    const y = radius + labelRadius * Math.sin(angle)
    return { x, y, label: point.label, value: point.value }
  })

  return (
    <div className="radar-chart" style={{ width: dimension, height: dimension }}>
      <svg className="radar-chart__svg" viewBox={`0 0 ${dimension} ${dimension}`} role="img" aria-label="Radar chart">
        <g className="radar-grid">
          {levelShapes.map((points, index) => (
            <polygon key={`grid-${index}`} points={points} />
          ))}
        </g>
        <g className="radar-axes">
          {metrics.map((metric, index) => {
            const angle = angleSlice * index - Math.PI / 2
            const x = radius + radius * Math.cos(angle)
            const y = radius + radius * Math.sin(angle)
            return (
              <line
                key={`axis-${metric.name}`}
                x1={radius}
                y1={radius}
                x2={x}
                y2={y}
              />
            )
          })}
        </g>
        <polygon className="radar-path" points={polygonPoints} />
        {dataPoints.map((point, index) => (
          <circle
            key={`point-${index}`}
            className="radar-point"
            cx={point.x}
            cy={point.y}
            r={4}
          />
        ))}
      </svg>
      <div className="radar-label-layer">
        {labelPositions.map((position) => (
          <div
            className="radar-label"
            key={`label-${position.label}`}
            style={{ left: `${position.x}px`, top: `${position.y}px` }}
          >
            <span className="radar-label__name">{position.label}</span>
            <span className="radar-label__value">{Math.round(position.value || 0)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default RadarChart
