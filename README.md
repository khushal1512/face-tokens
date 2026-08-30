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

Requirements: Node 20 or newer and the 1AM wallet extension set to **Preview**.
Nothing else. No Docker, no proof server, no faucet, no tokens.

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
works locally without any TLS setup.

## Networks

The app targets whatever `VITE_NETWORK_ID` in `ft-ui/.env` says, and reads every
endpoint except the read-only indexer from the wallet's `getConfiguration()`.

| Network | Proving | Fees | What the user needs |
|---|---|---|---|
| `preview` (default) | 1AM ProofStation, remote | Sponsored by 1AM | Nothing |
| `preprod` | Your own proof server | You pay | Faucet NIGHT, register it for DUST, wait |

**Preview is the default and the recommended one.** Proving happens at
`api-preview.1am.xyz` inside the wallet's own flow, so no proof server runs
anywhere near the user, and 1AM covers the fees. A reviewer installs the
extension, sets it to Preview, and mints. They never touch a faucet.

To use preprod instead, set both of these in `ft-ui/.env`:

```
VITE_NETWORK_ID=preprod
VITE_INDEXER_URL=https://indexer.preprod.midnight.network/api/v4/graphql
```

and be aware of what that costs you:

- A proof server has to be running. `npm run proof-server` starts one on `:6300`.
- Fees are not sponsored. Fund the unshielded address (`mn_addr_preprod1...`)
  from `https://faucet.preprod.midnight.network`, wait for the wallet to finish
  syncing, register the NIGHT UTXOs for DUST generation, then wait again while
  DUST accrues. A wallet that is still syncing reports itself as uninitialised
  and will refuse to register.

A contract deployed on one network does not exist on the other. Switching
networks means deploying again and replacing `VITE_DEFAULT_CONTRACT`.

The app checks all of this on connect and shows a notice above the scanner if
the wallet cannot pay for a mint yet, so you find out before scanning rather
than inside a failing transaction.

### Recompiling the circuit

`contract/managed/` is committed so the project runs without the Compact
toolchain installed. To rebuild it you need `compact` on PATH:

```bash
npm run compile
```

## Deploying so other people can use it

The frontend is a static bundle. Proving happens in the wallet and reading
happens through the public indexer, so there is no backend to host.

**1. Deploy the contract once and note the address.**

Open the app, connect the wallet, press `Select`, then `Deploy new`. Copy the
64 character address it returns. On preview this costs nothing. Deploy against
the same network the app is configured for.

**2. Bake that address into the build** so visitors do not have to deploy their
own instance:

```bash
# ft-ui/.env
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

Add the environment variables from `ft-ui/.env` in the Vercel project settings,
including `VITE_DEFAULT_CONTRACT`. Page analytics are already wired up
through `@vercel/analytics` and start reporting once the project is deployed.

The build copies `keys/` and `zkir/` into `dist/`. Those files are what
`FetchZkConfigProvider` fetches at proving time, so the host has to serve them
as static assets. They are a few megabytes and must not be stripped.

**4. Check the deployment** by opening the URL, confirming the ledger table
loads (that proves the indexer and the baked in contract address are correct),
then connecting a wallet and minting.

### What a reviewer needs

On the default preview network:

- The 1AM wallet extension, set to Preview
- Camera permission, which the browser grants over HTTPS

That is the whole list. No tokens, no faucet, no proof server, no API key, no
backend, no database. Fees are sponsored and proving is remote.

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
