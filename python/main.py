"""
DJ Playlist Generator — Python Analysis Sidecar
FastAPI server on localhost:7432

Electron starts this process on app launch.
All communication is via HTTP REST.
"""

import sys
import os
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional
from collections import deque

import uvicorn
from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from analyzer import analyze_track, LIBROSA_AVAILABLE, ESSENTIA_AVAILABLE

# ---- Analysis Queue (in-memory) ----
# In Phase 2 this will be backed by the SQLite DB shared with Electron
analysis_queue: deque = deque()
queue_results: dict = {}  # rekordbox_id → result or error
queue_status: dict = {}   # rekordbox_id → 'pending' | 'processing' | 'done' | 'error'
is_processing = False


# ---- FastAPI App ----
@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"[DJ Sidecar] Starting on port 7432")
    print(f"[DJ Sidecar] librosa: {'✓' if LIBROSA_AVAILABLE else '✗'}")
    print(f"[DJ Sidecar] essentia: {'✓' if ESSENTIA_AVAILABLE else '✗ (optional)'}")
    yield
    print("[DJ Sidecar] Shutting down")


app = FastAPI(
    title="DJ Playlist Generator — Analysis Sidecar",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Safe: localhost only
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---- Models ----
class AnalyzeRequest(BaseModel):
    rekordbox_id: str
    file_path: str
    title: str = ""
    artist: str = ""


class QueueItem(BaseModel):
    rekordbox_id: str
    file_path: str
    title: str = ""
    artist: str = ""


class QueueBatchRequest(BaseModel):
    tracks: list[QueueItem]


# ---- Routes ----

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "librosa": LIBROSA_AVAILABLE,
        "essentia": ESSENTIA_AVAILABLE,
        "queue_length": len(analysis_queue),
        "processed": len([v for v in queue_status.values() if v == "done"]),
        "errors": len([v for v in queue_status.values() if v == "error"]),
    }


@app.post("/analyze")
async def analyze_single(req: AnalyzeRequest):
    """Synchronous single-track analysis. Blocks until done."""
    try:
        result = analyze_track(req.file_path, req.title, req.artist)
        return {"status": "ok", "rekordbox_id": req.rekordbox_id, **result}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/queue/add")
async def queue_add(req: QueueBatchRequest, background_tasks: BackgroundTasks):
    """Add tracks to the analysis queue. Processing runs in the background."""
    added = 0
    for item in req.tracks:
        if item.rekordbox_id not in queue_status or queue_status[item.rekordbox_id] == "error":
            analysis_queue.append(item)
            queue_status[item.rekordbox_id] = "pending"
            added += 1

    background_tasks.add_task(process_queue)
    return {"queued": added, "total_pending": len(analysis_queue)}


@app.get("/queue/status")
async def queue_status_endpoint():
    """Get current queue status."""
    counts = {"pending": 0, "processing": 0, "done": 0, "error": 0}
    for s in queue_status.values():
        counts[s] = counts.get(s, 0) + 1
    return {
        "queue_length": len(analysis_queue),
        "is_processing": is_processing,
        **counts,
    }


@app.get("/queue/results")
async def queue_results_endpoint(rekordbox_id: Optional[str] = None):
    """Get completed analysis results."""
    if rekordbox_id:
        result = queue_results.get(rekordbox_id)
        if result is None:
            raise HTTPException(status_code=404, detail=f"No result for {rekordbox_id}")
        return result
    # Return all done results
    return [
        {"rekordbox_id": rid, **res}
        for rid, res in queue_results.items()
        if queue_status.get(rid) == "done"
    ]


@app.delete("/queue/clear")
async def queue_clear():
    """Clear the pending queue (does not cancel in-progress)."""
    count = len(analysis_queue)
    analysis_queue.clear()
    for rid in list(queue_status.keys()):
        if queue_status[rid] == "pending":
            del queue_status[rid]
    return {"cleared": count}


# ---- Background processor ----

async def process_queue():
    global is_processing
    if is_processing:
        return
    is_processing = True

    try:
        while analysis_queue:
            item: QueueItem = analysis_queue.popleft()
            rid = item.rekordbox_id
            queue_status[rid] = "processing"

            try:
                # Run in thread pool to avoid blocking the event loop
                result = await asyncio.get_event_loop().run_in_executor(
                    None,
                    lambda: analyze_track(item.file_path, item.title, item.artist)
                )
                queue_results[rid] = {"status": "done", **result}
                queue_status[rid] = "done"
            except Exception as e:
                queue_results[rid] = {"status": "error", "error": str(e)}
                queue_status[rid] = "error"
    finally:
        is_processing = False


# ---- Entry point ----
if __name__ == "__main__":
    port = int(os.environ.get("SIDECAR_PORT", "7432"))
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=port,
        log_level="info",
        loop="asyncio",
    )
