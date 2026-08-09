// storage.js — LocalStorage manager for saving and retrieving calculated video outputs

const STORAGE_KEY = 'ss_dance_sync_outputs';

/**
 * Retrieve all saved video outputs from LocalStorage.
 */
export function getLocalStorageHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Failed to read history from LocalStorage:', e);
    return [];
  }
}

/**
 * Save a calculated output result into LocalStorage.
 */
export function saveOutputToLocalStorage(jobId, resultData) {
  if (!jobId || !resultData) return getLocalStorageHistory();
  try {
    const current = getLocalStorageHistory();
    const newItem = {
      job_id: jobId,
      mtime: Date.now() / 1000,
      date_str: new Date().toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      overall_score: resultData.overall_score ?? 0,
      best_model: resultData.best_model ?? 'YOLOv8n-Pose',
      output_video: resultData.output_video ?? 'merged_dance_with_feedback.mp4',
      part_scores: resultData.part_scores ?? {},
      savedInLocalStorage: true,
      fullResult: resultData,
    };

    // Keep newest first and filter duplicate job IDs
    const updated = [newItem, ...current.filter(item => item.job_id !== jobId)];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.error('Failed to save output to LocalStorage:', e);
    return getLocalStorageHistory();
  }
}

/**
 * Remove a specific output from LocalStorage by job ID.
 */
export function removeOutputFromLocalStorage(jobId) {
  try {
    const current = getLocalStorageHistory();
    const updated = current.filter(item => item.job_id !== jobId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (e) {
    return getLocalStorageHistory();
  }
}
