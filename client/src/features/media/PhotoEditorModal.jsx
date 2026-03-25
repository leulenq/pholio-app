import React, { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { toast } from 'sonner';

import { getCroppedImgBlob } from '../../shared/utils/canvasUtils';
import './PhotoEditorModal.css';

export default function PhotoEditorModal({ imageSrc, onClose, onSave }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [aspect, setAspect] = useState(2 / 3); // Default to Portrait
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const onCropComplete = useCallback((croppedArea, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleSave = async () => {
    setIsProcessing(true);
    try {
      const croppedBlob = await getCroppedImgBlob(
        imageSrc,
        croppedAreaPixels,
        rotation
      );
      onSave(croppedBlob);
    } catch (e) {
      console.error(e);
      toast.error('Could not crop image. Please try again.');
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-5xl h-[85vh] rounded-2xl overflow-hidden flex flex-col md:flex-row shadow-2xl animate-fade-in-up">
        
        {/* Editor Area */}
        <div className="relative flex-1 bg-[#1a1a1a] min-h-[400px] md:min-h-0 order-2 md:order-1">
          <Cropper
            image={imageSrc}
            crop={crop}
            rotation={rotation}
            zoom={zoom}
            aspect={aspect}
            onCropChange={setCrop}
            onRotationChange={setRotation}
            onCropComplete={onCropComplete}
            onZoomChange={setZoom}
            objectFit="contain"
          />
        </div>

        {/* Controls Sidebar */}
        <div className="w-full md:w-80 bg-white flex flex-col border-l border-slate-100 z-10 h-[40vh] md:h-full order-1 md:order-2">
          
          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            <div>
              <h3 className="text-lg font-serif font-medium text-slate-900 mb-1">Edit Photo</h3>
              <p className="text-sm text-slate-500">Adjust the framing and composition</p>
            </div>

            <div className="mt-6 space-y-6">
              {/* Aspect Ratio */}
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 block">Frame</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { val: 2/3, label: 'Portrait (2:3)' },
                    { val: 1, label: 'Square (1:1)' },
                    { val: 4/5, label: 'IG Vertical (4:5)' },
                    { val: 16/9, label: 'Landscape (16:9)' }
                  ].map(opt => (
                    <button 
                       key={opt.label}
                       onClick={() => setAspect(opt.val)}
                       className={`px-3 py-2 text-sm rounded-lg border transition-all ${Math.abs(aspect - opt.val) < 0.01 ? 'border-amber-500 bg-amber-50 text-amber-700 font-medium' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sliders */}
              <div className="space-y-6">
                <div>
                  <div className="flex justify-between mb-2">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Zoom</label>
                    <span className="text-xs text-slate-400 font-mono">{zoom.toFixed(1)}x</span>
                  </div>
                  <input
                    type="range"
                    value={zoom}
                    min={1}
                    max={3}
                    step={0.1}
                    aria-label="Zoom level"
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between mb-2">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Rotation</label>
                    <span className="text-xs text-slate-400 font-mono">{Number(rotation)}°</span>
                  </div>
                  <input
                    type="range"
                    value={rotation}
                    min={0}
                    max={360}
                    step={1}
                    aria-label="Rotation angle"
                    onChange={(e) => setRotation(Number(e.target.value))}
                    className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Fixed Footer */}
          <div className="p-4 border-t border-slate-100 bg-white flex gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isProcessing}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
            >
              {isProcessing ? 'Processing...' : 'Save Changes'}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
