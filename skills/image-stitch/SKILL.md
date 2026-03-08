---
name: image-stitch
description: Use when the user needs to stitch multiple images into a grid/collage. Covers starting the FastAPI server, uploading images, configuring layout (direction, cols/rows, gap, background, format/quality), generating preview, and exporting the final stitched image.
---

# image-stitch

## Overview

FastAPI service for stitching multiple images into a grid or collage. Supports horizontal/vertical layouts, custom column/row counts, gaps, and background color. Sessions are stored in memory; restarting the server clears all sessions.

**Project root:** the directory where you cloned this repo (replace `<PROJECT_ROOT>` below with your actual path)

---

## Environment Setup

Requires **Python 3.9+**.

```bash
cd <PROJECT_ROOT>

# Create and activate virtual environment (recommended)
python3 -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

Key dependencies:

| Package | Purpose |
|---------|---------|
| `fastapi` | Web framework |
| `uvicorn[standard]` | ASGI server |
| `pillow` | Image resizing, compositing, and export |
| `aiofiles` | Async file I/O |
| `python-multipart` | File upload support |

---

## Server Startup

```bash
cd <PROJECT_ROOT>
source venv/bin/activate   # if using venv
uvicorn main:app --reload --port 8000
```

Web UI available at `http://localhost:8000` (tab: Image Stitch).

---

## API Endpoints

### POST `/api/upload-images`

Upload one or more images to start a stitch session.

**Request:** `multipart/form-data`, field `files` (multiple)

**Response:**
```json
{
  "stitch_id": "<uuid>",
  "images": [
    {"id": "a1b2c3d4", "filename": "photo.jpg", "url": "/api/stitch-image-file/<stitch_id>/a1b2c3d4"}
  ]
}
```

---

### POST `/api/receive-screenshots`

Import screenshots from a video-screenshot session into a new stitch session (cross-tool integration).

**Request body:**
```json
{
  "video_id": "<video_id from video-screenshot>",
  "filenames": ["scene_001.jpg", "scene_003.jpg"]
}
```

**Response:** Same as `upload-images` — returns `stitch_id` and image list.

---

### POST `/api/reorder-images`

Change the display/stitch order of images.

**Request body:**
```json
{
  "stitch_id": "<stitch_id>",
  "order": ["img_id_2", "img_id_0", "img_id_1"]
}
```

**Response:** Updated image list in new order.

---

### DELETE `/api/stitch-image/{stitch_id}/{img_id}`

Remove an image from the stitch session.

**Response:** `{"deleted": true}`

---

### POST `/api/stitch-preview`

Generate a low-resolution preview (max 1200px wide, JPEG quality 75).

**Request body:**
```json
{
  "stitch_id": "<stitch_id>",
  "direction": "horizontal",
  "cols": 3,
  "row_gap": 10,
  "col_gap": 10,
  "bg_color": "#FFFFFF"
}
```

**Response:**
```json
{"preview_url": "/api/stitch-file/<stitch_id>/preview.jpg"}
```

---

### POST `/api/stitch-export`

Export the final full-resolution stitched image.

**Request body:** Same layout params as preview, plus:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `fmt` | str | `"JPEG"` | Output format: `"JPEG"` or `"PNG"` |
| `quality` | int | `90` | JPEG quality (1–95), ignored for PNG |

**Response:** Direct file download (`stitched.jpg` or `stitched.png`).

---

### GET `/api/stitch-file/{stitch_id}/{filename}`

Serve a file from a stitch session directory (e.g., preview).

### GET `/api/stitch-image-file/{stitch_id}/{img_id}`

Serve a specific uploaded image by its ID.

---

## Layout Parameters Reference

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `direction` | str | `"horizontal"` | `"horizontal"` (fill cols first) or `"vertical"` (fill rows first) |
| `cols` | int | auto | Number of columns. If omitted, auto-calculated from image count |
| `rows` | int | auto | Number of rows. If omitted, auto-calculated from `cols` |
| `row_gap` | int | `10` | Vertical gap between rows in pixels |
| `col_gap` | int | `10` | Horizontal gap between columns in pixels |
| `bg_color` | str | `"#FFFFFF"` | Background/gap fill color (hex string) |

**Auto-layout logic:** If neither `cols` nor `rows` is specified, columns default to `ceil(sqrt(n))` for horizontal direction.

---

## Typical Workflow

```
1. POST /api/upload-images            → get stitch_id
   (or POST /api/receive-screenshots for video screenshots)
2. POST /api/reorder-images           → arrange desired order
3. POST /api/stitch-preview           → verify layout
4. Adjust params and repeat step 3 as needed
5. POST /api/stitch-export            → download final image
```

---

## Cross-tool Integration (← video-screenshot)

When the user wants to stitch video frames directly:

```
1. In video-screenshot: select frames, note video_id + filenames
2. POST /api/receive-screenshots {"video_id": "...", "filenames": [...]}
3. Continue with stitch workflow using the returned stitch_id
```

Both tools share the same server instance and `temp/` directory, so file copying is local.

---

## Session Mechanics

- Sessions stored in `_stitch_sessions` dict (in-memory)
- Files written to `temp/stitch/<stitch_id>/`
- Session is lost on server restart; files in `temp/` persist until manually cleared

---

## Installing This Skill into Claude Code

```bash
# Copy skill to your Claude skills directory
cp -r skills/image-stitch ~/.claude/skills/

# Edit the SKILL.md and replace <PROJECT_ROOT> with your actual path
```
