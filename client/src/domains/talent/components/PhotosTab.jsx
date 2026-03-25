import React, { useState, useEffect } from 'react';
import { ImagePlus, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { talentApi } from '../api/talent';

export const PhotosTab = ({ onPhotoUploaded }) => {
  const queryClient = useQueryClient();
  const [photos, setPhotos] = useState([]);
  const [isUploading, setIsUploading] = useState(false);

  // Fetch photos on mount
  useEffect(() => {
    const fetchPhotos = async () => {
      try {
        // We can fetch from profile endpoint or a dedicated media endpoint if one existed.
        // Using existing talentApi.getProfile() which includes 'images'.
        const data = await talentApi.getProfile();
        if (data && data.images) {
          // Map backend images to local state structure
          // backend image: { id, path, kind, ... }
          // local state: { id, url, isTemp... }
          const mapped = data.images.map(img => ({
            id: img.id,
            url: img.path, // path is now the public URL from backend
            isPrimary: !!img.is_primary,
            isTemp: false
          }));
          setPhotos(mapped);
        }
      } catch (error) {
        console.error('Failed to fetch photos', error);
        toast.error('Could not load portfolio');
      }
    };
    fetchPhotos();
  }, []);

  const handleDelete = async (photoId) => {
    try {
        // Optimistic update
        setPhotos(prev => prev.filter(p => p.id !== photoId));
        await talentApi.deleteMedia(photoId);

        // Invalidate auth query to refresh images in Header/Sidebar
        await queryClient.invalidateQueries({ queryKey: ['auth-user'] });

        toast.success('Photo removed');
    } catch (error) {
        console.error('Delete failed', error);
        toast.error('Failed to delete photo');
        // Revert? (Complex without comprehensive state management, acceptable for now)
    }
  };

  const handleFileChange = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const formData = new FormData();
    
    Array.from(files).forEach((file) => {
      formData.append('file', file);
    });

    try {
      const res = await talentApi.uploadMedia(formData);
      // res.path contains the new URL
      // Create a local object to append immediately
      const newPhoto = {
        id: Date.now(), // Temporary ID until refresh
        url: res.path,
        isTemp: false
      };

      setPhotos(prev => [...prev, newPhoto]);
      toast.success('Photo uploaded');

      // Invalidate auth query to refresh images everywhere (Header, Sidebar, etc.)
      await queryClient.invalidateQueries({ queryKey: ['auth-user'] });
      await queryClient.refetchQueries({ queryKey: ['auth-user'] });

      // Notify parent to refresh profile or update hero if needed
      if (onPhotoUploaded) onPhotoUploaded(res.path);
      
    } catch (error) {
      console.error('Upload failed', error);
      toast.error('Failed to upload photo');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-slate-900 font-display">Manage Photos</h2>
        <p className="text-sm text-slate-500">Add high-quality photos to your portfolio to stand out.</p>
      </div>

      {/* Upload Section */}
      <input 
        type="file" 
        multiple 
        accept="image/png, image/jpeg, image/jpg" 
        className="hidden" 
        id="photo-upload-input"
        onChange={handleFileChange}
        disabled={isUploading}
      />
      
      <div 
        onClick={() => !isUploading && document.getElementById('photo-upload-input').click()}
        className={`border-2 border-dashed border-slate-300 rounded-xl p-12 flex flex-col items-center justify-center text-center cursor-pointer hover:border-[#C9A55A] hover:bg-slate-50 transition-colors group ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-4 group-hover:bg-[#C9A55A]/10 transition-colors">
          {isUploading ? (
            <Loader2 className="w-6 h-6 text-[#C9A55A] animate-spin" />
          ) : (
            <ImagePlus className="w-6 h-6 text-slate-400 group-hover:text-[#C9A55A] transition-colors" />
          )}
        </div>
        <p className="text-slate-600 font-medium mb-1">
          {isUploading ? 'Uploading...' : 'Drag & drop photos here, or click to select files'}
        </p>
        <p className="text-xs text-slate-400">Supports JPG, PNG up to 5MB</p>
      </div>

      {/* Photo Grid */}
      <div className="mt-8">
        <h3 className="text-sm font-medium text-slate-900 mb-4 uppercase tracking-wider">Your Portfolio</h3>
        
        {photos.length === 0 ? (
           <div className="text-center py-12 bg-slate-50 rounded-lg border border-slate-100">
             <div className="w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center mx-auto mb-4">
               <ImagePlus className="w-8 h-8 text-slate-400" />
             </div>
             <p className="text-slate-900 font-medium">No photos yet</p>
             <p className="text-sm text-slate-500 mt-1">Upload your best shots to get discovered.</p>
           </div>
        ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {photos.map((photo) => (
                <div key={photo.id} className="aspect-[3/4] bg-slate-100 rounded-lg border border-slate-200 relative group overflow-hidden">
                    <img src={photo.url} alt="Portfolio" className="w-full h-full object-cover" />
                    
                    {photo.isPrimary && (
                      <div className="absolute top-2 left-2 px-2 py-0.5 bg-[#C9A55A] text-white text-[10px] font-bold uppercase rounded shadow-sm z-10">
                        Primary
                      </div>
                    )}

                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        {!photo.isPrimary && (
                            <button 
                                onClick={async () => {
                                    try {
                                        await talentApi.setHeroImage(photo.id);
                                        toast.success('Hero image updated');
                                        // Invalidate queries to refresh
                                        queryClient.invalidateQueries({ queryKey: ['auth-user'] });
                                        // Update local state to show change immediately
                                        setPhotos(prev => prev.map(p => ({
                                            ...p,
                                            isPrimary: p.id === photo.id
                                        })));
                                        if (onPhotoUploaded) onPhotoUploaded(photo.url);
                                    } catch (e) {
                                        toast.error('Failed to update hero');
                                    }
                                }}
                                className="px-3 py-1.5 bg-white text-slate-900 text-xs font-medium rounded-lg hover:bg-[#C9A55A] hover:text-white transition-colors"
                            >
                                Set as Primary
                            </button>
                        )}
                        <button 
                            onClick={() => handleDelete(photo.id)}
                            className="p-1.5 bg-white/20 hover:bg-red-500 text-white rounded-lg transition-colors"
                            title="Remove photo"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>
            ))}
            </div>
        )}
      </div>
    </div>
  );
};

export default PhotosTab;
