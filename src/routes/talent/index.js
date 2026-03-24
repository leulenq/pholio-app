const express = require('express');
const router = express.Router();
const path = require('path');
const { requireRole } = require('../../domains/auth/middleware/require-auth');

const profileRouter = require('./profile.api');
const mediaRouter = require('./media.api');
const analyticsRouter = require('./analytics.api');
const applicationsRouter = require('./applications.api');
const agenciesRouter = require('./agencies.api');
const settingsRouter = require('./settings.api');
const pdfRouter = require('./pdf.api');
const dashboardRouter = require('./dashboard.api');
const bioRouter = require('./bio.api'); // Bio refinement API

// Mount API routes
router.use('/api/talent/media', mediaRouter);
router.use('/api/talent', profileRouter);
router.use('/api/talent', analyticsRouter);
router.use('/api/talent/applications', applicationsRouter);
router.use('/api/talent/agencies', agenciesRouter);
router.use('/api/talent', settingsRouter);
router.use('/api/talent', pdfRouter);
router.use('/api/talent', dashboardRouter);
router.use('/api/talent/bio', bioRouter); // Bio refinement routes

// SPA catch-all — serves React app for all /dashboard/talent* routes
router.get('/dashboard/talent{/*path}', requireRole('TALENT'), (req, res) => {
  // Development: Redirect to Vite dev server for HMR
  if (process.env.NODE_ENV === 'development') {
    return res.redirect('http://localhost:5173' + req.originalUrl);
  }
  
  // Production: Serve built React app
  res.sendFile(path.join(__dirname, '..', '..', '..', 'public', 'dashboard-app', 'index.html'));
});

module.exports = router;
