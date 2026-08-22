require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });

const express = require('express');
const cors = require('cors');

const settlementRoutes = require('./routes/settlement');
const errorHandler = require('./middleware/errorHandler');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'settlement-service' }));

app.use('/api', settlementRoutes);

app.use((req, res) => res.status(404).json({ error: 'not found' }));
app.use(errorHandler);

const PORT = process.env.SETTLEMENT_SERVICE_PORT || 3003;

if (require.main === module) {
  app.listen(PORT, () => console.log(`[settlement-service] listening on port ${PORT}`));
}

module.exports = app;
