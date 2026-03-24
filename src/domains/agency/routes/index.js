const express = require('express');
const router = express.Router();

router.use(require('./roster'));
router.use(require('./inbox'));
router.use(require('./overview'));

module.exports = router;
