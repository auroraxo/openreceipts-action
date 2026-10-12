#!/usr/bin/env python3
"""CI helper: extract the raw 32-byte Ed25519 seed from a PEM PKCS8 file and
print it as base64 on stdout. Used by the test-raw-seed CI job."""
import base64
import sys

pem_path = sys.argv[1]
pem = open(pem_path).read()
der = base64.b64decode("".join(l for l in pem.splitlines() if not l.startswith("-")))
sys.stdout.write(base64.b64encode(der[-32:]).decode())
