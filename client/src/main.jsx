import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './styles/variables.css' /* 1. Variables first */
import './styles/agency-tokens.css' /* 2. Agency design tokens */
import './styles/agency-dark-overrides.css' /* 2b. Dark theme overrides for agency */
import './styles/reset.css'     /* 3. Reset second */
import './index.css'            /* 4. Global/Component styles */
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
