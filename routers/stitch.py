import os
import uuid
import math
from typing import List, Optional
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from fastapi.responses import FileResponse
import aiofiles

from services.image_stitch import stitch_images

router = APIRouter()

TEMP_DIR = "temp"

# In-memory store: stitch_id -> {images: [{id, filename, path}]}
_stitch_sessions: dict = {}


@router.post("/upload-images")
async def upload_images(files: List[UploadFile] = File(...)):
    stitch_id = str(uuid.uuid4())
    stitch_dir = os.path.join(TEMP_DIR, "stitch", stitch_id)
    os.makedirs(stitch_dir, exist_ok=True)

    images = []
    for file in files:
        img_id = str(uuid.uuid4())[:8]
        filepath = os.path.join(stitch_dir, f"{img_id}_{file.filename}")
        async with aiofiles.open(filepath, "wb") as f:
            while chunk := await file.read(1024 * 1024):
                await f.write(chunk)
        images.append({"id": img_id, "filename": file.filename, "path": filepath})

    _stitch_sessions[stitch_id] = {"images": images, "dir": stitch_dir}
    return {
        "stitch_id": stitch_id,
        "images": _serialize_images(images, stitch_id),
    }


@router.post("/receive-screenshots")
async def receive_screenshots(data: dict):
    """Receive screenshots from the video tool and create a stitch session."""
    stitch_id = str(uuid.uuid4())
    stitch_dir = os.path.join(TEMP_DIR, "stitch", stitch_id)
    os.makedirs(stitch_dir, exist_ok=True)

    video_id = data.get("video_id")
    shot_filenames = data.get("filenames", [])

    images = []
    for filename in shot_filenames:
        src = os.path.join(TEMP_DIR, video_id, "screenshots", filename)
        if os.path.exists(src):
            img_id = str(uuid.uuid4())[:8]
            dst = os.path.join(stitch_dir, f"{img_id}_{filename}")
            import shutil
            shutil.copy2(src, dst)
            images.append({"id": img_id, "filename": filename, "path": dst})

    _stitch_sessions[stitch_id] = {"images": images, "dir": stitch_dir}
    return {
        "stitch_id": stitch_id,
        "images": _serialize_images(images, stitch_id),
    }


@router.post("/reorder-images")
async def reorder_images(data: dict):
    """Reorder images in a stitch session."""
    stitch_id = data.get("stitch_id")
    order = data.get("order", [])
    session = _get_stitch_session(stitch_id)

    id_map = {img["id"]: img for img in session["images"]}
    session["images"] = [id_map[img_id] for img_id in order if img_id in id_map]
    return {"images": _serialize_images(session["images"], stitch_id)}


@router.delete("/stitch-image/{stitch_id}/{img_id}")
async def delete_stitch_image(stitch_id: str, img_id: str):
    session = _get_stitch_session(stitch_id)
    img = next((i for i in session["images"] if i["id"] == img_id), None)
    if img:
        try:
            os.remove(img["path"])
        except FileNotFoundError:
            pass
        session["images"] = [i for i in session["images"] if i["id"] != img_id]
    return {"deleted": img is not None}


@router.post("/stitch-clear/{stitch_id}")
async def clear_stitch_session(stitch_id: str):
    session = _get_stitch_session(stitch_id)
    for img in session["images"]:
        try:
            os.remove(img["path"])
        except FileNotFoundError:
            pass
    session["images"] = []
    return {"ok": True}


@router.post("/stitch-preview")
async def stitch_preview(data: dict):
    stitch_id = data.get("stitch_id")
    session = _get_stitch_session(stitch_id)

    if not session["images"]:
        raise HTTPException(status_code=400, detail="No images to stitch")

    params = _extract_params(data, len(session["images"]))
    output_path = os.path.join(session["dir"], "preview.jpg")

    try:
        stitch_images(
            image_paths=[img["path"] for img in session["images"]],
            direction=params["direction"],
            cols=params["cols"],
            rows=params["rows"],
            row_gap=params["row_gap"],
            col_gap=params["col_gap"],
            bg_color=params["bg_color"],
            output_path=output_path,
            fmt="JPEG",
            quality=75,
            preview_max=1200,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"preview_url": f"/api/stitch-file/{stitch_id}/preview.jpg"}


@router.post("/stitch-export")
async def stitch_export(data: dict):
    stitch_id = data.get("stitch_id")
    session = _get_stitch_session(stitch_id)

    if not session["images"]:
        raise HTTPException(status_code=400, detail="No images to stitch")

    params = _extract_params(data, len(session["images"]))
    fmt = data.get("fmt", "JPEG").upper()
    quality = int(data.get("quality", 90))
    ext = "jpg" if fmt == "JPEG" else "png"
    output_path = os.path.join(session["dir"], f"output.{ext}")

    try:
        stitch_images(
            image_paths=[img["path"] for img in session["images"]],
            direction=params["direction"],
            cols=params["cols"],
            rows=params["rows"],
            row_gap=params["row_gap"],
            col_gap=params["col_gap"],
            bg_color=params["bg_color"],
            output_path=output_path,
            fmt=fmt,
            quality=quality,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    media_type = "image/jpeg" if fmt == "JPEG" else "image/png"
    return FileResponse(output_path, media_type=media_type, filename=f"stitched.{ext}")


@router.get("/stitch-file/{stitch_id}/{filename}")
async def get_stitch_file(stitch_id: str, filename: str):
    session = _get_stitch_session(stitch_id)
    filepath = os.path.join(session["dir"], filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(filepath)


@router.get("/stitch-image-file/{stitch_id}/{img_id}")
async def get_stitch_image_file(stitch_id: str, img_id: str):
    session = _get_stitch_session(stitch_id)
    img = next((i for i in session["images"] if i["id"] == img_id), None)
    if not img or not os.path.exists(img["path"]):
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(img["path"])


def _get_stitch_session(stitch_id: str) -> dict:
    if stitch_id not in _stitch_sessions:
        raise HTTPException(status_code=404, detail="Stitch session not found")
    return _stitch_sessions[stitch_id]


def _serialize_images(images: list, stitch_id: str) -> list:
    return [
        {
            "id": img["id"],
            "filename": img["filename"],
            "url": f"/api/stitch-image-file/{stitch_id}/{img['id']}",
        }
        for img in images
    ]


def _extract_params(data: dict, n: int) -> dict:
    direction = data.get("direction", "horizontal")
    cols = data.get("cols")
    rows = data.get("rows")
    if cols is not None:
        cols = int(cols)
    if rows is not None:
        rows = int(rows)
    return {
        "direction": direction,
        "cols": cols,
        "rows": rows,
        "row_gap": int(data.get("row_gap", 10)),
        "col_gap": int(data.get("col_gap", 10)),
        "bg_color": data.get("bg_color", "#FFFFFF"),
    }
