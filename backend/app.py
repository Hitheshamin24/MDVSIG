"""
app.py – Flask server with upload, SSE progress streaming, and result serving.
"""

import os
import uuid
import json
import time
import shutil
import threading
from flask import Flask, request, jsonify, Response, send_file
from flask_cors import CORS

from pipeline import run_pipeline

app = Flask(__name__)
CORS(app)

# ── Configuration ─────────────────────────────────────────────────────────────
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ── In-memory job store ───────────────────────────────────────────────────────
# job_id → { status, progress: [{step, percent, message, timestamp}], results }
jobs = {}
jobs_lock = threading.Lock()


def _update_job_progress(job_id, step, percent, message):
    """Thread-safe progress update."""
    with jobs_lock:
        if job_id in jobs:
            jobs[job_id]['progress'].append({
                'step': step,
                'percent': round(percent, 1),
                'message': message,
                'timestamp': time.time(),
            })
            if step == 'done':
                jobs[job_id]['status'] = 'complete'


def _run_job(job_id, video1_path, video2_path, job_dir):
    """Background worker that runs the full pipeline."""
    try:
        with jobs_lock:
            jobs[job_id]['status'] = 'processing'

        results = run_pipeline(
            video1_path, video2_path, job_dir,
            progress_callback=lambda step, pct, msg: _update_job_progress(
                job_id, step, pct, msg
            )
        )

        with jobs_lock:
            jobs[job_id]['status'] = 'complete'
            jobs[job_id]['results'] = results

    except Exception as e:
        with jobs_lock:
            jobs[job_id]['status'] = 'error'
            jobs[job_id]['error'] = str(e)
        print(f"[ERROR] Job {job_id}: {e}")
        import traceback
        traceback.print_exc()


# ── Routes ────────────────────────────────────────────────────────────────────

@app.route('/api/upload', methods=['POST'])
def upload_videos():
    """Upload two videos and start processing."""
    if 'video1' not in request.files or 'video2' not in request.files:
        return jsonify({'error': 'Both video1 and video2 files are required'}), 400

    video1 = request.files['video1']
    video2 = request.files['video2']

    if not video1.filename or not video2.filename:
        return jsonify({'error': 'Both files must have filenames'}), 400

    # Create job directory
    job_id = str(uuid.uuid4())[:8]
    job_dir = os.path.join(UPLOAD_DIR, job_id)
    os.makedirs(job_dir, exist_ok=True)

    # Save uploaded videos
    v1_path = os.path.join(job_dir, 'video1_original.mp4')
    v2_path = os.path.join(job_dir, 'video2_original.mp4')
    video1.save(v1_path)
    video2.save(v2_path)

    # Initialise job state
    with jobs_lock:
        jobs[job_id] = {
            'status': 'queued',
            'progress': [],
            'results': None,
            'error': None,
        }

    # Start background processing
    thread = threading.Thread(
        target=_run_job,
        args=(job_id, v1_path, v2_path, job_dir),
        daemon=True
    )
    thread.start()

    return jsonify({'job_id': job_id, 'status': 'queued'}), 202


@app.route('/api/progress/<job_id>')
def stream_progress(job_id):
    """SSE endpoint for real-time progress updates."""
    def generate():
        last_idx = 0
        while True:
            with jobs_lock:
                job = jobs.get(job_id)
                if job is None:
                    yield f"data: {json.dumps({'error': 'Job not found'})}\n\n"
                    return

                # Send new progress events
                progress = job['progress']
                while last_idx < len(progress):
                    event = progress[last_idx]
                    yield f"data: {json.dumps(event)}\n\n"
                    last_idx += 1

                status = job['status']
                if status == 'complete':
                    yield f"data: {json.dumps({'step': 'complete', 'percent': 100, 'message': 'Done!'})}\n\n"
                    return
                elif status == 'error':
                    yield f"data: {json.dumps({'step': 'error', 'percent': 0, 'message': job.get('error', 'Unknown error')})}\n\n"
                    return

            time.sleep(1)

    # Fix: need nonlocal for last_idx - rewrite with class
    class ProgressStream:
        def __init__(self):
            self.last_idx = 0

        def generate(self):
            while True:
                with jobs_lock:
                    job = jobs.get(job_id)
                    if job is None:
                        yield f"data: {json.dumps({'error': 'Job not found'})}\n\n"
                        return

                    progress = job['progress']
                    while self.last_idx < len(progress):
                        event = progress[self.last_idx]
                        yield f"data: {json.dumps(event)}\n\n"
                        self.last_idx += 1

                    status = job['status']
                    if status == 'complete':
                        yield f"data: {json.dumps({'step': 'complete', 'percent': 100, 'message': 'Done!'})}\n\n"
                        return
                    elif status == 'error':
                        yield f"data: {json.dumps({'step': 'error', 'percent': 0, 'message': job.get('error', 'Unknown error')})}\n\n"
                        return

                time.sleep(1)

    stream = ProgressStream()
    return Response(
        stream.generate(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
        }
    )


@app.route('/api/results/<job_id>')
def get_results(job_id):
    """Get job results from memory or disk."""
    safe_id = os.path.basename(job_id)

    with jobs_lock:
        job = jobs.get(safe_id)
        if job and job.get('status') == 'error':
            return jsonify({'status': 'error', 'error': job.get('error')}), 500
        if job and job.get('status') != 'complete':
            return jsonify({'status': job.get('status')}), 202
        if job and job.get('results'):
            return jsonify(job['results'])

    # Disk fallback for past jobs or server restarts
    json_path = os.path.join(UPLOAD_DIR, safe_id, 'results.json')
    if os.path.exists(json_path):
        try:
            with open(json_path, 'r') as f:
                res = json.load(f)
                return jsonify(res)
        except Exception as e:
            return jsonify({'error': f'Failed to read results: {str(e)}'}), 500

    return jsonify({'error': 'Job not found'}), 404


@app.route('/api/history', methods=['GET'])
def get_history():
    """List all saved past video comparisons from disk."""
    history = []
    if not os.path.exists(UPLOAD_DIR):
        return jsonify([])

    for entry in os.listdir(UPLOAD_DIR):
        job_dir = os.path.join(UPLOAD_DIR, entry)
        if os.path.isdir(job_dir):
            json_path = os.path.join(job_dir, 'results.json')
            if os.path.exists(json_path):
                try:
                    with open(json_path, 'r') as f:
                        data = json.load(f)
                        mtime = os.path.getmtime(json_path)
                        history.append({
                            'job_id': entry,
                            'mtime': mtime,
                            'date_str': time.strftime('%b %d, %H:%M', time.localtime(mtime)),
                            'overall_score': data.get('overall_score', 0),
                            'best_model': data.get('best_model', 'YOLOv8n-Pose'),
                            'output_video': data.get('output_video', 'merged_dance_with_feedback.mp4'),
                            'part_scores': data.get('part_scores', {}),
                        })
                except Exception:
                    pass

    # Sort newest first
    history.sort(key=lambda x: x['mtime'], reverse=True)
    return jsonify(history)


@app.route('/api/history/<job_id>', methods=['DELETE'])
def delete_history_item(job_id):
    """Delete a saved comparison from disk and in-memory jobs."""
    safe_id = os.path.basename(job_id)
    job_dir = os.path.join(UPLOAD_DIR, safe_id)

    with jobs_lock:
        if safe_id in jobs:
            del jobs[safe_id]

    if os.path.exists(job_dir) and os.path.isdir(job_dir):
        try:
            shutil.rmtree(job_dir)
            return jsonify({'status': 'deleted', 'job_id': safe_id})
        except Exception as e:
            return jsonify({'error': f'Failed to delete job folder: {str(e)}'}), 500

    return jsonify({'status': 'deleted', 'job_id': safe_id}), 200


@app.route('/api/download/<job_id>/<filename>')
def download_file(job_id, filename):
    """Download a result file (video, chart, etc.)."""
    # Sanitise filename to prevent path traversal
    safe_name = os.path.basename(filename)
    file_path = os.path.join(UPLOAD_DIR, job_id, safe_name)

    if not os.path.exists(file_path):
        return jsonify({'error': 'File not found'}), 404

    return send_file(file_path)


@app.route('/api/health')
def health_check():
    """Health check endpoint."""
    return jsonify({'status': 'ok', 'jobs': len(jobs)})


if __name__ == '__main__':
    print("=" * 60)
    print("  Dance Video Sync – Backend Server")
    print("=" * 60)
    print(f"  Upload dir: {UPLOAD_DIR}")
    print(f"  Server: http://localhost:5000")
    print("=" * 60)
    app.run(host='0.0.0.0', port=5000, debug=True)
