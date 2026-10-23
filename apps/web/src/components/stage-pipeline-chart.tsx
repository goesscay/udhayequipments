'use client';

import { STAGE_BY_CODE, type DashboardSummary } from '@udhay/shared';
import { useRouter } from 'next/navigation';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export function StagePipelineChart({ data }: { data: DashboardSummary['stageCounts'] }) {
  const router = useRouter();
  const rows = data.map((d) => ({
    ...d,
    name: STAGE_BY_CODE[d.stage].short,
    label: STAGE_BY_CODE[d.stage].label,
    onTrack: d.count - d.overdue,
  }));
  const openStage = (bar: { payload?: { stage?: string } }) => {
    if (bar.payload?.stage) router.push(`/projects?stage=${bar.payload.stage}`);
  };

  return (
    <div className="h-[420px] w-full">
      <ResponsiveContainer>
        <BarChart data={rows} layout="vertical" margin={{ left: 4, right: 16, top: 4, bottom: 4 }} barCategoryGap={6}>
          <CartesianGrid horizontal={false} stroke="#ECEAE6" />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" width={78} tick={{ fontSize: 12, fill: '#1F2328' }} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: '#F7F0E3' }}
            contentStyle={{ borderRadius: 0, border: '1px solid #ECEAE6', fontSize: 12 }}
            labelFormatter={(_, p) => p?.[0]?.payload?.label ?? ''}
          />
          <Bar
            dataKey="onTrack"
            name="On track"
            stackId="a"
            fill="#B8862B"
            radius={0}
            className="cursor-pointer"
            onClick={openStage}
          />
          <Bar
            dataKey="overdue"
            name="Overdue"
            stackId="a"
            fill="#DC2626"
            radius={0}
            className="cursor-pointer"
            onClick={openStage}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
