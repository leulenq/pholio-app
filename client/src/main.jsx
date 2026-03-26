import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './styles/agency-tokens.css' /* 1. Agency design tokens */
import './styles/agency-dark-overrides.css' /* 2. Dark theme overrides for agency */
import './index.css'            /* 3. Global + component styles */
import App from './App'
import { FlashProvider } from './shared/hooks/useFlash'

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <FlashProvider>
          <App />
        </FlashProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
