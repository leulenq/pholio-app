import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import './PholioForms.css';

const CreditsEditor = ({
  value = [],
  onChange,
  error,
  disabled = false,
  label
}) => {
  // Safe parsing of initial value, including legacy object/blob shapes.
  const parseCredits = (val) => {
    const toCredit = (entry, index = 0) => {
      if (typeof entry === 'string') {
        return {
          id: `legacy-${index}`,
          role: '',
          production: entry,
          year: '',
          type: 'Other'
        };
      }

      if (!entry || typeof entry !== 'object') {
        return {
          id: `credit-${index}`,
          role: '',
          production: '',
          year: '',
          type: 'Film'
        };
      }

      return {
        ...entry,
        id: entry.id || `credit-${index}`,
        role: entry.role || entry.character || '',
        production:
          entry.production ||
          entry.project ||
          entry.show ||
          entry.company ||
          entry.name ||
          entry.title ||
          entry.description ||
          '',
        year: entry.year ? String(entry.year) : '',
        type: entry.type || 'Film'
      };
    };

    if (Array.isArray(val)) return val.map((item, index) => toCredit(item, index));

    if (val && typeof val === 'object') return [toCredit(val, 0)];

    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (!trimmed) return [];

      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.map((item, index) => toCredit(item, index));
        if (parsed && typeof parsed === 'object') return [toCredit(parsed, 0)];
      } catch {
        return trimmed
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line, index) => toCredit(line, index));
      }
    }

    return [];
  };

  const credits = parseCredits(value);

  const addCredit = () => {
    const newCredit = { id: Date.now(), role: '', production: '', year: '', type: 'Film' };
    onChange?.([...credits, newCredit]);
  };

  const removeCredit = (index) => {
    const newCredits = [...credits];
    newCredits.splice(index, 1);
    onChange?.(newCredits);
  };

  const updateCredit = (index, field, val) => {
    const newCredits = [...credits];
    newCredits[index] = { ...newCredits[index], [field]: val };
    onChange?.(newCredits);
  };

  return (
    <div className="pholio-form-group">
      {label && <label className="pholio-label">{label}</label>}
      
      <div className="flex flex-col gap-3">
        {credits.length === 0 && (
          <div className="text-sm text-gray-400 italic p-4 border border-dashed border-gray-300 rounded-lg text-center bg-gray-50">
            No structured credits added. Click below to add one.
          </div>
        )}

        {credits.map((credit, index) => (
          <div key={credit.id || index} className="flex flex-col md:flex-row gap-2 items-start md:items-center bg-[#F8F8F7] p-3 rounded-lg border border-[#e2e8f0] animate-in fade-in slide-in-from-top-2 duration-200">
             <div className="grid grid-cols-1 md:grid-cols-12 gap-2 w-full">
               
               {/* Role */}
               <div className="md:col-span-4">
                 <input
                   type="text"
                   placeholder="Role (e.g. Lead)"
                   className="pholio-input !h-10 !text-sm !p-2 bg-white"
                   value={credit.role || ''}
                   onChange={(e) => updateCredit(index, 'role', e.target.value)}
                   disabled={disabled}
                 />
               </div>

               {/* Production */}
               <div className="md:col-span-4">
                  <input
                   type="text"
                   placeholder="Production Name"
                   className="pholio-input !h-10 !text-sm !p-2 bg-white"
                   value={credit.production || ''}
                   onChange={(e) => updateCredit(index, 'production', e.target.value)}
                   disabled={disabled}
                 />
               </div>

               {/* Year */}
               <div className="md:col-span-2">
                 <input
                   type="text"
                   placeholder="Year"
                   className="pholio-input !h-10 !text-sm !p-2 bg-white"
                   value={credit.year || ''}
                   onChange={(e) => updateCredit(index, 'year', e.target.value)}
                   disabled={disabled}
                 />
               </div>

               {/* Type */}
               <div className="md:col-span-2 flex items-center gap-2">
                 <select
                    className="pholio-select !h-10 !text-sm !p-2 !pr-8 bg-white w-full"
                    value={credit.type || 'Film'}
                    onChange={(e) => updateCredit(index, 'type', e.target.value)}
                    disabled={disabled}
                 >
                    <option value="Film">Film</option>
                    <option value="TV">TV</option>
                    <option value="Stage">Stage</option>
                    <option value="Commercial">Comm.</option>
                    <option value="Other">Other</option>
                 </select>
                 
                 <button
                    type="button"
                    onClick={() => removeCredit(index)}
                    className="text-gray-400 hover:text-red-500 transition-colors p-2"
                    title="Remove credit"
                 >
                    <Trash2 size={16} />
                 </button>
               </div>

             </div>
          </div>
        ))}
        
        <button
          type="button"
          onClick={addCredit}
          disabled={disabled}
          className="flex items-center justify-center gap-2 w-full py-3 border border-dashed border-[#C9A55A] text-[#C9A55A] rounded-lg hover:bg-[#C9A55A]/5 transition-colors font-medium text-sm mt-1"
        >
          <Plus size={16} />
          Add Credit
        </button>
      </div>

       {error && (
        <span className="pholio-error-message" role="alert">
          {error.message || error}
        </span>
      )}
    </div>
  );
};

export default CreditsEditor;
