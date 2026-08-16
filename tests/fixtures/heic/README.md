# HEIC test fixture

`sample.heic` is a real HEIC file: an ISO base-media container whose image item
is HEVC-coded, exactly like the file an iPhone produces with "High Efficiency"
capture on. It exists because the spec-correct export's HEIC handling cannot be
tested with a synthetic file — the whole question is whether the deployed
libvips can decode HEVC, and only genuine HEVC bitstream answers it.

## Why it is not generated

The fixture is committed rather than produced at test time because Sharp can
only write a HEIC when libvips was built with an HEVC *encoder*, which is rarer
still than the decoder. The `HEIC input` block in
`tests/spec-registry/spec-export.test.js` tries to generate one first and falls
back to this file, so a machine that can encode HEVC exercises freshly-generated
bytes and every other machine exercises these.

## Provenance

Taken from the Nokia HEIF conformance candidate set
(`nokiatech/heif_conformance`, `conformance_files/C053.heic`), the corpus
published for MPEG HEIF conformance testing and generated with Nokia's
reference HEIF writer. 1024×512, `mif1` major brand with `heic` among its
compatible brands, 14,550 bytes — the smallest genuine HEIC located.

## Verified known-good

Decoded successfully to RGB pixel data via libheif 1.17.6 + libde265, so a
failure to decode it in a test is a statement about the runtime's HEVC support
and never about the file:

    heif_context_read_from_memory_without_copy → Success
    heif_context_get_primary_image_handle      → Success
    heif_decode_image (RGB, interleaved)       → Success, 1024px wide

Note that `sharp(...).metadata()` reports `format: "heif", compression: "hevc"`
even on a runtime that cannot decode it — the container parses without the
codec. Capability probes must attempt a real pixel decode, which is what the
test's `heicDecodeAvailable()` does.

## License

`nokiatech/heif_conformance` is publicly published by Nokia as a conformance
corpus, but the repository carries no explicit license file or redistribution
grant that this fixture's provenance note could point to. This file is used
here only as a test input — never served, shipped, or distributed to Pholio
users or agencies — but its redistribution status under Nokia's terms is
unverified. If that changes (the corpus gains an explicit license, or Pholio
needs this fixture outside test-only use), re-check before relying on it
further.
