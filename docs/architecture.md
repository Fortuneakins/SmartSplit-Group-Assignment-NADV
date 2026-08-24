# SmartSplit System Architecture

## 1. Overview

SmartSplit is a service-oriented group expense management system developed for NADV 744.

The system allows authenticated users to create groups, add members, record shared expenses, calculate balances and generate an optimised settlement plan.

The application uses a React frontend, an API Gateway, multiple backend services and a shared PostgreSQL database.

## 2. High-Level Architecture


                    ┌──────────────────┐
                    │   React Frontend │
                    │      :5173       │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │    API Gateway   │
                    │      :3000       │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
       ┌────────────┐ ┌────────────┐ ┌───────────────┐
       │ User/Group │ │  Expense   │ │  Settlement   │
       │  Service   │ │  Service   │ │   Service     │
       └──────┬─────┘ └──────┬─────┘ └───────┬───────┘
              │              │               │
              └──────────────┼───────────────┘
                             ▼
                    ┌──────────────────┐
                    │   PostgreSQL     │
                    │ Shared Database  │
                    └──────────────────┘


## 3. Components

### React Frontend

The React frontend provides the user interface for:

- Registration and login
- Group management
- Member management
- Expense management
- Balance viewing
- Settlement optimisation
- Settlement history

The frontend communicates with the API Gateway rather than directly
depending on individual backend service ports.

### API Gateway

The API Gateway provides a single entry point for the frontend.

It:

- Routes requests to backend services
- Verifies JWT authentication
- Applies rate limiting
- Provides the public `/api` boundary
- Exposes the `/health` endpoint

### User/Group Service

Responsible for:

- User registration
- User authentication
- Group creation
- Group listing
- Group membership
- Group deletion
- Leaving groups

### Expense Service

Responsible for:

- Creating expenses
- Updating expenses
- Deleting expenses
- Retrieving expenses
- Calculating expense splits
- Validating expense participants

The service supports equal, exact and percentage splitting.

### Settlement Service

Responsible for:

- Calculating net balances
- Generating settlement payments
- Minimising the number of transactions
- Persisting settlement history
- Retrieving previous settlement results

### PostgreSQL

PostgreSQL provides persistent storage for:

- Users
- Groups
- Group memberships
- Expenses
- Expense splits
- Settlements
- Settlement payments

## 4. Data Flow

A typical expense workflow is:

User authenticates through the frontend.
Frontend sends an authenticated request to the API Gateway.
Gateway routes the request to the appropriate service.
Backend service validates the request and user permissions.
Service reads or writes PostgreSQL data.
Service returns JSON to the gateway.
Gateway returns the response to the frontend.
React updates the user interface.

## 5. Service-to-Service Communication

Backend services communicate through HTTP APIs where required.

The API Gateway provides the main external boundary for frontend requests.

Services use PostgreSQL for persistent shared domain data.

## 6. Authentication and Security

Authentication uses JWT-based access tokens.

Passwords are stored as password hashes rather than plaintext passwords.

Protected routes require authentication and group membership checks where appropriate.

SQL queries use parameterised values to reduce SQL injection risk.

Database relationships use foreign keys and cascading deletes where appropriate.

## 7. Design Decisions
Service-oriented architecture

Separate services provide clearer domain boundaries and allow individual components to evolve independently.

API Gateway

A gateway gives the frontend one consistent API endpoint and hides internal service ports.

Shared PostgreSQL database

A shared database simplifies consistency between the user, expense and settlement domains for this assignment.

Minimum-transactions settlement

The settlement engine calculates net balances and produces a payment plan designed to minimise the number of transfers.

Transactional group creation

Group creation and adding the creator as the first member are performed within a database transaction so the operation does not leave inconsistent state.

## 8. Scalability Considerations

The service-oriented structure allows individual services to be scaled independently.

The API Gateway can distribute traffic across service instances.

PostgreSQL indexes are used on frequently queried relationship columns such as group IDs and expense IDs.

Stateless JWT authentication allows backend instances to process requests without maintaining server-side sessions.