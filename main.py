import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from routers import screenshot, stitch, report

app = FastAPI(title="Video & Image Tool")

# Ensure temp directory exists
os.makedirs("temp", exist_ok=True)

app.include_router(screenshot.router, prefix="/api")
app.include_router(stitch.router, prefix="/api")
app.include_router(report.router, prefix="/api")

app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def root():
    return FileResponse("static/index.html")
