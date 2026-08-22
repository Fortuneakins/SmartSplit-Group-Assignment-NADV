/* eslint-disable no-unused-vars */
module.exports = function errorHandler(err, req, res, next) {
  console.error(`[settlement-service] ${req.method} ${req.originalUrl} ->`, err);

  if (err.code === '23505') {
    return res.status(409).json({ error: 'duplicate value violates a unique constraint' });
  }
  if (err.code === '23503') {
    return res.status(400).json({ error: 'referenced record does not exist' });
  }
  if (err.code === '23514') {
    return res.status(400).json({ error: 'value violates a database check constraint' });
  }

  res.status(err.status || 500).json({ error: err.expose ? err.message : 'internal server error' });
};
