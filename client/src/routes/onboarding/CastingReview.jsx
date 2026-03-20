/**
 * Casting Review - Step 3: Confirm AI Predictions
 * Brand-compliant split-screen confirmation
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { fadeVariants } from './animations';
import { toast } from 'sonner';

function CastingReview({ photoData, onComplete }) {
  const [isEditing, setIsEditing] = useState(false);
  const [height, setHeight] = useState(photoData?.predictions?.height_cm || 175);
  const [build, setBuild] = useState(photoData?.predictions?.build || 'athletic');

  console.log('[CastingReview] Component rendered', { photoData, isEditing });

  const handleConfirm = () => {
    console.log('[CastingReview] User confirmed predictions');
    toast.success('Looking good!');
    onComplete();
  };

  const handleEdit = () => {
    console.log('[CastingReview] User wants to edit');
    setIsEditing(true);
  };

  const handleSaveEdits = () => {
    console.log('[CastingReview] Saving edits', { height, build });
    // TODO: Send corrections to backend if needed
    toast.success('Updated!');
    onComplete();
  };

  // Convert cm to feet/inches for display
  const heightInFeet = Math.floor(height / 30.48);
  const heightInInches = Math.round((height / 2.54) % 12);
  const heightDisplay = `${heightInFeet}'${heightInInches}"`;

  return (
    <motion.div
      variants={fadeVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="w-full h-full flex"
    >
      {/* Left Side - Photo */}
      <div className="w-1/2 h-full flex items-center justify-center bg-[#f5f4f2]">
        <div className="relative w-96 h-96 rounded-2xl overflow-hidden opacity-70 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.08)]">
          {photoData?.photo_url ? (
            <img
              src={photoData.photo_url}
              alt="Your photo"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-[#e2e8f0] flex items-center justify-center">
              <span className="text-[#94a3b8] text-lg">Photo</span>
            </div>
          )}
        </div>
      </div>

      {/* Right Side - Confirmation */}
      <div className="w-1/2 h-full flex items-center justify-center px-16">
        <div className="max-w-lg">
          {!isEditing ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <h1 className="text-5xl font-bold text-[#0f172a] mb-12 leading-tight tracking-tight">
                We detected:
              </h1>

              <div className="space-y-5 mb-16">
                <div className="flex items-baseline gap-4">
                  <span className="text-3xl text-[#C9A55A]">•</span>
                  <span className="text-2xl text-[#0f172a] font-medium">
                    {heightDisplay} ({height}cm)
                  </span>
                </div>
                <div className="flex items-baseline gap-4">
                  <span className="text-3xl text-[#C9A55A]">•</span>
                  <span className="text-2xl text-[#0f172a] font-medium capitalize">
                    {build} build
                  </span>
                </div>
              </div>

              <p className="text-xl text-[#64748b] mb-12">
                Is this accurate?
              </p>

              <div className="flex gap-4">
                <button
                  onClick={handleConfirm}
                  className="flex-1 px-8 py-4 bg-[#C9A55A] text-white text-lg font-medium rounded-lg hover:bg-[#b08d45] hover:shadow-[0_4px_12px_rgba(201,165,90,0.2)] hover:-translate-y-0.5 transition-all"
                >
                  Yes, that's right
                </button>
                <button
                  onClick={handleEdit}
                  className="px-8 py-4 border-2 border-[#e2e8f0] text-[#64748b] text-lg rounded-lg hover:border-[#cbd5e1] hover:text-[#0f172a] hover:bg-[#f8f9fa] transition-all"
                >
                  Let me edit
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <h2 className="text-4xl font-semibold text-[#0f172a] mb-12 tracking-tight">
                Make your edits
              </h2>

              <div className="space-y-7 mb-12">
                {/* Height Input */}
                <div>
                  <label className="block text-base text-[#0f172a] font-medium mb-2">
                    Height (cm)
                  </label>
                  <input
                    type="number"
                    value={height}
                    onChange={(e) => setHeight(parseInt(e.target.value) || 175)}
                    className="w-full px-4 py-3 bg-white border border-[#e2e8f0] rounded-lg text-[#0f172a] text-lg focus:outline-none focus:border-[#C9A55A] focus:shadow-[0_0_0_4px_rgba(201,165,90,0.1)] transition-all"
                    min="140"
                    max="220"
                  />
                  <p className="mt-2 text-[#64748b] text-sm">
                    {Math.floor(height / 30.48)}'{Math.round((height / 2.54) % 12)}"
                  </p>
                </div>

                {/* Build Select */}
                <div>
                  <label className="block text-base text-[#0f172a] font-medium mb-2">
                    Build
                  </label>
                  <select
                    value={build}
                    onChange={(e) => setBuild(e.target.value)}
                    className="w-full px-4 py-3 bg-white border border-[#e2e8f0] rounded-lg text-[#0f172a] text-lg focus:outline-none focus:border-[#C9A55A] focus:shadow-[0_0_0_4px_rgba(201,165,90,0.1)] transition-all capitalize"
                  >
                    <option value="petite">Petite</option>
                    <option value="slim">Slim</option>
                    <option value="athletic">Athletic</option>
                    <option value="curvy">Curvy</option>
                    <option value="plus">Plus</option>
                  </select>
                </div>
              </div>

              <button
                onClick={handleSaveEdits}
                className="w-full px-8 py-4 bg-[#C9A55A] text-white text-lg font-medium rounded-lg hover:bg-[#b08d45] hover:shadow-[0_4px_12px_rgba(201,165,90,0.2)] hover:-translate-y-0.5 transition-all"
              >
                Save & Continue
              </button>
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default CastingReview;
