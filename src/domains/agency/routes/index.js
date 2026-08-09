const express = require("express");
const router = express.Router();

router.use(require("./legal"));
router.use(require("./setup"));
router.use(require("./roster"));
router.use(require("./roster-data"));
router.use(require("./inbox"));
router.use(require("./talent-dossier"));
router.use(require("./team-rbac"));
router.use(require("./casting"));
router.use(require("./tags"));
router.use(require("./interviews"));
router.use(require("./reminders"));
router.use(require("./messages"));
router.use(require("./overview"));
router.use(require("./analytics"));
router.use(require("./notifications"));
router.use(require("./activity"));
router.use(require("./open-call"));

module.exports = router;
