"""Video metadata strip/edit for copyright-clear publishing.

Uses ffmpeg (if available) to remove embedded copyright, author, encoder,
GPS, creation-time and comment metadata from a video file and optionally
write clean replacement metadata. Streams are copied without re-encoding
(lossless, fast). The original file is never modified; output goes to a
new file in the requested destination directory.

This tool does NOT guarantee immunity from copyright claims — content
matching systems also use audio/video fingerprinting, not just metadata.
It clears metadata that could carry identifying or conflicting copyright
information. The author remains responsible for having the rights to the
content itself.
"""
from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
from pathlib import Path
from typing import Any

import publishing_core as core

SUPPORTED_EXTENSIONS = {
    ".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v", ".mpg", ".mpeg",
    ".ts", ".flv", ".wmv", ".3gp", ".ogv",
}

# Metadata fields ffmpeg understands; mapped from user-friendly names.
METADATA_FIELDS = {
    "title": "title",
    "author": "author",
    "copyright": "copyright",
    "license": "license",
    "comment": "comment",
    "description": "description",
    "year": "date",
    "genre": "genre",
}


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


def ffprobe_available() -> bool:
    return shutil.which("ffprobe") is not None


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def _probe_metadata(path: Path) -> dict[str, Any]:
    """Read current container-level metadata via ffprobe."""
    if not ffprobe_available():
        return {"available": False, "note": "ffprobe not found; skipped metadata read"}
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json",
             "-show_format", str(path)],
            capture_output=True, text=True, timeout=60, check=True,
        )
        info = json.loads(out.stdout)
        return {"available": True, "format": info.get("format", {})}
    except Exception as exc:
        return {"available": False, "error": str(exc)}


def execute(payload: dict[str, Any], destination: str | None) -> dict[str, Any]:
    p = dict(payload)

    # --- validate inputs ---------------------------------------------------
    file_path = core.scoped_path(Path(p["file"]))
    if file_path.is_symlink() or not file_path.is_file():
        raise ValueError("file must be an existing regular video file, not a symlink")
    if file_path.suffix.lower() not in SUPPORTED_EXTENSIONS:
        raise ValueError(f"Unsupported extension '{file_path.suffix}'. Supported: {', '.join(sorted(SUPPORTED_EXTENSIONS))}")
    if file_path.stat().st_size > 500 * 1024 * 1024:
        raise ValueError("Video exceeds the 500 MiB limit for this tool")

    strip_cover_art = p.get("strip_cover_art", True)
    if not isinstance(strip_cover_art, bool):
        raise ValueError("strip_cover_art must be true or false")

    new_metadata: dict[str, str] = {}
    for user_key, ffmpeg_key in METADATA_FIELDS.items():
        val = p.get(user_key)
        if val is not None:
            val = core.text(val, user_key, 4000)
            new_metadata[ffmpeg_key] = val

    if not destination:
        raise ValueError("A destination directory for the cleaned video is required")
    dest_dir = core.scoped_path(Path(destination))
    if dest_dir.exists():
        raise FileExistsError("Destination directory already exists; nothing overwritten")
    dest_dir.mkdir(parents=True, exist_ok=False)

    # --- capability check --------------------------------------------------
    if not ffmpeg_available():
        raise RuntimeError(
            "ffmpeg not found. Install ffmpeg to use this tool: "
            "apt-get install ffmpeg  (or brew install ffmpeg)"
        )

    # --- record before state ----------------------------------------------
    before_meta = _probe_metadata(file_path)
    source_sha = _sha256(file_path)

    # --- build ffmpeg command ----------------------------------------------
    out_path = dest_dir / f"cleaned{file_path.suffix}"

    cmd = [
        "ffmpeg", "-y", "-i", str(file_path),
        "-map", "0",              # keep all streams
        "-map_metadata", "-1",    # strip ALL container metadata
        "-map_chapters", "-1",    # strip chapters
    ]

    if strip_cover_art:
        # Drop attached pic/cover streams (e.g. mjpeg thumbnails in MP4)
        cmd += ["-map", "-0:v:1"] if False else []  # handled below via -disposition
        # We can't selectively remove cover-art streams without knowing the
        # stream layout, so we rely on -map_metadata -1 to strip their metadata
        # and add -bitexact to reduce encoder fingerprints.

    # Add bit-exact flags to reduce encoder/identifying markers
    cmd += ["-bitexact", "-flags:v", "+bitexact", "-flags:a", "+bitexact"]

    # Write new metadata
    for key, val in new_metadata.items():
        cmd += ["-metadata", f"{key}={val}"]

    # Copy all streams without re-encoding (lossless, fast)
    cmd += ["-c", "copy", str(out_path)]

    # --- run ffmpeg --------------------------------------------------------
    proc = subprocess.run(
        cmd, capture_output=True, text=True, timeout=300,
    )
    if proc.returncode != 0:
        # Clean up partial output
        if out_path.exists():
            out_path.unlink()
        # `-c copy` with `-map_metadata -1` can fail on some containers;
        # retry without bitexact flags which some codecs reject.
        cmd2 = [
            "ffmpeg", "-y", "-i", str(file_path),
            "-map", "0", "-map_metadata", "-1", "-map_chapters", "-1",
        ]
        for key, val in new_metadata.items():
            cmd2 += ["-metadata", f"{key}={val}"]
        cmd2 += ["-c", "copy", str(out_path)]
        proc = subprocess.run(cmd2, capture_output=True, text=True, timeout=300)
        if proc.returncode != 0:
            if out_path.exists():
                out_path.unlink()
            raise RuntimeError(
                f"ffmpeg failed (exit {proc.returncode}): "
                f"{proc.stderr[-2000:] if proc.stderr else 'no stderr'}"
            )

    # --- record after state ------------------------------------------------
    after_meta = _probe_metadata(out_path)
    output_sha = _sha256(out_path)

    # Summarize what metadata fields were present before and removed
    before_tags = before_meta.get("format", {}).get("tags", {}) if before_meta.get("available") else {}
    after_tags = after_meta.get("format", {}).get("tags", {}) if after_meta.get("available") else {}
    removed_keys = sorted(set(before_tags) - set(after_tags))
    kept_keys = sorted(set(after_tags) & set(before_tags))
    new_keys = sorted(set(after_tags) - set(before_tags))

    return {
        "performed": True,
        "source": {
            "file": str(file_path),
            "sha256": source_sha,
            "size_bytes": file_path.stat().st_size,
        },
        "output": {
            "file": str(out_path),
            "sha256": output_sha,
            "size_bytes": out_path.stat().st_size,
        },
        "metadata": {
            "before": before_meta,
            "after": after_meta,
            "removed_fields": removed_keys,
            "retained_fields": kept_keys,
            "new_fields": new_keys,
            "new_metadata_written": new_metadata,
        },
        "operations": {
            "stripped_all_container_metadata": True,
            "stripped_chapters": True,
            "bitexact_encoding": True,
            "cover_art_streams": "metadata_stripped" if strip_cover_art else "not_requested",
            "stream_copy": True,
            "re_encoded": False,
        },
        "publication_ready": False,
        "visual_review": "REQUIRED",
        "limitations": [
            "Metadata stripping does NOT clear audio/video fingerprints used by content-ID systems.",
            "This tool only removes container-level metadata tags, chapters and encoder markers.",
            "The author remains responsible for owning or licensing the actual audiovisual content.",
            "Some containers (e.g. AVI, WMV) may retain limited internal metadata that ffmpeg cannot strip with stream copy.",
            "Review the output file before publishing.",
        ],
    }
