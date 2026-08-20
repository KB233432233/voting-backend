# Project: Anonymous RCV Voting Backend
## Stack
- Runtime: Node.js + TypeScript
- Framework: Express.js
- ORM: Prisma (PostgreSQL)
- Auth: Wallet-based (EIP-4361/ECDSA), no passwords
- Crypto: RSA Blind Signatures, SHA-256 commitments
- IDs: Snowflake (BIGINT), app-generated
- Blockchain: Polygon/Base L2 (relayer or user wallet)

## Core Rules
1. NEVER store `userId` in `votes` or `transactions` tables (anonymity requirement)
2. `serial` and `voteHash` are stored as `Bytes` (Buffers in TS)
3. All BigInts must be serialized to strings before JSON response
4. Tokens are single-use: hash before storage, mark `usedAt` on consumption
5. Blind signing must happen BEFORE vote is cast on-chain
6. Use Prisma transactions for atomic DB writes
7. Strict error handling + Zod validation for all inputs

## Data Flow
1. Auth: Wallet signature → session → eligible user
2. Token: Server generates `crypto.randomBytes(32)`, stores SHA256, returns plaintext
3. Blind Sign: Client blinds `SHA256(serial + rankings)`, sends with token → server signs & consumes token
4. Cast: Client submits `(serial, voteHash, signature, txHash)` → server creates `Vote` + `Transaction` (no userId)
5. Worker: Polls chain → updates `Transaction.status` → `confirmed`
6. Tally: Reads `confirmed` votes → verifies signatures → runs IRV → publishes results