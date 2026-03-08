---
name: video-screenshot
description: Use when the user needs to extract frames/screenshots from a video using scene detection. Covers starting the FastAPI server, uploading video, running scene detection (content/adaptive/threshold algorithms), manual frame capture, and exporting screenshots as ZIP.
---

# video-screenshot

## Overview

FastAPI service for extracting frames from videos via automated scene detection or manual timestamp capture. Sessions are stored in memory; restarting the server clears all sessions.

**Project root:** the directory where you cloned this repo (replace `<PROJECT_ROOT>` below with your actual path)

---

## Environment Setup

Requires **Python 3.9+** and a working **OpenCV** installation with video support.

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
| `opencv-python` | Video decoding |
| `scenedetect[opencv]` | Scene detection algorithms |
| `pillow` | Image processing / export |
| `aiofiles` | Async file I/O |
| `python-multipart` | File upload support |

---

## Server Startup

```bash
cd <PROJECT_ROOT>
source venv/bin/activate   # if using venv
uvicorn main:app --reload --port 8000
```

Web UI available at `http://localhost:8000`.

---

## API Endpoints

### POST `/api/upload-video`

Upload a video file. Returns a `video_id` used for all subsequent calls.

**Request:** `multipart/form-data`, field `file`

**Response:**
```json
{"video_id": "<uuid>", "filename": "input.mp4"}
```

---

### POST `/api/detect-scenes`

Run automated scene detection on an uploaded video.

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `video_id` | str | required | Session ID from upload |
| `detector` | str | `"content"` | Algorithm: `content`, `adaptive`, or `threshold` |
| `threshold` | float | `27.0` | Detection sensitivity. Lower = more sensitive. Typical range: 15–40 for `content`; 3.0 for `adaptive` |
| `min_scene_len` | float | `1.0` | Minimum scene length in seconds |

**Detector notes:**
- `content`: HSV frame diff, general purpose, works for most videos
- `adaptive`: Dynamic thresholding, better for varying lighting conditions
- `threshold`: Pixel luminance diff, best for hard cuts with flash/fade

**Response:**
```json
{
  "screenshots": [
    {"id": "scene_001", "filename": "scene_001.jpg", "timestamp": 3.42, "url": "/api/screenshot-file/<video_id>/scene_001.jpg"}
  ]
}
```

---

### GET `/api/screenshots/{video_id}`

List all screenshots (auto-detected and manually captured) in the session, sorted by timestamp.

---

### POST `/api/capture-frame`

Manually capture a specific frame.

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `video_id` | str | Session ID |
| `timestamp` | float | Time in seconds |

**Response:** Single screenshot object (same format as above).

---

### DELETE `/api/screenshot/{video_id}/{shot_id}`

Remove a screenshot from the session and delete its file.

**Response:** `{"deleted": true}`

---

### GET `/api/export-screenshots/{video_id}`

Download all screenshots as a ZIP archive.

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `fmt` | str | `"jpg"` | Export format: `jpg` or `png` |

**Response:** `screenshots.zip` file download.

---

### GET `/api/screenshot-file/{video_id}/{filename}`

Serve a single screenshot image.

---

### GET `/api/video-file/{video_id}`

Serve the uploaded video file.

---

## Typical Workflow

```
1. POST /api/upload-video          → get video_id
2. POST /api/detect-scenes         → auto-generate scene screenshots
3. GET  /api/screenshots/{id}      → review list
4. POST /api/capture-frame         → add missing frames manually
5. DELETE /api/screenshot/{id}/{shot_id} → remove unwanted frames
6. GET  /api/export-screenshots/{id}    → download ZIP
```

---

## Session Mechanics

- All state is in `_sessions` dict (Python in-memory)
- `detect-scenes` replaces all auto-detected shots but preserves `manual_*` shots
- `capture-frame` inserts with id prefix `manual_`
- Session is lost on server restart; temp files survive in `temp/<video_id>/`

---

## Cross-tool Integration (→ image-stitch)

To send selected screenshots to the image stitch tool:

```
POST /api/receive-screenshots
{
  "video_id": "<video_id>",
  "filenames": ["scene_001.jpg", "manual_12.34.jpg"]
}
```

Returns a `stitch_id` for use with the image-stitch API. See the `image-stitch` skill for full details.

---

## Installing This Skill into Claude Code

```bash
# Copy skill to your Claude skills directory
cp -r skills/video-screenshot ~/.claude/skills/

# Edit the SKILL.md and replace <PROJECT_ROOT> with your actual path
```
