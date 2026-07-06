const express = require("express");
const router = express.Router();

router.use(require("./roster"));
router.use(require("./inbox"));
router.use(require("./team-rbac"));
router.use(require("./casting"));
router.use(require("./matching"));
router.use(require("./tags"));
router.use(require("./interviews"));
router.use(require("./reminders"));
router.use(require("./messages"));
router.use(require("./overview"));
router.use(require("./notifications"));
router.use(require("./activity"));
router.use(require("./open-call"));

module.exports = router;
