// Real Pholio profiles (prod, read-only snapshot) with images served locally for the lab.
const img = (n, extra = {}) => ({ id: `lab-${n}`, src: `/compcard-lab/${n}.img`, ...extra });

export const FIXTURES = {
  mia: {
    profile: { slug: 'mia-voss', first_name: 'Mia', last_name: 'Voss', city: 'Los Angeles, CA', height_cm: 178, bust_cm: '81.0', waist_cm: '61.0', hips_cm: '88.0', shoe_size: '8 US', shoe_region: 'US', dress_size: '4', eye_color: 'Hazel', hair_color: 'Dark Brown', gender: 'Male', date_of_birth: '1997-04-12', phone: '8595195506' },
    email: 'mia@pholio.studio',
    portfolioUrl: 'pholio.studio/p/mia-voss',
    images: [img(1, { is_primary: true }), img(2), img(3), img(4), img(5), img(6)],
  },
  natan: {
    profile: { slug: 'natan', first_name: 'Natan', last_name: 'Getahun', city: 'New York, NY', height_cm: 169, bust_cm: '96.0', chest_cm: 98, waist_cm: '61.0', hips_cm: '76.0', inseam_cm: 81, shoe_size: '9', shoe_region: 'US', dress_size: '2', eye_color: 'Blue', hair_color: 'Brown', gender: 'Male', date_of_birth: '2004-12-03' },
    email: 'natan@example.com',
    portfolioUrl: 'pholio.studio/p/natan',
    images: [img(7), img(8, { is_primary: true }), img(9), img(10)],
  },
  leul: {
    profile: { slug: 'leul-eyassu', first_name: 'Leul', last_name: 'Eyassu', city: 'New York, United States', height_cm: 183, bust_cm: '100.0', waist_cm: '85.0', hips_cm: '100.0', shoe_size: '10', shoe_region: 'US', eye_color: 'Other', hair_color: 'Black', gender: 'Female', stats_track: 'womenswear', date_of_birth: '2006-12-15' },
    email: 'leul@example.com',
    portfolioUrl: 'pholio.studio/p/leul-eyassu',
    images: [img(11), img(12)],
  },
  agency: {
    profile: { slug: 'anais-novak', first_name: 'Anaïs', last_name: 'Novak-Okonkwo', city: 'Paris', height_cm: 177, bust_cm: 82, waist_cm: 60, hips_cm: 89, shoe_size: '40', shoe_region: 'EU', dress_size: '4', eye_color: 'Green', hair_color: 'Auburn', gender: 'Female', date_of_birth: '1999-02-01' },
    agency: { name: 'Maison Atelier Management', location: 'Paris', website: 'https://maisonatelier.com', support_email: 'women@maisonatelier.com' },
    portfolioUrl: 'pholio.studio/p/anais-novak',
    images: [img(5, { is_primary: true }), img(2), img(6), img(4), img(1), img(3)],
  },
};
