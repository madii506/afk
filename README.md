# AFK

The onchain AFK protocol. One click puts your SOL into any pump.fun (PumpSwap) pool, and every trade in that pool pays you a cut, even while you're away.

- `index.html`, `css/`, `js/`: the site. `js/world.js` is the live three.js night pool; `js/afk.js` is the app (wallet, pools, one-click deposit, positions, withdraw).
- `api/afk.js`: one Vercel function behind `/api/*`. It reads Solana, builds unsigned PumpSwap transactions with the official SDK, simulates them on mainnet, and hands them to the user's wallet to sign. It never holds keys or funds.

## Environment (all optional, set in Vercel, never in the repo)

| Variable | What it does |
|---|---|
| `RPC_URL` | A private Solana RPC (Helius etc.). Public RPCs are used without it. |
| `AFK_CA` | The $AFK mint. Shows the CA pill on the site once set. |
| `AFK_X` | The X handle or URL for the CA pill. |
| `AFK_FEE_WALLET` | A public wallet address to receive a deposit fee. Unset = AFK takes 0%. |
| `AFK_FEE_BPS` | Fee in basis points when a fee wallet is set (default 10 = 0.1%). |

## Local

`node dev/srv.mjs` serves the site with a mock `/api` built from a real DexScreener snapshot (`dev/snap.json`). `dev/` is not deployed.
