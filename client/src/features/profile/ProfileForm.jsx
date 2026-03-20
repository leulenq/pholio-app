import React, { useEffect, useState } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { talentProfileUpdateSchema } from '../../lib/validation';
import { useProfile } from '../../hooks/useProfile';
import { Input, Select, TextArea, Button } from '../../components/ui';
import ProfilePreview from './ProfilePreview';
import { 
  User, Ruler, Briefcase, Award, FileText, Share2, Phone, CheckCircle2, AlertCircle 
} from 'lucide-react';

// Task 2: Visual Section Card Component
const SectionCard = ({ icon: Icon, title, completion, children }) => {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-zinc-100 overflow-hidden mb-6 transition-all hover:shadow-md">
      <div className="px-8 py-6 border-b border-zinc-50 flex items-center justify-between bg-white sticky top-0 z-10">
        <div className="flex items-center gap-3">
           <div className="p-2 bg-amber-50 rounded-lg text-amber-600">
             <Icon size={20} />
           </div>
           <div>
             <h3 className="text-lg font-semibold text-zinc-900">{title}</h3>
           </div>
        </div>
        {/* Progress Indicator */}
        {completion !== undefined && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-zinc-500">{completion}%</span>
            <div className="w-24 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
               <div 
                 className="h-full bg-emerald-500 transition-all duration-500" 
                 style={{ width: `${completion}%` }}
               />
            </div>
          </div>
        )}
      </div>
      <div className="p-8">
        {children}
      </div>
    </div>
  );
};

export default function ProfileForm() {
  const { profile, images, updateProfile, isUpdating } = useProfile();
  
  const formMethods = useForm({
    resolver: zodResolver(talentProfileUpdateSchema),
    defaultValues: profile || {}, 
    mode: 'onBlur'
  });
  
  const { register, handleSubmit, reset, watch, formState: { errors, isDirty } } = formMethods;

  // Simple completion calculation (mock logic for now)
  const calculateCompletion = (fields) => {
    const values = watch(fields);
    if (!values) return 0;
    const filled = fields.filter(f => values[f]).length;
    return Math.round((filled / fields.length) * 100);
  };

  useEffect(() => {
    if (profile) {
      const formatted = { ...profile };
      if (Array.isArray(formatted.languages)) formatted.languages = formatted.languages.join(', ');
      if (Array.isArray(formatted.specialties)) formatted.specialties = formatted.specialties.join(', ');
      if (Array.isArray(formatted.comfort_levels)) formatted.comfort_levels = formatted.comfort_levels.join(', ');
      reset(formatted);
    }
  }, [profile, reset]);

  const onSubmit = async (data) => {
    await updateProfile(data);
  };

  if (!profile) return <div className="p-8 text-center text-zinc-500">Loading profile data...</div>;

  return (
    <FormProvider {...formMethods}>
      <form onSubmit={handleSubmit(onSubmit)} className="relative">
        
        {/* Task 5: Sticky Header/Actions */}
        <div className="sticky top-4 z-20 flex justify-end mb-4 pointer-events-none">
           <Button 
             type="submit" 
             disabled={!isDirty || isUpdating} 
             loading={isUpdating}
             className="pointer-events-auto shadow-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold py-3 px-6 rounded-full transition-all transform hover:scale-105"
           >
             {isUpdating ? 'Saving...' : 'Save Changes'}
           </Button>
        </div>

        {/* Task 1: Split-Screen Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
            
            {/* Left Column: Form (60% -> col-span-3) */}
            <div className="lg:col-span-3 space-y-2">
                
                {/* Section 1: Personal Info */}
                <SectionCard 
                  icon={User} 
                  title="Personal Information" 
                  completion={calculateCompletion(['first_name', 'last_name', 'city', 'gender', 'date_of_birth'])}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Input label="First Name" {...register('first_name')} error={errors.first_name} />
                    <Input label="Last Name" {...register('last_name')} error={errors.last_name} />
                    <Input label="City" {...register('city')} error={errors.city} />
                    <Input label="Secondary Base" {...register('city_secondary')} error={errors.city_secondary} />
                    <Select 
                      label="Gender" 
                      {...register('gender')} 
                      options={[
                        { value: 'Male', label: 'Male' },
                        { value: 'Female', label: 'Female' },
                        { value: 'Non-binary', label: 'Non-binary' },
                        { value: 'Other', label: 'Other' },
                        { value: 'Prefer not to say', label: 'Prefer not to say' }
                      ]} 
                      error={errors.gender} 
                    />
                    <Input label="Date of Birth" type="date" {...register('date_of_birth')} error={errors.date_of_birth} />
                  </div>
                </SectionCard>

                {/* Section 2: Physical Attributes */}
                <SectionCard 
                  icon={Ruler} 
                  title="Physical Attributes"
                  completion={calculateCompletion(['height_cm', 'weight_kg', 'bust', 'waist', 'hips', 'shoe_size'])}
                >
                   <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                     <Input label="Height (cm)" type="number" {...register('height_cm', { valueAsNumber: true })} error={errors.height_cm} />
                     <Input label="Weight (kg)" type="number" step="0.1" {...register('weight_kg', { valueAsNumber: true })} error={errors.weight_kg} />
                     <Input label="Shoe Size" {...register('shoe_size')} error={errors.shoe_size} />
                     
                     <div className="md:col-span-3 grid grid-cols-3 gap-6 pt-4 border-t border-dashed border-zinc-200 mt-2">
                        <Input label="Bust (in)" type="number" step="0.5" {...register('bust', { valueAsNumber: true })} error={errors.bust} />
                        <Input label="Waist (in)" type="number" step="0.5" {...register('waist', { valueAsNumber: true })} error={errors.waist} />
                        <Input label="Hips (in)" type="number" step="0.5" {...register('hips', { valueAsNumber: true })} error={errors.hips} />
                     </div>

                     <Input label="Eye Color" {...register('eye_color')} error={errors.eye_color} />
                     <Input label="Hair Color" {...register('hair_color')} error={errors.hair_color} />
                     <Select 
                       label="Hair Length"
                       {...register('hair_length')}
                       options={[
                          { value: 'Short', label: 'Short' },
                          { value: 'Medium', label: 'Medium' },
                          { value: 'Long', label: 'Long' },
                          { value: 'Very Long', label: 'Very Long' }
                       ]}
                       error={errors.hair_length}
                     />
                     <div className="md:col-span-3">
                        <Input label="Skin Tone" {...register('skin_tone')} error={errors.skin_tone} />
                     </div>
                   </div>
                </SectionCard>

                {/* Section 3: Professional Info */}
                <SectionCard 
                  icon={Briefcase} 
                  title="Professional Information"
                  completion={calculateCompletion(['bio', 'experience_level'])}
                >
                  <div className="space-y-6">
                     <TextArea 
                       label="Bio" 
                       {...register('bio')} 
                       error={errors.bio} 
                       rows={5}
                       helpText="Tell us about yourself (min 10 chars)"
                       className="min-h-[120px]"
                     />
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <Select 
                         label="Experience Level"
                         {...register('experience_level')}
                         options={[
                            { value: 'Beginner', label: 'Beginner' },
                            { value: 'Intermediate', label: 'Intermediate' },
                            { value: 'Experienced', label: 'Experienced' },
                            { value: 'Professional', label: 'Professional' }
                         ]}
                         error={errors.experience_level}
                      />
                      <Select 
                         label="Travel Availability"
                         {...register('availability_travel')}
                         options={[
                            { value: 'true', label: 'Yes' },
                            { value: 'false', label: 'No' }
                         ]}
                         error={errors.availability_travel}
                      />
                    </div>
                     <TextArea 
                       label="Training & Education" 
                       {...register('training')} 
                       error={errors.training}
                       rows={3}
                     />
                  </div>
                </SectionCard>

                {/* Section 4: Skills */}
                <SectionCard icon={Award} title="Skills & Languages">
                   <div className="space-y-6">
                      <Input 
                         label="Languages" 
                         placeholder="English, Spanish, French..." 
                         {...register('languages')} 
                         error={errors.languages}
                         helpText="Separate multiple languages with commas" 
                      />
                      <Input 
                         label="Specialties" 
                         placeholder="Modeling, Acting, Voiceover..." 
                         {...register('specialties')} 
                         error={errors.specialties} 
                         helpText="Separate multiple specialties with commas"
                      />
                      <Input 
                         label="Comfort Levels" 
                         placeholder="Swimwear, Lingerie, Nude..." 
                         {...register('comfort_levels')} 
                         error={errors.comfort_levels}
                         helpText="Separate with commas" 
                      />
                   </div>
                </SectionCard>

                {/* Section 5: Additional Details */}
                <SectionCard icon={FileText} title="Additional Details">
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <Input label="Ethnicity" {...register('ethnicity')} error={errors.ethnicity} />
                      <Input label="Union Membership" {...register('union_membership')} error={errors.union_membership} />
                      <Select 
                         label="Tattoos"
                         {...register('tattoos')}
                         options={[{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]}
                         error={errors.tattoos}
                      />
                      <Select 
                         label="Piercings"
                         {...register('piercings')}
                         options={[{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]}
                         error={errors.piercings}
                      />
                      <Select 
                         label="Work Eligibility"
                         {...register('work_eligibility')}
                         options={[{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }]}
                         error={errors.work_eligibility}
                      />
                      <Input label="Work Status" {...register('work_status')} error={errors.work_status} />
                   </div>
                </SectionCard>

                {/* Section 6: Social & Links */}
                <SectionCard icon={Share2} title="Social & Links">
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <Input label="Instagram Handle" prefix="@" {...register('instagram_handle')} error={errors.instagram_handle} />
                      <Input label="TikTok Handle" prefix="@" {...register('tiktok_handle')} error={errors.tiktok_handle} />
                      <Input label="Twitter Handle" prefix="@" {...register('twitter_handle')} error={errors.twitter_handle} />
                      <Input label="External Portfolio URL" {...register('portfolio_url')} error={errors.portfolio_url} />
                   </div>
                </SectionCard>

                {/* Section 7: Contact */}
                <SectionCard icon={Phone} title="Contact & Emergency">
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <Input label="Phone Number" {...register('phone')} error={errors.phone} />
                      <div className="md:col-span-2 pt-4 border-t border-dashed border-zinc-200 mt-2">
                        <h4 className="text-sm font-semibold text-zinc-900 mb-4">Emergency Contact</h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <Input label="Name" {...register('emergency_contact_name')} error={errors.emergency_contact_name} />
                          <Input label="Phone" {...register('emergency_contact_phone')} error={errors.emergency_contact_phone} />
                          <Input label="Relationship" {...register('emergency_contact_relationship')} error={errors.emergency_contact_relationship} />
                        </div>
                      </div>
                   </div>
                </SectionCard>
                
                 {/* Mobile Save Button */}
                <div className="block lg:hidden sticky bottom-4 z-20">
                  <Button 
                    type="submit" 
                    disabled={!isDirty || isUpdating} 
                    loading={isUpdating}
                    className="w-full shadow-lg bg-amber-600 text-white"
                  >
                    Save Changes
                  </Button>
                </div>
            </div>

            {/* Right Column: Profile Preview (40% -> col-span-2) */}
            <div className="hidden lg:block lg:col-span-2">
                <div className="sticky top-24 transition-all duration-300">
                   <ProfilePreview images={images} />
                </div>
            </div>
        </div>

      </form>
    </FormProvider>
  );
}
