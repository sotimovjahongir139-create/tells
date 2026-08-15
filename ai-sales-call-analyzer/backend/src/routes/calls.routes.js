const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { ApiError } = require('../middleware/errorHandler');
const prisma = require('../lib/prisma');
const dateRange = require('../lib/dateRange');
const analysisService = require('../services/analysis.service');

const router = express.Router();

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { period, date } = req.query;
    const where = {};
    if (period && ['daily', 'weekly', 'monthly'].includes(period)) {
      const range = dateRange.getRange(period, date);
      where.startedAt = {
        gte: dateRange.toZonedJSDate(range.start),
        lte: dateRange.toZonedJSDate(range.end),
      };
    }

    const limit = Math.min(MAX_LIMIT, parseInt(req.query.limit, 10) || DEFAULT_LIMIT);

    const [calls, total] = await Promise.all([
      prisma.call.findMany({
        where,
        include: { analysis: true, salesperson: true },
        orderBy: { startedAt: 'desc' },
        take: limit,
      }),
      prisma.call.count({ where }),
    ]);

    res.json({ calls, total, limit });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const call = await prisma.call.findUnique({
      where: { id: req.params.id },
      include: {
        salesperson: true,
        analysis: { include: { mistakes: true, recommendations: true } },
      },
    });
    if (!call) throw new ApiError(404, 'Qo\'ng\'iroq topilmadi.');
    res.json({ call });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/analyze', requireAuth, async (req, res, next) => {
  try {
    const call = await analysisService.analyzeCall(req.params.id);
    res.json({ call });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
