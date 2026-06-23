'use client';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

interface HourChartProps {
  data: Record<string, number>;
  title?: string;
}

export default function HourChart({ data, title = "Soatlik taqsimot" }: HourChartProps) {
  const chartData = Object.entries(data).map(([slot, value]) => ({
    slot: slot.replace(':00', '').replace('-', '–'),
    value,
  }));

  const maxVal = Math.max(...chartData.map((d) => d.value), 1);

  return (
    <div className="bg-gray-900 rounded-xl p-4">
      <h3 className="text-sm text-gray-400 mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={chartData} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
          <XAxis
            dataKey="slot"
            tick={{ fill: '#9ca3af', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis hide />
          <Tooltip
            contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
            labelStyle={{ color: '#d1d5db' }}
            itemStyle={{ color: '#9ca3af' }}
            formatter={(v: number) => [v, "Qo'ng'iroqlar"]}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {chartData.map((entry, i) => (
              <Cell
                key={i}
                fill={entry.value === maxVal && maxVal > 0 ? '#f59e0b' : '#3b82f6'}
              />
            ))}
            <LabelList
              dataKey="value"
              position="top"
              style={{ fill: '#9ca3af', fontSize: 11 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
