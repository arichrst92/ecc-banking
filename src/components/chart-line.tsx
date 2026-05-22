"use client";

import { useMemo } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  type ChartOptions,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, Filler
);

export interface LineDataset {
  label: string;
  data: number[];
  color: string; // hex
  fill?: boolean;
}

export function ChartLine({
  labels,
  datasets,
  height = 240,
  currency = "IDR",
}: {
  labels: string[];
  datasets: LineDataset[];
  height?: number;
  currency?: string;
}) {
  const data = useMemo(
    () => ({
      labels,
      datasets: datasets.map((d) => ({
        label: d.label,
        data: d.data,
        borderColor: d.color,
        backgroundColor: d.color + "22",
        fill: d.fill ?? true,
        tension: 0.3,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
      })),
    }),
    [labels, datasets]
  );

  const options: ChartOptions<"line"> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: "index" },
      plugins: {
        legend: {
          position: "bottom",
          labels: { font: { family: "Plus Jakarta Sans", size: 11 }, usePointStyle: true, padding: 14 },
        },
        tooltip: {
          callbacks: {
            label(ctx) {
              const val = ctx.parsed.y;
              return ` ${ctx.dataset.label}: ${new Intl.NumberFormat("id-ID", {
                style: "currency",
                currency,
                maximumFractionDigits: 0,
              }).format(val)}`;
            },
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 } } },
        y: {
          grid: { color: "#eee" },
          ticks: {
            font: { size: 10 },
            callback(v) {
              const n = Number(v);
              if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(0) + "M";
              if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(0) + "K";
              return String(n);
            },
          },
        },
      },
    }),
    [currency]
  );

  return (
    <div style={{ height }}>
      <Line data={data} options={options} />
    </div>
  );
}
