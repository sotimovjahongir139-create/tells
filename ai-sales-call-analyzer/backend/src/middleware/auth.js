const jwt = require('jsonwebtoken');
const env = require('../config/env');

function signToken(user) {
  return jwt.sign({ sub: user.id, username: user.username }, env.jwtSecret, {
    expiresIn: '12h',
  });
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Avtorizatsiya talab qilinadi.' });
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    req.user = { id: payload.sub, username: payload.username };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Sessiya muddati tugagan yoki yaroqsiz.' });
  }
}

module.exports = { signToken, requireAuth };
