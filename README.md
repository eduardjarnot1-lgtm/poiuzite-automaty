# Použité automaty

Homepage for Použité automaty, a Czech business selling refurbished vending machines.

## Run it

It's a static site. Serve the folder and open `index.html`:

```sh
python3 -m http.server 8000
```

## Hero

The hero is a workshop scene split into two depth layers, with the Czech copy, navigation, button and before/after switch as plain HTML on top:

- `assets/img/hero-bg.webp`: the workshop (wall, workbench, floor) with the machines and platform removed, softly blurred towards the edges.
- `assets/img/hero-fg-before.webp` and `hero-fg-after.webp`: the three machines on the concrete platform, opened up for repair and finished.

The pointer moves the far layer less than the near one, and tilts the machines very slightly. The platform gets extra volume from CSS shading, and the glass fronts carry a faint reflection that follows the pointer. Phones, touch screens and `prefers-reduced-motion` get a still scene. "Před opravou" and "Po opravě" wipe between the two machine layers.

The layers are built from the two flattened mockups in `assets/source/` by `tools/build_layers.py`. It removes the text baked into the mockups, cuts out the machines and platform, and fills in the workshop behind them. To rebuild:

```sh
pip install opencv-python-headless numpy pillow
python3 tools/build_layers.py
```

## Servis section

The "Druhá šance začíná důkladnou péčí" section (`#servis` in `index.html`) is driven by scrolling. The section is tall, the video stays pinned to the screen, and scrolling moves the video from its first frame to its last, forwards or backwards. When the video ends, the page carries on to the footer.

- **Copy:** plain HTML in `index.html`. Each `.scrub-panel` has `data-from` / `data-to`, the seconds of video during which it shows. Comments there say what the footage shows at each point.
- **Scroll length:** `--scrub-distance` on `.scrub` in `assets/css/style.css`, in viewport heights (400 by default). Higher means slower scrubbing.
- **Smoothing:** `EASE` at the top of `assets/js/scrub.js`.

The footage is an exploded-assembly animation, so the section labels it "Ilustrační animace" and the copy describes the process, not what the footage literally shows.

Video files in `assets/video/`:

- `servis-scrub-1280.mp4` / `.webm`: desktop
- `servis-scrub-720.mp4` / `.webm`: phones (up to 760 px wide)
- `servis-scrub-start.jpg`: the first frame, shown until the video is ready
- `servis-scrub-poster.jpg`: the still used when the video can't run

The original video is kept in `assets/source/servis-automatu-original.mp4`. The scrub files are encoded with a keyframe every 6 frames so seeking stays quick in both directions:

```sh
SRC=assets/source/servis-automatu-original.mp4
ffmpeg -i $SRC -an -c:v libx264 -crf 28 -preset slow -g 6 -keyint_min 6 -sc_threshold 0 -bf 0 -pix_fmt yuv420p -movflags +faststart assets/video/servis-scrub-1280.mp4
ffmpeg -i $SRC -an -vf scale=720:-2 -c:v libx264 -crf 27 -preset slow -g 6 -keyint_min 6 -sc_threshold 0 -bf 0 -pix_fmt yuv420p -movflags +faststart assets/video/servis-scrub-720.mp4
ffmpeg -i $SRC -an -c:v libvpx-vp9 -crf 39 -b:v 0 -g 6 assets/video/servis-scrub-1280.webm
ffmpeg -i $SRC -an -vf scale=720:-2 -c:v libvpx-vp9 -crf 37 -b:v 0 -g 6 assets/video/servis-scrub-720.webm
```

If the video length changes, update `data-duration` on the section and the panel timings.

Visitors who prefer reduced motion, browsers that can't play the video, and any failed load get a normal section instead: the poster, then all the copy and steps laid out in order. The script waits for the page to load before fetching video, and plays it from memory if the server doesn't support range requests (which seeking needs).
