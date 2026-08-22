require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const verifyJwt = require('./middleware/verifyJwt');
const registerProxyRoutes = require('./routes/proxy');

const app = express();
app.use(cors());

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'api-gateway' }));

// Rate limiting: protects downstream services from being overwhelmed and is
// a cheap first line of defence against brute-forcing /api/auth/login.
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too many requests, please slow down' },
});
app.use(limiter);

// Auth check happens at the gateway so client requests never reach
// internal services without a validated identity attached.
app.use(verifyJwt);

// NOTE: no express.json() here - body parsing is intentionally left to each
// downstream service. Parsing (and re-serialising) the body at the gateway
// would break http-proxy-middleware's streaming of the raw request.
registerProxyRoutes(app);

app.use((req, res) => res.status(404).json({ error: 'not found' }));

const PORT = process.env.GATEWAY_PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => console.log(`[api-gateway] listening on port ${PORT}`));
}

module.exports = app;
