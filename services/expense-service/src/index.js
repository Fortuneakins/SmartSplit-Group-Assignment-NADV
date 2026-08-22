require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });

const express = require('express');
const cors = require('cors');

const expenseRoutes = require('./routes/expenses');
const errorHandler = require('./middleware/errorHandler');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'expense-service' }));

app.use('/api', expenseRoutes);

app.use((req, res) => res.status(404).json({ error: 'not found' }));
app.use(errorHandler);

const PORT = process.env.EXPENSE_SERVICE_PORT || 3002;

if (require.main === module) {
  app.listen(PORT, () => console.log(`[expense-service] listening on port ${PORT}`));
}

module.exports = app;
