import os
import uuid
import zipfile
import shutil
from typing import List, Optional
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, HTTPException, Query
from fastapi.responses import FileResponse
import aiofiles

from services.scene_detect import detect_scenes, capture_frame

router = APIRouter()

# In-memory store: video_id -> {path, screenshots: [{id, filename, timestamp, path}]}
_sessions: dict = {}

TEMP_DIR = "temp"


@router.post("/upload-video")
async def upload_video(file: UploadFile = File(...)):
    video_id = str(uuid.uuid4())
    video_dir = os.path.join(TEMP_DIR, video_id)
    os.makedirs(video_dir, exist_ok=True)

    video_path = os.path.join(video_dir, file.filename)
    async with aiofiles.open(video_path, "wb") as f:
        while chunk := await file.read(1024 * 1024):
            await f.write(chunk)

    _sessions[video_id] = {"path": video_path, "screenshots": []}
    return {"video_id": video_id, "filename": file.filename}


@router.post("/detect-scenes")
async def api_detect_scenes(
    video_id: str,
    detector: str = "content",
    threshold: float = 27.0,
    min_scene_len: float = 1.0,
):
    session = _get_session(video_id)
    screenshot_dir = os.path.join(TEMP_DIR, video_id, "screenshots")

    # Clear existing auto-detected screenshots (keep manual ones)
    session["screenshots"] = [s for s in session["screenshots"] if s["id"].startswith("manual_")]

    # Remove old scene files
    if os.path.exists(screenshot_dir):
        for f in os.listdir(screenshot_dir):
            if f.startswith("scene_"):
                os.remove(os.path.join(screenshot_dir, f))

    try:
        new_shots = detect_scenes(
            video_path=session["path"],
            output_dir=screenshot_dir,
            detector=detector,
            threshold=threshold,
            min_scene_len=min_scene_len,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    session["screenshots"].extend(new_shots)
    session["screenshots"].sort(key=lambda x: x["timestamp"])

    return {"screenshots": _serialize(session["screenshots"], video_id)}


@router.get("/screenshots/{video_id}")
async def get_screenshots(video_id: str):
    session = _get_session(video_id)
    return {"screenshots": _serialize(session["screenshots"], video_id)}


@router.post("/capture-frame")
async def api_capture_frame(video_id: str, timestamp: float):
    session = _get_session(video_id)
    screenshot_dir = os.path.join(TEMP_DIR, video_id, "screenshots")

    try:
        shot = capture_frame(session["path"], timestamp, screenshot_dir)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Insert in sorted order
    session["screenshots"].append(shot)
    session["screenshots"].sort(key=lambda x: x["timestamp"])

    return {"screenshot": _serialize([shot], video_id)[0]}


@router.delete("/screenshot/{video_id}/{shot_id}")
async def delete_screenshot(video_id: str, shot_id: str):
    session = _get_session(video_id)
    before = len(session["screenshots"])
    shot = next((s for s in session["screenshots"] if s["id"] == shot_id), None)
    if shot:
        try:
            os.remove(shot["path"])
        except FileNotFoundError:
            pass
        session["screenshots"] = [s for s in session["screenshots"] if s["id"] != shot_id]
    return {"deleted": before != len(session["screenshots"])}


@router.get("/export-screenshots/{video_id}")
async def export_screenshots(video_id: str, fmt: str = "jpg"):
    session = _get_session(video_id)
    if not session["screenshots"]:
        raise HTTPException(status_code=400, detail="No screenshots to export")

    zip_path = os.path.join(TEMP_DIR, video_id, "screenshots.zip")
    with zipfile.ZipFile(zip_path, "w") as zf:
        for i, shot in enumerate(session["screenshots"]):
            arcname = f"{i+1:03d}_{Path(shot['filename']).stem}.{fmt}"
            if fmt == "jpg" and shot["path"].endswith(".jpg"):
                zf.write(shot["path"], arcname)
            else:
                from PIL import Image
                img = Image.open(shot["path"])
                import io
                buf = io.BytesIO()
                if fmt == "png":
                    img.save(buf, "PNG")
                else:
                    img.save(buf, "JPEG", quality=95)
                buf.seek(0)
                zf.writestr(arcname, buf.read())

    return FileResponse(zip_path, media_type="application/zip", filename="screenshots.zip")


@router.get("/screenshot-file/{video_id}/{filename}")
async def get_screenshot_file(video_id: str, filename: str):
    filepath = os.path.join(TEMP_DIR, video_id, "screenshots", filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(filepath, media_type="image/jpeg")


@router.get("/video-file/{video_id}")
async def get_video_file(video_id: str):
    session = _get_session(video_id)
    return FileResponse(session["path"])


def _get_session(video_id: str) -> dict:
    if video_id not in _sessions:
        raise HTTPException(status_code=404, detail="Video session not found")
    return _sessions[video_id]


def _serialize(shots: list, video_id: str) -> list:
    return [
        {
            "id": s["id"],
            "filename": s["filename"],
            "timestamp": s["timestamp"],
            "url": f"/api/screenshot-file/{video_id}/{s['filename']}",
        }
        for s in shots
    ]
