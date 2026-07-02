/**
 * Casting Profile - Step 4: Lanes & Market
 * Two sub-steps: which lanes of work call to the talent (multi-select,
 * "Not sure yet" as a first-class exclusive answer), then their market —
 * a skippable city autocomplete. No gender, no experience level: this
 * step only ever sends { city, modeling_categories }.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { fadeVariants } from './animations';
import { useCastingProfile } from '../hooks/useCasting';
import { CITIES } from '../../../data/cities';
import { useActionDock } from '../components/ActionDockContext';
import LanePlates from '../components/LanePlates';
import SpotlightField from '../components/SpotlightField';

import StepBeat from '../components/StepBeat';
import { InlineErrorText } from '../../../shared/components/states';
import '../styles/CastingSteps.css';
import './CastingProfile.screen.css';

// Canonical onboarding lane labels — order here is the order sent to the server.
const LANES = ['Editorial', 'Commercial', 'Runway'];

function CastingProfile({ onComplete, initialProfileStep, registerBack, firstName }) {
  const [profileStep, setProfileStep] = useState(initialProfileStep || 1); // 1: lanes, 2: city

  // The shell's single back control owns "back": on the city sub-step it
  // returns to lanes; on lanes it falls through to the previous flow step.
  React.useEffect(() => {
    if (!registerBack) return undefined;
    registerBack(() => {
      if (profileStep === 2) {
        setProfileStep(1);
        return true;
      }
      return false;
    });
    return () => registerBack(null);
  }, [registerBack, profileStep]);
  const [laneSet, setLaneSet] = useState(() => new Set());
  const [notSure, setNotSure] = useState(false);
  const [city, setCity] = useState('');
  const [submitError, setSubmitError] = useState('');
  const profileMutation = useCastingProfile();

  const inputRef = React.useRef(null);

  const selectedLanes = LANES.filter((lane) => laneSet.has(lane));
  const lanesValid = notSure || laneSet.size > 0;

  const handleLaneChange = (next) => {
    setLaneSet(new Set(next.lanes));
    setNotSure(next.notSure);
  };

  const handleLanesNext = () => {
    if (!lanesValid) return;
    setProfileStep(2);
  };

  const handleSubmit = async (cityOverride) => {
    if (profileMutation.isPending) return;
    setSubmitError('');
    const trimmedCity = cityOverride !== undefined ? cityOverride : city.trim() || null;
    const profileData = {
      city: trimmedCity,
      modeling_categories: selectedLanes,
    };
    try {
      await profileMutation.mutateAsync(profileData);
      onComplete(profileData);
    } catch (error) {
      setSubmitError(error.message || 'That did not save. Try once more.');
    }
  };

  const handleSkipCity = () => {
    if (profileMutation.isPending) return;
    handleSubmit(null);
  };

  const [suggestions, setSuggestions] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const handleCityChange = (e) => {
    const val = e.target.value;
    setCity(val);
    setSelectedIndex(0); // Reset selection

    if (val.length > 0) {
      const matches = CITIES.filter((c) =>
        c.label.toLowerCase().includes(val.toLowerCase())
      ).slice(0, 4);
      setSuggestions(matches);
    } else {
      setSuggestions([]);
    }
  };

  const selectCity = (cityLabel) => {
    setCity(cityLabel);
    setSuggestions([]);
    inputRef.current?.focus();
  };

  // Arrow-key navigation only — Enter is handled separately via SpotlightField's onEnter.
  const handleCityKeyDown = (e) => {
    if (suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
    }
  };

  const handleCityEnter = () => {
    if (suggestions.length > 0) {
      selectCity(suggestions[selectedIndex].label);
    } else if (city.trim().length > 0) {
      handleSubmit();
    }
  };

  useActionDock(
    profileStep === 1
      ? { label: 'Next', enabled: lanesValid, onAdvance: handleLanesNext }
      : {
          label: profileMutation.isPending ? 'Saving…' : 'Finish',
          enabled: city.trim().length > 0,
          onAdvance: () => handleSubmit(),
          skip: { label: 'Skip for now', onClick: handleSkipCity },
        }
  );

  const lanesHeadline = firstName
    ? `${firstName}, what work calls to *you*?`
    : 'What work calls to *you*?';

  return (
    <AnimatePresence mode="wait">
      {profileStep === 1 && (
        <motion.div className="cs-step-stage" key="lanes" variants={fadeVariants} initial="initial" animate="animate" exit="exit">
          <StepBeat text={lanesHeadline} />

          <LanePlates
            value={{ lanes: selectedLanes, notSure }}
            onChange={handleLaneChange}
            disabled={profileMutation.isPending}
          />
        </motion.div>
      )}

      {profileStep === 2 && (
        <motion.div className="cs-step-stage" key="city" variants={fadeVariants} initial="initial" animate="animate" exit="exit">
          <StepBeat text="And your *market*?" />

          <div className="casting-profile-market-stage">
            <SpotlightField
              type="text"
              value={city}
              onChange={handleCityChange}
              onEnter={handleCityEnter}
              onKeyDown={handleCityKeyDown}
              placeholder="Type your city"
              inputRef={inputRef}
              autoFocus
            />

            <AnimatePresence>
              {suggestions.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="market-suggest"
                >
                  {suggestions.map((c, index) => (
                    <button
                      type="button"
                      key={c.label}
                      onClick={() => selectCity(c.label)}
                      className={`market-suggest-row${index === selectedIndex ? ' is-active' : ''}`}
                    >
                      <span className="market-suggest-city">{c.name}</span>
                      <span className="market-suggest-country">{c.country}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            <InlineErrorText message={submitError} className="cinematic-field-error casting-profile-error" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default CastingProfile;
