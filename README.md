# video-image-tool

A web-based tool for extracting video screenshots via scene detection and stitching multiple images into a grid/collage.

## Features

- **Video Screenshot**: Upload a video, auto-detect scene changes (content / adaptive / threshold algorithms), capture specific frames manually, and export selected screenshots as a ZIP
- **Image Stitch**: Upload images, configure layout (grid direction, columns, rows, gaps, background color), preview, and export the stitched result
- **Cross-tool Integration**: Send video screenshots directly to the stitch tool for quick collage creation

## Requirements

- Python 3.9+
- OpenCV with video support (included via `opencv-python`)

## Installation

```bash
# Clone the repo
git clone https://github.com/hengbingwang/video-image-tool.git
cd video-image-tool

# Create and activate a virtual environment (recommended)
python3 -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `fastapi` | ≥0.104.0 | Web framework |
| `uvicorn[standard]` | ≥0.24.0 | ASGI server |
| `opencv-python` | ≥4.8.0 | Video decoding and frame extraction |
| `scenedetect[opencv]` | ≥0.6.2 | Scene change detection algorithms |
| `pillow` | ≥10.0.0 | Image processing and export |
| `aiofiles` | ≥23.2.1 | Async file I/O |
| `python-multipart` | ≥0.0.6 | File upload support |

## Startup

```bash
source venv/bin/activate   # if using venv
uvicorn main:app --reload
```

The app will be available at `http://localhost:8000`.

## API Overview

### Video Screenshot

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/upload-video` | Upload a video file, returns `video_id` |
| POST | `/api/detect-scenes` | Run scene detection (params: `detector`, `threshold`, `min_scene_len`) |
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
| POST | `/api/stitch-export` | Export the final stitched image (params: `fmt`, `quality`) |

## Claude Code Skills

This repo includes two Claude Code skills under `skills/` that let you control this tool through natural language in Claude Code.

### Install

```bash
cp -r skills/video-screenshot ~/.claude/skills/
cp -r skills/image-stitch ~/.claude/skills/

# Replace <PROJECT_ROOT> with your actual clone path in each SKILL.md
sed -i '' "s|<PROJECT_ROOT>|$(pwd)|g" \
  ~/.claude/skills/video-screenshot/SKILL.md \
  ~/.claude/skills/image-stitch/SKILL.md
```

### Usage in Claude Code

Once installed, Claude Code will automatically invoke the relevant skill when you describe a video or image task. Examples:

- *"从这个视频里检测场景变化，导出截图"* → triggers `video-screenshot`
- *"把这几张截图拼成 3 列的网格图"* → triggers `image-stitch`

See [`skills/video-screenshot/SKILL.md`](skills/video-screenshot/SKILL.md) and [`skills/image-stitch/SKILL.md`](skills/image-stitch/SKILL.md) for full API and parameter reference.

## Notes

- Sessions are stored in memory and are lost on server restart
- Temporary files are written to the `temp/` directory (excluded from version control)
