import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './styles/agency-tokens.css' /* 1. Agency design tokens */
import './styles/agency-dark-overrides.css' /* 2. Dark theme overrides for agency */
import './index.css'            /* 3. Global + component styles */
import App from './App'
import FlashProvider from './shared/hooks/FlashProvider'
import PholioToaster from './shared/components/toast/PholioToaster'
import { AuthEntryTransitionProvider } from './domains/auth/components/AuthEntryTransitionProvider'
import {
  getReactRootErrorHandlers,
  initErrorMonitoring,
} from './shared/lib/error-monitoring'

initErrorMonitoring();

// Mark the document as the React SPA shell before the first paint.
// `styles/global.css` uses this class (alongside the pre-existing `.is-agency`
// set by AgencyLayout) to keep its bare-element `<button>` reset off every
// SPA-rendered surface — components own their own button styling, and the
// global 999px pill radius was curling underline/text buttons into
// half-circles. Set here, in the single entry point, because the SPA's
// standalone routes (onboarding, /reply, /picks, /opencall, /internal, the
// full-screen apply studio, auth) share no layout component to hang it on,
// and because a layout effect would apply it one paint too late.
document.body.classList.add('is-spa');

const queryClient = new QueryClient();

// AuthEntryTransitionProvider sits outside <App /> deliberately. It renders the
// post-login splash, which must not be a descendant of the router's Suspense
// boundary: a lazy route suspending there would swap the splash out for the
// route fallback mid-transition and replay it on reveal.
ReactDOM.createRoot(
  document.getElementById('root'),
  getReactRootErrorHandlers(),
).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <FlashProvider>
          <AuthEntryTransitionProvider>
            <App />
            <PholioToaster />
          </AuthEntryTransitionProvider>
        </FlashProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
