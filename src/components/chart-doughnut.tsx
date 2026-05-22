"use client";

import { useMemo } from "react";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  type ChartOptions,
} from "chart.js";
import { Doughnut } from "react-chartjs-2";

ChartJS.register(ArcElement, Tooltip, Legend);

export function ChartDoughnut({
  labels,
  values,
  colors,
  height = 240,
  currency = "IDR",
}: {
  labels: string[];
  values: number[];
  colors: string[];
  height?: number;
  currency?: string;
}) {
  const data = useMemo(
    () => ({
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: "#fff",
          hoverOffset: 8,
        },
      ],
    }),
    [labels, values, colors]
  );

  const total = useMemo(() => values.reduce((a, b) => a + b, 0), [values]);

  const options: ChartOptions<"doughnut"> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: {
        legend: {
          position: "right",
          labels: {
            font: { family: "Plus Jakarta Sans", size: 11 },
            usePointStyle: true,
            padding: 10,
            generateLabels(chart) {
              const ds = chart.data.datasets[0];
              return (chart.data.labels as string[]).map((label, i) => {
                const value = (ds.data as number[])[i];
                const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0.0";
                return {
                  text: `${label} (${pct}%)`,
                  fillStyle: (ds.backgroundColor as string[])[i],
                  strokeStyle: (ds.backgroundColor as string[])[i],
                  hidden: false,
                  index: i,
                  pointStyle: "circle",
                };
              });
            },
          },
        },
        tooltip: {
          callbacks: {
            label(ctx) {
              const val = ctx.parsed;
              const pct = total > 0 ? ((val / total) * 100).toFixed(1) : "0";
              return ` ${ctx.label}: ${new Intl.NumberFormat("id-ID", {
                style: "currency",
                currency,
                maximumFractionDigits: 0,
              }).format(val)} (${pct}%)`;
            },
          },
        },
      },
    }),
    [total, currency]
  );

  return (
    <div style={{ height }}>
      <Doughnut data={data} options={options} />
    </div>
  );
}
