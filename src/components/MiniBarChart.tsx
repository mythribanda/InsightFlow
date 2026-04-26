import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";

const PALETTE = [
  "var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)",
  "var(--color-chart-4)", "var(--color-chart-5)",
];

export function MiniBarChart({ data, dataKey = "count", labelKey = "value" }: {
  data: { [k: string]: string | number }[];
  dataKey?: string;
  labelKey?: string;
}) {
  return (
    <div className="h-32 w-full">
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-grid)" strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 9, fill: "var(--color-muted-foreground)" }} />
          <YAxis dataKey={labelKey} type="category" width={70}
            tick={{ fontSize: 9, fill: "var(--color-muted-foreground)" }} />
          <Tooltip
            contentStyle={{
              background: "var(--color-popover)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              fontSize: 11,
            }}
            cursor={{ fill: "var(--color-secondary)", opacity: 0.4 }}
          />
          <Bar dataKey={dataKey} radius={[0, 3, 3, 0]}>
            {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
