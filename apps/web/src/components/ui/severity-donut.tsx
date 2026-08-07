'use client';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { useThemeColors } from './use-theme-colors';

const TOKENS = ['sev-critical', 'sev-high', 'sev-medium', 'sev-low', 'sev-info'];
const LABELS = ['Critical', 'High', 'Medium', 'Low', 'Info'];

export function SeverityDonut({ counts }: { counts: [number, number, number, number, number] }) {
  const colors = useThemeColors([...TOKENS, 'surface', 'border', 'fg']);
  const data = LABELS.map((name, i) => ({ name, value: counts[i] ?? 0, token: TOKENS[i]! })).filter((d) => d.value > 0);
  const total = counts.reduce((a, b) => a + b, 0);

  if (!total)
    return <div className="flex h-48 items-center justify-center text-sm text-fg-subtle">No findings yet</div>;

  const pct = (v: number) => Math.round((v / total) * 100);

  return (
    <div>
      <div className="relative h-44">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              innerRadius={52}
              outerRadius={76}
              paddingAngle={2}
              cornerRadius={3}
              strokeWidth={0}
            >
              {data.map((d) => (
                <Cell key={d.name} fill={colors[d.token]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number, name: string) => [`${value} (${pct(value)}%)`, name]}
              contentStyle={{
                background: colors.surface,
                border: `1px solid ${colors.border}`,
                borderRadius: 8,
                color: colors.fg,
                fontSize: 12,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular">{total}</span>
          <span className="text-xs text-fg-subtle">findings</span>
        </div>
      </div>
      {/* Always-visible legend with counts: severities should be readable without hovering. */}
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 px-1 text-xs sm:grid-cols-3">
        {LABELS.map((name, i) => {
          const v = counts[i] ?? 0;
          return (
            <div key={name} className={`flex items-center gap-1.5 ${v === 0 ? 'opacity-40' : ''}`}>
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: colors[TOKENS[i]!] }}
                aria-hidden="true"
              />
              <span className="text-fg-muted">{name}</span>
              <span className="ml-auto font-medium tabular">{v}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
