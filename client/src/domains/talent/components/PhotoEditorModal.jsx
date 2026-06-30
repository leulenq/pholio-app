import React, { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Cropper from 'react-easy-crop';
import { Crop, RotateCcw, RotateCw, Save, ScanLine, X, ZoomIn } from 'lucide-react';
import { toast } from 'sonner';

import { getCroppedImgBlob } from '../../../shared/utils/canvasUtils';
import PholioButton, {
  PholioIconButton,
  PholioToggleButton,
  PholioToggleGroup,
} from '../../../shared/components/ui/PholioButton';
import './PhotoEditorModal.css';

const ASPECTS = [
  { val: 2 / 3, label: 'Portrait', meta: '2:3' },
  { val: 1, label: 'Square', meta: '1:1' },
  { val: 4 / 5, label: 'Editorial', meta: '4:5' },
  { val: 16 / 9, label: 'Wide', meta: '16:9' },
];

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
      await Promise.resolve(onSave(croppedBlob));
    } catch (e) {
      console.error(e);
      toast.error('Could not crop image. Please try again.');
      setIsProcessing(false);
    }
  };

  const resetCrop = () => {
    setCrop({ x: 0, y: 0 });
    setRotation(0);
    setZoom(1);
  };

  const rotateBy = (amount) => {
    setRotation((current) => (current + amount + 360) % 360);
  };

  return createPortal(
    <div className="pem-overlay" onClick={onClose}>
      <section className="pem-shell" aria-label="Crop and rotate image" onClick={(e) => e.stopPropagation()}>
        <div className="pem-stage">
          <header className="pem-stage__top">
            <div>
              <h2>Refine frame</h2>
            </div>
            <PholioIconButton type="button" tone="dark" className="pem-icon-btn" onClick={onClose} aria-label="Close crop editor">
              <X size={18} />
            </PholioIconButton>
          </header>
          <div className="pem-cropper-wrap">
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
          <div className="pem-stage__bottom">
            <span>{ASPECTS.find((item) => Math.abs(item.val - aspect) < 0.01)?.label || 'Custom'} frame</span>
            <span>{zoom.toFixed(1)}x · {Number(rotation)} deg</span>
          </div>
        </div>

        <aside className="pem-controls">
          <div className="pem-controls__head">
            <p>Portfolio crop</p>
          </div>

          <div className="pem-controls__body">
            <div className="pem-tool-section">
              <div className="pem-tool-label">
                <Crop size={14} />
                <span>Frame</span>
              </div>
              <PholioToggleGroup className="pem-aspect-grid">
                {ASPECTS.map((opt) => (
                  <PholioToggleButton
                    key={opt.label}
                    type="button"
                    onClick={() => setAspect(opt.val)}
                    active={Math.abs(aspect - opt.val) < 0.01}
                    className={Math.abs(aspect - opt.val) < 0.01 ? 'is-active' : ''}
                  >
                    <span className="pem-aspect-icon" style={{ aspectRatio: `${opt.val}` }} />
                    <span>{opt.label}</span>
                    <small>{opt.meta}</small>
                  </PholioToggleButton>
                ))}
              </PholioToggleGroup>
            </div>

            <div className="pem-tool-section">
              <div className="pem-slider-head">
                <label htmlFor="pem-zoom"><ZoomIn size={14} />Zoom</label>
                <span>{zoom.toFixed(1)}x</span>
              </div>
              <input
                id="pem-zoom"
                type="range"
                value={zoom}
                min={1}
                max={3}
                step={0.1}
                aria-label="Zoom level"
                onChange={(e) => setZoom(Number(e.target.value))}
                className="pem-range"
              />
            </div>

            <div className="pem-tool-section">
              <div className="pem-slider-head">
                <label htmlFor="pem-rotation"><RotateCw size={14} />Rotation</label>
                <span>{Number(rotation)} deg</span>
              </div>
              <input
                id="pem-rotation"
                type="range"
                value={rotation}
                min={0}
                max={360}
                step={1}
                aria-label="Rotation angle"
                onChange={(e) => setRotation(Number(e.target.value))}
                className="pem-range"
              />
              <div className="pem-nudge-row">
                <PholioButton type="button" variant="tertiary" onClick={() => rotateBy(-90)}><RotateCcw size={14} />Left</PholioButton>
                <PholioButton type="button" variant="tertiary" onClick={() => rotateBy(90)}><RotateCw size={14} />Right</PholioButton>
              </div>
            </div>

            <PholioButton type="button" variant="secondary" fullWidth onClick={resetCrop}>
              <ScanLine size={14} />
              Reset composition
            </PholioButton>
          </div>

          <footer className="pem-footer">
            <PholioButton type="button" variant="secondary" onClick={onClose}>
              Cancel
            </PholioButton>
            <PholioButton type="button" variant="primary" onClick={handleSave} disabled={isProcessing}>
              {isProcessing ? 'Processing...' : <><Save size={15} />Apply crop</>}
            </PholioButton>
          </footer>
        </aside>
      </section>
    </div>,
    document.body
  );
}
