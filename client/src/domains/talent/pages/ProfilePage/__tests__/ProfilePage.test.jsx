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
    Feather: makeIconMock('Feather'),
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
    Building2: makeIconMock('Building2'),
  };
});

// Mock framer-motion to render static markup
vi.mock('framer-motion', () => {
  // Generic passthrough: any motion.<tag> renders the plain tag, so new
  // motion elements (li, svg line/path, ...) never break this mock.
  const tagCache = new Map();
  const passthroughFor = (tag) => {
    if (!tagCache.has(tag)) {
      const Tag = tag;
      const Passthrough = ({ children, ...props }) => <Tag {...props}>{children}</Tag>;
      Passthrough.displayName = `motion.${tag}`;
      tagCache.set(tag, Passthrough);
    }
    return tagCache.get(tag);
  };
  return {
    motion: new Proxy({}, { get: (_target, tag) => passthroughFor(String(tag)) }),
    AnimatePresence: ({ children }) => <>{children}</>,
    useReducedMotion: () => false,
  };
});

// Mock talentApi
vi.mock('../../../api/talent', () => ({
  talentApi: {
    getProfile: vi.fn(),
    updateProfile: vi.fn(),
    replaceRepresentations: vi.fn(),
    generateBio: vi.fn(),
    refineBio: vi.fn(),
    listCompCardPresets: vi.fn().mockResolvedValue({ presets: [] }),
    getAvailability: vi.fn().mockResolvedValue({ availability_status: 'available' }),
    updateAvailability: vi.fn().mockResolvedValue({ availability_status: 'available' }),
    getBookouts: vi.fn().mockResolvedValue({ bookouts: [] }),
    createBookout: vi.fn().mockResolvedValue({}),
    deleteBookout: vi.fn().mockResolvedValue({}),
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
    vi.resetAllMocks();
    talentApi.listCompCardPresets.mockResolvedValue({ presets: [] });
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
    expect(screen.getByRole('button', { name: /save profile/i })).toBeDisabled();
    expect(screen.queryByText(/unsaved changes/i)).not.toBeInTheDocument();
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

  test('saves a manual bio with a minimal payload and verifies it after reload', async () => {
    let persistedProfile = { ...mockProfile };
    talentApi.getProfile.mockImplementation(async () => ({
      profile: persistedProfile,
    }));
    talentApi.updateProfile.mockImplementation(async ({ bio }) => {
      persistedProfile = {
        ...persistedProfile,
        bio: undefined,
        bio_raw: bio,
      };
      return { profile: persistedProfile };
    });
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
    expect(lastCallArg).toEqual({ bio: 'Updated bio.' });
    expect(talentApi.replaceRepresentations).not.toHaveBeenCalled();
    expect(talentApi.getProfile.mock.calls.length).toBeGreaterThanOrEqual(2);

    await waitFor(() => {
      expect(pholioToast.success).toHaveBeenCalledWith('Profile saved successfully');
      expect(saveButton).toBeDisabled();
      expect(screen.queryByText(/unsaved changes/i)).not.toBeInTheDocument();
    });
  });

  test('saves a generated bio and returns the profile to a clean state', async () => {
    const profileWithoutBio = {
      ...mockProfile,
      bio: null,
      bio_raw: null,
      weight_kg: '58.00',
    };
    const generatedBio =
      'LA-based editorial and commercial model with six years of campaign and runway experience.';

    let persistedProfile = { ...profileWithoutBio };
    talentApi.getProfile.mockImplementation(async () => ({
      profile: persistedProfile,
    }));
    talentApi.generateBio.mockResolvedValue({
      bio: generatedBio,
      wordCount: 14,
    });
    talentApi.updateProfile.mockImplementation(async ({ bio }) => {
      persistedProfile = {
        ...persistedProfile,
        bio_raw: bio,
      };
      return { profile: persistedProfile };
    });
    talentApi.replaceRepresentations.mockResolvedValue({ success: true });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ProfilePage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByLabelText('Loading profile...')).not.toBeInTheDocument();
    });

    const user = userEvent.setup();
    const saveButton = screen.getByRole('button', { name: /save profile/i });
    expect(saveButton).toBeDisabled();

    // The AI action is an icon, so its accessible name comes from aria-label —
    // which the old unlabelled flare never had.
    await user.click(screen.getByRole('button', { name: /write your bio with pholio/i }));

    const bioInput = screen.getByPlaceholderText(/tell us about yourself/i);
    await waitFor(() => expect(bioInput).toHaveValue(generatedBio));
    expect(saveButton).toBeEnabled();
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();

    await user.click(saveButton);

    await waitFor(() => {
      expect(talentApi.updateProfile).toHaveBeenCalledWith(
        { bio: generatedBio },
      );
      expect(talentApi.replaceRepresentations).not.toHaveBeenCalled();
      expect(talentApi.getProfile.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(pholioToast.success).toHaveBeenCalledWith('Profile saved successfully');
    });
    expect(saveButton).toHaveTextContent('Save profile');
    expect(saveButton).toBeDisabled();
    expect(screen.queryByText(/unsaved changes/i)).not.toBeInTheDocument();
  });

  test('keeps the form dirty and reports an error when the saved bio does not survive reload', async () => {
    const submittedBio = 'A revised bio that should be verified after saving.';
    talentApi.getProfile.mockResolvedValue({ profile: mockProfile });
    talentApi.updateProfile.mockResolvedValue({
      profile: {
        ...mockProfile,
        bio_raw: submittedBio,
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ProfilePage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByLabelText('Loading profile...')).not.toBeInTheDocument();
    });

    const user = userEvent.setup();
    const bioInput = screen.getByPlaceholderText(/tell us about yourself/i);
    await user.clear(bioInput);
    await user.type(bioInput, submittedBio);

    const saveButton = screen.getByRole('button', { name: /save profile/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(pholioToast.fromFailure).toHaveBeenCalled();
    });
    expect(pholioToast.success).not.toHaveBeenCalledWith('Profile saved successfully');
    expect(saveButton).toBeEnabled();
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();
  });
});
