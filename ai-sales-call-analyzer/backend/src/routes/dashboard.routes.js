const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { ApiError } = require('../middleware/errorHandler');
const dashboardService = require('../services/dashboard.service');

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { period, date } = req.query;
    if (!['daily', 'weekly', 'monthly'].includes(period)) {
      throw new ApiError(400, 'period parametri daily, weekly yoki monthly bo\'lishi kerak.');
    }
    const data = await dashboardService.getDashboard(period, date);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
