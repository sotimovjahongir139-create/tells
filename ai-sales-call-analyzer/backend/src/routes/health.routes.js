const express = require('express');
const prisma = require('../lib/prisma');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'ulangan' });
  } catch (err) {
    res.status(503).json({ status: 'error', database: 'ulanmagan' });
  }
});

module.exports = router;
