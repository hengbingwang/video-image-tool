# video-image-tool

A web-based tool for extracting video screenshots via scene detection and stitching multiple images into a grid/collage.

## Features

- **Video Screenshot**: Upload a video, auto-detect scene changes, capture specific frames manually, and export selected screenshots as a ZIP
- **Image Stitch**: Upload images, configure layout (grid direction, columns, rows, gaps, background), preview, and export the stitched result
- **Cross-tool Integration**: Send video screenshots directly to the stitch tool for quick collage creation

## Installation

```bash
pip install -r requirements.txt
```

> Requires Python 3.9+ and OpenCV with video support.

## Startup

```bash
uvicorn main:app --reload
```

The app will be available at `http://localhost:8000`.

## API Overview

### Video Screenshot

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/upload-video` | Upload a video file, returns `video_id` |
| POST | `/api/detect-scenes` | Run scene detection on uploaded video |
| GET | `/api/screenshots/{video_id}` | List all screenshots in a session |
| POST | `/api/capture-frame` | Manually capture a frame at a given timestamp |
| DELETE | `/api/screenshot/{video_id}/{shot_id}` | Delete a specific screenshot |
| GET | `/api/export-screenshots/{video_id}` | Download all screenshots as ZIP |

### Image Stitch

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/upload-images` | Upload images to stitch, returns `stitch_id` |
| POST | `/api/receive-screenshots` | Import screenshots from a video session |
| POST | `/api/reorder-images` | Reorder images in a stitch session |
| DELETE | `/api/stitch-image/{stitch_id}/{img_id}` | Remove an image from the session |
| POST | `/api/stitch-preview` | Generate a low-resolution preview |
| POST | `/api/stitch-export` | Export the final stitched image |

## Notes

- Sessions are stored in memory and are lost on server restart
- Temporary files are written to the `temp/` directory (excluded from version control)
