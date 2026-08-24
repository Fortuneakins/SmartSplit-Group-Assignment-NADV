# SmartSplit Testing Documentation

## 1. Testing Strategy

SmartSplit uses a combination of unit tests, integration tests, regression tests,
and performance/scalability testing.

The test suite covers:

- Authentication and authorisation
- User registration and login
- Group creation and membership
- Group deletion and leaving groups
- Expense creation, retrieval, update and deletion
- Equal, exact and percentage expense splitting
- Input validation and invalid requests
- Balance calculation
- Settlement optimisation
- Minimum transaction calculation
- API Gateway routing and authentication
- Health endpoints
- Regression cases for previously identified bugs
- Performance with large groups and many expenses

## 2. Unit Tests

### Expense Split Logic

Location:

`services/expense-service/test/splitLogic.test.js`

Tests include:

- Equal splitting
- Remainder-cent handling
- Large-member-count equal splits
- Exact splits
- Percentage splits
- Invalid split types
- Negative amounts
- Duplicate participants
- Participants who are not group members

### Settlement Optimisation

Location:

`services/settlement-service/test/minTransactions.test.js`

Tests include:

- Already-settled groups
- Zero-net circular debts
- Two-person settlements
- Minimum transaction behaviour
- Invalid non-zero-sum balances
- Larger multi-member groups

## 3. Integration Tests

### API Gateway

`services/api-gateway/test/integration.test.js`

Verifies:

- Health endpoint
- Public authentication routes
- JWT protection
- Invalid authentication
- Authenticated routing
- 404 handling

### User/Group Service

`services/user-service/test/integration.test.js`

Verifies:

- Registration
- Login
- Password validation
- Email validation
- Duplicate accounts
- Group creation
- Automatic group membership
- Adding members
- Invalid members
- Non-member authorisation

### Expense Service

`services/expense-service/test/integration.test.js`

Verifies:

- Expense creation
- Expense retrieval
- Group membership validation
- Split validation
- Net balance calculation
- Expense update
- Expense deletion

### Settlement Service

`services/settlement-service/test/integration.test.js`

Verifies:

- Zero-balance groups
- Minimum settlement payments
- Settlement persistence
- Settlement retrieval
- Non-member authorisation
- Missing settlement handling

## 4. Running the Tests

Install dependencies:


npm install
cd frontend
npm install
cd ..

## 5. Performance and Scalability Test

The performance test was executed against the running SmartSplit application using:

```bash
node scripts/perf-test.js 50 500

$ node scripts/perf-test.js 50 500 SmartSplit performance test: 50 members, 500 expenses 1. Register members: 8.994s 2. Create group + add members: 940.927ms 3. Log expenses: 36.596s 4. Fetch balances: 105.832ms 5. Run settlement optimisation: 658.985ms Members with non-zero balance: 50 Algorithm used: min-transactions+greedy-fallback Payments produced: 49 
Naive all-to-all upper bound: up to 1,225 payments
Optimised settlement: 49 payments

A performance test with 50 group members and 500 expenses was executed. The system successfully processed all expenses, calculated balances, and generated a settlement plan. The optimisation algorithm produced 49 payments for 50 members with non-zero balances, demonstrating substantial reduction compared with a naive all-to-all settlement strategy.

| Operation                  |       Time |
| -------------------------- | ---------: |
| Register 50 members        |    8.994 s |
| Create group + add members | 940.927 ms |
| Log 500 expenses           |   36.596 s |
| Fetch balances             | 105.832 ms |
| Settlement optimisation    | 658.985 ms |
