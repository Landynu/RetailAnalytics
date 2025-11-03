import React from 'react';

const Sparkline = ({ data, width = 60, height = 20, color = '#10b981' }) => {
  if (!data || data.length === 0) {
    return <div className="text-xs text-muted-foreground">-</div>;
  }

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  // Create points for the line
  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width;
    const normalizedValue = range > 0 ? (value - min) / range : 0.5;
    const y = height - (normalizedValue * height);
    return `${x},${y}`;
  }).join(' ');

  // Determine trend (comparing first half to second half)
  const midPoint = Math.floor(data.length / 2);
  const firstHalf = data.slice(0, midPoint);
  const secondHalf = data.slice(midPoint);
  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
  const trend = secondAvg > firstAvg * 1.1 ? 'up' : secondAvg < firstAvg * 0.9 ? 'down' : 'stable';

  const trendColors = {
    up: '#22c55e',
    down: '#ef4444',
    stable: '#6b7280'
  };

  return (
    <svg 
      width={width} 
      height={height} 
      className="inline-block"
      style={{ verticalAlign: 'middle' }}
    >
      <polyline
        fill="none"
        stroke={trendColors[trend]}
        strokeWidth="1.5"
        points={points}
      />
    </svg>
  );
};

export default Sparkline;
