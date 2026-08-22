const jwt = require('jsonwebtoken');

/**
 * In production traffic flows through the API Gateway, which verifies the
 * JWT and forwards the authenticated user id in the X-User-Id header so
 * internal services never have to re-parse tokens. For local development
 * and unit testing (hitting this service directly, bypassing the gateway)
 * we fall back to verifying the Authorization header ourselves.
 */
function requireAuth(req, res, next) {
  const forwardedUserId = req.header('x-user-id');
  if (forwardedUserId) {
    req.userId = forwardedUserId;
    return next();
  }

  const authHeader = req.header('authorization') || '';
  const [, token] = authHeader.split(' ');
  if (!token) {
    return res.status(401).json({ error: 'missing authentication token' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.sub;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'invalid or expired token' });
  }
}

module.exports = requireAuth;
