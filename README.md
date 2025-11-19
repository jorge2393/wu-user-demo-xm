

<div align="center">
<img width="200" alt="Image" src="https://github.com/user-attachments/assets/8b617791-cd37-4a5a-8695-a7c9018b7c70" />
<br>
<br>
<h1>Western Union Agent Demo</h1>

<br>
<br>
</div>

## Introduction
This demo demonstrates a Western Union agent interface built with Crossmint and Rain. Users sign in with email to auto‑create a smart wallet, receive money transfers, request cash pickups, or create and fund a Rain credit card—then view balances, activity, and securely reveal card details.

**Features:**
- **Account Management**: View USDC balance on Base Sepolia
- **Money Transfers**: Receive money transfers via Circle faucet
- **Cash Pickup**: Request cash pickup at Western Union agent locations
- **Credit Cards**: Create and manage Rain-powered credit cards
- **Card Funding**: Fund credit cards with USDC
- **Card Details**: Securely reveal PAN and CVC using RSA/AES encryption
- **Transaction History**: View recent wallet activity


## Setup
1. Clone the repository and navigate to the project folder:
```bash
git clone https://github.com/jorge2393/wu-user-demo.git && cd wu-user-demo
```

2. Install all dependencies:
```bash
npm install
# or
yarn install
# or
pnpm install
# or
bun install
```

3. Set up the environment variables:
```bash
cp .env.example .env
```

4. Configure the required environment variables in your `.env` file:

**Required Variables:**
- `NEXT_PUBLIC_CROSSMINT_API_KEY`: Get from [Crossmint Dashboard](https://docs.crossmint.com/introduction/platform/api-keys/client-side)
- `NEXT_PUBLIC_CHAIN`: Set to `base-sepolia` for Base Sepolia testnet
- `RAIN_API_KEY`: Get from [Rain Dashboard](https://rain.xyz) for credit card functionality
- `NEXT_PUBLIC_TREASURY_ADDRESS`: Treasury wallet address for offramp functionality
- `CIRCLE_FAUCET_API_KEY`: Get from [Circle Developer Console](https://developers.circle.com/) for USDC faucet functionality (format: `TEST_API_KEY:...`)

**Optional Variables:**
- `NEXT_PUBLIC_BACKEND_URL`: Backend URL for salary claiming (defaults to demo mode)
- `RAIN_API_BASE_URL`: Rain API base URL (defaults to `https://api-dev.raincards.xyz/v1`)

**API Key Scopes Required:**
- Crossmint: `users.create`, `users.read`, `wallets.read`, `wallets.create`, `wallets:transactions.create`, `wallets:transactions.sign`, `wallets:balance.read`, `wallets.fund`

5. Run the development server:
```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```


## User Flow


### 0) Auth and Wallet Creation
- User logs in with email and verifies with OTP 1.
- Crossmint issues a JWT for the session.
- The app accesses this token from the Crossmint React SDK via `useCrossmint()` and uses it to authorize wallet operations against Crossmint APIs on behalf of the user.
- On first login, a smart wallet is created automatically with an email-based signer.


### 1) Receive Money Transfer
- User clicks "Receive Money Transfer".
- Frontend calls Circle Faucet API to request USDC tokens.
- Balance updates automatically once the transfer is processed.

### 2) Cash Pickup
- User selects an agent location and enters an amount.
- A transaction is sent from the user's smart wallet to the treasury address (`NEXT_PUBLIC_TREASURY_ADDRESS`).
- First transaction requires an OTP flow to authorize the signature; subsequent transactions do not.
- UI shows "Processing Request", confirms when on-chain success is detected, and generates a QR code for agent verification.

### 3) Credit Card via Rain
1. KYC (demo-bypassed): Create a Rain user (returns `userId`).
2. Create Rain smart contract for the user on Base Sepolia.
3. Issue a credit card for the user (status active).
4. Fund the card by sending USDC from the user’s smart wallet to the contract’s deposit address.
5. Poll Rain endpoints to reflect spending power/balance on the card.
6. Reveal card details (PAN/CVC) via secure RSA public-key handshake + AES-128-GCM decryption, performed on server-side API routes.



### Environment Summary
- `NEXT_PUBLIC_CROSSMINT_API_KEY`,
- `NEXT_PUBLIC_CHAIN` (Base Sepolia),
- `NEXT_PUBLIC_TREASURY_ADDRESS` (for offramp),
- `RAIN_API_KEY`,
- `CIRCLE_FAUCET_API_KEY` (for money transfer functionality).

