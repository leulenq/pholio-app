import React, { useDeferredValue, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import HouseBand from './HouseBand';
import { SCOPE, SCOPE_FILTERS, buildHouses, filterHouses } from '../../lib/marketDirectory';
import './market-board.css';

/**
 * The Market — a season board.
 *
 * One house to a band, at the scale a house deserves, opening in place into the
 * whole brief. The bet, made deliberately: a market is read the way a schedule
 * is read, not the way a table is queried, and an agency earns more of the page
 * than a row of a database ever gives it.
 *
 * The trade that comes with that bet is finding: poster bands cannot be scanned
 * two hundred at a time, so search does the work scrolling used to. It reaches
 * names, cities, markets, country codes and boards, and the market strip below
 * the masthead jumps straight to a city.
 *
 * Bands stay closed until asked. Opening one is what fetches its requirements,
 * so a market of any size costs one request to read and one more to open a
 * house — never one per house.
 */

export default function MarketBoard({
  entries,
  isLoading,
  images,
  appliedAgencyIds,
  isCoreReady,
  isSendReady,
  onOpen,
  onOutbound,
}) {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState(SCOPE.ALL);
  const [openKey, setOpenKey] = useState(null);
  const deferredQuery = useDeferredValue(query);

  const houses = useMemo(() => buildHouses(entries), [entries]);
  const filtered = useMemo(
    () => filterHouses(houses, { query: deferredQuery, scope }),
    [houses, deferredQuery, scope],
  );
  /*
    Flat and alphabetical. City sections and the market strip both went: search
    already reaches cities, and two navigation devices for one axis was the
    thing eating the board's room.
  */
  const sorted = useMemo(
    () => [...filtered].sort((a, b) => a.name.localeCompare(b.name)),
    [filtered],
  );

  const imageIds = useMemo(
    () => (images || []).map((image) => image?.id).filter(Boolean),
    [images],
  );

  const toggle = (key) => setOpenKey((current) => (current === key ? null : key));

  if (isLoading) {
    return (
      <div className="mb-loading" aria-label="Opening the market">
        {[1, 2, 3, 4, 5].map((item) => (
          <div key={item} className="mb-loading__band" />
        ))}
      </div>
    );
  }

  return (
    <div className="mb">
      {/*
        One row, and only one. Search takes the left, the scope switch is pinned
        hard right, and nothing rules them off from the board — the board's own
        first band is the rule.
      */}
      <header className="mb-top">
        <div className="mb-search">
          <Search size={16} className="mb-search__icon" aria-hidden />
          <input
            type="search"
            className="mb-search__input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search a house, a city, a board"
            aria-label="Search the market"
          />
        </div>

        <div className="mb-scopes" role="tablist" aria-label="Filter the market">
          {SCOPE_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              role="tab"
              aria-selected={scope === filter.id}
              className={`mb-scope${scope === filter.id ? ' mb-scope--on' : ''}`}
              onClick={() => setScope(filter.id)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </header>

      {sorted.length === 0 ? (
        <div className="mb-empty">
          <p className="mb-empty__line">Nothing in the market matches that.</p>
          <p className="mb-empty__hint">
            Try a city, a country, or part of a house&rsquo;s name. Pholio adds houses as
            their requirements are researched and confirmed.
          </p>
        </div>
      ) : (
        <div className="mb-board">
          {sorted.map((house) => (
            <HouseBand
              key={house.key}
              house={house}
              isOpen={openKey === house.key}
              onToggle={toggle}
              images={imageIds}
              isCoreReady={isCoreReady}
              isSendReady={isSendReady}
              applied={Boolean(
                house.pholio?.agencyId && appliedAgencyIds.has(house.pholio.agencyId),
              )}
              onOpenFlow={onOpen}
              onOutbound={onOutbound}
            />
          ))}
        </div>
      )}
    </div>
  );
}
