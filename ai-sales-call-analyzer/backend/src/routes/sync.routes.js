const express = require('express');
const { requireAuth } = require('../middleware/auth');
const syncService = require('../services/sync.service');

const router = express.Router();

router.post('/amocrm', requireAuth, async (req, res, next) => {
  try {
    const result = await syncService.syncAmoCrmCalls();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
