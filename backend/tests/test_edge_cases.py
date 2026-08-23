import uuid

import httpx
from fastapi.testclient import TestClient
import pytest

from tests.conftest import API

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
JPEG_MAGIC = b"\xff\xd8\xff\xe0"


def _png_bytes() -> bytes:
    return PNG_MAGIC + b"rest-of-png-content-not-really-needed" * 4


def test_text_disguised_as_jpeg_is_rejected(client: TestClient, resident_headers, category_factory):
    category = category_factory()
    r = client.post(
        f"{API}/complaints",
        headers=resident_headers,
        data={"category_id": category["id"], "description": "Disguised text file upload."},
        files={"photo": ("photo.jpg", b"this is definitely not a jpeg image", "image/jpeg")},
    )
    assert r.status_code == 422, r.text


def test_png_bytes_with_jpg_name_and_jpeg_mime_rejected(client: TestClient, resident_headers, category_factory):
    category = category_factory()
    r = client.post(
        f"{API}/complaints",
        headers=resident_headers,
        data={"category_id": category["id"], "description": "Mismatched magic byte upload."},
        files={"photo": ("photo.jpg", _png_bytes(), "image/jpeg")},
    )
    assert r.status_code == 422, r.text


def test_real_jpeg_magic_accepted_with_correct_mime(client: TestClient, resident_headers, category_factory):
    category = category_factory()
    r = client.post(
        f"{API}/complaints",
        headers=resident_headers,
        data={"category_id": category["id"], "description": "Valid jpeg upload should pass."},
        files={"photo": ("photo.jpg", JPEG_MAGIC + b"\x00" * 64, "image/jpeg")},
    )
    assert r.status_code == 201, r.text
    assert r.json()["photo_url"]


def test_whitespace_only_description_rejected(client: TestClient, resident_headers, category_factory):
    category = category_factory()
    r = client.post(
        f"{API}/complaints",
        headers=resident_headers,
        data={"category_id": category["id"], "description": "     "},
    )
    assert r.status_code == 422, r.text


def test_description_is_stripped(client: TestClient, db, resident_headers, category_factory):
    category = category_factory()
    r = client.post(
        f"{API}/complaints",
        headers=resident_headers,
        data={"category_id": category["id"], "description": "  padded description here  "},
    )
    assert r.status_code == 201
    assert r.json()["description"] == "padded description here"


def test_case_insensitive_duplicate_category_rejected(client: TestClient, admin_headers, category_factory):
    category_factory(name="Gardening")
    r = client.post(f"{API}/categories", headers=admin_headers, json={"name": "gardening"})
    assert r.status_code == 409, r.text


def test_category_rename_to_existing_name_case_insensitive(client: TestClient, admin_headers, category_factory):
    category_factory(name="Pests")
    other = category_factory(name="Roads")
    r = client.patch(f"{API}/categories/{other['id']}", headers=admin_headers, json={"name": "pests"})
    assert r.status_code == 409, r.text


def test_rename_to_own_name_allowed(client: TestClient, admin_headers, category_factory):
    cat = category_factory(name="UniqueCat")
    r = client.patch(f"{API}/categories/{cat['id']}", headers=admin_headers, json={"name": "UniqueCat"})
    assert r.status_code == 200, r.text


def test_date_range_from_after_to_rejected(client: TestClient, admin_headers):
    r = client.get(
        f"{API}/complaints",
        headers=admin_headers,
        params={"date_from": "2026-08-23", "date_to": "2026-08-01"},
    )
    assert r.status_code == 422, r.text


def test_overdue_false_returns_only_not_overdue(client: TestClient, db, admin_headers, resident_headers, category_factory):
    from datetime import datetime, timedelta, timezone
    from sqlalchemy import text

    category = category_factory()
    fresh = complaint_factory_helper(client, resident_headers, category)
    old = complaint_factory_helper(client, resident_headers, category)
    engine = db.get_bind()
    with engine.begin() as conn:
        conn.execute(
            text("UPDATE complaints SET created_at = :t WHERE id::text = :i"),
            {"t": datetime.now(timezone.utc) - timedelta(days=30), "i": old["id"]},
        )
    r = client.get(f"{API}/complaints", headers=admin_headers, params={"overdue": False, "limit": 100})
    ids = [i["id"] for i in r.json()["items"]]
    assert old["id"] not in ids and fresh["id"] in ids


def test_resident_can_use_sort_oldest(client: TestClient, resident_headers, category_factory):
    category = category_factory()
    first = complaint_factory_helper(client, resident_headers, category, "First complaint ever made.")
    second = complaint_factory_helper(client, resident_headers, category, "Second complaint made after.")
    r = client.get(f"{API}/complaints", headers=resident_headers, params={"sort": "oldest"})
    items = r.json()["items"]
    ids = [i["id"] for i in items]
    assert ids.index(first["id"]) < ids.index(second["id"])


def test_note_whitespace_stored_stripped(client: TestClient, admin_headers, resident_headers, category_factory):
    category = category_factory()
    comp = complaint_factory_helper(client, resident_headers, category)
    r = client.patch(
        f"{API}/complaints/{comp['id']}/status",
        headers=admin_headers,
        json={"status": "IN_PROGRESS", "note": "  plumber assigned  "},
    )
    assert r.status_code == 200
    hist = client.get(f"{API}/complaints/{comp['id']}/history", headers=admin_headers).json()
    assert hist["items"][-1]["note"] == "plumber assigned"


def complaint_factory_helper(client: httpx.Client, resident_headers, category, description=None):
    payload = {
        "category_id": category["id"],
        "description": description or "Edge case verification complaint.",
    }
    r = client.post(f"{API}/complaints", headers=resident_headers, data=payload)
    assert r.status_code == 201, r.text
    return r.json()
