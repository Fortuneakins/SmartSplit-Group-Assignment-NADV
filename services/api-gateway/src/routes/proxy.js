const { createProxyMiddleware } = require('http-proxy-middleware');

const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://localhost:3001';
const EXPENSE_SERVICE_URL = process.env.EXPENSE_SERVICE_URL || 'http://localhost:3002';
const SETTLEMENT_SERVICE_URL = process.env.SETTLEMENT_SERVICE_URL || 'http://localhost:3003';

function proxyTo(target) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    logLevel: 'warn',
    proxyTimeout: 5000,
    timeout: 6000,
    onError(err, req, res) {
      console.error(`[api-gateway] proxy error routing to ${target}:`, err.message);
      res.status(502).json({ error: 'upstream service unavailable' });
    },
  });
}

/**
 * Route table, most specific first:
 *   /api/auth/*                                  -> user-service
 *   /api/groups/:id/expenses                      -> expense-service
 *   /api/groups/:id/balances                       -> settlement-service
 *   /api/groups/:id/settle                          -> settlement-service
 *   /api/groups/:id/settlements[/...]                -> settlement-service
 *   /api/groups[/...]  (create, list, members)        -> user-service
 */
function registerProxyRoutes(app) {
  app.use('/api/auth', proxyTo(USER_SERVICE_URL));

  app.use(/^\/api\/groups\/[^/]+\/expenses/, proxyTo(EXPENSE_SERVICE_URL));

  app.use(/^\/api\/groups\/[^/]+\/(balances|settle|settlements)(\/.*)?$/, proxyTo(SETTLEMENT_SERVICE_URL));

  app.use('/api/groups', proxyTo(USER_SERVICE_URL));
}

module.exports = registerProxyRoutes;
