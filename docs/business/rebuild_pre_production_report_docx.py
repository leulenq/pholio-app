#!/usr/bin/env python3
"""Rebuild the Pholio pre-production founder/status DOCX from text-safe Base64.

Some review/upload systems reject binary `.docx` files. This script decodes the
committed Base64 payload into the shareable Word document without requiring
`python-docx` or any third-party dependency.
"""

from __future__ import annotations

import base64
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "docs/business/pre-production-founder-status-report.docx.b64"
OUTPUT = ROOT / "Pholio-Pre-Production-Founder-Status-Report.docx"


def main() -> None:
    encoded = SOURCE.read_text().encode("ascii")
    OUTPUT.write_bytes(base64.b64decode(encoded))
    print(f"Wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
