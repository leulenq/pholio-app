import { describe, expect, it } from 'vitest';
import { getTalentHeaderTone } from '../talentHeaderTone';

describe('getTalentHeaderTone', () => {
  it('keeps Overview on the dark cinematic shell', () => {
    expect(getTalentHeaderTone('/dashboard/talent')).toBe('dark');
    expect(getTalentHeaderTone('/dashboard/talent/')).toBe('dark');
  });

  it('uses light tone for cream paper work pages', () => {
    expect(getTalentHeaderTone('/dashboard/talent/messages')).toBe('light');
    expect(getTalentHeaderTone('/dashboard/talent/media')).toBe('light');
    expect(getTalentHeaderTone('/dashboard/talent/profile')).toBe('light');
    expect(getTalentHeaderTone('/dashboard/talent/applications')).toBe('light');
    expect(getTalentHeaderTone('/dashboard/talent/intel')).toBe('light');
    expect(getTalentHeaderTone('/dashboard/talent/settings/subscription')).toBe('light');
  });
});
