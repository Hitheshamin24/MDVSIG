"""
cloudinary_storage.py — Cloudinary upload/delete helpers for MDVSIG.

Reads credentials from .env (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY,
CLOUDINARY_API_SECRET) via python-dotenv and configures the SDK once at
import time.
"""

import os
import cloudinary
import cloudinary.uploader
from dotenv import load_dotenv

# Load .env from the same directory as this file
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env'))

cloudinary.config(
    cloud_name=os.getenv('CLOUDINARY_CLOUD_NAME'),
    api_key=os.getenv('CLOUDINARY_API_KEY'),
    api_secret=os.getenv('CLOUDINARY_API_SECRET'),
    secure=True,
)


def upload_video(local_path: str, public_id: str) -> str:
    """
    Upload a local video file to Cloudinary.

    Args:
        local_path: Absolute path to the local video file.
        public_id:  Cloudinary public_id (folder/name, no extension).

    Returns:
        The secure HTTPS URL of the uploaded asset.

    Raises:
        RuntimeError: If the upload fails.
    """
    try:
        result = cloudinary.uploader.upload(
            local_path,
            resource_type='video',
            public_id=public_id,
            overwrite=True,
            chunk_size=6_000_000,   # 6 MB chunks for large files
        )
        return result['secure_url']
    except Exception as e:
        raise RuntimeError(f"Cloudinary upload failed for '{public_id}': {e}") from e


def upload_image(local_path: str, public_id: str) -> str:
    """
    Upload a local image file (e.g. chart PNG) to Cloudinary.

    Args:
        local_path: Absolute path to the local image file.
        public_id:  Cloudinary public_id (folder/name, no extension).

    Returns:
        The secure HTTPS URL of the uploaded asset.
    """
    try:
        result = cloudinary.uploader.upload(
            local_path,
            resource_type='image',
            public_id=public_id,
            overwrite=True,
        )
        return result['secure_url']
    except Exception as e:
        raise RuntimeError(f"Cloudinary upload failed for image '{public_id}': {e}") from e


def delete_asset(public_id: str, resource_type: str = 'video') -> None:
    """
    Delete a Cloudinary asset by its public_id.

    Args:
        public_id:     The Cloudinary public_id to delete.
        resource_type: 'video' or 'image'.
    """
    try:
        cloudinary.uploader.destroy(public_id, resource_type=resource_type)
    except Exception as e:
        print(f"[WARN] Cloudinary delete failed for '{public_id}': {e}")
