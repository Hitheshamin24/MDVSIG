# StepSync (MDVSIG)

**Multi-Model Dance Video Synchronization & Intelligent Grading**

StepSync is a computer vision and deep learning platform that synchronizes two dance videos (e.g., an instructor and a learner), tracks dance poses with sub-frame precision, evaluates choreography accuracy across multiple body segments, and renders side-by-side feedback videos with automatic cloud storage.

---

## 🌟 Key Features

- 🎵 **Audio Cross-Correlation Sync**: Automatically aligns videos temporally by computing FFT cross-correlation over extracted audio tracks (Librosa & SciPy).
- 🧠 **Dynamic Multi-Model Benchmarking**: Benchmarks 4 pose estimation models on initial sample frames and dynamically selects the best performer for your footage:
  - **MediaPipe BlazePose** (Google)
  - **MoveNet Lightning** (TF Hub — ultra fast)
  - **MoveNet Thunder** (TF Hub — high accuracy)
  - **YOLOv8n-Pose** (Ultralytics — multi-person resilience)
- 🎯 **Stable Pose Tracker (`StablePoseTracker`)**:
  - **Person Anchoring**: Retains tracking on the primary dancer across crowded scenes using centroid proximity.
  - **EMA Smoothing**: Exponential moving average on keypoints to eliminate jitter and flickering.
  - **Jump Rejection**: Filters out detection anomalies and teleportation errors.
  - **Freeze Recovery**: Automatically resets state if subject is temporarily occluded.
- 📊 **Granular COCO-17 Scoring**:
  - Scale and position-invariant normalization (hip midpoint origin + torso scaling).
  - Independent accuracy tracking for **Left Arm**, **Right Arm**, **Left Leg**, **Right Leg**, and **Torso**.
  - Letter grade assignment (A, B, C, D, F) with mistake timestamp detection.
- 🎬 **Side-by-Side Feedback Video**: Generates a synchronized side-by-side composite video with color-coded skeleton overlays, live accuracy scores, and performance badges.
- ☁️ **Cloudinary Cloud Storage**:
  - Automatically uploads rendered output videos directly to Cloudinary using chunked upload streams.
  - Automatically cleans up local scratch workspaces (`uploads/`) to save server disk space.
  - Stores persistent job metadata in `backend/results/*.json`.
- ⚡ **Real-Time Progress Streaming**: SSE (Server-Sent Events) push pipeline updates and percentages straight to the frontend.
- 💻 **Modern React UI**:
  - **Studio Page**: Drag-and-drop dual video uploader with instant validation.
  - **Compare Page**: Live progress indicator and tabbed analytics dashboard:
    - **Playback Tab**: Cloudinary-streamed synced video player, timeline scrubber, mistake bookmarks, speed control, and video download.
    - **Scores Tab**: Overall similarity rating, grade badge, and body segment score breakdown.
    - **Feedback Tab**: Posture correction tips and mistake timeline.
    - **Analytics Tab**: Model benchmark charts comparing FPS, inference time, and detection confidence.

---

## 🏗️ Architecture & Pipeline Flow

```
   Reference Video (v1)            User Dance Video (v2)
          │                                  │
          ▼                                  ▼
   ┌────────────────────────────────────────────────────────┐
   │ 1. Video Normalization (30 FPS CFR, libx264 via FFmpeg)│
   └──────────────────────────┬─────────────────────────────┘
                              ▼
   ┌────────────────────────────────────────────────────────┐
   │ 2. Audio Extraction & FFT Cross-Correlation Sync Offset│
   └──────────────────────────┬─────────────────────────────┘
                              ▼
   ┌────────────────────────────────────────────────────────┐
   │ 3. Multi-Model Pose Benchmarking                       │
   │    (Evaluates MediaPipe, MoveNet L/T, YOLOv8n)         │
   └──────────────────────────┬─────────────────────────────┘
                              ▼
   ┌────────────────────────────────────────────────────────┐
   │ 4. StablePoseTracker Keypoint Extraction (COCO-17)     │
   │    (Person Anchoring + EMA Smoothing + Jump Rejection) │
   └──────────────────────────┬─────────────────────────────┘
                              ▼
   ┌────────────────────────────────────────────────────────┐
   │ 5. Pose Comparison Engine                              │
   │    (Torso-Scale Normalization & Body-Part Scoring)     │
   └──────────────────────────┬─────────────────────────────┘
                              ▼
   ┌────────────────────────────────────────────────────────┐
   │ 6. Side-by-Side Video Synthesis & Feedback Overlay     │
   └──────────────────────────┬─────────────────────────────┘
                              ▼
   ┌────────────────────────────────────────────────────────┐
   │ 7. Cloudinary Upload & Local Scratch Cleanup           │
   └──────────────────────────┬─────────────────────────────┘
                              ▼
   ┌────────────────────────────────────────────────────────┐
   │ 8. Results Served to React Dashboard (SSE + REST API)  │
   └────────────────────────────────────────────────────────┘
```

---

## 📁 Repository Structure

```
MDVSIG/
├── backend/
│   ├── app.py                   # Flask server, SSE progress & REST API endpoints
│   ├── pipeline.py              # Main pipeline orchestrator
│   ├── pose_models.py           # Model registry (MediaPipe, MoveNet, YOLOv8-Pose)
│   ├── stable_tracker.py        # StablePoseTracker, EMA smoothing & drawing
│   ├── pose_comparison.py       # COCO-17 normalization & body-part scoring engine
│   ├── audio_sync.py            # Audio extraction & cross-correlation sync
│   ├── video_merge.py           # Side-by-side video rendering with feedback overlay
│   ├── cloudinary_storage.py    # Cloudinary upload and asset deletion helpers
│   ├── requirements.txt         # Python dependencies
│   ├── results/                 # Persistent job results JSON storage
│   └── uploads/                 # Temporary local workspace (auto-cleaned after upload)
│
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── StudioPage.jsx   # Dual video upload & submission page
│   │   │   ├── ComparePage.jsx  # Processing status & comparison view
│   │   │   └── AuthPage.jsx     # Authentication view
│   │   ├── components/
│   │   │   ├── Header.jsx       # Global navigation bar
│   │   │   ├── ProcessingStatus.jsx # Real-time SSE progress tracker
│   │   │   ├── ResultsView.jsx  # Results container with tab selector
│   │   │   └── tabs/
│   │   │       ├── PlaybackTab.jsx  # Synchronized video player & scrubber
│   │   │       ├── ScoresTab.jsx    # Overall score & body part breakdown
│   │   │       ├── FeedbackTab.jsx  # Coaching insights & mistake timestamps
│   │   │       └── AnalyticsTab.jsx # Model benchmarking graphs (Recharts)
│   │   ├── App.jsx              # Main React router
│   │   └── App.css              # Global styles and design system
│   ├── package.json             # Frontend dependencies & scripts
│   └── vite.config.js           # Vite configuration with API proxy (/api -> :5000)
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites

Ensure you have the following installed on your system:
- **Python 3.10+**
- **Node.js 18+** & **npm**
- **FFmpeg** (installed and available on system PATH, or bundled via `imageio-ffmpeg`)
- A **Cloudinary** account (for cloud video storage)

---

### 1. Backend Setup

1. Open a terminal and navigate to the `backend/` directory:
   ```bash
   cd backend
   ```

2. Create and activate a Python virtual environment:
   ```bash
   # Windows (PowerShell)
   python -m venv venv
   .\venv\Scripts\activate

   # macOS / Linux
   python3 -m venv venv
   source venv/bin/activate
   ```

3. Install the required Python packages:
   ```bash
   pip install -r requirements.txt
   ```

4. Create a `.env` file in the `backend/` folder with your Cloudinary credentials:
   ```env
   CLOUDINARY_CLOUD_NAME=your_cloud_name
   CLOUDINARY_API_KEY=your_api_key
   CLOUDINARY_API_SECRET=your_api_secret
   ```

5. Start the Flask backend server:
   ```bash
   python app.py
   ```
   The backend will run on `http://localhost:5000`.

---

### 2. Frontend Setup

1. In a new terminal window, navigate to the `frontend/` directory:
   ```bash
   cd frontend
   ```

2. Install Node dependencies:
   ```bash
   npm install
   ```

3. Start the Vite development server:
   ```bash
   npm run dev
   ```
   The frontend will run at `http://localhost:3000` (requests to `/api` are automatically proxied to port `5000`).

---

## 📡 API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/upload` | Uploads reference (`video1`) and user (`video2`) videos; starts background job |
| `GET` | `/api/progress/<job_id>` | Server-Sent Events (SSE) streaming real-time pipeline progress |
| `GET` | `/api/results/<job_id>` | Retrieves final comparison scores, grade, and Cloudinary video URL |
| `GET` | `/api/history` | Lists all past comparison jobs saved on the server |
| `DELETE` | `/api/history/<job_id>` | Deletes saved job results and purges video assets from Cloudinary |
| `GET` | `/api/health` | Health check endpoint returning backend status |

---

## 🧪 Pose Tracking & Scoring Specifications

### COCO-17 Keypoint Mapping
Pose models map landmarks into standard COCO-17 indices:
- `0`: Nose, `1-2`: Eyes, `3-4`: Ears
- `5-6`: Shoulders, `7-8`: Elbows, `9-10`: Wrists
- `11-12`: Hips, `13-14`: Knees, `15-16`: Ankles

### Body Segment Grouping
- **Left Arm**: Joint indices `[5, 7, 9]`
- **Right Arm**: Joint indices `[6, 8, 10]`
- **Left Leg**: Joint indices `[11, 13, 15]`
- **Right Leg**: Joint indices `[12, 14, 16]`
- **Torso**: Joint indices `[5, 6, 11, 12]`

### Grading Scale
- **A** (Score $\ge 85$): Excellent synchronization and form
- **B** ($70 \le$ Score $< 85$): Good alignment with minor posture variances
- **C** ($55 \le$ Score $< 70$): Moderate coordination; noticeable timing or extension errors
- **D** ($40 \le$ Score $< 55$): Frequent timing lags and joint position mismatches
- **F** (Score $< 40$): Significant choreography deviation or desynchronization

---

## 🛠️ Built With

- **Backend**: Flask, Flask-CORS, OpenCV, MediaPipe, TensorFlow Hub, Ultralytics YOLOv8, Librosa, SciPy, MoviePy, Cloudinary Python SDK.
- **Frontend**: React 19, Vite 8, React Router 7, Recharts, Vanilla CSS Design System.
