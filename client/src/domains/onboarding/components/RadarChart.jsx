/**
 * Radar Chart - Archetype Visualization
 * Uses Chart.js for radar chart rendering
 */

import React, { useEffect, useRef } from 'react';
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
} from 'chart.js';
import { Radar } from 'react-chartjs-2';

// Register Chart.js components
ChartJS.register(
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
);

function RadarChart({ data }) {
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: true,
    aspectRatio: 1,
    scales: {
      r: {
        min: 0,
        max: 100,
        beginAtZero: true,
        ticks: {
          stepSize: 20,
          font: {
            family: 'Inter, sans-serif',
            size: 12
          },
          color: '#64748b',
          backdropColor: 'transparent'
        },
        grid: {
          color: '#e2e8f0',
          lineWidth: 1
        },
        angleLines: {
          color: '#e2e8f0',
          lineWidth: 1
        },
        pointLabels: {
          font: {
            family: 'Playfair Display, serif',
            size: 16,
            weight: '600'
          },
          color: '#0f172a',
          padding: 15
        }
      }
    },
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        titleFont: {
          family: 'Inter, sans-serif',
          size: 14,
          weight: '600'
        },
        bodyFont: {
          family: 'Inter, sans-serif',
          size: 13
        },
        padding: 12,
        cornerRadius: 8,
        callbacks: {
          label: function(context) {
            return `${context.label}: ${context.parsed.r}%`;
          }
        }
      }
    },
    animation: {
      duration: 1500,
      easing: 'easeInOutQuart'
    }
  };

  const chartData = {
    labels: data.labels,
    datasets: [{
      label: data.datasets[0].label,
      data: data.datasets[0].data,
      backgroundColor: 'rgba(201, 165, 90, 0.15)',
      borderColor: '#C9A55A',
      borderWidth: 3,
      pointBackgroundColor: '#C9A55A',
      pointBorderColor: '#fff',
      pointBorderWidth: 2,
      pointRadius: 6,
      pointHoverRadius: 8,
      pointHoverBackgroundColor: '#D4AF37',
      pointHoverBorderWidth: 3
    }]
  };

  return (
    <div className="radar-chart">
      <Radar data={chartData} options={chartOptions} />
    </div>
  );
}

export default RadarChart;
