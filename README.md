# openreceipts-action

GitHub Action: sign an [openreceipts/v1](https://github.com/auroraxo/openreceipts/blob/main/docs/SPEC.md)
receipt for every published release — with **your own key**, zero configuration.

```yaml
# .github/workflows/release-receipt.yml
on:
  release:
    types: [published]

permissions:
  contents: write # only needed to upload the receipt as a release asset

jobs:
  receipt:
    runs-on: ubuntu-latest
    steps:
      - uses: auroraxo/openreceipts-action@v1
        with:
          key: ${{ secrets.OPENRECEIPTS_PRIVATE_KEY }}
```

That's it. On each release the action:

1. signs a `release` receipt: `issuer` = your repo owner, `subject` = `owner/repo`,
   `claims.version` = the release tag, `claims.url` = the release URL;
2. writes it to `receipts/release-<tag>.json` (self-contained: receipt + pubkey + sig);
3. verifies the signature before finishing (a broken key fails the workflow, loudly);
4. uploads the receipt as a release asset (disable with `upload: false`).

## Key (BYO)

```bash
git clone https://github.com/auroraxo/openreceipts.git && cd openreceipts
pip install cryptography
python3 receipt.py keygen --issuer yourname
gh secret set OPENRECEIPTS_PRIVATE_KEY < ~/.openreceipts/yourname.key
```

The private key never leaves your secret store. The public key is printed by
`keygen` — publish it (repo, website, README) so third parties can pin it.

## Inputs

| input | default | description |
| --- | --- | --- |
| `key` | *(required)* | Ed25519 private key: PEM PKCS8 or base64 raw 32-byte seed |
| `issuer` | repo owner | Receipt issuer |
| `path` | `receipts/release-<tag>.json` | Output path |
| `upload` | `true` | Upload receipt as release asset |

## Outputs

| output | description |
| --- | --- |
| `receipt-path` | Path of the signed receipt file |
| `pubkey` | base64 Ed25519 public key (for pinning) |

## Verifying a receipt

Offline, no server, no registry — copy `verify.mjs` or `receipt.py` from
[auroraxo/openreceipts](https://github.com/auroraxo/openreceipts):

```bash
python3 receipt.py verify release-v1.0.0.json --key yourname.pub
node verify.mjs --key yourname.pub release-v1.0.0.json
```

## Why

Receipts are the cheap end of verifiable: one Ed25519 signature over canonical
JSON beats a screenshot of a release page. See the
[getting-started guide](https://github.com/auroraxo/openreceipts/blob/main/docs/getting-started.md).

MIT.
