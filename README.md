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

The "Péče o každý detail" section (`#servis` in `index.html`) runs a looping video behind the copy and the three steps. All text is plain HTML in `index.html`, so edit it there.

Video files live in `assets/video/`:

- `servis-automatu-1280.mp4` / `.webm`: desktop
- `servis-automatu-720.mp4` / `.webm`: phones (up to 720 px wide)
- `servis-automatu-poster.jpg`: shown before the video loads, and as the still image for visitors who prefer reduced motion

`assets/js/service.js` attaches the video only after the page has loaded and the section is close to the screen. It plays only while the section is visible. To swap in a new video, replace these files. Encode them without audio, with `-movflags +faststart` for the MP4s.
