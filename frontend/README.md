# SmartSplit Frontend

React + Vite frontend for the existing SmartSplit service-oriented backend.

## Run

From the repository root:

```bash
npm run frontend:install
npm run frontend:dev
```

The browser talks only to `http://localhost:3000` (the API Gateway). Override with `VITE_API_URL` if needed.

The frontend implements the backend endpoints already present in this repository: authentication,
groups, membership, expenses, balances, settlement optimisation and settlement history.
