import logging
import uuid
from dataclasses import dataclass
from pathlib import Path, PurePosixPath

from app.core.config import settings

logger = logging.getLogger(__name__)

IMAGE_CONTENT_TYPES: dict[str, str] = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}

_JPEG_ALIAS_EXTENSIONS: frozenset[str] = frozenset({".jpg", ".jpeg"})

_ERROR_UNSUPPORTED_FILE_TYPE: str = "unsupported_file_type"
_ERROR_FILE_EXTENSION_MISMATCH: str = "file_extension_mismatch"
_ERROR_FILE_TOO_LARGE: str = "file_too_large"
_ERROR_EMPTY_FILE: str = "empty_file"
_ERROR_CONTENT_MISMATCH: str = "file_content_mismatch"

_UPLOADS_URL_PREFIX: str = "/uploads/"
_UPLOADS_URL_PREFIX_POSIX: str = "/uploads"

_PARENT_DIR_COMPONENT: str = ".."


@dataclass(frozen=True)
class StoredFile:
    storage_path: str
    url: str


class StorageService:
    def __init__(self, base_dir: Path | None = None) -> None:
        if base_dir is None:
            base_dir = Path(settings.UPLOAD_DIR)
        self._root_dir: Path = base_dir.resolve()
        self._complaints_dir: Path = self._root_dir / "complaints"

    @staticmethod
    def _sniff_image_format(data: bytes) -> str | None:
        if data[:3] == b"\xff\xd8\xff":
            return "image/jpeg"
        if data[:8] == b"\x89PNG\r\n\x1a\n":
            return "image/png"
        if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
            return "image/webp"
        return None

    def save_file(self, data: bytes, original_filename: str, content_type: str) -> StoredFile:
        canonical_ext = IMAGE_CONTENT_TYPES.get(content_type)
        if canonical_ext is None:
            raise ValueError(_ERROR_UNSUPPORTED_FILE_TYPE)

        sniffed = self._sniff_image_format(data)
        if sniffed is None:
            raise ValueError(_ERROR_CONTENT_MISMATCH)
        if sniffed != content_type:
            raise ValueError(_ERROR_CONTENT_MISMATCH)

        extension = PurePosixPath(original_filename).suffix.lower()
        allowed_extensions: frozenset[str] = (
            _JPEG_ALIAS_EXTENSIONS if content_type == "image/jpeg" else frozenset({canonical_ext})
        )
        if extension not in allowed_extensions:
            raise ValueError(_ERROR_FILE_EXTENSION_MISMATCH)

        max_bytes: int = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
        if len(data) == 0:
            raise ValueError(_ERROR_EMPTY_FILE)
        if len(data) > max_bytes:
            raise ValueError(_ERROR_FILE_TOO_LARGE)

        filename = f"{uuid.uuid4().hex}{canonical_ext}"
        destination = self._complaints_dir / filename
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)

        storage_path = f"complaints/{filename}"
        logger.info("stored file: path=%s size=%d", storage_path, len(data))
        return StoredFile(storage_path=storage_path, url=f"/uploads/{storage_path}")

    def delete_file(self, storage_path: str) -> None:
        candidate = Path(storage_path)
        if candidate.is_absolute() or _PARENT_DIR_COMPONENT in candidate.parts:
            logger.warning("rejected delete for unsafe path: %s", storage_path)
            return
        target = (self._root_dir / candidate).resolve()
        if not target.is_relative_to(self._root_dir):
            logger.warning("rejected delete escaping base dir: %s", storage_path)
            return
        target.unlink(missing_ok=True)

    def resolve_file(self, storage_path: str | None) -> Path | None:
        if not storage_path:
            return None
        candidate = Path(storage_path)
        if candidate.is_absolute() or _PARENT_DIR_COMPONENT in candidate.parts:
            logger.warning("rejected resolve for unsafe path: %s", storage_path)
            return None
        target = (self._root_dir / candidate).resolve()
        if not target.is_relative_to(self._root_dir):
            logger.warning("rejected resolve escaping base dir: %s", storage_path)
            return None
        if not target.is_file():
            return None
        return target

    def media_type_for(self, storage_path: str) -> str:
        suffix = PurePosixPath(storage_path.replace("\\", "/")).suffix.lower()
        media_types = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
        return media_types.get(suffix, "application/octet-stream")


storage_service = StorageService()
