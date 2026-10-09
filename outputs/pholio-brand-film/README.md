# PHOLIO / First Impressions

A 64.663-second portrait brand film: the introduction is a fragmented image until the person comes into focus. Optical shutters, rolling contact sheets, cropped portraits and oversized editorial typography move from friction to confident self-expression.

- Main delivery: PHOLIO-First-Impressions-1080x1920.mp4
- 1080 × 1920, 9:16, 30 fps, H.264 / yuv420p, AAC stereo at 48 kHz / 320 kbps; fast-start MP4.
- PHOLIO-Reel-Cover.jpg: portrait cover, exported from the film.
- PHOLIO-Captions.srt: optional narration captions, supplied separately so the graphic composition remains clean.
- Review-Contact-Sheet.jpg: representative frames.
- Asset-Credits.md: asset provenance.

The owner-approved Vocal Design master is preserved at timeline zero. The first brand transition is at 26.080 seconds and the closing reveal at 51.370 seconds. The full outro is retained.

## Render source

source/film.py is the deterministic frame renderer. Python dependencies: Pillow, NumPy, SciPy, OpenCV; FFmpeg on PATH. It currently references the local raw-asset package, fonts and approved soundtrack by absolute path. No app code is involved.

Run `python source/film.py frames` for review frames or `python source/film.py` for the full film. All visual effects are computed frame by frame; the soundtrack has no processing beyond delivery encoding.
