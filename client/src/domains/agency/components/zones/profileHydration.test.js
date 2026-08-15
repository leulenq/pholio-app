import { describe, expect, it } from 'vitest';
import { getTalentSiteLink } from './profileHydration';

describe('getTalentSiteLink', () => {
  it('shows a talent portfolio route regardless of Pro status', () => {
    expect(getTalentSiteLink({ slug: 'ava-stone' })).toEqual({
      href: '/portfolio/ava-stone',
      label: 'View site',
      external: false,
    });
  });

  it('shows an explicitly configured portfolio URL regardless of Pro status', () => {
    expect(
      getTalentSiteLink({
        portfolioUrl: 'https://ava.example.com',
      }),
    ).toEqual({
      href: 'https://ava.example.com',
      label: 'ava.example.com',
      external: true,
    });
  });

  it('returns no link when the talent has no public target', () => {
    expect(getTalentSiteLink({})).toBeNull();
  });
});
