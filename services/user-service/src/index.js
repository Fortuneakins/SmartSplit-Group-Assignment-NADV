require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });

const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const groupRoutes = require('./routes/groups');
const internalRoutes = require('./routes/internal');
const errorHandler = require('./middleware/errorHandler');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'user-service' }));

app.use('/api/auth', authRoutes);
app.use('/api/groups', groupRoutes);
app.use('/internal', internalRoutes);

app.use((req, res) => res.status(404).json({ error: 'not found' }));
app.use(errorHandler);

const PORT = process.env.USER_SERVICE_PORT || 3001;

if (require.main === module) {
  app.listen(PORT, () => console.log(`[user-service] listening on port ${PORT}`));
}

module.exports = app;
