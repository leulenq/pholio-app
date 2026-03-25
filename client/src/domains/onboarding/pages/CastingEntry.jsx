/**
 * Casting Entry - Step 1: Authentication Choice
 * Brand-compliant auth selection: Google, Instagram, or Manual
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  createUserWithEmailAndPassword, 
  sendEmailVerification,
  updateProfile,
  signOut
} from 'firebase/auth';
import { auth } from '../../../shared/lib/firebase';
import { useCastingEntry } from '../../../hooks/useCasting';
import { useTypeToFocus } from '../../../shared/hooks/useTypeToFocus';
import { toast } from 'sonner';
import { fadeVariants, containerVariants, childVariants } from './animations';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

import { ThinkingText } from './ThinkingText';
import { CinematicDivider } from './CinematicDivider';

function CastingEntry({ onComplete, onProgress }) {
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [manualStep, setManualStep] = useState(0); // 0: choice, 1: name, 2: email, 3: password, 4: verify
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const entryMutation = useCastingEntry();
  
  const inputRef = React.useRef(null);
  useTypeToFocus(inputRef);

  // Report progress whenever manualStep changes
  React.useEffect(() => {
    if (onProgress) {
      // 5 total sub-steps: Choice(0), Name(1), Email(2), Password(3), Verify(4)
      // Representing 0% -> 80% of the "Entry" phase
      onProgress(manualStep / 5);
    }
  }, [manualStep, onProgress]);

  const [isVerifying, setIsVerifying] = useState(false);
  // verificationCode state removed as we use Firebase link now
  
  const handleGoogleSignIn = async () => {
    setIsAuthenticating(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const token = await result.user.getIdToken();
      // Google users are verified by default typically, but let's just proceed
      const response = await entryMutation.mutateAsync({ firebase_token: token });
      toast.success(`Welcome, ${result.user.displayName}!`);
      onComplete({ hasOAuthData: response.has_oauth_data, method: 'google' });
    } catch (error) {
      console.error('[Casting Entry] Auth error:', error);
      toast.error(error.message || 'Authentication failed');
      setIsAuthenticating(false);
    }
  };

  const handleNextManual = () => {
    if (manualStep === 1 && !formData.name) return toast.error("Please enter your name");
    if (manualStep === 2 && !formData.email) return toast.error("Please enter your email");
    if (manualStep === 3 && !formData.password) return toast.error("Please enter a password");
    
    if (manualStep < 3) {
      setManualStep(manualStep + 1);
    } else {
      handleManualSignup();
    }
  };

  const handleManualSignup = async () => {
    setIsAuthenticating(true);
    try {
      // 1. Create User in Firebase
      const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
      const user = userCredential.user;

      // 2. Update Display Name
      await updateProfile(user, {
        displayName: formData.name
      });

      // 3. Send Verification Email
      await sendEmailVerification(user);

      // 4. Move to Verification UI
      setIsAuthenticating(false);
      setManualStep(4);
      toast.success("Account created! Verification email sent.");

    } catch (error) {
      console.error('[Casting Entry] Signup error:', error);
      toast.error(error.message || 'Signup failed');
      setIsAuthenticating(false);
    }
  };

  const handleCheckVerification = async () => {
    setIsVerifying(true);
    try {
      // Reload user to get fresh emailVerified status
      if (auth.currentUser) {
        await auth.currentUser.reload();
        
        if (auth.currentUser.emailVerified) {
          toast.success("Email verified!");
        } else {
          // Allow proceeding even if not verified (Temporary override)
          toast.success("Proceeding without verification (Dev Mode)");
        }
          
        // Complete the entry on backend and proceed
        const token = await auth.currentUser.getIdToken();
        const response = await entryMutation.mutateAsync({ firebase_token: token, name: formData.name });
        
        setIsVerifying(false);
        onComplete({ 
          hasOAuthData: response.has_oauth_data, 
          method: 'manual',
          manualData: { name: formData.name, email: formData.email }
        });
      } else {
         toast.error("Session expired. Please log in again.");
         setIsVerifying(false); // Should probably redirect to login
      }
    } catch (error) {
      console.error("Verification check failed", error);
      toast.error(error.message);
      setIsVerifying(false);
    }
  };

  const handleResendEmail = async () => {
     if (auth.currentUser) {
        try {
           await sendEmailVerification(auth.currentUser);
           toast.success("Verification email resent!");
        } catch(e) {
           toast.error("Error resending email: " + e.message);
        }
     }
  };

  const handleGenderSelect = (gender) => {
    setFormData({ ...formData, gender });
    
    onComplete({ 
      hasOAuthData: false, 
      method: 'manual',
      manualData: { gender } 
    });
  };

  return (
    <AnimatePresence mode="wait">
      {manualStep === 0 && (
        <motion.div
          key="choice"
          variants={containerVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="text-center"
        >
          {/* Main Text: Single, Centered, Gold Gradient, Large */}
          {/* Main Text: Editorial Style */}
          <ThinkingText 
            key="header-smooth-v4"
            text="Let's get you *seen*" 
            className="cinematic-question" 
            style={{ marginBottom: '3.5rem' }} 
            delay={0.3}
          />

          {/* The Golden Cross Divider */}

          {/* The Cinematic Divider */}
          <CinematicDivider delay={0.6} />
          
          <motion.div 
            className="cinematic-card" 
            layoutId="cinematic-card"
            variants={childVariants}
            style={{ maxWidth: '440px', padding: '3rem 2.5rem', margin: '0 auto' }}
          >
            <div className="cinematic-label" style={{ marginBottom: '2.5rem', letterSpacing: '0.2em' }}>CREATE YOUR ACCOUNT</div>
            
            <div className="space-y-4">
              {/* Option 1: Google - Premium Cinematic Style */}
              <motion.button
                onClick={handleGoogleSignIn}
                disabled={isAuthenticating}
                whileHover={{ scale: 1.015 }}
                whileTap={{ scale: 0.98 }}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl font-medium transition-shadow duration-300 disabled:opacity-50 disabled:cursor-not-allowed group relative overflow-hidden"
                style={{
                  background: 'rgba(255, 255, 255, 0.95)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(255, 255, 255, 0.05)',
                  color: '#1A1815'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 8px 24px rgba(201, 165, 90, 0.15), 0 0 0 1px rgba(201, 165, 90, 0.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(255, 255, 255, 0.05)';
                }}
              >
                {isAuthenticating ? (
                  <Loader2 className="animate-spin text-[#C9A55A]" size={20} />
                ) : (
                  <>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.26.81-.58z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    <span style={{ 
                      fontFamily: "var(--cinematic-font-sans, 'Inter', sans-serif)", 
                      letterSpacing: '0.05em',
                      fontWeight: 600,
                      fontSize: '14px'
                    }}>
                      Sign up with Google
                    </span>
                  </>
                )}
              </motion.button>

              {/* Option 2: Instagram - Official Gradient Style */}
              <motion.button
                onClick={() => toast.info('Instagram signup coming soon!')}
                disabled={isAuthenticating}
                whileHover={{ scale: 1.015 }}
                whileTap={{ scale: 0.98 }}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 text-white rounded-xl font-medium transition-shadow duration-300 hover:shadow-lg disabled:opacity-50"
                style={{
                  background: 'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)'
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                </svg>
                <span style={{
                      fontFamily: "var(--cinematic-font-sans, 'Inter', sans-serif)",
                      letterSpacing: '0.05em',
                      fontWeight: 600,
                      fontSize: '14px'
                    }}>Sign up with Instagram</span>
              </motion.button>
              
              {/* Option 3: Email */}
              <motion.button
                onClick={() => setManualStep(1)}
                disabled={isAuthenticating}
                whileHover={{ scale: 1.015 }}
                whileTap={{ scale: 0.98 }}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-transparent border border-white/20 text-white/80 rounded-xl font-medium transition-all duration-300 hover:border-[#C9A55A] hover:text-[#C9A55A] hover:bg-white/5 disabled:opacity-50"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/60">
                  <rect x="3" y="5" width="18" height="14" rx="2"/>
                  <path d="M3 7l9 6 9-6"/>
                </svg>
                <span style={{
                      fontFamily: "var(--cinematic-font-sans, 'Inter', sans-serif)",
                      letterSpacing: '0.05em',
                      fontWeight: 600,
                      fontSize: '14px'
                    }}>Sign up with Email</span>
              </motion.button>
            </div>
            
            <p className="mt-8 text-xs text-slate-400 font-sans tracking-wide">
              By joining, you agree to our Terms and Privacy Policy.
            </p>
          </motion.div>
        </motion.div>
      )}

      {manualStep === 1 && (
        <motion.div
          key="name"
          variants={fadeVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="text-center"
        >
          <ThinkingText 
            text="What is your *name*?" 
            className="cinematic-question" 
            style={{ marginBottom: '3.5rem' }} 
            delay={0.3}
          />


          <CinematicDivider delay={0.6} />

          <motion.div 
            className="cinematic-ghost" 
            layoutId="cinematic-card"
            variants={childVariants}
            style={{ maxWidth: '600px', margin: '0 auto' }}
          >
            <input
              ref={inputRef}
              autoFocus
              className="cinematic-input"
              placeholder="Your Name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && handleNextManual()}
            />
            
            <AnimatePresence>
              {formData.name.trim().length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="cinematic-hint"
                  onClick={handleNextManual}
                >
                  Press Enter ↵
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}

      {manualStep === 2 && (
        <motion.div
          key="email"
          variants={fadeVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="text-center"
        >
          <ThinkingText 
            text="And your *email*?" 
            className="cinematic-question" 
            style={{ marginBottom: '3.5rem' }} 
            delay={0.3}
          />


          <CinematicDivider delay={0.6} />

          <motion.div 
            className="cinematic-ghost" 
            layoutId="cinematic-card"
            variants={childVariants}
            style={{ maxWidth: '600px', margin: '0 auto' }}
          >
            <input
              ref={inputRef}
              autoFocus
              type="email"
              className="cinematic-input cinematic-input-email"
              placeholder="email@example.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && handleNextManual()}
            />
            
            <AnimatePresence>
              {formData.email.trim().length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="cinematic-hint"
                  onClick={handleNextManual}
                >
                  Press Enter ↵
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}

      {manualStep === 3 && (
        <motion.div
          key="password"
          variants={fadeVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="text-center"
        >
          <ThinkingText 
            text="Create a *password*" 
            className="cinematic-question" 
            style={{ marginBottom: '3.5rem' }} 
            delay={0.3}
          />


          <CinematicDivider delay={0.6} />

          <motion.div 
            className="cinematic-ghost" 
            layoutId="cinematic-card"
            variants={childVariants}
            style={{ maxWidth: '600px', margin: '0 auto' }}
          >
            <div className="relative">
              <input
                ref={inputRef}
                autoFocus
                type={showPassword ? "text" : "password"}
                className="cinematic-input"
                style={{ paddingRight: '3rem' }}
                placeholder="••••••••"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && handleNextManual()}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition-colors p-2"
              >
                {showPassword ? <EyeOff size={24} /> : <Eye size={24} />}
              </button>
            </div>
            
            <AnimatePresence>
              {formData.password.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="cinematic-hint"
                  onClick={handleNextManual}
                >
                  {isAuthenticating ? "Creating Account..." : "Press Enter ↵"}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}

      {manualStep === 4 && (
        <motion.div
          key="verify"
          variants={fadeVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="text-center"
        >
          <ThinkingText
            text="Verify your *email*"
            className="cinematic-question"
            style={{ marginBottom: '2rem' }}
            delay={0.3}
          />

          <CinematicDivider delay={0.5} />

          <motion.div
            className="cinematic-ghost"
            layoutId="cinematic-card"
            variants={childVariants}
            style={{ maxWidth: '440px', margin: '0 auto' }}
          >
            {/* Envelope icon */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.6, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="flex justify-center mb-8"
            >
              <div className="w-16 h-16 rounded-full border border-[#C9A55A]/20 bg-[#C9A55A]/5 flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#C9A55A" strokeWidth="1.5">
                  <rect x="3" y="5" width="18" height="14" rx="2"/>
                  <path d="M3 7l9 6 9-6"/>
                </svg>
              </div>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
              className="text-white/50 text-sm leading-relaxed mb-10 max-w-sm mx-auto font-sans"
            >
              We sent a verification link to<br />
              <span className="text-[#C9A55A] font-medium">{formData.email}</span>
            </motion.p>

            {/* Waiting indicator */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.0 }}
              className="flex items-center justify-center gap-3 mb-10"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-[#C9A55A] animate-pulse shadow-[0_0_10px_#C9A55A]" />
              <span className="text-[10px] tracking-[0.2em] text-white/30 font-sans uppercase">
                Waiting for confirmation
              </span>
            </motion.div>

            {/* Continue + helper links */}
            <div className="flex flex-col items-center gap-6">
              <motion.button
                onClick={handleCheckVerification}
                disabled={isVerifying}
                whileHover={isVerifying ? {} : { scale: 1.03 }}
                whileTap={isVerifying ? {} : { scale: 0.97 }}
                className="group relative py-4 px-2 flex items-center gap-3 text-white/50 font-serif italic tracking-[0.15em] text-xl transition-colors duration-300 hover:text-[#C9A55A] disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {isVerifying ? (
                  <span className="flex items-center gap-3">
                    <Loader2 className="animate-spin" size={18} />
                    <span>Checking...</span>
                  </span>
                ) : (
                  <>
                    <span>I'VE VERIFIED</span>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-50 group-hover:opacity-100 transition-opacity">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </>
                )}
              </motion.button>

              <div className="flex items-center justify-center gap-6">
                <button
                  onClick={() => window.location.href = 'mailto:'}
                  className="text-white/25 text-[10px] uppercase tracking-[0.2em] hover:text-[#C9A55A] transition-colors py-2"
                >
                  Open Mail App
                </button>
                <span className="w-px h-3 bg-white/10" />
                <button
                  onClick={handleResendEmail}
                  className="text-white/25 text-[10px] uppercase tracking-[0.2em] hover:text-[#C9A55A] transition-colors py-2"
                >
                  Resend Email
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}

    </AnimatePresence>
  );
}

export default CastingEntry;
