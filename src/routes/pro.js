const express = require('express');
const { v4: uuidv4 } = require('uuid');
const knex = require('../db/knex');
const { requireRole } = require('../middleware/auth');
const config = require('../config');
const { addMessage } = require('../middleware/context');
const { getSubscriptionStatus, getTrialDaysRemaining, isInTrial, isCanceling } = require('../lib/subscriptions');

const router = express.Router();

router.get('/pro/upgrade', requireRole('TALENT'), async (req, res, next) => {
  try {
    const profile = await knex('profiles').where({ user_id: req.session.userId }).first();
    // Allow upgrade access even without profile - user can upgrade and complete profile later

    // Get subscription status (already loaded in res.locals by middleware, but fetch again to ensure latest)
    const subscription = await getSubscriptionStatus(req.session.userId);
    const trialDaysRemaining = subscription ? getTrialDaysRemaining(subscription) : null;
    const isInTrialPeriod = subscription ? isInTrial(subscription) : false;
    const isCancelingSubscription = subscription ? isCanceling(subscription) : false;

    return res.render('pro/upgrade', {
      title: 'Upgrade to Studio+',
      profile: profile || null,
      subscription: subscription || null,
      trialDaysRemaining,
      isInTrial: isInTrialPeriod,
      isCanceling: isCancelingSubscription,
      layout: 'layout',
      currentPage: 'pro-upgrade'
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
