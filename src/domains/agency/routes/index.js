const express = require("express");
const router = express.Router();

router.use(require("./roster"));
router.use(require("./inbox"));
router.use(require("./casting"));
router.use(require("./tags"));
router.use(require("./interviews"));
router.use(require("./reminders"));
router.use(require("./messages"));
router.use(require("./overview"));

module.exports = router;
