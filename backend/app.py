"""
app.py – Flask server with upload, SSE progress streaming, and result serving.

Videos are stored on Cloudinary; the local 'uploads/' folder is used only as
a temporary workspace during pipeline processing and is cleaned up afterwards.
"""

import os
import uuid
import json
import time
import shutil
import threading
from flask import Flask, request, jsonify, Response
from flask_cors import CORS
from dotenv import load_dotenv

from pipeline import run_pipeline
from cloudinary_storage import upload_video, delete_asset

# Load .env
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env'))

app = Flask(__name__)
CORS(app)

# ── Configuration ─────────────────────────────────────────────────────────────
# Temp workspace — cleaned up after each job's files are on Cloudinary
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Persistent results store (JSON files survive server restarts)
RESULTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'results')
os.makedirs(RESULTS_DIR, exist_ok=True)

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
    """Background worker: runs pipeline → uploads output to Cloudinary → cleans up temp dir."""
    try:
        with jobs_lock:
            jobs[job_id]['status'] = 'processing'

        # ── Run AI pipeline ────────────────────────────────────────────────────
        results = run_pipeline(
            video1_path, video2_path, job_dir,
            progress_callback=lambda step, pct, msg: _update_job_progress(
                job_id, step, pct, msg
            )
        )

        # ── Upload output video to Cloudinary ──────────────────────────────────
        _update_job_progress(job_id, 'uploading', 95, 'Uploading output video to cloud…')

        output_video_path = results.get('output_video_path')
        output_video_url = None
        if output_video_path and os.path.exists(output_video_path):
            public_id = f'mdvsig/outputs/{job_id}/merged_output'
            output_video_url = upload_video(output_video_path, public_id)
            results['output_video_url'] = output_video_url
            results['cloudinary_output_public_id'] = public_id
        else:
            print(f'[WARN] Job {job_id}: output video file not found at: {output_video_path}')

        # ── Persist results JSON ───────────────────────────────────────────────
        results_path = os.path.join(RESULTS_DIR, f'{job_id}.json')
        with open(results_path, 'w') as f:
            json.dump(results, f, indent=2)

        with jobs_lock:
            jobs[job_id]['status'] = 'complete'
            jobs[job_id]['results'] = results

        _update_job_progress(job_id, 'done', 100, 'Processing complete!')

    except Exception as e:
        with jobs_lock:
            jobs[job_id]['status'] = 'error'
            jobs[job_id]['error'] = str(e)
        print(f'[ERROR] Job {job_id}: {e}')
        import traceback
        traceback.print_exc()

    finally:
        # ── Always clean up temp job directory ────────────────────────────────
        if os.path.exists(job_dir):
            try:
                shutil.rmtree(job_dir)
                print(f'[INFO] Cleaned up temp dir: {job_dir}')
            except Exception as cleanup_err:
                print(f'[WARN] Could not remove temp dir {job_dir}: {cleanup_err}')


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

    # Create temp job directory (will be deleted after Cloudinary upload)
    job_id = str(uuid.uuid4())[:8]
    job_dir = os.path.join(UPLOAD_DIR, job_id)
    os.makedirs(job_dir, exist_ok=True)

    # Save uploaded videos to temp dir
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

    # Disk fallback (server restart recovery)
    json_path = os.path.join(RESULTS_DIR, f'{safe_id}.json')
    if os.path.exists(json_path):
        try:
            with open(json_path, 'r') as f:
                return jsonify(json.load(f))
        except Exception as e:
            return jsonify({'error': f'Failed to read results: {str(e)}'}), 500

    return jsonify({'error': 'Job not found'}), 404


@app.route('/api/history', methods=['GET'])
def get_history():
    """List all saved past video comparisons from persistent results dir."""
    history = []
    if not os.path.exists(RESULTS_DIR):
        return jsonify([])

    for fname in os.listdir(RESULTS_DIR):
        if not fname.endswith('.json'):
            continue
        json_path = os.path.join(RESULTS_DIR, fname)
        try:
            with open(json_path, 'r') as f:
                data = json.load(f)
            job_id = fname[:-5]   # strip .json
            mtime = os.path.getmtime(json_path)
            history.append({
                'job_id': job_id,
                'mtime': mtime,
                'date_str': time.strftime('%b %d, %H:%M', time.localtime(mtime)),
                'overall_score': data.get('overall_score', 0),
                'best_model': data.get('best_model', 'YOLOv8n-Pose'),
                'output_video_url': data.get('output_video_url', ''),
                'part_scores': data.get('part_scores', {}),
            })
        except Exception:
            pass

    history.sort(key=lambda x: x['mtime'], reverse=True)
    return jsonify(history)


@app.route('/api/history/<job_id>', methods=['DELETE'])
def delete_history_item(job_id):
    """Delete a saved comparison: remove results JSON + Cloudinary assets."""
    safe_id = os.path.basename(job_id)

    # Remove from in-memory store
    with jobs_lock:
        if safe_id in jobs:
            del jobs[safe_id]

    # Load stored public_ids to delete from Cloudinary
    json_path = os.path.join(RESULTS_DIR, f'{safe_id}.json')
    if os.path.exists(json_path):
        try:
            with open(json_path, 'r') as f:
                data = json.load(f)

            # Delete output video from Cloudinary
            output_pid = data.get('cloudinary_output_public_id')
            if output_pid:
                delete_asset(output_pid, resource_type='video')

        except Exception as e:
            print(f'[WARN] Could not read results for Cloudinary cleanup: {e}')

        try:
            os.remove(json_path)
        except Exception as e:
            return jsonify({'error': f'Failed to delete results file: {str(e)}'}), 500

    return jsonify({'status': 'deleted', 'job_id': safe_id}), 200


@app.route('/api/health')
def health_check():
    """Health check endpoint."""
    return jsonify({'status': 'ok', 'jobs': len(jobs)})


if __name__ == '__main__':
    print('=' * 60)
    print('  Dance Video Sync – Backend Server (Cloudinary mode)')
    print('=' * 60)
    print(f'  Results dir : {RESULTS_DIR}')
    print(f'  Temp dir    : {UPLOAD_DIR}')
    print(f'  Server      : http://localhost:5000')
    print('=' * 60)
    app.run(host='0.0.0.0', port=5000, debug=True)
