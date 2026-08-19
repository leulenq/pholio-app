import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

import HandoffScene from '../HandoffScene';

const WEB_ROUTE = {
  agencyName: 'The Society Management',
  channelType: 'official_web_form',
  sourceUrl: 'https://example.com/apply',
};

const EMAIL_ROUTE = {
  agencyName: 'Muse Model Management',
  channelType: 'official_email',
  sourceUrl: 'https://example.com/contact',
};

const idleMutation = () => ({
  mutate: vi.fn(),
  isPending: false,
  isSuccess: false,
  isError: false,
});

function renderHandoff(props = {}) {
  const logSubmission = props.logSubmission || idleMutation();
  const utils = render(
    <HandoffScene
      route={WEB_ROUTE}
      firstName="Ada"
      exportState={{ status: 'done', filename: 'society-set.zip', fileCount: 6, imageCount: 4 }}
      frameCount={4}
      logSubmission={logSubmission}
      onOutboundClick={vi.fn()}
      onExit={vi.fn()}
      onBack={vi.fn()}
      {...props}
    />,
  );
  return { ...utils, logSubmission };
}

describe('HandoffScene — honesty', () => {
  test('never says the package was sent, submitted or confirmed', () => {
    renderHandoff();

    expect(screen.queryByText(/\bsubmitted\b/i)).toBeNull();
    expect(screen.queryByText(/submission confirmed/i)).toBeNull();
    expect(screen.queryByText(/has been sent/i)).toBeNull();
    expect(screen.queryByText(/thank you/i)).toBeNull();
  });

  test('the receipt line states the actual status, where a Pholio submission says "under review"', () => {
    renderHandoff();

    expect(screen.getByText(/Not sent yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/under review/i)).toBeNull();
  });

  test('names the archive that actually landed', () => {
    renderHandoff();

    expect(screen.getByText(/society-set\.zip · 6 files/)).toBeInTheDocument();
    expect(screen.getByText(/4 images, prepared to/)).toBeInTheDocument();
  });
});

describe('HandoffScene — sending it', () => {
  test('the steps are the errand for this channel, in order', () => {
    renderHandoff({ route: EMAIL_ROUTE });

    const steps = screen.getAllByRole('listitem');
    expect(steps[0]).toHaveTextContent(/EMAIL\.txt/);
    expect(steps[0]).toHaveTextContent(/Muse Model Management/);
    expect(screen.getByText(/Send it from your own address/)).toBeInTheDocument();
    // A web-form instruction would be wrong here.
    expect(screen.queryByText(/Upload the images/)).toBeNull();
  });

  test('a web-form agency is told to keep the published order', () => {
    renderHandoff();

    expect(screen.getByText(/in the order they are numbered/i)).toBeInTheDocument();
  });

  test('the outbound link opens the agency and is counted', async () => {
    const onOutboundClick = vi.fn();
    renderHandoff({ onOutboundClick });

    const link = screen.getByRole('link', { name: /open their application page/i });
    expect(link).toHaveAttribute('href', 'https://example.com/apply');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));

    await userEvent.click(link);
    expect(onOutboundClick).toHaveBeenCalledTimes(1);
  });

  test('a route with no destination says so rather than linking nowhere', () => {
    renderHandoff({ route: { ...WEB_ROUTE, sourceUrl: null } });

    expect(screen.getByText(/no published submission link/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /open their application page/i }),
    ).toBeNull();
  });
});

describe('HandoffScene — the record', () => {
  test('asks rather than assumes, and can be walked past', async () => {
    const logSubmission = idleMutation();
    renderHandoff({ logSubmission });

    await userEvent.click(screen.getByRole('button', { name: /not yet/i }));
    expect(screen.queryByText(/put it on record/i)).toBeNull();
    expect(logSubmission.mutate).not.toHaveBeenCalled();
  });

  test('logging is an explicit answer to an explicit question', async () => {
    const logSubmission = idleMutation();
    renderHandoff({ logSubmission });

    await userEvent.click(screen.getByRole('button', { name: /i’ve sent it/i }));
    expect(logSubmission.mutate).toHaveBeenCalledTimes(1);
  });

  test('a logged submission says where it went', () => {
    renderHandoff({ logSubmission: { ...idleMutation(), isSuccess: true } });

    expect(screen.getByText(/in your submission history/i)).toBeInTheDocument();
  });

  test('a failed log never implicates the archive', () => {
    renderHandoff({ logSubmission: { ...idleMutation(), isError: true } });

    expect(screen.getByRole('alert')).toHaveTextContent(/archive is unaffected/i);
  });
});

describe('HandoffScene — what you keep', () => {
  test('states the payoff that exists whether or not the agency ever answers', () => {
    renderHandoff();

    const keep = screen.getByText('What you keep').closest('div');
    expect(within(keep).getByText(/on your own machine/i)).toBeInTheDocument();
    expect(within(keep).getByText(/ready to\s+prepare again/i)).toBeInTheDocument();
    expect(within(keep).getByRole('link', { name: /download comp card/i })).toBeInTheDocument();
  });

  test('the portfolio link only appears when there is a portfolio', () => {
    const { rerender } = renderHandoff();
    expect(screen.queryByRole('link', { name: /view portfolio link/i })).toBeNull();

    rerender(
      <HandoffScene
        route={WEB_ROUTE}
        firstName="Ada"
        exportState={{ status: 'done', filename: 'set.zip', fileCount: 6, imageCount: 4 }}
        frameCount={4}
        logSubmission={idleMutation()}
        onOutboundClick={vi.fn()}
        onExit={vi.fn()}
        onBack={vi.fn()}
        portfolioSlug="ada"
      />,
    );
    expect(screen.getByRole('link', { name: /view portfolio link/i })).toHaveAttribute(
      'href',
      '/portfolio/ada',
    );
  });
});

describe('HandoffScene — leaving it', () => {
  test('offers the market and a way back to the set', async () => {
    const onExit = vi.fn();
    const onBack = vi.fn();
    renderHandoff({ onExit, onBack });

    await userEvent.click(screen.getByRole('button', { name: /back to the market/i }));
    expect(onExit).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: /change the set/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  test('locks the page behind it while it is up, and releases on unmount', () => {
    const { unmount } = renderHandoff();
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});
