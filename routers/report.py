import os
import uuid
import shutil
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, UploadFile, File, HTTPException, Query
from fastapi.responses import FileResponse
import aiofiles
from pydantic import BaseModel

from services.report_generator import generate_report as _generate

router = APIRouter()

TEMP_DIR = "temp"
_report_sessions: dict = {}  # report_id -> {images: [{id, filename, path}]}


def _session_dir(report_id: str) -> str:
    return os.path.join(TEMP_DIR, "report", report_id)


def _serialize_images(images: list, report_id: str) -> list:
    return [
        {
            "id": img["id"],
            "filename": img["filename"],
            "url": f"/api/report-image-file/{report_id}/{img['id']}",
        }
        for img in images
    ]


@router.post("/receive-report-screenshots")
async def receive_report_screenshots(data: dict):
    """Copy video screenshots into a report session."""
    report_id = data.get("report_id") or str(uuid.uuid4())
    video_id = data.get("video_id")
    filenames = data.get("filenames", [])

    dir_path = _session_dir(report_id)
    os.makedirs(dir_path, exist_ok=True)

    if report_id not in _report_sessions:
        _report_sessions[report_id] = {"images": [], "dir": dir_path}

    new_images = []
    for filename in filenames:
        src = os.path.join(TEMP_DIR, video_id, "screenshots", filename)
        if os.path.exists(src):
            img_id = str(uuid.uuid4())[:8]
            dst = os.path.join(dir_path, f"{img_id}_{filename}")
            shutil.copy2(src, dst)
            obj = {"id": img_id, "filename": filename, "path": dst}
            _report_sessions[report_id]["images"].append(obj)
            new_images.append(obj)

    return {"report_id": report_id, "images": _serialize_images(new_images, report_id)}


@router.post("/upload-report-images")
async def upload_report_images(
    report_id: Optional[str] = Query(None),
    files: List[UploadFile] = File(...),
):
    if not report_id:
        report_id = str(uuid.uuid4())

    dir_path = _session_dir(report_id)
    os.makedirs(dir_path, exist_ok=True)

    if report_id not in _report_sessions:
        _report_sessions[report_id] = {"images": [], "dir": dir_path}

    new_images = []
    for file in files:
        img_id = str(uuid.uuid4())[:8]
        filepath = os.path.join(dir_path, f"{img_id}_{file.filename}")
        async with aiofiles.open(filepath, "wb") as f:
            while chunk := await file.read(1024 * 1024):
                await f.write(chunk)
        obj = {"id": img_id, "filename": file.filename, "path": filepath}
        _report_sessions[report_id]["images"].append(obj)
        new_images.append(obj)

    return {"report_id": report_id, "images": _serialize_images(new_images, report_id)}


@router.delete("/report-image/{report_id}/{img_id}")
async def delete_report_image(report_id: str, img_id: str):
    if report_id not in _report_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    images = _report_sessions[report_id]["images"]
    img = next((i for i in images if i["id"] == img_id), None)
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")
    if os.path.exists(img["path"]):
        os.remove(img["path"])
    _report_sessions[report_id]["images"] = [i for i in images if i["id"] != img_id]
    return {"ok": True}


@router.post("/report-clear/{report_id}")
async def clear_report_session(report_id: str):
    if report_id not in _report_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    images = _report_sessions[report_id]["images"]
    for img in images:
        if os.path.exists(img["path"]):
            os.remove(img["path"])
    _report_sessions[report_id]["images"] = []
    return {"ok": True}


@router.get("/report-image-file/{report_id}/{img_id}")
async def get_report_image_file(report_id: str, img_id: str):
    if report_id not in _report_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    images = _report_sessions[report_id]["images"]
    img = next((i for i in images if i["id"] == img_id), None)
    if not img or not os.path.exists(img["path"]):
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(img["path"])


class ReportRequest(BaseModel):
    report_id: str
    image_ids: list[str]
    prompt: str


@router.post("/generate-report")
async def generate_report_endpoint(req: ReportRequest):
    if req.report_id not in _report_sessions:
        raise HTTPException(status_code=404, detail="Report session not found，请重新上传图片")
    if not req.image_ids:
        raise HTTPException(status_code=400, detail="未提供图片")
    if not req.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt 不能为空")

    images = _report_sessions[req.report_id]["images"]
    image_paths = []
    for img_id in req.image_ids:
        img = next((i for i in images if i["id"] == img_id), None)
        if img and os.path.exists(img["path"]):
            image_paths.append(img["path"])

    if not image_paths:
        raise HTTPException(status_code=404, detail="未找到有效图片文件")

    report = await _generate(image_paths, req.prompt)
    return {"report": report}
