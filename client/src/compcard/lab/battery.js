// Synthetic talents built from real photographs, designed to break things:
// men, mature, B&W, landscape-only libraries, sparse libraries, duplicates,
// no full length, no stats, very long names, kids, agency vs freelance.
const c = (n, extra = {}) => ({ id: `c${n}`, src: `/compcard-lab/c/${n}.img`, ...extra });

const W = { height_cm: 177, bust_cm: 82, waist_cm: 61, hips_cm: 89, shoe_size: '8.5', shoe_region: 'US', dress_size: '4', hair_color: 'brown', eye_color: 'green', gender: 'Female', date_of_birth: '1999-05-01' };
const M = { height_cm: 188, chest_cm: 99, waist_cm: 79, inseam_cm: 84, shoe_size: '11', shoe_region: 'US', hair_color: 'dark brown', eye_color: 'brown', gender: 'Male', date_of_birth: '1996-03-01' };

export const BATTERY = {
  menAgency: { profile: { first_name: 'Theo', last_name: 'Larsen', city: 'London', ...M }, agency: { name: 'Select Model Management', location: 'London', website: 'https://selectmodel.com', support_email: 'men@selectmodel.com' }, portfolioUrl: 'pholio.studio/p/theo-larsen', images: [c(14, { is_primary: true }), c(32), c(33), c(11), c(24), c(3)] },
  menLongName: { profile: { first_name: 'Kwabena', last_name: 'Mensah-Adjei Okonkwo', city: 'Atlanta, GA', ...M }, email: 'kwabena.mensah@gmail.com', portfolioUrl: 'pholio.studio/p/kwabena', images: [c(2), c(23), c(20), c(21), c(22)] },
  noFullLength: { profile: { first_name: 'Ines', last_name: 'Sato', city: 'Tokyo', ...W }, email: 'ines@sato.jp', portfolioUrl: 'pholio.studio/p/ines-sato', images: [c(13), c(26), c(29), c(19), c(31)] },
  mature: { profile: { first_name: 'Margaret', last_name: 'Ellison', city: 'Chicago, IL', ...W, date_of_birth: '1971-02-02', height_cm: 170, dress_size: '8' }, email: 'meg@ellison.com', portfolioUrl: 'pholio.studio/p/margaret', images: [c(16, { is_primary: true }), c(1), c(6), c(8)] },
  single: { profile: { first_name: 'Ruben', last_name: 'Adler', city: 'Berlin', ...M }, email: 'ruben@adler.de', portfolioUrl: 'pholio.studio/p/ruben', images: [c(25)] },
  landscapes: { profile: { first_name: 'Dev', last_name: 'Raman', city: 'Mumbai', ...M }, email: 'dev@raman.in', portfolioUrl: 'pholio.studio/p/dev', images: [c(7), c(10), c(12), c(3), c(2)] },
  noStats: { profile: { first_name: 'Maria-Fernanda', last_name: 'de los Ángeles Castillo-Ruiz', city: 'Ciudad de México' }, email: 'mf.castillo@example.mx', portfolioUrl: 'pholio.studio/p/maria-fernanda', images: [c(28), c(5), c(18), c(17), c(30)] },
  kids: { profile: { first_name: 'Lily', last_name: 'Chen', city: 'Seattle, WA', height_cm: 142, shoe_size: '3', hair_color: 'black', eye_color: 'brown', gender: 'Female', date_of_birth: '2014-06-01' }, email: 'parent@chen.family', portfolioUrl: 'pholio.studio/p/lily', images: [c(1), c(6)] },
  messy: { profile: { first_name: 'Natan', last_name: 'Getahun', city: 'New York, NY', ...M, height_cm: 169 }, email: 'natan@example.com', portfolioUrl: 'pholio.studio/p/natan', images: [c(39), c(41), c(40), c(38), c(36), c(35), c(37)] },
  darkStudio: { profile: { first_name: 'Elena', last_name: 'Varga', city: 'Budapest', ...W }, agency: { name: 'Next', location: 'Paris', website: 'nextmanagement.com', support_email: 'paris@nextmanagement.com' }, portfolioUrl: 'pholio.studio/p/elena', images: [c(26, { is_primary: true }), c(24), c(14), c(17), c(18), c(4)] },
};
