/**
 * Agency Dashboard - Analytics Module
 * Handles Charts and Stats
 */

(function(window) {
  'use strict';

  const Analytics = {
    tooltip: null,

    init() {
      const section = document.getElementById('analytics');
      if (!section) return;
      
      this.createTooltip();

      // Use Intersection Observer to lazy load
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            this.loadAnalytics();
            observer.unobserve(entry.target);
          }
        });
      });
      observer.observe(section);
    },

    createTooltip() {
        if (document.getElementById('agency-analytics-tooltip')) return;
        const tooltip = document.createElement('div');
        tooltip.id = 'agency-analytics-tooltip';
        tooltip.className = 'agency-analytics-tooltip';
        document.body.appendChild(tooltip);
        this.tooltip = tooltip;
    },

    showTooltip(event, content) {
        if (!this.tooltip) this.createTooltip();
        this.tooltip.innerHTML = content;
        this.tooltip.style.opacity = '1';
        
        // Position
        const x = event.pageX + 15;
        const y = event.pageY + 15;
        this.tooltip.style.left = `${x}px`;
        this.tooltip.style.top = `${y}px`;
    },

    hideTooltip() {
        if (this.tooltip) {
            this.tooltip.style.opacity = '0';
        }
    },

    async loadAnalytics() {
        const loading = document.getElementById('analytics-loading');
        const content = document.getElementById('analytics-content');
        const error = document.getElementById('analytics-error');
        
        if (loading) loading.style.display = 'block';
        if (content) content.style.display = 'none';
        if (error) error.style.display = 'none';
        
        try {
            const res = await fetch('/api/agency/analytics');
            if (!res.ok) throw new Error('Failed to load data');
            const data = await res.json();
            
            if (data.success && data.analytics) {
                if (loading) loading.style.display = 'none';
                if (content) content.style.display = 'block';
                
                // Render after making visible so clientWidth is correct
                // Use requestAnimationFrame to ensure layout is computed
                requestAnimationFrame(() => {
                    this.renderKPIs(data.analytics);
                    this.renderCharts(data.analytics);
                });
            } else {
                throw new Error('Invalid data');
            }
        } catch (err) {
            console.error(err);
            if (loading) loading.style.display = 'none';
            if (error) error.style.display = 'block';
        }
    },
    
    renderKPIs(analytics) {
        const total = document.getElementById('analytics-total');
        if (total) total.textContent = analytics.byStatus?.total || 0;
        
        const rate = document.getElementById('analytics-acceptance-rate');
        if (rate) rate.textContent = (analytics.acceptanceRate || 0) + '%';
    },

    renderCharts(analytics) {
        const trafficContainer = document.getElementById('analytics-traffic-chart');
        if (trafficContainer && analytics.timeline) {
            this.renderTrafficChart(trafficContainer, analytics.timeline);
        }
        
        const distContainer = document.getElementById('analytics-distribution-chart');
        if (distContainer && analytics.matchScores) {
            this.renderDistributionChart(distContainer, analytics);
        }

        if (analytics.byStatus) {
            this.renderStatusBreakdown(analytics.byStatus);
        }

        if (analytics.matchScores) {
            this.renderMatchScores(analytics.matchScores);
        }

        if (analytics.byBoard) {
            this.renderBoards(analytics.byBoard);
        }
    },

    renderTrafficChart(container, timelineData) {
      if (!Array.isArray(timelineData)) {
          console.error('Timeline data is not an array');
          return;
      }

      // Update subtitle to show total count and context
      const totalTraffic = timelineData.reduce((sum, d) => sum + d.count, 0);
      const subtitle = container.parentElement.querySelector('.agency-dashboard__analytics-chart-subtitle');
      if (subtitle) {
          subtitle.textContent = `${totalTraffic} applications in the last 30 days`;
      }

      // Check dimensions with fallback
      const rect = container.getBoundingClientRect();
      let width = rect.width || container.clientWidth;
      
      // Retry if width is 0 (e.g. hidden tab)
      if (width === 0) {
          setTimeout(() => this.renderTrafficChart(container, timelineData), 100);
          return;
      }

      const height = 200;
      const padding = { top: 20, right: 20, bottom: 30, left: 30 };
      const chartWidth = width - padding.left - padding.right;
      const chartHeight = height - padding.top - padding.bottom;

      if (timelineData.length === 0) {
          container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#999;">No application data available</div>';
          return;
      }

      // Store current data on container so resize listener can access latest data
      container._currentTimelineData = timelineData;

      // Add resize listener to re-render chart
      if (!container.hasAttribute('data-resize-listener')) {
          window.addEventListener('resize', () => {
              // Debounce slightly
              clearTimeout(container.resizeTimeout);
              container.resizeTimeout = setTimeout(() => {
                  // Use stored data from container instead of captured closure
                  if (container._currentTimelineData) {
                      this.renderTrafficChart(container, container._currentTimelineData);
                  }
              }, 200);
          });
          container.setAttribute('data-resize-listener', 'true');
      }

      // Data processing
      const maxVal = Math.max(...timelineData.map(d => d.count), 5);
      const points = timelineData.map((d, i) => {
          let x;
          if (timelineData.length <= 1) {
              x = chartWidth / 2 + padding.left;
          } else {
              x = (i / (timelineData.length - 1)) * chartWidth + padding.left;
          }
          const y = chartHeight - (d.count / maxVal) * chartHeight + padding.top;
          // Parse date safely from YYYY-MM-DD string to avoid timezone issues
          const dateParts = d.date.split('-');
          const dateObj = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]); 
          return { x, y, date: dateObj, count: d.count, dateStr: d.date };
      });

      // Generate smooth path (Catmull-Rom or similar, simplified here with cubic bezier)
      const pathD = points.length > 1 
        ? `M ${points[0].x} ${points[0].y} ` + 
          points.slice(1).map((p, i) => {
            const prev = points[i];
            const cp1x = prev.x + (p.x - prev.x) / 2;
            const cp1y = prev.y;
            const cp2x = prev.x + (p.x - prev.x) / 2;
            const cp2y = p.y;
            return `C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p.x} ${p.y}`;
          }).join(' ')
        : `M ${points[0].x} ${points[0].y}`; // Single point fallback

      // Area path (close the loop)
      const areaPathD = pathD + ` L ${points[points.length-1].x} ${height - padding.bottom} L ${points[0].x} ${height - padding.bottom} Z`;

      // X Axis Labels (show every 5th label or so)
      const xLabels = points.filter((_, i) => i % 5 === 0).map(p => {
          const day = p.date.toLocaleDateString('en-US', { weekday: 'short' });
          return `<text x="${p.x}" y="${height - 5}" text-anchor="middle" font-size="10" fill="#999" font-family="var(--agency-font-sans)">${day}</text>`;
      }).join('');

      // Y Axis Labels (0, mid, max)
      const yLabels = [0, Math.round(maxVal/2), maxVal].map(val => {
          const y = chartHeight - (val / maxVal) * chartHeight + padding.top;
          return `<text x="${padding.left - 5}" y="${y + 3}" text-anchor="end" font-size="10" fill="#999" font-family="var(--agency-font-sans)">${val}</text>`;
      }).join('');

      // Data Points (only for non-zero or significant points to avoid clutter)
      const dataPoints = points.map((p, i) => {
          return `<circle cx="${p.x}" cy="${p.y}" r="3" fill="#1a1a1a" stroke="#fff" stroke-width="1" class="agency-analytics-chart-point" data-index="${i}"/>`;
      }).join('');

      const uniqueId = 'traffic-gradient-' + Math.random().toString(36).substr(2, 9);
      
      container.innerHTML = `
        <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" overflow="visible" id="traffic-svg-${uniqueId}">
          <!-- Grid Lines -->
          <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" stroke="#eee" stroke-width="1"/>
          <line x1="${padding.left}" y1="${padding.top}" x2="${width - padding.right}" y2="${padding.top}" stroke="#eee" stroke-width="1" stroke-dasharray="4 4"/>
          
          <!-- Gradient Definition -->
          <defs>
            <linearGradient id="${uniqueId}" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#1a1a1a" stop-opacity="0.2"/>
              <stop offset="100%" stop-color="#1a1a1a" stop-opacity="0"/>
            </linearGradient>
          </defs>

          <!-- Area Fill -->
          <path d="${areaPathD}" fill="url(#${uniqueId})"/>
          
          <!-- Line Stroke -->
          <path d="${pathD}" fill="none" stroke="#1a1a1a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          
          <!-- Hover Line (Hidden by default) -->
          <line id="hover-line-${uniqueId}" x1="0" y1="${padding.top}" x2="0" y2="${height - padding.bottom}" stroke="#1a1a1a" stroke-width="1" stroke-dasharray="4 4" style="opacity: 0; pointer-events: none; transition: opacity 0.1s;"/>

          <!-- Data Points -->
          <g id="data-points-${uniqueId}">${dataPoints}</g>

          <!-- Labels -->
          <g>${xLabels}</g>
          <g>${yLabels}</g>
          
          <!-- Interaction Layer -->
          <rect x="${padding.left}" y="${padding.top}" width="${chartWidth}" height="${chartHeight}" fill="transparent" id="interaction-layer-${uniqueId}"/>
        </svg>
      `;

      // Add Interaction Logic
      const svg = document.getElementById(`traffic-svg-${uniqueId}`);
      const interactionLayer = document.getElementById(`interaction-layer-${uniqueId}`);
      const hoverLine = document.getElementById(`hover-line-${uniqueId}`);
      const pointsGroup = document.getElementById(`data-points-${uniqueId}`);
      
      if (interactionLayer) {
          interactionLayer.addEventListener('mousemove', (e) => {
              const svgRect = svg.getBoundingClientRect();
              const mouseX = e.clientX - svgRect.left;
              
              // Find closest point
              let closestPoint = points[0];
              let minDiff = Math.abs(mouseX - points[0].x);
              
              points.forEach(p => {
                  const diff = Math.abs(mouseX - p.x);
                  if (diff < minDiff) {
                      minDiff = diff;
                      closestPoint = p;
                  }
              });

              // Move hover line
              hoverLine.setAttribute('x1', closestPoint.x);
              hoverLine.setAttribute('x2', closestPoint.x);
              hoverLine.style.opacity = '1';

              // Highlight point
              Array.from(pointsGroup.children).forEach(circle => {
                  const cx = parseFloat(circle.getAttribute('cx'));
                  if (Math.abs(cx - closestPoint.x) < 1) {
                      circle.setAttribute('r', '6');
                      circle.setAttribute('stroke-width', '2');
                  } else {
                      circle.setAttribute('r', '3');
                      circle.setAttribute('stroke-width', '1');
                  }
              });

              // Show Tooltip
              const dayName = closestPoint.date.toLocaleDateString('en-US', { weekday: 'short' });
              const content = `
                <div class="agency-analytics-tooltip__title">${dayName}</div>
                <div class="agency-analytics-tooltip__row">
                    <span class="agency-analytics-tooltip__label">Applications:</span>
                    <span class="agency-analytics-tooltip__value">${closestPoint.count}</span>
                </div>
              `;
              this.showTooltip(e, content);
          });

          interactionLayer.addEventListener('mouseleave', () => {
              hoverLine.style.opacity = '0';
              this.hideTooltip();
              // Reset points
              Array.from(pointsGroup.children).forEach(circle => {
                  circle.setAttribute('r', '3');
                  circle.setAttribute('stroke-width', '1');
              });
          });
      }
    },

    describeArc(x, y, innerRadius, outerRadius, startAngle, endAngle) {
        const start = this.polarToCartesian(x, y, outerRadius, endAngle);
        const end = this.polarToCartesian(x, y, outerRadius, startAngle);
        const start2 = this.polarToCartesian(x, y, innerRadius, endAngle);
        const end2 = this.polarToCartesian(x, y, innerRadius, startAngle);

        const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

        const d = [
            "M", start.x, start.y,
            "A", outerRadius, outerRadius, 0, largeArcFlag, 0, end.x, end.y,
            "L", end2.x, end2.y,
            "A", innerRadius, innerRadius, 0, largeArcFlag, 1, start2.x, start2.y,
            "Z"
        ].join(" ");

        return d;
    },

    polarToCartesian(centerX, centerY, radius, angleInDegrees) {
        const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
        return {
            x: centerX + (radius * Math.cos(angleInRadians)),
            y: centerY + (radius * Math.sin(angleInRadians))
        };
    },

    renderDistributionChart(container, analytics) {
      const legendContainer = document.getElementById('analytics-distribution-legend');
      
      const distribution = analytics.matchScores?.distribution || {};
      const total = analytics.matchScores?.total || 0;
      
      if (total === 0) {
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#999;font-size:0.875rem;">No data available</div>';
        container.style.background = '#f5f5f5';
        container.style.borderRadius = '50%';
        if (legendContainer) legendContainer.innerHTML = '';
        return;
      }

      const data = [
        { label: 'New Faces', value: distribution.poor || 0, color: '#1a1a1a' },
        { label: 'Developing', value: distribution.fair || 0, color: '#8d7b68' },
        { label: 'Professional', value: distribution.good || 0, color: '#c5b4a0' },
        { label: 'Top Talent', value: distribution.excellent || 0, color: '#e0e0e0' }
      ];

      // Reset container styles for SVG
      container.style.background = 'none';
      container.style.width = '180px';
      container.style.height = '180px';
      container.style.borderRadius = '0';
      container.style.position = 'relative';

      const width = 180;
      const height = 180;
      const radius = Math.min(width, height) / 2;
      const innerRadius = radius * 0.65; // Donut hole size

      let currentAngle = 0;
      const svgContent = data.map((item, index) => {
          if (item.value === 0) return '';
          
          const percentage = (item.value / total) * 100;
          const angle = (percentage / 100) * 360;
          const endAngle = currentAngle + angle;
          
          // Ensure we don't have a gap if it's a full circle (single item 100%)
          const isFullCircle = percentage === 100;
          const pathD = isFullCircle 
              ? this.describeArc(width/2, height/2, innerRadius, radius, 0, 359.99)
              : this.describeArc(width/2, height/2, innerRadius, radius, currentAngle, endAngle);
          
          const path = `<path d="${pathD}" fill="${item.color}" class="agency-analytics-donut-segment" data-label="${item.label}" data-value="${item.value}" data-percentage="${Math.round(percentage)}"/>`;
          
          currentAngle += angle;
          return path;
      }).join('');

      container.innerHTML = `
        <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
            ${svgContent}
        </svg>
      `;

      // Add Listeners
      const paths = container.querySelectorAll('path');
      paths.forEach(path => {
          path.addEventListener('mousemove', (e) => {
              const label = path.getAttribute('data-label');
              const value = path.getAttribute('data-value');
              const pct = path.getAttribute('data-percentage');
              
              const content = `
                <div class="agency-analytics-tooltip__title">${label}</div>
                <div class="agency-analytics-tooltip__row">
                    <span class="agency-analytics-tooltip__label">Count:</span>
                    <span class="agency-analytics-tooltip__value">${value}</span>
                </div>
                <div class="agency-analytics-tooltip__row">
                    <span class="agency-analytics-tooltip__label">Share:</span>
                    <span class="agency-analytics-tooltip__value">${pct}%</span>
                </div>
              `;
              this.showTooltip(e, content);
          });
          
          path.addEventListener('mouseleave', () => {
              this.hideTooltip();
          });
      });
      
      // Render Legend
      if (legendContainer) {
        legendContainer.innerHTML = data.map(item => {
            if (item.value === 0) return ''; 
            const percentage = Math.round((item.value / total) * 100);
            return `
              <div class="agency-dashboard__analytics-legend-item">
                <span class="agency-dashboard__analytics-legend-dot" style="background-color: ${item.color};"></span>
                <span>${item.label} (${percentage}%)</span>
              </div>
            `;
        }).join('');
      }
    },

    renderStatusBreakdown(byStatus) {
        const container = document.getElementById('analytics-status-grid');
        if (!container) return;

        const statuses = [
            { key: 'pending', label: 'Pending Review', icon: '⏳' },
            { key: 'accepted', label: 'Accepted', icon: '✅' },
            { key: 'declined', label: 'Declined', icon: '❌' },
            { key: 'archived', label: 'Archived', icon: '📦' }
        ];

        container.innerHTML = statuses.map(status => `
            <div class="agency-dashboard__analytics-status-card">
                <div class="agency-dashboard__analytics-status-icon">${status.icon}</div>
                <div class="agency-dashboard__analytics-status-info">
                    <div class="agency-dashboard__analytics-status-label">${status.label}</div>
                    <div class="agency-dashboard__analytics-status-count">${byStatus[status.key] || 0}</div>
                </div>
            </div>
        `).join('');
    },

    renderMatchScores(matchScores) {
        const container = document.getElementById('analytics-scores');
        if (!container) return;

        const distribution = matchScores.distribution || {};
        const scores = [
            { key: 'excellent', label: 'Excellent (80-100%)', color: '#4CAF50' },
            { key: 'good', label: 'Good (60-79%)', color: '#8BC34A' },
            { key: 'fair', label: 'Fair (40-59%)', color: '#FFC107' },
            { key: 'poor', label: 'Poor (<40%)', color: '#F44336' }
        ];

        const total = matchScores.total || 1;

        container.innerHTML = scores.map(score => {
            const count = distribution[score.key] || 0;
            const percentage = Math.round((count / total) * 100);
            
            return `
                <div class="agency-dashboard__analytics-score-item">
                    <div class="agency-dashboard__analytics-score-label">
                        <span>${score.label}</span>
                        <span>${count}</span>
                    </div>
                    <div class="agency-dashboard__analytics-score-bar">
                        <div class="agency-dashboard__analytics-score-fill" style="width: ${percentage}%; background-color: ${score.color};"></div>
                    </div>
                </div>
            `;
        }).join('');
    },

    renderBoards(boards) {
        const container = document.getElementById('analytics-boards');
        if (!container) return;

        if (!boards || boards.length === 0) {
            container.innerHTML = '<div style="color: #888; font-style: italic;">No boards created yet</div>';
            return;
        }

        // Sort by count desc
        const sortedBoards = [...boards].sort((a, b) => b.count - a.count).slice(0, 5);
        const maxCount = Math.max(...sortedBoards.map(b => b.count), 1);

        container.innerHTML = sortedBoards.map(board => {
            const percentage = Math.round((board.count / maxCount) * 100);
            return `
                <div class="agency-dashboard__analytics-board-item" data-board="${board.board_name}" data-count="${board.count}">
                    <div class="agency-dashboard__analytics-board-info">
                        <span class="agency-dashboard__analytics-board-name">${board.board_name}</span>
                        <span class="agency-dashboard__analytics-board-count">${board.count} apps</span>
                    </div>
                    <div class="agency-dashboard__analytics-board-bar">
                        <div class="agency-dashboard__analytics-board-fill" style="width: ${percentage}%;"></div>
                    </div>
                </div>
            `;
        }).join('');

        // Add Tooltip Listeners
        const items = container.querySelectorAll('.agency-dashboard__analytics-board-item');
        items.forEach(item => {
            item.addEventListener('mousemove', (e) => {
                const name = item.getAttribute('data-board');
                const count = item.getAttribute('data-count');
                
                const content = `
                    <div class="agency-analytics-tooltip__title">${name}</div>
                    <div class="agency-analytics-tooltip__row">
                        <span class="agency-analytics-tooltip__label">Total Applications:</span>
                        <span class="agency-analytics-tooltip__value">${count}</span>
                    </div>
                `;
                this.showTooltip(e, content);
            });
            
            item.addEventListener('mouseleave', () => {
                this.hideTooltip();
            });
        });
    }
  };

  window.AgencyDashboard = window.AgencyDashboard || {};
  window.AgencyDashboard.Analytics = Analytics;

})(window);
