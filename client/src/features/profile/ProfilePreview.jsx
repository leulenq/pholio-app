import React from 'react';
import { useFormContext } from 'react-hook-form';

export default function ProfilePreview({ images = [] }) {
  const { watch } = useFormContext();
  const formData = watch();
  
  // Base URLs for images (adjust based on dev/prod)
  const getImageUrl = (path) => {
    if (!path) return 'https://via.placeholder.com/400x600?text=No+Image';
    if (path.startsWith('http')) return path;
    return path.startsWith('/') ? path : `/uploads/${path}`;
  };

  const heroImage = images.find(img => img.path === formData.hero_image_path) || images[0];
  const heroUrl = getImageUrl(heroImage?.path);

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm sticky top-6">
      <div className="bg-gray-100 p-4 border-b border-gray-200 text-center text-sm font-medium text-gray-500 uppercase tracking-wide">
        Live Preview
      </div>

      {/* Hero Section */}
      <div className="relative aspect-[3/4] bg-gray-100">
        <img 
          src={heroUrl} 
          alt="Profile Hero" 
          className="w-full h-full object-cover"
        />
        <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent text-white">
          <h2 className="text-3xl font-bold font-display">
            {formData.first_name || 'Name'} {formData.last_name}
          </h2>
          <p className="text-lg opacity-90">
            {formData.title || (typeof formData.specialties === 'string' ? formData.specialties.split(',')[0] : 'Model')} • {formData.city || 'City'}
          </p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 border-b border-gray-200 divide-x divide-gray-200 bg-gray-50">
        <div className="p-3 text-center">
           <span className="block text-xs text-gray-500 uppercase tracking-wider">Height</span>
           <span className="font-semibold">{formData.height_cm ? `${formData.height_cm}cm` : '-'}</span>
        </div>
        <div className="p-3 text-center">
           <span className="block text-xs text-gray-500 uppercase tracking-wider">Waist</span>
           <span className="font-semibold">{formData.waist ? `${formData.waist}"` : '-'}</span>
        </div>
        <div className="p-3 text-center">
           <span className="block text-xs text-gray-500 uppercase tracking-wider">Shoes</span>
           <span className="font-semibold">{formData.shoe_size || '-'}</span>
        </div>
      </div>

      {/* Bio & Details */}
      <div className="p-6 space-y-4">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-gray-900 mb-2">About</h3>
          <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
            {formData.bio || 'No bio yet.'}
          </p>
        </div>

        {/* Mini Gallery Preview */}
        {images.length > 0 && (
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-900 mb-2">Portfolio</h3>
            <div className="grid grid-cols-3 gap-2">
              {images.slice(0, 3).map((img) => (
                <div key={img.id} className="aspect-[3/4] bg-gray-100 rounded overflow-hidden">
                   <img src={getImageUrl(img.path)} className="w-full h-full object-cover" alt="" />
                </div>
              ))}
            </div>
            {images.length > 3 && (
               <p className="text-xs text-gray-400 mt-1 text-center">+{images.length - 3} more</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
