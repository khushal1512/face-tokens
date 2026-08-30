# FaceToken

Private proof of personhood on the Midnight Network.

Face detection, liveness checking and hashing all happen inside the browser tab.
What reaches the chain is a zero knowledge proof, a one way hash of facial
landmark ratios, and a liveness score that passed a threshold. The camera feed,
the raw landmarks and the vector itself never leave the device.

## Repository layout

```
contract/   facetoken.compact plus the compiled circuit output in managed/
api/        FaceTokenAPI, the deploy/join/mint wrapper over midnight-js
ft-ui/      React and Vite frontend
```

The three are npm workspaces. `ft-ui` depends on `facetoken-api`, which depends
on `facetoken-contract`, so the two library packages have to be built before the
frontend can resolve them.

## The circuit

```
mint(to) -> Uint<64>
  reads localFaceVectorHash() and localLivenessScore() from private state
  asserts score >= 70
  asserts the hash has not been registered before   (one face, one token)
  inserts a TokenEntry and returns the new token id
```

The ledger stores four public fields per token: `tokenId`, `owner`, `faceHash`
and `livenessScore`. Nothing in that set can be reversed into an image.

## Running locally

Requirements: Node 20 or newer, and a Midnight wallet extension. The 1AM wallet
is the easiest option because it proves transactions itself.

```bash
git clone https://github.com/khushal1512/face-tokens.git
cd face-tokens
npm install
npm run dev
```

That opens http://localhost:3000. `npm run dev` builds `contract` and `api`
first, then copies the proving keys and ZK IR into `ft-ui/public` so
`FetchZkConfigProvider` can fetch them, then starts Vite.

Camera access needs a secure context. `localhost` counts as one, so the scan
works in local development without any TLS setup.

### About the proof server

Midnight has no public shared proof server, and that is deliberate: proving
consumes your private witness data, so sending it to a stranger's endpoint would
undo the privacy the circuit gives you. There are two ways to satisfy it.

**Wallet side proving, which is the default here.** The 1AM wallet exposes
`getProvingProvider()` and routes proving through its own ProofStation. This app
tries that first, so with 1AM installed you do not need Docker at all.

**Your own proof server, as a fallback.** If the wallet cannot prove on its own,
the app falls back to whatever `proverServerUri` the wallet reports. To run one:

```bash
npm run proof-server     # docker, listens on :6300
```

### Network choice

| Network | Proving | Fees |
|---|---|---|
| `preview` | 1AM ProofStation | Sponsored, the user pays nothing |
| `preprod` | 1AM ProofStation or your own server | You need NIGHT and DUST |

`preprod` is the default in `ft-ui/.env.preprod`. On `preview` the wallet
sponsors fees, so reviewers need no faucet, no NIGHT and no DUST registration.
Switch by setting `VITE_NETWORK_ID=preview` and pointing `VITE_INDEXER_URL` at
`https://indexer.preview.midnight.network/api/v4/graphql`, then redeploy the
contract on that network.

### Getting DUST on preprod

DUST is the fee resource, and NIGHT does not pay fees directly. NIGHT generates
DUST, but only after its UTXOs are registered on chain.

1. Copy your unshielded address from 1AM. It starts `mn_addr_preprod1`.
2. Request NIGHT from `https://faucet.preprod.midnight.network`.
3. Let the wallet finish syncing. A wallet that is still syncing reports itself
   as uninitialised, and DUST registration will refuse to run.
4. Register the NIGHT UTXOs for DUST generation from the wallet.
5. Wait. DUST accrues over minutes rather than instantly.

The app reads `getDustBalance()` on connect and warns before you scan if the
balance is still zero, so you do not discover it inside a failing transaction.

### Recompiling the circuit

`contract/managed/` is committed so the project runs without the Compact
toolchain installed. To rebuild it you need `compact` on PATH:

```bash
npm run compile
```

## Deploying so other people can use it

The frontend is a static bundle. Proving happens in the wallet's proof server and
reading happens through the public indexer, so there is no backend to host.

**1. Deploy the contract once and note the address.**

Open the app, connect a funded wallet, press `Select`, then `Deploy new`. Copy
the 64 character address it returns.

**2. Bake that address into the build** so visitors do not have to deploy their
own instance:

```bash
# ft-ui/.env.preprod
VITE_DEFAULT_CONTRACT=<the 64 hex character address>
```

**3. Build and publish `ft-ui/dist`.**

```bash
npm run build
```

Any static host works. On Vercel, import the repository and set:

| Setting | Value |
|---|---|
| Framework preset | Other |
| Build command | `npm run build` |
| Output directory | `ft-ui/dist` |
| Install command | `npm install` |
| Node version | 20.x |

Add the environment variables from `ft-ui/.env.preprod` in the Vercel project
settings, including `VITE_DEFAULT_CONTRACT`. Page analytics are already wired up
through `@vercel/analytics` and start reporting once the project is deployed.

The build copies `keys/` and `zkir/` into `dist/`. Those files are what
`FetchZkConfigProvider` fetches at proving time, so the host has to serve them
as static assets. They are a few megabytes and must not be stripped.

**4. Check the deployment** by opening the URL, confirming the ledger table
loads (that proves the indexer and the baked in contract address are correct),
then connecting a wallet and minting.

### What a reviewer needs

- The 1AM wallet extension, with preprod NIGHT registered for DUST
- Camera permission, which the browser grants over HTTPS or on localhost
- Nothing else. No API key, no backend, no database.

## Notes on the wallet integration

- One authorisation per session. `BrowserFaceTokenManager.connect()` memoises the
  `ConnectedAPI`, so the extension prompts once rather than on every read.
- Network, indexer and proof server URLs all come from the wallet's
  `getConfiguration()`. The env file only sets what the dApp asks for, and a
  mismatch is logged rather than silently ignored.
- The hosted preprod indexer rejects `contractAction` queries with a null offset,
  which is what the SDK sends when asked for the latest state. Reads go through
  `createPatchedPublicDataProvider` for that reason.
- Wallets return shielded keys bech32m encoded (`mn_shield-cpk_...`). They are
  decoded with `parseCoinPublicKeyToHex` from `midnight-js-utils`, which needs the
  network id. Parsing one as raw hex would silently produce 32 zero bytes and mint
  the token to nobody.
