"use strict";

const knex = require("../../src/shared/db/knex");
const {
  processPendingDeletions,
} = require("../../src/shared/lib/account-deletion");
const {
  replayPendingEvents,
} = require("../../src/shared/lib/stripe-events");
const {
  replayPendingNotices,
} = require("../../src/shared/services/billing-notices");
const {
  replaySubmissionWebhooks,
} = require("../../src/domains/agency/services/submission-webhook-outbox");
const {
  processStripeEvent,
} = require("../../src/routes/stripe-webhook");

const jobs = [
  {
    name: "account_deletions",
    run: () => processPendingDeletions(knex, { limit: 10 }),
    summarize: (value) => ({
      processed: value.processed,
      resolved: value.resolved,
      failed: value.failed,
    }),
  },
  {
    name: "stripe_events",
    run: () => replayPendingEvents(knex, processStripeEvent, { limit: 10 }),
    summarize: (value) => ({
      processed: value.length,
      recovered: value.filter((item) => item.recovered).length,
      failed: value.filter((item) => !item.recovered).length,
    }),
  },
  {
    name: "billing_notices",
    run: () => replayPendingNotices({ knex }, { limit: 10 }),
    summarize: (value) => ({
      processed: value.length,
      recovered: value.filter((item) => item.recovered).length,
      failed: value.filter((item) => !item.recovered).length,
    }),
  },
  {
    name: "submission_webhooks",
    run: () => replaySubmissionWebhooks(knex, { limit: 5 }),
    summarize: (value) => value,
  },
];

async function runJob(job) {
  try {
    const value = await job.run();
    const result = job.summarize(value);
    const ok = !value?.unavailableReason && Number(result.failed || 0) === 0;
    if (!ok) {
      console.error("[ProviderRecovery] task incomplete", { task: job.name });
    }
    return { name: job.name, ok, result };
  } catch (error) {
    // Provider messages can contain URLs, addresses, or identifiers. Log only
    // the fixed task label and error class; detailed state remains in its
    // durable queue without leaking PII into function logs.
    console.error("[ProviderRecovery] task failed", {
      task: job.name,
      errorType: error?.name || "Error",
    });
    return { name: job.name, ok: false };
  }
}

exports.handler = async function handler() {
  // Independent lanes run concurrently so one slow provider does not consume
  // the entire scheduled-function window before the other queues are checked.
  const results = await Promise.all(jobs.map(runJob));
  const failedTasks = results.filter((item) => !item.ok).map((item) => item.name);
  const summary = Object.fromEntries(
    results.filter((item) => item.ok).map((item) => [item.name, item.result]),
  );

  console.log("[ProviderRecovery] completed", {
    ...summary,
    failedTasks,
    completedAt: new Date().toISOString(),
  });

  if (failedTasks.length > 0) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "provider_recovery_incomplete", failedTasks }),
    };
  }
  return { statusCode: 204 };
};
