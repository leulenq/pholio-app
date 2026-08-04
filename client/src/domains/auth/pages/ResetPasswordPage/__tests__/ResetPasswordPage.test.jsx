import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import ResetPasswordPage from '../ResetPasswordPage';

const {
  verifyPasswordResetCode,
  confirmPasswordReset,
  signInWithEmailAndPassword,
} = vi.hoisted(() => ({
  verifyPasswordResetCode: vi.fn(),
  confirmPasswordReset: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  verifyPasswordResetCode,
  confirmPasswordReset,
  signInWithEmailAndPassword,
}));

vi.mock('../../../../../shared/lib/firebase', () => ({ auth: {} }));
vi.mock('../../../../../shared/lib/pholio-auth/broadcast', () => ({
  notifyAuthChange: vi.fn(),
}));

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/dashboard/talent" element={<div>Dashboard landed</div>} />
        <Route path="/login" element={<div>Login screen</div>} />
        <Route path="/login/forgot-password" element={<div>Forgot password screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    verifyPasswordResetCode.mockReset();
    confirmPasswordReset.mockReset();
    signInWithEmailAndPassword.mockReset();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('a link with no oobCode shows the invalid state without calling Firebase', async () => {
    renderAt('/reset-password');

    expect(await screen.findByText(/expired/i)).toBeInTheDocument();
    expect(screen.getByText(/incomplete/i)).toBeInTheDocument();
    expect(verifyPasswordResetCode).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: /request a new link/i })).toHaveAttribute(
      'href',
      '/login/forgot-password',
    );
  });

  test('an expired code renders the specific expiry message', async () => {
    verifyPasswordResetCode.mockRejectedValue({ code: 'auth/expired-action-code' });
    renderAt('/reset-password?mode=resetPassword&oobCode=stale-code');

    expect(await screen.findByText(/this link has expired/i)).toBeInTheDocument();
  });

  test('a valid code shows the set-password form addressed to that email', async () => {
    verifyPasswordResetCode.mockResolvedValue('talent@example.com');
    renderAt('/reset-password?mode=resetPassword&oobCode=good-code');

    expect(await screen.findByText('talent@example.com')).toBeInTheDocument();
    expect(screen.getByLabelText(/new password/i)).toBeInTheDocument();
  });

  test('mismatched passwords are rejected before Firebase is asked to confirm anything', async () => {
    verifyPasswordResetCode.mockResolvedValue('talent@example.com');
    renderAt('/reset-password?mode=resetPassword&oobCode=good-code');
    await screen.findByLabelText(/new password/i);

    fireEvent.change(screen.getByLabelText(/^new password$/i), {
      target: { value: 'password1' },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: 'password2' },
    });
    fireEvent.click(screen.getByRole('button', { name: /set password/i }));

    expect(await screen.findByText(/don.t match/i)).toBeInTheDocument();
    expect(confirmPasswordReset).not.toHaveBeenCalled();
  });

  test('full success: resets, signs in, notifies the backend, and lands on the dashboard', async () => {
    verifyPasswordResetCode.mockResolvedValue('talent@example.com');
    confirmPasswordReset.mockResolvedValue(undefined);
    signInWithEmailAndPassword.mockResolvedValue({
      user: { getIdToken: vi.fn().mockResolvedValue('fresh-id-token') },
    });
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, redirect: '/dashboard/talent' }),
    });

    renderAt('/reset-password?mode=resetPassword&oobCode=good-code');
    await screen.findByLabelText(/new password/i);

    fireEvent.change(screen.getByLabelText(/^new password$/i), {
      target: { value: 'a-strong-password' },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: 'a-strong-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: /set password/i }));

    await waitFor(() => expect(confirmPasswordReset).toHaveBeenCalledWith(
      {},
      'good-code',
      'a-strong-password',
    ));
    await waitFor(() =>
      expect(signInWithEmailAndPassword).toHaveBeenCalledWith(
        {},
        'talent@example.com',
        'a-strong-password',
      ),
    );

    // This is the flag /api/login uses to fire the "your password was
    // changed" confirmation email — the whole point of routing through a real
    // sign-in here instead of just calling confirmPasswordReset and stopping.
    await waitFor(() => {
      const [, options] = fetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body).toEqual({
        firebase_token: 'fresh-id-token',
        password_just_reset: true,
      });
    });

    expect(await screen.findByText('Dashboard landed')).toBeInTheDocument();
  });

  test('password changes even if the automatic sign-in afterward fails', async () => {
    verifyPasswordResetCode.mockResolvedValue('talent@example.com');
    confirmPasswordReset.mockResolvedValue(undefined);
    signInWithEmailAndPassword.mockRejectedValue(new Error('network blip'));

    renderAt('/reset-password?mode=resetPassword&oobCode=good-code');
    await screen.findByLabelText(/new password/i);

    fireEvent.change(screen.getByLabelText(/^new password$/i), {
      target: { value: 'a-strong-password' },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: 'a-strong-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: /set password/i }));

    // The password change itself already succeeded (confirmPasswordReset
    // resolved) — this must read as success, never as an error, even though
    // the follow-on sign-in failed.
    expect(await screen.findByText(/password/i, { selector: 'h1' })).toBeInTheDocument();
    expect(screen.getByText(/updated/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /continue to sign in/i })).toHaveAttribute(
      'href',
      '/login',
    );
  });

  test('a weak password from confirmPasswordReset is shown, not swallowed', async () => {
    verifyPasswordResetCode.mockResolvedValue('talent@example.com');
    confirmPasswordReset.mockRejectedValue({ code: 'auth/weak-password' });

    renderAt('/reset-password?mode=resetPassword&oobCode=good-code');
    await screen.findByLabelText(/new password/i);

    fireEvent.change(screen.getByLabelText(/^new password$/i), {
      target: { value: 'abcdef' },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: 'abcdef' },
    });
    fireEvent.click(screen.getByRole('button', { name: /set password/i }));

    expect(await screen.findByText(/at least six characters/i)).toBeInTheDocument();
    expect(signInWithEmailAndPassword).not.toHaveBeenCalled();
  });
});
