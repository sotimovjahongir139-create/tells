interface RateGaugeProps {
  label: string;
  value: number;
}

function rateColor(v: number): string {
  if (v >= 80) return '#22c55e';
  if (v >= 60) return '#eab308';
  return '#ef4444';
}

export default function RateGauge({ label, value }: RateGaugeProps) {
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(value, 100) / 100) * circumference;
  const color = rateColor(value);

  return (
    <div className="bg-gray-900 rounded-xl p-4 flex flex-col items-center gap-2">
      <span className="text-xs text-gray-400 text-center leading-tight">{label}</span>
      <svg viewBox="0 0 100 100" className="w-24 h-24" aria-label={`${value}%`}>
        <circle cx="50" cy="50" r={radius} fill="none" stroke="#1f2937" strokeWidth="10" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
        />
        <text
          x="50"
          y="50"
          textAnchor="middle"
          dominantBaseline="central"
          fill="white"
          fontSize="18"
          fontWeight="bold"
        >
          {value}%
        </text>
      </svg>
    </div>
  );
}
