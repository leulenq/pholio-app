# Haar cascades

`haarcascade_frontalface_default.xml` is the stump-based frontal face
detector from the OpenCV project (Rainer Lienhart), copied verbatim from
`opencv/opencv` `data/haarcascades/` (4.x). It is redistributed under the
OpenCV licence terms embedded in the file header (Intel License Agreement
for Open Source Computer Vision Library, BSD-style).

Used by `perception/faces.js` through `@techstark/opencv-js` (OpenCV compiled
to WebAssembly) when no `@vladmandic/human` detector is installed. Runs in
~150–350 ms on a 640px probe with no native dependencies.
