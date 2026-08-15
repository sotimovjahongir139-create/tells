const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { signToken } = require('../middleware/auth');
const { ApiError } = require('../middleware/errorHandler');

const router = express.Router();

router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      throw new ApiError(400, 'Login va parolni kiriting.');
    }

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) throw new ApiError(401, 'Login yoki parol noto\'g\'ri.');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new ApiError(401, 'Login yoki parol noto\'g\'ri.');

    const token = signToken(user);
    res.json({ token, user: { id: user.id, username: user.username } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
