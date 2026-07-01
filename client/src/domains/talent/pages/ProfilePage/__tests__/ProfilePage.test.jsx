import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, test, expect, beforeEach } from 'vitest';
import ProfilePage from '../index';
import { talentApi } from '../../../api/talent';
import { pholioToast } from '../../../../../shared/lib/pholio-toast';

// Mock lucide icons
vi.mock('lucide-react', () => {
  const makeIconMock = (name) => {
    const IconMock = (props) => <span {...props}>{name}Mock</span>;
    IconMock.displayName = name;
    return IconMock;
  };
  return {
    Instagram: makeIconMock('Instagram'),
    PlaySquare: makeIconMock('PlaySquare'),
    Trash2: makeIconMock('Trash2'),
    Globe: makeIconMock('Globe'),
    Check: makeIconMock('Check'),
    Link2: makeIconMock('Link2'),
    Sparkles: makeIconMock('Sparkles'),
    ClipboardList: makeIconMock('ClipboardList'),
    Menu: makeIconMock('Menu'),
    X: makeIconMock('X'),
    Camera: makeIconMock('Camera'),
    ChevronDown: makeIconMock('ChevronDown'),
    ChevronUp: makeIconMock('ChevronUp'),
    Plus: makeIconMock('Plus'),
    Settings: makeIconMock('Settings'),
    PencilLine: makeIconMock('PencilLine'),
    AlertCircle: makeIconMock('AlertCircle'),
    CheckCircle2: makeIconMock('CheckCircle2'),
    Sparkle: makeIconMock('Sparkle'),
  };
});

// Mock framer-motion to render static markup
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }) => <div {...props}>{children}</div>,
    span: ({ children, ...props }) => <span {...props}>{children}</span>,
    button: ({ children, ...props }) => <button {...props}>{children}</button>,
    header: ({ children, ...props }) => <header {...props}>{children}</header>,
    nav: ({ children, ...props }) => <nav {...props}>{children}</nav>,
    aside: ({ children, ...props }) => <aside {...props}>{children}</aside>,
    main: ({ children, ...props }) => <main {...props}>{children}</main>,
  },
  AnimatePresence: ({ children }) => <>{children}</>,
  useReducedMotion: () => false,
}));

// Mock talentApi
vi.mock('../../../api/talent', () => ({
  talentApi: {
    getProfile: vi.fn(),
    updateProfile: vi.fn(),
    replaceRepresentations: vi.fn(),
    listCompCardPresets: vi.fn().mockResolvedValue({ presets: [] }),
  },
}));

// Mock useAuth hook
vi.mock('../../../auth/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-123', email: 'talent@example.com' },
  }),
}));

// Mock toast to avoid actual screen notifications
vi.mock('../../../../../shared/lib/pholio-toast', () => ({
  pholioToast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    fromFailure: vi.fn(),
  },
}));

const mockProfile = {
  id: 'profile-123',
  user_id: 'user-123',
  first_name: 'Nova',
  last_name: 'Lane',
  email: 'talent@example.com',
  city: 'New York',
  bio: 'Professional model.',
  date_of_birth: '1995-05-15',
  height_cm: 175,
  weight_kg: 58,
  bust_cm: 86,
  waist_cm: 61,
  hips_cm: 89,
  languages: ['English', 'Spanish'],
  specialties: ['Runway'],
  guardian_consent_at: null,
  experience_level: null,
};

describe('ProfilePage Component', () => {
  let queryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    vi.clearAllMocks();
  });

  test('renders loading skeleton initially', () => {
    talentApi.getProfile.mockReturnValue(new Promise(() => {})); // Never resolves

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ProfilePage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(screen.getByLabelText('Loading profile...')).toBeInTheDocument();
  });

  test('hydrates and renders form fields with loaded profile data', async () => {
    talentApi.getProfile.mockResolvedValue({ profile: mockProfile });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ProfilePage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Wait for skeleton to go away
    await waitFor(() => {
      expect(screen.queryByLabelText('Loading profile...')).not.toBeInTheDocument();
    });

    // Check hydration of text inputs
    expect(screen.getByRole('textbox', { name: /first name/i })).toHaveValue('Nova');
    expect(screen.getByRole('textbox', { name: /last name/i })).toHaveValue('Lane');
    expect(screen.getByPlaceholderText(/tell us about yourself/i)).toHaveValue('Professional model.');
  });

  test('shows validation errors for invalid input and blocks saving', async () => {
    talentApi.getProfile.mockResolvedValue({ profile: mockProfile });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ProfilePage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.queryByLabelText('Loading profile...')).not.toBeInTheDocument();
    });

    const firstNameInput = screen.getByRole('textbox', { name: /first name/i });
    
    const user = userEvent.setup();
    // Clear first name to trigger validation error
    await user.clear(firstNameInput);
    
    // Attempt save
    const saveButton = screen.getByRole('button', { name: /save profile/i });
    await user.click(saveButton);

    // Verify first_name error or invalid state
    await waitFor(() => {
      expect(firstNameInput).toBeInvalid();
    });
  });

  test('submits successfully and calls API with normalized data on save', async () => {
    talentApi.getProfile.mockResolvedValue({ profile: mockProfile });
    talentApi.updateProfile.mockResolvedValue({ success: true, profile: { ...mockProfile, bio: 'Updated bio.' } });
    talentApi.replaceRepresentations.mockResolvedValue({ success: true });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ProfilePage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.queryByLabelText('Loading profile...')).not.toBeInTheDocument();
    });

    // Make form dirty by editing the bio
    const bioInput = screen.getByPlaceholderText(/tell us about yourself/i);
    const user = userEvent.setup();
    await user.clear(bioInput);
    await user.type(bioInput, 'Updated bio.');

    pholioToast.error.mockClear();
    const saveButton = screen.getByRole('button', { name: /save profile/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(talentApi.updateProfile).toHaveBeenCalled();
    });

    const lastCallArg = talentApi.updateProfile.mock.calls[0][0];
    expect(lastCallArg.bio).toBe('Updated bio.');
    expect(lastCallArg.city).toBe('New York');
    expect(lastCallArg.gender).toBeNull(); // Empty string converted to null
  });
});
