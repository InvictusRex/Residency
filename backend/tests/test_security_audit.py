import struct
import uuid
import zlib

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from tests.conftest import API


def _png_bytes() -> bytes:
    def chunk(t: bytes, d: bytes) -> bytes:
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    ihdr = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)
    raw = b"\x00\x10\x40\x80"
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


def _webp_bytes() -> bytes:
    return b"RIFF" + struct.pack("<I", 30) + b"WEBPVP8 " + b"\x00" * 20


def _jpeg_bytes() -> bytes:
    return b"\xff\xd8\xff\xe0" + b"\x00" * 64


def _create_with_photo(client, headers, category_id, filename, content, content_type):
    return client.post(
        f"{API}/complaints",
        headers=headers,
        data={"category_id": category_id, "description": "Photo security audit complaint."},
        files={"photo": (filename, content, content_type)},
    )


@pytest.fixture()
def complaint_with_photo(client, resident_headers, category_factory):
    category = category_factory(name="Plumbing")
    r = _create_with_photo(client, resident_headers, category["id"], "leak.png", _png_bytes(), "image/png")
    assert r.status_code == 201, r.text
    return r.json()


class TestPhotoAuthorization:
    def test_owner_can_access_own_photo(self, client, resident_headers, complaint_with_photo):
        url = complaint_with_photo["photo_url"]
        r = client.get(url, headers=resident_headers)
        assert r.status_code == 200
        assert r.content == _png_bytes()
        assert r.headers["content-type"].startswith("image/png")

    def test_other_resident_cannot_access_photo(self, client, second_resident_headers, complaint_with_photo):
        url = complaint_with_photo["photo_url"]
        r = client.get(url, headers=second_resident_headers)
        assert r.status_code == 404

    def test_admin_can_access_any_photo(self, client, admin_headers, complaint_with_photo):
        url = complaint_with_photo["photo_url"]
        r = client.get(url, headers=admin_headers)
        assert r.status_code == 200
        assert r.content == _png_bytes()

    def test_unauthenticated_cannot_access_photo(self, client, complaint_with_photo):
        r = client.get(complaint_with_photo["photo_url"])
        assert r.status_code == 401

    def test_unknown_complaint_photo_404(self, client, resident_headers):
        fake = uuid.uuid4()
        r = client.get(f"{API}/complaints/{fake}/photo", headers=resident_headers)
        assert r.status_code == 404

    def test_complaint_without_photo_404(self, client, resident_headers, category_factory, complaint_factory):
        comp = complaint_factory(resident_headers, category_factory(name="NoPhotoCat")["id"])
        r = client.get(f"{API}/complaints/{comp['id']}/photo", headers=resident_headers)
        assert r.status_code == 404

    def test_missing_file_on_disk_404(self, client, db, resident_headers, complaint_with_photo):
        storage_rel = None
        engine = db.get_bind()
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT photo_path FROM complaints WHERE id::text = :i"),
                {"i": complaint_with_photo["id"]},
            ).fetchone()
            storage_rel = row[0]
        assert storage_rel
        from app.core.config import settings as app_settings
        from pathlib import Path
        target = Path(app_settings.UPLOAD_DIR) / storage_rel
        saved = target.read_bytes()
        target.unlink()
        try:
            r = client.get(complaint_with_photo["photo_url"], headers=resident_headers)
            assert r.status_code == 404
        finally:
            target.write_bytes(saved)


class TestUploadAbuse:
    def test_webp_upload_accepted(self, client, resident_headers, category_factory):
        cat = category_factory(name="WebpCat")
        r = _create_with_photo(client, resident_headers, cat["id"], "pic.webp", _webp_bytes(), "image/webp")
        assert r.status_code == 201, r.text
        served = client.get(r.json()["photo_url"], headers=resident_headers)
        assert served.status_code == 200
        assert served.headers["content-type"].startswith("image/webp")

    def test_jpeg_upload_accepted(self, client, resident_headers, category_factory):
        cat = category_factory(name="JpegCat")
        r = _create_with_photo(client, resident_headers, cat["id"], "pic.jpg", _jpeg_bytes(), "image/jpeg")
        assert r.status_code == 201, r.text

    def test_empty_file_rejected(self, client, resident_headers, category_factory):
        cat = category_factory(name="EmptyFileCat")
        r = _create_with_photo(client, resident_headers, cat["id"], "empty.png", b"", "image/png")
        assert r.status_code == 422
        assert r.json()["code"] == "file_upload_error"

    def test_path_traversal_filename_is_harmless(self, client, db, resident_headers, category_factory):
        cat = category_factory(name="TraversalCat")
        r = _create_with_photo(
            client, resident_headers, cat["id"],
            "../../etc/passwd.png", _png_bytes(), "image/png",
        )
        assert r.status_code == 201
        from app.core.config import settings as app_settings
        from pathlib import Path
        base = Path(app_settings.UPLOAD_DIR).resolve().parent.parent
        stored = list(Path(app_settings.UPLOAD_DIR).rglob("*"))
        assert all(base in s.resolve().parents or s.resolve() == base for s in stored if s.is_file())
        assert not (Path(app_settings.UPLOAD_DIR).parent / "etc" / "passwd.png").exists()

    def test_backslash_filename_is_sanitized(self, client, resident_headers, category_factory):
        cat = category_factory(name="BackslashCat")
        r = _create_with_photo(
            client, resident_headers, cat["id"],
            "..\\..\\windows\\evil.png", _png_bytes(), "image/png",
        )
        assert r.status_code in (201, 422)
        if r.status_code == 201:
            served = client.get(r.json()["photo_url"], headers=resident_headers)
            assert served.status_code == 200
            assert served.content == _png_bytes()

    def test_null_byte_and_long_filenames_rejected_or_safe(self, client, resident_headers, category_factory):
        cat = category_factory(name="WeirdNameCat")
        r1 = _create_with_photo(
            client, resident_headers, cat["id"],
            "evil\x00.png", _png_bytes(), "image/png",
        )
        assert r1.status_code in (201, 422)
        r2 = _create_with_photo(
            client, resident_headers, cat["id"],
            ("a" * 500 + ".png"), _png_bytes(), "image/png",
        )
        assert r2.status_code in (201, 422)

    def test_duplicate_upload_gets_unique_names(self, client, db, resident_headers, category_factory):
        cat = category_factory(name="DupUpCat")
        r1 = _create_with_photo(client, resident_headers, cat["id"], "same.png", _png_bytes(), "image/png")
        r2 = _create_with_photo(client, resident_headers, cat["id"], "same.png", _png_bytes(), "image/png")
        assert r1.status_code == 201 and r2.status_code == 201
        engine = db.get_bind()
        with engine.connect() as conn:
            paths = [
                row[0]
                for row in conn.execute(
                    text("SELECT photo_path FROM complaints WHERE id::text IN (:a, :b)"),
                    {"a": r1.json()["id"], "b": r2.json()["id"]},
                ).fetchall()
            ]
        assert len(set(paths)) == 2

    def test_malformed_multipart_rejected(self, client, resident_headers):
        r = client.post(
            f"{API}/complaints",
            headers={**resident_headers, "Content-Type": "multipart/form-data; boundary=xyz"},
            content=b"--xyz\r\nbroken",
        )
        assert r.status_code in (400, 422)


class TestHistoryIntegrity:
    def test_status_and_history_atomic_on_history_failure(self, client, db, monkeypatch, admin_headers, resident_headers, category_factory, complaint_factory):
        import uuid as uuid_mod

        from app.core.enums import ComplaintStatus
        from app.models.complaint import Complaint
        from app.models.user import User
        from app.services import complaint_service

        cat = category_factory(name="AtomicCat")
        comp = complaint_factory(resident_headers, cat["id"])
        complaint_id = uuid_mod.UUID(comp["id"])

        original_cls = complaint_service.ComplaintHistory

        class ExplodingHistory(original_cls):
            def __init__(self, *args, **kwargs):
                raise RuntimeError("simulated history failure")

        admin_user = db.query(User).filter(User.email == "admin@example.com").first()
        complaint_obj = db.get(Complaint, complaint_id)

        monkeypatch.setattr(complaint_service, "ComplaintHistory", ExplodingHistory)
        try:
            with pytest.raises(RuntimeError):
                complaint_service.update_status(
                    db, complaint_obj, admin_user, ComplaintStatus.IN_PROGRESS, None
                )
        finally:
            monkeypatch.undo()
        db.rollback()

        refreshed = db.get(Complaint, complaint_id)
        assert refreshed.status == ComplaintStatus.OPEN
        r = client.get(f"{API}/complaints/{comp['id']}/history", headers=admin_headers)
        assert [h["status"] for h in r.json()["items"]] == ["OPEN"]

    def test_no_fake_history_creation_endpoint(self, client, resident_headers, admin_headers, category_factory, complaint_factory):
        comp = complaint_factory(resident_headers, category_factory(name="HistCat")["id"])
        for method in ("post", "patch", "delete"):
            caller = getattr(client, method)
            r = caller(f"{API}/complaints/{comp['id']}/history", headers=admin_headers)
            assert r.status_code == 405


class TestExpiredJwt:
    def test_expired_token_rejected(self, client):
        from datetime import datetime, timedelta, timezone

        import jwt as pyjwt

        from app.core.config import settings as app_settings

        payload = {
            "sub": "00000000-0000-0000-0000-000000000001",
            "role": "RESIDENT",
            "iat": datetime.now(timezone.utc) - timedelta(hours=2),
            "exp": datetime.now(timezone.utc) - timedelta(hours=1),
        }
        token = pyjwt.encode(payload, app_settings.JWT_SECRET_KEY, algorithm=app_settings.JWT_ALGORITHM)
        r = client.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 401


class TestRateLimiting:
    def test_login_rate_limited_after_ten_attempts(self, client, monkeypatch):
        from app.api.routes.auth import auth_rate_limiter
        auth_rate_limiter.reset()
        payload = {"email": "ratelimit@example.com", "password": "Whatever1!"}
        statuses = [client.post(f"{API}/auth/login", json=payload).status_code for _ in range(12)]
        assert 429 in statuses
        assert statuses[-1] == 429
        first_ten = statuses[:10]
        assert all(s in (401, 200) for s in first_ten)
        auth_rate_limiter.reset()

    def test_rate_limit_response_shape(self, client):
        from app.api.routes.auth import auth_rate_limiter
        auth_rate_limiter.reset()
        payload = {"email": "shape@example.com", "password": "Whatever1!"}
        for _ in range(10):
            client.post(f"{API}/auth/login", json=payload)
        r = client.post(f"{API}/auth/login", json=payload)
        assert r.status_code == 429
        body = r.json()
        assert body["code"] == "rate_limited"
        assert "detail" in body
        auth_rate_limiter.reset()


class TestCorsPreflight:
    def test_preflight_allowed_origin(self, client):
        origin = "http://localhost:3000"
        r = client.options(
            f"{API}/categories",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "GET",
            },
        )
        assert r.status_code in (200, 204)
        assert r.headers.get("access-control-allow-origin") == origin

    def test_preflight_unknown_origin_not_allowed(self, client):
        r = client.options(
            f"{API}/categories",
            headers={
                "Origin": "https://evil.example.com",
                "Access-Control-Request-Method": "GET",
            },
        )
        allow = r.headers.get("access-control-allow-origin")
        assert allow != "https://evil.example.com"


class TestOverdueBoundary:
    def test_boundary_threshold_behavior(self, client, db, admin_headers, resident_headers, category_factory, complaint_factory):
        from datetime import datetime, timedelta, timezone
        from sqlalchemy import text as sqltext

        cat = category_factory(name="BoundaryCat")
        comp = complaint_factory(resident_headers, cat["id"])
        exact_days = 3
        engine = db.get_bind()
        with engine.begin() as conn:
            created = datetime.now(timezone.utc) - timedelta(days=exact_days)
            conn.execute(
                sqltext("UPDATE complaints SET created_at = :t WHERE id::text = :i"),
                {"t": created, "i": comp["id"]},
            )
        r_overdue = client.get(f"{API}/complaints", headers=admin_headers, params={"overdue": True})
        ids = [i["id"] for i in r_overdue.json()["items"]]
        assert comp["id"] in ids
