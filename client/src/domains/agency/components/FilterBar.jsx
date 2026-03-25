import { useState, useRef, useEffect } from 'react';
import { Search, X, List, Columns3, LayoutGrid, SlidersHorizontal } from 'lucide-react';
import './FilterBar.css';

export default function FilterBar({
  filters = [],
  activeFilters = {},
  onChange,
  presets = [],
  activePreset = null,
  onSelectPreset,
  onSavePreset,
  viewMode = 'list',
  onViewModeChange,
  searchValue = '',
  onSearchChange,
  searchPlaceholder = 'Search...',
  viewModes = ['list', 'kanban'],
}) {
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const activeCount = Object.values(activeFilters).filter(v =>
    Array.isArray(v) ? v.length > 0 : v != null && v !== ''
  ).length;

  return (
    <div className="ag-filter-bar">
      {/* Row 1: Preset + Search + View Toggle */}
      <div className="ag-filter-bar__row1">
        {presets.length > 0 && (
          <select
            className="ag-filter-bar__preset"
            value={activePreset || ''}
            onChange={e => onSelectPreset?.(e.target.value || null)}
          >
            <option value="">All</option>
            {presets.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}

        <div className="ag-filter-bar__search">
          <Search size={16} className="ag-filter-bar__search-icon" />
          <input
            type="text"
            value={searchValue}
            onChange={e => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="ag-filter-bar__search-input"
          />
          {searchValue && (
            <button className="ag-filter-bar__search-clear" onClick={() => onSearchChange('')}>
              <X size={14} />
            </button>
          )}
        </div>

        <div className="ag-filter-bar__actions">
          {filters.length > 0 && (
            <button
              className={`ag-filter-bar__toggle ${filtersExpanded ? 'is-active' : ''}`}
              onClick={() => setFiltersExpanded(!filtersExpanded)}
            >
              <SlidersHorizontal size={16} />
              {activeCount > 0 && <span className="ag-filter-bar__badge">{activeCount}</span>}
            </button>
          )}

          <div className="ag-filter-bar__views">
            {viewModes.includes('list') && (
              <button
                className={`ag-filter-bar__view-btn ${viewMode === 'list' ? 'is-active' : ''}`}
                onClick={() => onViewModeChange('list')}
                title="List view"
              >
                <List size={16} />
              </button>
            )}
            {viewModes.includes('kanban') && (
              <button
                className={`ag-filter-bar__view-btn ${viewMode === 'kanban' ? 'is-active' : ''}`}
                onClick={() => onViewModeChange('kanban')}
                title="Kanban view"
              >
                <Columns3 size={16} />
              </button>
            )}
            {viewModes.includes('grid') && (
              <button
                className={`ag-filter-bar__view-btn ${viewMode === 'grid' ? 'is-active' : ''}`}
                onClick={() => onViewModeChange('grid')}
                title="Grid view"
              >
                <LayoutGrid size={16} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: Filter chips (expandable) */}
      {filtersExpanded && filters.length > 0 && (
        <div className="ag-filter-bar__row2">
          {filters.map(f => (
            <FilterChip
              key={f.key}
              filter={f}
              value={activeFilters[f.key]}
              onChange={val => onChange({ ...activeFilters, [f.key]: val })}
            />
          ))}
          {activeCount > 0 && (
            <button className="ag-filter-bar__clear" onClick={() => onChange({})}>
              <X size={12} /> Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function FilterChip({ filter, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const hasValue = Array.isArray(value) ? value.length > 0 : value != null && value !== '';

  if (filter.type === 'select' || filter.type === 'multi') {
    return (
      <div className="ag-filter-chip" ref={ref}>
        <button
          className={`ag-filter-chip__trigger ${hasValue ? 'has-value' : ''}`}
          onClick={() => setOpen(!open)}
        >
          {filter.label} {hasValue ? `(${Array.isArray(value) ? value.length : 1})` : ''}
        </button>
        {open && (
          <div className="ag-filter-chip__dropdown">
            {filter.options.map(opt => {
              const optValue = typeof opt === 'string' ? opt : opt.value;
              const optLabel = typeof opt === 'string' ? opt : opt.label;
              const isSelected = filter.type === 'multi'
                ? (value || []).includes(optValue)
                : value === optValue;

              return (
                <button
                  key={optValue}
                  className={`ag-filter-chip__option ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => {
                    if (filter.type === 'multi') {
                      const arr = value || [];
                      onChange(isSelected ? arr.filter(v => v !== optValue) : [...arr, optValue]);
                    } else {
                      onChange(isSelected ? null : optValue);
                      setOpen(false);
                    }
                  }}
                >
                  {optLabel}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return null;
}
