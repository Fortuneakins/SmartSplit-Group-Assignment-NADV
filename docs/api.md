# SmartSplit API Documentation

## Base URL

http://localhost:3000

## Authentication

Authenticated endpoints require a valid JWT access token.

The frontend stores the authenticated session and sends the token with API requests.

## Register
POST /api/auth/register

Example request:

{
  "email": "alice@example.com",
  "password": "password123",
  "fullName": "Alice Smith"
}
## Login
POST /api/auth/login

Example request:

{
  "email": "alice@example.com",
  "password": "password123"
}
## Group Endpoints
## Create group
POST /api/groups

The authenticated user becomes the creator and first member.

List user's groups
GET /api/groups

Returns groups the authenticated user belongs to.

## Delete group
DELETE /api/groups/:id

Only the group creator can delete the group.

Deleting a group cascades to its members, expenses and settlement records according to the database relationships.

## Leave group
DELETE /api/groups/:id/leave

Allows a non-creator member to leave a group.

The group creator cannot leave their own group; they must delete the group instead.

## List group members
GET /api/groups/:id/members
Add group member
POST /api/groups/:id/members

Example request:

{
  "email": "bob@example.com"
}
Expense Endpoints
Create expense
POST /api/groups/:id/expenses

Supports:

Equal splitting
Exact splitting
Percentage splitting
List expenses
GET /api/groups/:id/expenses
Update expense
PUT /api/groups/:id/expenses/:expenseId
Delete expense
DELETE /api/groups/:id/expenses/:expenseId
Balance and Settlement Endpoints
Get balances
GET /api/groups/:id/balances

Returns each member's net balance.

Positive balances represent money owed to the member.

Negative balances represent money the member owes.

## Generate settlement
POST /api/groups/:id/settle

Calculates a payment plan using the minimum-transactions settlement algorithm and persists the result.

## Settlement history
GET /api/groups/:id/settlements

Returns previously generated settlement results.

Settlement details
GET /api/groups/:id/settlements/:sid

Returns the payment details for a specific settlement.

## Health Endpoint
GET /health

Returns the API gateway/service health status.

Error Responses

Errors are returned as JSON.

Example:

{
  "error": "group not found"
}

## Common HTTP status codes include:

Status	Meaning
200	Request successful
201	Resource created
400	Invalid request
401	Authentication required/invalid
403	User is not authorised
404	Resource not found
500	Internal server error

