// The review corpus: real Pholio profiles plus synthetic talents built from
// real photographs to stress the generator. `brief` says what each one tests.
import { FIXTURES } from './fixtures';
import { BATTERY } from './battery';

export const CORPUS = [
  { key: 'mia', brief: 'Prod profile · six strong editorial frames (demo set)', data: FIXTURES.mia },
  { key: 'natan', brief: 'Prod profile · selfies, a group dinner, a duplicate', data: FIXTURES.natan },
  { key: 'leul', brief: 'Prod profile · two photos, one watermarked', data: FIXTURES.leul },
  { key: 'agency', brief: 'Represented · long hyphenated surname · metric', data: FIXTURES.agency },
  { key: 'menAgency', brief: 'Menswear · represented · suits and full lengths', data: BATTERY.menAgency },
  { key: 'menLongName', brief: 'Menswear · very long name · freelance', data: BATTERY.menLongName },
  { key: 'darkStudio', brief: 'Low-key studio hero · represented by a one-word agency', data: BATTERY.darkStudio },
  { key: 'noFullLength', brief: 'No full length in the library', data: BATTERY.noFullLength },
  { key: 'mature', brief: 'Classic/mature · landscape hero', data: BATTERY.mature },
  { key: 'landscapes', brief: 'Landscape-only library', data: BATTERY.landscapes },
  { key: 'noStats', brief: 'No measurements · five-word name', data: BATTERY.noStats },
  { key: 'single', brief: 'One photo (black and white)', data: BATTERY.single },
  { key: 'messy', label: 'Natan (messy)', brief: 'Messy real library · selfies, group shots, duplicates, watermark', data: BATTERY.messy },
  { key: 'kids', brief: 'Kids track (age 12) · guardian contact', data: BATTERY.kids },
];
