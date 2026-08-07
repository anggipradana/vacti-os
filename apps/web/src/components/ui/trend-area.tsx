'use client';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useThemeColors } from './use-theme-colors';

export function TrendArea({ data }: { data: { label: string; value: number }[] }) {
  const c = useThemeColors(['accent', 'border', 'surface', 'fg', 'fg-subtle']);
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <div className="relative h-48">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <defs>
            <linearGradient id="trend" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c.accent} stopOpacity={0.3} />
              <stop offset="100%" stopColor={c.accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={c.border} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: c['fg-subtle'], fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis
            tick={{ fill: c['fg-subtle'], fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
            width={36}
          />
          <Tooltip
            cursor={{ stroke: c.border, strokeWidth: 1 }}
            contentStyle={{
              background: c.surface,
              border: `1px solid ${c.border}`,
              borderRadius: 8,
              color: c.fg,
              fontSize: 12,
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={c.accent}
            strokeWidth={2}
            fill="url(#trend)"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
      {total === 0 ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-fg-subtle">
          No activity in this period
        </div>
      ) : null}
    </div>
  );
}
