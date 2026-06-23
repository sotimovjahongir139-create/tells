type Color = 'blue' | 'green' | 'red' | 'yellow' | 'default';

interface StatCardProps {
  label: string;
  value: number | string;
  unit?: string;
  color?: Color;
  sub?: string;
}

const colorMap: Record<Color, string> = {
  blue: 'text-blue-400',
  green: 'text-green-400',
  red: 'text-red-400',
  yellow: 'text-yellow-400',
  default: 'text-white',
};

export default function StatCard({ label, value, unit, color = 'default', sub }: StatCardProps) {
  return (
    <div className="bg-gray-900 rounded-xl p-4 flex flex-col gap-1">
      <span className="text-xs text-gray-400 leading-tight">{label}</span>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-3xl font-bold tabular-nums ${colorMap[color]}`}>{value}</span>
        {unit && <span className="text-sm text-gray-400">{unit}</span>}
      </div>
      {sub && <span className="text-xs text-gray-500">{sub}</span>}
    </div>
  );
}
