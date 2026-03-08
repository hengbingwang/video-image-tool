import os
import cv2
from pathlib import Path
from typing import List, Dict, Any

def detect_scenes(
    video_path: str,
    output_dir: str,
    detector: str = "content",
    threshold: float = 27.0,
    min_scene_len: float = 1.0,
) -> List[Dict[str, Any]]:
    """
    Run PySceneDetect on video_path, save one frame per scene to output_dir.
    Returns list of {id, filename, timestamp, path} dicts.
    """
    from scenedetect import open_video, SceneManager
    from scenedetect.detectors import ContentDetector, AdaptiveDetector, ThresholdDetector
    from scenedetect.scene_manager import save_images

    video = open_video(video_path)
    fps = video.frame_rate

    scene_manager = SceneManager()

    if detector == "content":
        scene_manager.add_detector(ContentDetector(threshold=threshold, min_scene_len=int(min_scene_len * fps)))
    elif detector == "adaptive":
        scene_manager.add_detector(AdaptiveDetector(min_scene_len=int(min_scene_len * fps)))
    elif detector == "threshold":
        scene_manager.add_detector(ThresholdDetector(threshold=threshold, min_scene_len=int(min_scene_len * fps)))
    else:
        scene_manager.add_detector(ContentDetector(threshold=threshold, min_scene_len=int(min_scene_len * fps)))

    scene_manager.detect_scenes(video)
    scene_list = scene_manager.get_scene_list()

    os.makedirs(output_dir, exist_ok=True)

    results = []
    for i, (start_tc, _) in enumerate(scene_list):
        ts = start_tc.get_seconds()
        frame_num = start_tc.get_frames()
        filename = f"scene_{i:04d}_{int(ts*1000):010d}.jpg"
        filepath = os.path.join(output_dir, filename)
        _extract_frame_at_time(video_path, ts, filepath)
        results.append({
            "id": f"scene_{i:04d}",
            "filename": filename,
            "timestamp": ts,
            "path": filepath,
        })

    return results


def capture_frame(video_path: str, timestamp: float, output_dir: str) -> Dict[str, Any]:
    """Extract a single frame at the given timestamp (seconds)."""
    os.makedirs(output_dir, exist_ok=True)
    filename = f"manual_{int(timestamp*1000):010d}.jpg"
    filepath = os.path.join(output_dir, filename)
    _extract_frame_at_time(video_path, timestamp, filepath)
    return {
        "id": f"manual_{int(timestamp*1000):010d}",
        "filename": filename,
        "timestamp": timestamp,
        "path": filepath,
    }


def _extract_frame_at_time(video_path: str, timestamp: float, output_path: str):
    cap = cv2.VideoCapture(video_path)
    cap.set(cv2.CAP_PROP_POS_MSEC, timestamp * 1000)
    ret, frame = cap.read()
    cap.release()
    if ret:
        cv2.imwrite(output_path, frame, [cv2.IMWRITE_JPEG_QUALITY, 95])
    else:
        raise ValueError(f"Could not extract frame at {timestamp}s from {video_path}")
