const express = require("express");
const router = express.Router();
const path = require("path");
const { requireRole } = require("../../auth/middleware/require-auth");
const {
  requireTalentLegalAcceptance,
} = require("../../../shared/middleware/require-legal-acceptance");

const profileRouter = require("./profile");
const mediaRouter = require("./media");
const analyticsRouter = require("./analytics");
const intelRouter = require("./intel");
const ageVerificationRouter = require("./age-verification");
const applicationsRouter = require("./applications");
const messagesRouter = require("./messages");
const agenciesRouter = require("./agencies");
const settingsRouter = require("./settings");
const pdfRouter = require("./pdf-custom");
const dashboardRouter = require("./dashboard");
const bioRouter = require("./bio"); // Bio refinement API
const submissionNoteRouter = require("./submission-note"); // Submission cover-note writer
const trainingSummaryRouter = require("./training-summary");
const notificationsRouter = require("./notifications");
const messagePolishRouter = require("./message-polish");
const socialOauthRouter = require("./social-oauth");
const phylloRouter = require("./phyllo-routes");
const representationsRouter = require("./representations");
const fieldVisibilityRouter = require("./field-visibility");
const availabilityRouter = require("./availability");
const specRegistryRouter = require("./spec-registry");
const compCardImportRouter = require("./comp-card-import");
const digitalsRouter = require("./digitals");
const trackerRouter = require("./tracker");
const callWindowsRouter = require("./call-windows");

router.use(requireTalentLegalAcceptance());

// Mount API routes
router.use("/api/talent/media", mediaRouter);
router.use("/api/talent/spec-registry", specRegistryRouter);
router.use("/api/talent/comp-card-import", compCardImportRouter);
router.use("/api/talent/digitals", digitalsRouter);
router.use("/api/talent/tracker", trackerRouter);
router.use("/api/talent/call-windows", callWindowsRouter);
router.use("/api/talent", representationsRouter);
router.use("/api/talent", profileRouter);
router.use("/api/talent", analyticsRouter);
router.use("/api/talent", intelRouter);
router.use("/api/talent", ageVerificationRouter);
router.use("/api/talent/applications", applicationsRouter);
router.use("/api/talent/messages", messagesRouter);
router.use("/api/talent/agencies", agenciesRouter);
router.use("/api/talent", settingsRouter);
router.use("/api/talent", fieldVisibilityRouter);
router.use("/api/talent", availabilityRouter);
router.use("/api/talent", pdfRouter);
router.use("/api/talent", dashboardRouter);
router.use("/api/talent/bio", bioRouter); // Bio refinement routes
router.use("/api/talent/submission-note", submissionNoteRouter);
router.use("/api/talent/training-summary", trainingSummaryRouter);
router.use("/api/talent", notificationsRouter);
router.use("/api/talent/message-polish", messagePolishRouter);
// Mock/simulated OAuth verification (fabricates handles + follower/engagement metrics).
// Dev/staging only — never mount in production. Real verification goes through the
// Phyllo-backed router below.
if (process.env.NODE_ENV !== "production") {
  router.use("/api/talent/socials/oauth", socialOauthRouter);
}
router.use("/api/talent/socials/phyllo", phylloRouter);

// SPA catch-all — serves React app for all /dashboard/talent* routes
router.get("/dashboard/talent{/*path}", requireRole("TALENT"), (req, res) => {
  // Development: Redirect to Vite dev server for HMR
  if (process.env.NODE_ENV === "development") {
    return res.redirect("http://localhost:5173" + req.originalUrl);
  }

  // Production: Serve built React app
  res.sendFile(
    path.join(
      __dirname,
      "..",
      "..",
      "..",
      "..",
      "public",
      "dashboard-app",
      "index.html",
    ),
  );
});

module.exports = router;
