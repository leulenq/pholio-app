import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signInWithEmailAndPassword,
  sendPasswordResetEmail
} from 'firebase/auth';
import { Loader2, AlertCircle, Instagram, Mail, Lock, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { auth } from '../../lib/firebase';

import GradientText from '../../components/ui/GradientText';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [resetSent, setResetSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // Use useAuth to check session, but skip redirect to prevent loop
  // This allows us to auto-redirect if already logged in
  const { user } = useAuth({ skipRedirect: true });

  useEffect(() => {
    if (user) {
      navigate('/dashboard/talent');
    }
  }, [user, navigate]);

  // Get return URL from state or query param
  const from = location.state?.from?.pathname || '/dashboard/talent';

  // Handle Google Sign In
  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      // Get ID token
      const idToken = await user.getIdToken();
      
      // Send to backend
      await authenticateWithBackend(idToken);
    } catch (err) {
      console.error("Google Sign In Error:", err);
      // Clean up Firebase error messages
      setError(
          err.code === 'auth/popup-closed-by-user' 
          ? 'Sign in cancelled.' 
          : 'Failed to sign in with Google. Please try again.'
      );
      setIsGoogleLoading(false);
    }
  };

  // Handle Email Sign In
  const handleEmailSignIn = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Get ID token
      const idToken = await user.getIdToken();
      
      // Send to backend
      await authenticateWithBackend(idToken);
    } catch (err) {
      console.error("Email Sign In Error:", err);
      // Map Firebase errors to user-friendly messages
      let msg = 'Failed to sign in. Please check your credentials.';
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        msg = 'Invalid email or password.';
      } else if (err.code === 'auth/invalid-email') {
        msg = 'Please enter a valid email address.';
      } else if (err.code === 'auth/too-many-requests') {
        msg = 'Too many failed attempts. Please try again later.';
      }
      setError(msg);
      setIsLoading(false);
    }
  };

  // Handle Forgot Password
  const handleForgotPassword = async () => {
    if (!email) {
      setError('Please enter your email address first to reset your password.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResetSent(false);

    try {
      await sendPasswordResetEmail(auth, email);
      setResetSent(true);
      setIsLoading(false);
    } catch (err) {
      console.error("Password Reset Error:", err);
      let msg = 'Failed to send reset email. Please try again.';
      if (err.code === 'auth/user-not-found') {
        msg = 'No account found with this email.';
      } else if (err.code === 'auth/invalid-email') {
        msg = 'Please enter a valid email address.';
      }
      setError(msg);
      setIsLoading(false);
    }
  };

  // Send token to Pholio Backend
  const authenticateWithBackend = async (idToken) => {
    try {
      // Use /api/login to avoid collision with client-side /login route and ensure proxying
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ firebase_token: idToken })
      });

      // Check Content-Type to ensure we got JSON back
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        // If not JSON, it's likely a server error page or an unexpected redirect
        // Read text to debug
        const text = await response.text();
        console.error("Non-JSON response from backend:", text.substring(0, 500));
        throw new Error(`Server returned unexpected response (${response.status})`);
      }

      const data = await response.json();

      if (!response.ok) {
        // Extract error message from various formats
        let errorMessage = 'Backend authentication failed';
        
        if (typeof data.error === 'string') {
            errorMessage = data.error;
        } else if (data.error && data.error.message) {
            errorMessage = data.error.message;
        } else if (data.errors) {
            // Handle Laravel-style/Validation object errors
            const firstError = Object.values(data.errors)[0];
            if (Array.isArray(firstError)) {
                errorMessage = firstError[0];
            } else if (typeof firstError === 'string') {
                errorMessage = firstError;
            }
        } else if (data.message) {
            errorMessage = data.message;
        }
        
        throw new Error(errorMessage);
      }

      // Success! Redirect to app
      // window.location.href ensures a full reload to pick up the new session cookie reliably
      if (data.redirect) {
          window.location.href = data.redirect;
      } else {
          window.location.href = from;
      }

    } catch (err) {
      console.error("Backend Auth Error:", err);
      // Show the actual error message if available, otherwise generic
      setError(err.message || 'Server connection failed. Please try again.');
      setIsLoading(false);
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto relative">
      {/* Paper Grain Texture (Premium Editorial) */}
      <div 
        style={{
          position: 'fixed',
          inset: 0,
          opacity: 0.02,
          pointerEvents: 'none',
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          backgroundSize: '150px 150px',
          zIndex: 56,
        }}
      />

      {/* Sign In Heading */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ 
          fontFamily: "var(--ag-font-serif, 'Playfair Display', Georgia, serif)", 
          fontSize: '2.5rem', 
          fontWeight: 400, 
          color: '#1A1815', 
          letterSpacing: '-0.01em',
          lineHeight: 1.1,
          marginBottom: '8px'
        }}>
          <GradientText
            colors={["#c9a559", "#c9a559", "#D4BC8A", "#c9a559"]}
            animationSpeed={14}
            showBorder={false}
            className="custom-class"
          >
            Welcome back.
          </GradientText>
        </h1>
        <p style={{ 
          fontFamily: "var(--ag-font-sans, 'Inter', sans-serif)", 
          fontSize: '14px', 
          color: '#9C958E', 
          letterSpacing: '0.01em',
          fontWeight: 400
        }}>
          Sign in to your Pholio account.
        </p>
      </div>

      {resetSent && (
        <div style={{ 
          background: 'rgba(39,174,96,0.06)', 
          border: '1px solid rgba(39,174,96,0.12)', 
          borderRadius: '8px', 
          padding: '14px 16px', 
          marginBottom: '28px', 
          display: 'flex', 
          alignItems: 'flex-start', 
          gap: '10px', 
          color: '#27AE60', 
          fontSize: '14px', 
          fontFamily: "var(--ag-font-sans, 'Inter', sans-serif)",
          boxShadow: '0 2px 8px rgba(39,174,96,0.04)'
        }}>
          <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
          <span>Password reset email sent. Please check your inbox.</span>
        </div>
      )}

      {error && (
        <div style={{ 
          background: 'rgba(192,57,43,0.06)', 
          border: '1px solid rgba(192,57,43,0.12)', 
          borderRadius: '8px', 
          padding: '14px 16px', 
          marginBottom: '28px', 
          display: 'flex', 
          alignItems: 'flex-start', 
          gap: '10px', 
          color: '#C0392B', 
          fontSize: '14px', 
          fontFamily: "var(--ag-font-sans, 'Inter', sans-serif)",
          boxShadow: '0 2px 8px rgba(192,57,43,0.04)'
        }}>
          <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
          <span>{error}</span>
        </div>
      )}

      {/* Social Login Buttons - Side-by-Side Pill Layout */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '32px' }}>
        <button
          onClick={handleGoogleSignIn}
          disabled={isLoading || isGoogleLoading}
          style={{
            flex: 1,
            height: '48px',
            borderRadius: '12px',
            border: '1px solid #E2E8F0',
            background: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            cursor: 'pointer',
            transition: 'all 0.3s cubic-bezier(0.16,1,0.3,1)',
            fontSize: '14px',
            fontWeight: 600,
            fontFamily: "var(--ag-font-sans, 'Inter', sans-serif)",
            color: '#1A1815',
            opacity: (isLoading || isGoogleLoading) ? 0.6 : 1,
          }}
          onMouseEnter={(e) => { 
            e.currentTarget.style.background = '#FFFFFF'; 
            e.currentTarget.style.borderColor = '#B8956A';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(184,149,106,0.08)';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={(e) => { 
            e.currentTarget.style.background = '#FFFFFF'; 
            e.currentTarget.style.borderColor = '#E2E8F0';
            e.currentTarget.style.boxShadow = 'none';
            e.currentTarget.style.transform = 'none';
          }}
        >
          {isGoogleLoading ? (
            <Loader2 className="animate-spin" size={18} />
          ) : (
            <>
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" style={{ width: '18px', height: '18px' }} />
              <span>Google</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={(e) => { e.preventDefault(); }}
          disabled={isLoading || isGoogleLoading}
          style={{
            flex: 1,
            height: '48px',
            borderRadius: '12px',
            border: '1px solid #E2E8F0',
            background: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            cursor: 'pointer',
            transition: 'all 0.3s cubic-bezier(0.16,1,0.3,1)',
            fontSize: '14px',
            fontWeight: 600,
            fontFamily: "var(--ag-font-sans, 'Inter', sans-serif)",
            color: '#1A1815',
          }}
          onMouseEnter={(e) => { 
            e.currentTarget.style.background = '#FFFFFF'; 
            e.currentTarget.style.borderColor = '#B8956A';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(184,149,106,0.08)';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={(e) => { 
            e.currentTarget.style.background = '#FFFFFF'; 
            e.currentTarget.style.borderColor = '#E2E8F0';
            e.currentTarget.style.boxShadow = 'none';
            e.currentTarget.style.transform = 'none';
          }}
        >
          <Instagram size={18} style={{ color: '#000000' }} />
          <span>Instagram</span>
        </button>
      </div>

      {/* Divider */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '20px', 
        marginBottom: '32px' 
      }}>
        <div style={{ flex: 1, height: '1px', background: '#C9A55A', opacity: 0.3 }} />
        <span style={{ 
          fontSize: '12px', 
          color: '#9C958E', 
          fontFamily: "var(--ag-font-sans, 'Inter', sans-serif)",
          fontWeight: 500,
          whiteSpace: 'nowrap',
          letterSpacing: '0.02em'
        }}>
          Or Continue With
        </span>
        <div style={{ flex: 1, height: '1px', background: '#C9A55A', opacity: 0.3 }} />
      </div>

      {/* Email Form */}
      <form onSubmit={handleEmailSignIn} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Email Address */}
        <div>
          <label style={{ 
            display: 'block', 
            fontSize: '12px', 
            fontWeight: 500, 
            color: '#9C958E', 
            marginBottom: '12px', 
            fontFamily: "var(--ag-font-sans, 'Inter', sans-serif)" 
          }}>
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isLoading || isGoogleLoading}
            placeholder="sadeghsadegi1999@gmail.com"
            required
            style={{
              width: '100%',
              height: '52px',
              padding: '0 16px',
              background: '#F8F9FA',
              border: '1px solid #E9ECEF',
              borderRadius: '12px',
              fontSize: '14px',
              fontFamily: "var(--ag-font-sans, 'Inter', sans-serif)",
              color: '#343A40',
              outline: 'none',
              transition: 'all 0.2s ease',
              boxSizing: 'border-box',
            }}
            onFocus={(e) => { 
              e.target.style.background = '#FFFFFF';
              e.target.style.borderColor = '#B8956A'; 
              e.target.style.boxShadow = '0 0 0 4px rgba(184,149,106,0.06)';
            }}
            onBlur={(e) => { 
              e.target.style.background = '#F8F9FA';
              e.target.style.borderColor = '#E9ECEF'; 
              e.target.style.boxShadow = 'none';
            }}
          />
        </div>

        {/* Password */}
        <div style={{ marginBottom: '8px' }}>
          <label style={{ 
            display: 'block', 
            fontSize: '12px', 
            fontWeight: 500, 
            color: '#9C958E', 
            marginBottom: '12px', 
            fontFamily: "var(--ag-font-sans, 'Inter', sans-serif)" 
          }}>
            Password
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading || isGoogleLoading}
              placeholder="••••••••"
              required
              style={{
                width: '100%',
                height: '52px',
                padding: '0 16px',
                background: '#F8F9FA',
                border: '1px solid #E9ECEF',
                borderRadius: '12px',
                fontSize: '14px',
                fontFamily: "var(--ag-font-sans, 'Inter', sans-serif)",
                color: '#343A40',
                outline: 'none',
                transition: 'all 0.2s ease',
                boxSizing: 'border-box',
              }}
              onFocus={(e) => { 
                e.target.style.background = '#FFFFFF';
                e.target.style.borderColor = '#B8956A'; 
                e.target.style.boxShadow = '0 0 0 4px rgba(184,149,106,0.06)';
              }}
              onBlur={(e) => { 
                e.target.style.background = '#F8F9FA';
                e.target.style.borderColor = '#E9ECEF'; 
                e.target.style.boxShadow = 'none';
              }}
            />
            <button
              type="button"
              style={{ 
                position: 'absolute', 
                right: '16px', 
                top: '50%', 
                transform: 'translateY(-50%)', 
                background: 'none', 
                border: 'none', 
                padding: 0, 
                color: '#9C958E', 
                cursor: 'pointer' 
              }}
            >
              <Lock size={16} />
            </button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={isLoading || isGoogleLoading}
              style={{ 
                background: 'none', 
                border: 'none', 
                padding: 0, 
                fontSize: '13px', 
                color: '#B8956A', 
                cursor: 'pointer', 
                fontWeight: 600, 
                fontFamily: "var(--ag-font-sans, 'Inter', sans-serif)",
                transition: 'color 0.2s ease',
                opacity: (isLoading || isGoogleLoading) ? 0.6 : 1
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#A68459'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#B8956A'}
            >
              Forgot Password?
            </button>
          </div>
        </div>

        {/* LOGIN Button (Premium Pholio Gold Style) */}
        <button
          type="submit"
          disabled={isLoading || isGoogleLoading}
          style={{
            width: '100%',
            height: '52px',
            background: '#C9A55A',
            color: '#FFFFFF',
            fontWeight: 600,
            fontSize: '14px',
            fontFamily: "var(--ag-font-sans, 'Inter', sans-serif)",
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            transition: 'all 0.3s cubic-bezier(0.16,1,0.3,1)',
            opacity: (isLoading || isGoogleLoading) ? 0.7 : 1,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            boxShadow: '0 4px 12px rgba(201,165,90,0.15)'
          }}
          onMouseEnter={(e) => { 
            if (!isLoading && !isGoogleLoading) {
              e.currentTarget.style.background = '#D4BC8A';
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(201,165,90,0.25)';
            }
          }}
          onMouseLeave={(e) => { 
            e.currentTarget.style.background = '#C9A55A';
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(201,165,90,0.15)';
          }}
        >
          {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'LOGIN'}
        </button>
      </form>

      {/* Links */}
      <div style={{ marginTop: '32px', display: 'flex', justifyContent: 'center', fontFamily: "var(--ag-font-sans, 'Inter', sans-serif)" }}>
        <p style={{ fontSize: '14px', color: '#9C958E' }}>
          Don't have an account?{' '}
          <Link to="/onboarding" style={{ color: '#B8956A', fontWeight: 700, textDecoration: 'none', marginLeft: '4px', transition: 'color 0.2s ease' }}>Sign up for free</Link>
        </p>
      </div>
    </div>
  );
}


