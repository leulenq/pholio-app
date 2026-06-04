import React, { useRef, useEffect, useState, useCallback } from 'react';
import styles from './PholioMeasuringTape.module.css';

/**
 * Helper to parse user entered measurement strings.
 * Supports feet and inches notation (e.g. 5'11", 5-11, 5 11) for imperial height (unit: 'in'),
 * as well as normal numeric strings for other cases.
 */
const parseValue = (str, currentUnit, minVal, maxVal) => {
  let val;
  const cleanStr = str.trim();
  
  if (currentUnit === 'in') {
    // Look for feet and inches format: e.g. 5'11", 5-11, 5 11, 5ft 11
    const ftInMatch = cleanStr.match(/^(\d+)\s*(?:'|ft|’|′|-)\s*(\d+)?\s*(?:"|in|”|″)?$/i) 
      || cleanStr.match(/^(\d+)\s+(\d+)\s*(?:"|in|”|″)?$/i);
      
    if (ftInMatch) {
      const feet = parseInt(ftInMatch[1], 10);
      const inches = ftInMatch[2] ? parseInt(ftInMatch[2], 10) : 0;
      val = feet * 12 + inches;
    } else {
      val = parseFloat(cleanStr);
    }
  } else {
    val = parseFloat(cleanStr);
  }
  
  if (isNaN(val)) return null;
  return Math.max(minVal, Math.min(maxVal, val));
};

/**
 * PholioMeasuringTape - A premium horizontal slider that looks like a measuring tape.
 * @param {number} value - The current value
 * @param {function} onChange - Callback for value changes
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @param {number} step - Step increment (default 1)
 * @param {string} unit - Label for the unit (cm, kg, etc.)
 */
const PholioMeasuringTape = ({ 
  value, 
  onChange, 
  min = 140, 
  max = 220, 
  step = 1, 
  unit = 'cm',
  size = 'medium',
  formatter, // Function to format the display value (e.g. val => val + "'")
  className = ''
}) => {
  const containerRef = useRef(null);
  const scaleRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const [isEditing, setIsEditing] = useState(false);
  const [editVal, setEditVal] = useState('');
  const inputRef = useRef(null);

  // Auto-focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Each small tick width based on size
  const tickWidth = size === 'small' ? 8 : 10;
  
  // Density: Label every 10 for cm, every 12 for inches (1 foot), or 5 for general
  const majorTickInterval = unit === 'cm' ? 10 : (unit.includes('in') ? 12 : 5);

  // Initial scroll position based on value - MUST RE-SYNC when min/max/step changes
  useEffect(() => {
    if (containerRef.current && !isDragging) {
      // If there's no value, default the visual scroll position to the middle of the tape
      const numericValue = value !== null && value !== undefined && value !== '' ? value : Math.round((min + max) / 2);
      const targetScroll = (numericValue - min) * (tickWidth / step);
      containerRef.current.scrollLeft = targetScroll;
    }
  }, [value, min, max, step, tickWidth, isDragging]);

  const handleScroll = useCallback(() => {
    if (!containerRef.current || isDragging) return;
    
    const scrollPos = containerRef.current.scrollLeft;
    const newValue = min + (scrollPos / (tickWidth / step));
    const roundedValue = Math.round(newValue / step) * step;
    
    // Clamp within bounds
    const clampedValue = Math.max(min, Math.min(max, roundedValue));
    
    if (clampedValue !== value) {
      onChange(clampedValue);
    }
  }, [min, max, step, value, onChange, tickWidth, isDragging]);

  // Mouse/Touch Drag Handlers
  const onMouseDown = (e) => {
    setIsDragging(true);
    setStartX(e.pageX - containerRef.current.offsetLeft);
    setScrollLeft(containerRef.current.scrollLeft);
    
    // If it was unset, auto-initialize to whatever the center position is immediately.
    // In handleScroll we wait for scroll events, but here we can force an initialization 
    // to give immediate feedback.
    if (value === null || value === undefined || value === '') {
       const initialValue = min + (containerRef.current.scrollLeft / (tickWidth / step));
       onChange(Math.max(min, Math.min(max, Math.round(initialValue / step) * step)));
    }
  };

  const onMouseLeave = () => {
    if (isDragging) setIsDragging(false);
  };

  const onMouseUp = () => {
    if (isDragging) setIsDragging(false);
  };

  const onMouseMove = (e) => {
    if (!isDragging) return;
    e.preventDefault();
    const x = e.pageX - containerRef.current.offsetLeft;
    const walk = (x - startX) * 1.8; // Slightly faster drag
    
    const targetScroll = scrollLeft - walk;
    containerRef.current.scrollLeft = targetScroll;
    
    // Immediate update while dragging
    const newValue = min + (targetScroll / (tickWidth / step));
    const normalizedValue = Math.max(min, Math.min(max, Math.round(newValue / step) * step));
    if (normalizedValue !== value) {
      onChange(normalizedValue);
    }
  };

  // Generate ticks
  const totalTicks = Math.floor((max - min) / step);
  const ticks = [];
  for (let i = 0; i <= totalTicks; i++) {
    const isMajor = i % majorTickInterval === 0;
    const currentVal = min + (i * step);
    ticks.push(
      <div 
        key={i} 
        className={`${styles.tick} ${isMajor ? styles.tickMajor : ''}`}
        style={{ flex: `0 0 ${tickWidth}px` }}
      >
        {isMajor && <span className={styles.tickLabel}>{currentVal}</span>}
      </div>
    );
  }

  const hasValue = value !== null && value !== undefined && value !== '';
  const displayVal = hasValue ? (formatter ? formatter(value) : value) : '--';

  const handleDoubleClick = () => {
    const initialText = hasValue ? (formatter ? formatter(value) : String(value)) : '';
    setEditVal(initialText);
    setIsEditing(true);
  };

  const handleCommit = () => {
    const parsed = parseValue(editVal, unit, min, max);
    if (parsed !== null && !isNaN(parsed)) {
      const stepped = Math.round(parsed / step) * step;
      onChange(stepped);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCommit();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  };

  return (
    <div className={`${styles.tapeWrapper} ${styles[size]} ${className} ${!hasValue ? styles.tapeUnset : ''}`}>
      {/* Current Value Display */}
      <div className={`${styles.valueDisplay} ${!hasValue ? styles.valueDisplayUnset : ''}`}>
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            className={styles.editInput}
            value={editVal}
            onChange={(e) => setEditVal(e.target.value)}
            onBlur={handleCommit}
            onKeyDown={handleKeyDown}
          />
        ) : (
          <span 
            className={styles.value} 
            onDoubleClick={handleDoubleClick}
            style={{ cursor: 'text' }}
            title="Double-click to type"
          >
            {displayVal}
          </span>
        )}
        <span className={styles.unit}>{unit}</span>
      </div>

      {/* The Tape Container */}
      <div className={`${styles.tapeContainerOuter} ${!hasValue ? styles.tapeContainerUnset : ''}`}>
        <div className={styles.indicator} />
        
        <div 
          ref={containerRef}
          className={styles.tapeContainer}
          onScroll={handleScroll}
          onMouseDown={onMouseDown}
          onMouseLeave={onMouseLeave}
          onMouseUp={onMouseUp}
          onMouseMove={onMouseMove}
        >
          <div className={styles.spacer} />
          <div className={styles.scale} ref={scaleRef}>
            {ticks}
          </div>
          <div className={styles.spacer} />
        </div>
      </div>
    </div>
  );
};

export default PholioMeasuringTape;
