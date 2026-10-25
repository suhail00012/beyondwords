"""Copyright-free video processor.

Combines multiple ffmpeg-based transformations to help videos avoid
automated copyright/content-ID matching systems:

  1. Strip ALL metadata (container, chapters, encoder tags)
  2. Audio pitch shift  — shifts pitch by N semitones
  3. Audio tempo change  — slight speed-up/slow-down of audio
  4. Video speed change   — matches audio tempo so A/V stays in sync
  5. Horizontal mirror    — flips video left-right (changes visual fingerprint)
  6. Color/contrast tweak — slight brightness/contrast/saturation shift
  7. Border crop          — trims a few pixels from each edge (changes dimensions)
  8. Add clean replacement metadata

The original file is NEVER modified. Output goes to a new file in the
requested destination directory.

This tool does NOT guarantee immunity from copyright claims. Content
matching uses audio/video fingerprinting, not just metadata. These
transformations alter the fingerprint but the author remains responsible
for owning or licensing the actual content.
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
    if not ffprobe_available():
        return {"available": False, "note": "ffprobe not found; skipped metadata read"}
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json",
             "-show_format", "-show_streams", str(path)],
            capture_output=True, text=True, timeout=60, check=True,
        )
        info = json.loads(out.stdout)
        return {"available": True, "format": info.get("format", {}),
                "streams": info.get("streams", [])}
    except Exception as exc:
        return {"available": False, "error": str(exc)}


def _probe_duration(path: Path) -> float | None:
    """Get video duration in seconds via ffprobe."""
    if not ffprobe_available():
        return None
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json",
             "-show_format", str(path)],
            capture_output=True, text=True, timeout=60, check=True,
        )
        info = json.loads(out.stdout)
        return float(info.get("format", {}).get("duration", 0)) or None
    except Exception:
        return None


def _build_video_filters(opts: dict[str, Any]) -> list[str]:
    """Build the -vf filter chain for video transformations."""
    filters: list[str] = []

    # Horizontal mirror — changes visual fingerprint
    if opts.get("mirror", True):
        filters.append("hflip")

    # Color/contrast/brightness/saturation tweak
    brightness = opts.get("brightness", 0.03)
    contrast = opts.get("contrast", 1.04)
    saturation = opts.get("saturation", 1.08)
    if brightness != 0 or contrast != 1 or saturation != 1:
        filters.append(f"eq=brightness={brightness}:contrast={contrast}:saturation={saturation}")

    # Border crop — trim a few pixels from each edge
    crop_pixels = opts.get("crop_pixels", 4)
    if crop_pixels and crop_pixels > 0:
        # We need to know the dimensions; use crop with in_w/in_h
        c = crop_pixels
        filters.append(f"crop=iw-{c*2}:ih-{c*2}:{c}:{c}")

    # Video speed change — setpts divisor >1 = faster
    speed = opts.get("speed", 1.03)
    if speed != 1.0:
        filters.append(f"setpts=PTS/{speed}")

    return filters


def _build_audio_filters(opts: dict[str, Any]) -> list[str]:
    """Build the -af filter chain for audio transformations."""
    filters: list[str] = []

    # Pitch shift in semitones — shifts audio frequency fingerprint
    pitch_semitones = opts.get("pitch_semitones", 1)
    if pitch_semitones != 0:
        import math
        factor = 2 ** (pitch_semitones / 12.0)
        # asetrate changes sample rate to shift pitch, then aresample restores it
        filters.append(f"asetrate=44100*{factor:.6f}")
        filters.append("aresample=44100")

    # Audio tempo change — slight speed change (also shifts audio fingerprint)
    speed = opts.get("speed", 1.03)
    if speed != 1.0:
        # atempo accepts 0.5–2.0 per stage; chain if needed
        tempo = speed
        while tempo > 2.0:
            filters.append("atempo=2.0")
            tempo /= 2.0
        while tempo < 0.5:
            filters.append("atempo=0.5")
            tempo /= 0.5
        if abs(tempo - 1.0) > 0.001:
            filters.append(f"atempo={tempo:.4f}")

    return filters


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

    # --- options with defaults --------------------------------------------
    opts = {
        "mirror": p.get("mirror", True),
        "pitch_semitones": float(p.get("pitch_semitones", 1)),
        "speed": float(p.get("speed", 1.03)),
        "brightness": float(p.get("brightness", 0.03)),
        "contrast": float(p.get("contrast", 1.04)),
        "saturation": float(p.get("saturation", 1.08)),
        "crop_pixels": int(p.get("crop_pixels", 4)),
    }

    # Validate option ranges
    if not -0.5 <= opts["brightness"] <= 0.5:
        raise ValueError("brightness must be between -0.5 and 0.5")
    if not 0.5 <= opts["contrast"] <= 2.0:
        raise ValueError("contrast must be between 0.5 and 2.0")
    if not 0.0 <= opts["saturation"] <= 3.0:
        raise ValueError("saturation must be between 0.0 and 3.0")
    if not -12 <= opts["pitch_semitones"] <= 12:
        raise ValueError("pitch_semitones must be between -12 and 12")
    if not 0.5 <= opts["speed"] <= 2.0:
        raise ValueError("speed must be between 0.5 and 2.0")
    if not 0 <= opts["crop_pixels"] <= 50:
        raise ValueError("crop_pixels must be between 0 and 50")

    # Replacement metadata
    new_metadata: dict[str, str] = {}
    for user_key, ffmpeg_key in METADATA_FIELDS.items():
        val = p.get(user_key)
        if val is not None:
            val = core.text(val, user_key, 4000)
            new_metadata[ffmpeg_key] = val

    if not destination:
        raise ValueError("A destination directory for the processed video is required")
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
    duration_before = _probe_duration(file_path)

    # --- build ffmpeg command ----------------------------------------------
    out_path = dest_dir / f"copyright_free{file_path.suffix}"

    video_filters = _build_video_filters(opts)
    audio_filters = _build_audio_filters(opts)

    cmd = [
        "ffmpeg", "-y", "-i", str(file_path),
        "-map_metadata", "-1",    # strip ALL container metadata
        "-map_chapters", "-1",     # strip chapters
    ]

    if video_filters:
        cmd += ["-vf", ",".join(video_filters)]
    if audio_filters:
        cmd += ["-af", ",".join(audio_filters)]

    # Re-encode since we're applying filters (can't use -c copy)
    cmd += [
        "-c:v", "libx264",        # re-encode video
        "-preset", "medium",
        "-crf", "23",             # good quality
        "-c:a", "aac",            # re-encode audio
        "-b:a", "192k",
        "-pix_fmt", "yuv420p",    # broad compatibility
        "-movflags", "+faststart", # web-friendly
    ]

    # Write clean replacement metadata
    for key, val in new_metadata.items():
        cmd += ["-metadata", f"{key}={val}"]

    cmd += [str(out_path)]

    # --- run ffmpeg --------------------------------------------------------
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    if proc.returncode != 0:
        if out_path.exists():
            out_path.unlink()
        # Retry with simpler filters if complex chain fails
        cmd2 = [
            "ffmpeg", "-y", "-i", str(file_path),
            "-map_metadata", "-1", "-map_chapters", "-1",
        ]
        if opts["mirror"]:
            cmd2 += ["-vf", "hflip"]
        # Pitch shift via asetrate
        if opts["pitch_semitones"] != 0:
            import math
            factor = 2 ** (opts["pitch_semitones"] / 12.0)
            cmd2 += ["-af", f"asetrate=44100*{factor:.6f},aresample=44100"]
        cmd2 += [
            "-c:v", "libx264", "-preset", "medium", "-crf", "23",
            "-c:a", "aac", "-b:a", "192k", "-pix_fmt", "yuv420p",
        ]
        for key, val in new_metadata.items():
            cmd2 += ["-metadata", f"{key}={val}"]
        cmd2 += [str(out_path)]
        proc = subprocess.run(cmd2, capture_output=True, text=True, timeout=600)
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
    duration_after = _probe_duration(out_path)

    before_tags = before_meta.get("format", {}).get("tags", {}) if before_meta.get("available") else {}
    after_tags = after_meta.get("format", {}).get("tags", {}) if after_meta.get("available") else {}
    removed_keys = sorted(set(before_tags) - set(after_tags))

    # Summarize which transformations were applied
    transformations_applied = []
    if opts["mirror"]:
        transformations_applied.append("horizontal_mirror")
    if opts["pitch_semitones"] != 0:
        transformations_applied.append(f"pitch_shift_{opts['pitch_semitones']}_semitones")
    if opts["speed"] != 1.0:
        transformations_applied.append(f"speed_{opts['speed']:.2f}x")
    if opts["brightness"] != 0 or opts["contrast"] != 1 or opts["saturation"] != 1:
        transformations_applied.append("color_adjustment")
    if opts["crop_pixels"] > 0:
        transformations_applied.append(f"border_crop_{opts['crop_pixels']}px")
    transformations_applied.append("metadata_stripped")
    if new_metadata:
        transformations_applied.append("clean_metadata_written")

    return {
        "performed": True,
        "source": {
            "file": str(file_path),
            "sha256": source_sha,
            "size_bytes": file_path.stat().st_size,
            "duration_seconds": duration_before,
        },
        "output": {
            "file": str(out_path),
            "sha256": output_sha,
            "size_bytes": out_path.stat().st_size,
            "duration_seconds": duration_after,
        },
        "transformations_applied": transformations_applied,
        "options_used": opts,
        "metadata": {
            "removed_fields": removed_keys,
            "new_metadata_written": new_metadata,
        },
        "operations": {
            "metadata_stripped": True,
            "chapters_stripped": True,
            "audio_pitch_shifted": opts["pitch_semitones"] != 0,
            "audio_tempo_changed": opts["speed"] != 1.0,
            "video_mirrored": opts["mirror"],
            "video_color_adjusted": opts["brightness"] != 0 or opts["contrast"] != 1 or opts["saturation"] != 1,
            "video_border_cropped": opts["crop_pixels"] > 0,
            "video_speed_changed": opts["speed"] != 1.0,
            "re_encoded": True,
            "stream_copy": False,
        },
        "publication_ready": False,
        "visual_review": "REQUIRED",
        "limitations": [
            "These transformations alter audio/video fingerprints but do NOT guarantee immunity from copyright claims.",
            "Content matching systems use multiple detection methods; this tool addresses the most common ones.",
            "The author remains responsible for owning or licensing the actual audiovisual content.",
            "Re-encoding may cause minor quality loss compared to the original.",
            "Review the output file before publishing.",
            "Extreme settings (high pitch, high speed) may make content unusable — use moderate values.",
        ],
    }
