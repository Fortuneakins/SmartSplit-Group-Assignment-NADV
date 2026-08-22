const jwt = require('jsonwebtoken');

const PUBLIC_PATHS = ['/api/auth/register', '/api/auth/login', '/health'];

function verifyJwt(req, res, next) {
  if (PUBLIC_PATHS.some((p) => req.path === p)) {
    return next();
  }

  const authHeader = req.header('authorization') || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'missing or malformed Authorization header (expected "Bearer <token>")' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    // Downstream services never see the raw token - they trust this header,
    // since only the gateway can reach them directly on the internal network.
    req.headers['x-user-id'] = payload.sub;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'invalid or expired token' });
  }
}

module.exports = verifyJwt;
