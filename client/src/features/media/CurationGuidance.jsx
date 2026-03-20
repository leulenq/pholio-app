import React, { useState, useMemo } from 'react';
import { X, Check, Info, AlertCircle, Camera } from 'lucide-react';
import { analyzePortfolio } from '../../utils/portfolioGapAnalysis';

export default function CurationGuidance({ images }) {
  const [isVisible, setIsVisible] = useState(true);

  const analysis = useMemo(() => analyzePortfolio(images), [images]);
  const { checks, score, isComplete } = analysis;

  if (!isVisible) return null;

  // If complete, we can show a simpler "Good Job" banner or nothing
  // For now, let's show the success state checkmark
  
  return (
    <div className="curation-guidance p-4 mb-6 bg-white rounded-xl border border-[#e2e8f0] shadow-sm relative transition-all duration-300">
      <button 
        onClick={() => setIsVisible(false)}
        className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 transition-colors"
        aria-label="Dismiss guidance"
      >
        <X size={16} />
      </button>

      <div className="flex items-start gap-4">
        {/* Dynamic Icon based on score */}
        <div className={`p-2 rounded-lg shrink-0 ${isComplete ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'}`}>
          {isComplete ? <Check size={20} /> : <Info size={20} />}
        </div>
        
        <div className="flex-1">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-slate-900 text-sm">
              {isComplete ? 'Portfolio Complete' : 'Build Your Agency Book'}
            </h3>
            <span className={`text-xs font-medium ${isComplete ? 'text-green-600' : 'text-blue-600'}`}>
              {score}% Ready
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-1.5 bg-slate-100 rounded-full mb-4 overflow-hidden">
            <div 
              className={`h-full transition-all duration-700 ease-out ${isComplete ? 'bg-green-500' : 'bg-blue-500'}`}
              style={{ width: `${score}%` }}
            />
          </div>

          {/* Missing Item Cards (High Priority) */}
          {!isComplete && (
            <div className="mb-4 space-y-2">
              {checks.filter(c => !c.met && c.id !== 'min_count').slice(0, 1).map(missing => (
                <div key={missing.id} className="flex items-center gap-3 p-3 bg-blue-50/50 border border-blue-100 rounded-lg">
                  <div className="p-1.5 bg-white rounded-md shadow-sm text-blue-600">
                     <Camera size={14} />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-slate-800">Missing: {missing.label}</h4>
                    <p className="text-[11px] text-slate-600">{missing.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Checklist Grid */}
          <div className="grid grid-cols-2 gap-2">
            {checks.map(check => (
              <div 
                key={check.id}
                className={`flex items-center gap-2 text-xs transition-colors duration-300 ${check.met ? 'text-slate-400' : 'text-slate-600'}`}
              >
                <div className={`w-4 h-4 rounded-full flex items-center justify-center border transition-colors duration-300 ${check.met ? 'bg-green-50 border-green-200 text-green-600' : 'border-slate-300 bg-white'}`}>
                  {check.met && <Check size={10} />}
                </div>
                <span className={check.met ? 'line-through decoration-slate-300' : ''}>{check.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
