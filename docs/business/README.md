# Business documents

## Pre-production founder/status report

The shareable Word document is stored in a text-safe format because this review
surface does not support binary `.docx` files.

Rebuild the DOCX locally with:

```bash
python docs/business/rebuild_pre_production_report_docx.py
```

That writes:

```text
Pholio-Pre-Production-Founder-Status-Report.docx
```

The Base64 payload lives at:

```text
docs/business/pre-production-founder-status-report.docx.b64
```

The Markdown source remains:

```text
docs/business/pre-production-founder-status-report.md
```

If you want to regenerate the styled DOCX from Markdown instead of decoding the
committed payload, install `python-docx` and run:

```bash
python docs/business/generate_pre_production_report_docx.py
```
