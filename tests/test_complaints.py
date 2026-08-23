import struct
import uuid
import zlib
from datetime import date, timedelta

from tests.conftest import API


def _png_chunk(tag: bytes, data: bytes) -> bytes:
    return (
        struct.pack(">I", len(data))
        + tag
        + data
        + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    )


def _minimal_png_bytes() -> bytes:
    """A real, valid 1x1 RGBA PNG built inline."""
    ihdr = struct.pack(">IIBBBBB", 1, 1, 8, 6, 0, 0, 0)
    # one scanline: filter byte 0x00 + RGBA pixel
    raw_scanline = b"\x00\xff\x00\x00\xff"
    idat = zlib.compress(raw_scanline)
    return (
        b"\x89PNG\r\n\x1a\n"
        + _png_chunk(b"IHDR", ihdr)
        + _png_chunk(b"IDAT", idat)
        + _png_chunk(b"IEND", b"")
    )


def _create_complaint(client, headers, category_id, description="Leaking tap in bathroom", **kwargs):
    resp = client.post(
        f"{API}/complaints",
        headers=headers,
        data={"category_id": str(category_id), "description": description},
        **kwargs,
    )
    return resp


# ---------------------------------------------------------------------------
# Creation
# ---------------------------------------------------------------------------


class TestCreateComplaint:
    def test_create_returns_201_open_low(self, client, resident_headers, category_factory):
        category = category_factory(name="Plumbing")
        resp = _create_complaint(client, resident_headers, category["id"])
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["status"] == "OPEN"
        assert body["priority"] == "LOW"
        assert body["description"] == "Leaking tap in bathroom"

    def test_description_too_short_rejected(self, client, resident_headers, category_factory):
        category = category_factory(name="Plumbing")
        resp = _create_complaint(client, resident_headers, category["id"], description="abc")
        assert resp.status_code == 422
        assert resp.json()["code"] == "validation_error"

    def test_missing_category_id_rejected(self, client, resident_headers):
        resp = client.post(
            f"{API}/complaints",
            headers=resident_headers,
            data={"description": "No category provided here"},
        )
        assert resp.status_code == 422

    def test_nonexistent_category_rejected(self, client, resident_headers):
        resp = _create_complaint(client, resident_headers, uuid.uuid4())
        assert resp.status_code == 404
        assert resp.json()["detail"] == "category_not_found"

    def test_inactive_category_rejected(self, client, admin_headers, resident_headers, category_factory):
        category = category_factory(name="Retired Category")
        patch_resp = client.patch(
            f"{API}/categories/{category['id']}",
            headers=admin_headers,
            json={"is_active": False},
        )
        assert patch_resp.status_code == 200, patch_resp.text
        resp = _create_complaint(client, resident_headers, category["id"])
        assert resp.status_code == 422
        assert resp.json()["detail"] == "category_inactive"


# ---------------------------------------------------------------------------
# Photo upload
# ---------------------------------------------------------------------------


class TestPhotoUpload:
    def test_photo_upload_happy_path(self, client, resident_headers, category_factory):
        category = category_factory(name="Plumbing")
        resp = _create_complaint(
            client,
            resident_headers,
            category["id"],
            files={"photo": ("leak.png", _minimal_png_bytes(), "image/png")},
        )
        assert resp.status_code == 201, resp.text
        photo_url = resp.json()["photo_url"]
        assert photo_url is not None
        assert photo_url.startswith("/uploads/complaints/")
        served = client.get(photo_url)
        assert served.status_code == 200
        assert served.content == _minimal_png_bytes()

    def test_invalid_file_type_rejected(self, client, resident_headers, category_factory):
        category = category_factory(name="Plumbing")
        resp = _create_complaint(
            client,
            resident_headers,
            category["id"],
            files={"photo": ("notes.txt", b"plain text content", "text/plain")},
        )
        assert resp.status_code == 422
        assert resp.json()["code"] == "file_upload_error"

    def test_extension_mismatch_rejected(self, client, resident_headers, category_factory):
        category = category_factory(name="Plumbing")
        resp = _create_complaint(
            client,
            resident_headers,
            category["id"],
            files={"photo": ("not_a_png.png", _minimal_png_bytes(), "image/jpeg")},
        )
        assert resp.status_code == 422
        assert resp.json()["code"] == "file_upload_error"

    def test_oversized_file_rejected(self, client, resident_headers, category_factory, monkeypatch):
        from app.core.config import settings

        category = category_factory(name="Plumbing")
        # The route module imported `settings` directly from app.core.config,
        # so mutating this singleton's attribute is visible at request time.
        monkeypatch.setattr(settings, "MAX_UPLOAD_SIZE_MB", 0)
        resp = _create_complaint(
            client,
            resident_headers,
            category["id"],
            files={"photo": ("big.png", _minimal_png_bytes(), "image/png")},
        )
        assert resp.status_code == 422
        assert resp.json()["detail"] == "file_too_large"


# ---------------------------------------------------------------------------
# Listing, scoping, filters, pagination
# ---------------------------------------------------------------------------


class TestListComplaints:
    def test_resident_sees_only_own_complaints(self, client, resident_headers, second_resident_headers, category_factory, complaint_factory):
        category = category_factory(name="Shared Category")
        mine = complaint_factory(resident_headers, category["id"])
        theirs = complaint_factory(second_resident_headers, category["id"])

        resp = client.get(f"{API}/complaints", headers=resident_headers)
        assert resp.status_code == 200
        body = resp.json()
        ids = [item["id"] for item in body["items"]]
        assert mine["id"] in ids
        assert theirs["id"] not in ids
        assert body["total"] == 1

    def test_admin_lists_all(self, client, resident_headers, second_resident_headers, admin_headers, category_factory, complaint_factory):
        category = category_factory(name="All Access")
        first = complaint_factory(resident_headers, category["id"])
        second = complaint_factory(second_resident_headers, category["id"])

        resp = client.get(f"{API}/complaints", headers=admin_headers)
        assert resp.status_code == 200
        ids = [item["id"] for item in resp.json()["items"]]
        assert first["id"] in ids
        assert second["id"] in ids

    def test_filter_by_status(self, client, admin_headers, resident_headers, category_factory, complaint_factory):
        complaint = complaint_factory(resident_headers)
        open_resp = client.get(f"{API}/complaints?status=OPEN", headers=admin_headers)
        assert open_resp.status_code == 200
        assert complaint["id"] in [i["id"] for i in open_resp.json()["items"]]

        resolved_resp = client.get(f"{API}/complaints?status=RESOLVED", headers=admin_headers)
        assert resolved_resp.status_code == 200
        assert resolved_resp.json()["items"] == []

    def test_filter_by_priority_values(self, client, admin_headers, resident_headers, category_factory, complaint_factory):
        category = category_factory(name="Priority Filter")
        low = complaint_factory(resident_headers, category["id"])
        high = complaint_factory(resident_headers, category["id"])

        client.patch(
            f"{API}/complaints/{high['id']}/priority",
            headers=admin_headers,
            json={"priority": "HIGH"},
        )

        high_resp = client.get(f"{API}/complaints?priority=HIGH", headers=admin_headers)
        assert high_resp.status_code == 200
        assert [i["id"] for i in high_resp.json()["items"]] == [high["id"]]

        low_resp = client.get(f"{API}/complaints?priority=LOW", headers=admin_headers)
        assert low_resp.status_code == 200
        assert [i["id"] for i in low_resp.json()["items"]] == [low["id"]]

    def test_filter_by_date_range(self, client, admin_headers, resident_headers, complaint_factory):
        complaint = complaint_factory(resident_headers)
        today = date.today()
        tomorrow = today + timedelta(days=1)

        from_today = client.get(
            f"{API}/complaints?date_from={today.isoformat()}", headers=admin_headers
        )
        assert from_today.status_code == 200
        assert complaint["id"] in [i["id"] for i in from_today.json()["items"]]

        from_tomorrow = client.get(
            f"{API}/complaints?date_from={tomorrow.isoformat()}", headers=admin_headers
        )
        assert from_tomorrow.status_code == 200
        assert from_tomorrow.json()["items"] == []
        assert from_tomorrow.json()["total"] == 0

        date_to_today = client.get(
            f"{API}/complaints?date_to={today.isoformat()}", headers=admin_headers
        )
        assert date_to_today.status_code == 200
        assert complaint["id"] in [i["id"] for i in date_to_today.json()["items"]]

    def test_overdue_params_accepted(self, client, admin_headers, resident_headers, complaint_factory):
        complaint = complaint_factory(resident_headers)
        for param in ("true", "false"):
            resp = client.get(f"{API}/complaints?overdue={param}", headers=admin_headers)
            assert resp.status_code == 200, resp.text
        assert complaint is not None

    def test_pagination_limit_offset(self, client, admin_headers, resident_headers, category_factory, complaint_factory):
        category = category_factory(name="Pagination")
        for _ in range(3):
            complaint_factory(resident_headers, category["id"])

        resp = client.get(f"{API}/complaints?limit=1&offset=0", headers=admin_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["items"]) == 1
        assert body["total"] >= len(body["items"])
        assert body["limit"] == 1
        assert body["offset"] == 0

        page_two = client.get(f"{API}/complaints?limit=1&offset=1", headers=admin_headers)
        assert page_two.status_code == 200
        assert page_two.json()["items"][0]["id"] != body["items"][0]["id"]

    def test_limit_above_100_rejected(self, client, admin_headers):
        resp = client.get(f"{API}/complaints?limit=101", headers=admin_headers)
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Priority updates
# ---------------------------------------------------------------------------


class TestPriorityUpdate:
    def test_admin_patch_priority_persists(self, client, admin_headers, resident_headers, complaint_factory):
        complaint = complaint_factory(resident_headers)
        resp = client.patch(
            f"{API}/complaints/{complaint['id']}/priority",
            headers=admin_headers,
            json={"priority": "HIGH"},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["priority"] == "HIGH"

        fetched = client.get(
            f"{API}/complaints/{complaint['id']}", headers=admin_headers
        )
        assert fetched.status_code == 200
        assert fetched.json()["priority"] == "HIGH"

    def test_invalid_priority_value_rejected(self, client, admin_headers, resident_headers, complaint_factory):
        complaint = complaint_factory(resident_headers)
        resp = client.patch(
            f"{API}/complaints/{complaint['id']}/priority",
            headers=admin_headers,
            json={"priority": "URGENT"},
        )
        assert resp.status_code == 422

    def test_resident_cannot_patch_priority(self, client, resident_headers, complaint_factory):
        complaint = complaint_factory(resident_headers)
        resp = client.patch(
            f"{API}/complaints/{complaint['id']}/priority",
            headers=resident_headers,
            json={"priority": "HIGH"},
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Status lifecycle
# ---------------------------------------------------------------------------


class TestStatusLifecycle:
    def test_full_happy_path_with_resolved_at(
        self, client, admin_headers, resident_headers, complaint_factory
    ):
        complaint = complaint_factory(resident_headers)
        cid = complaint["id"]

        first = client.patch(
            f"{API}/complaints/{cid}/status",
            headers=admin_headers,
            json={"status": "IN_PROGRESS", "note": "Plumber assigned"},
        )
        assert first.status_code == 200, first.text
        assert first.json()["status"] == "IN_PROGRESS"
        assert first.json()["resolved_at"] is None

        second = client.patch(
            f"{API}/complaints/{cid}/status",
            headers=admin_headers,
            json={"status": "RESOLVED", "note": "Fixed and verified"},
        )
        assert second.status_code == 200, second.text
        assert second.json()["status"] == "RESOLVED"
        assert second.json()["resolved_at"] is not None

        fetched = client.get(f"{API}/complaints/{cid}", headers=resident_headers)
        assert fetched.status_code == 200
        assert fetched.json()["resolved_at"] is not None

    def test_direct_resolution_without_note_rejected(
        self, client, admin_headers, resident_headers, complaint_factory
    ):
        complaint = complaint_factory(resident_headers)
        resp = client.patch(
            f"{API}/complaints/{complaint['id']}/status",
            headers=admin_headers,
            json={"status": "RESOLVED"},
        )
        assert resp.status_code == 422
        assert resp.json()["detail"] == "note_required_for_direct_resolution"

    def test_direct_resolution_with_note_succeeds(
        self, client, admin_headers, resident_headers, complaint_factory
    ):
        complaint = complaint_factory(resident_headers)
        resp = client.patch(
            f"{API}/complaints/{complaint['id']}/status",
            headers=admin_headers,
            json={"status": "RESOLVED", "note": "Resolved immediately"},
        )
        assert resp.status_code == 200, resp.text

    def test_resolved_is_terminal(self, client, admin_headers, resident_headers, complaint_factory):
        complaint = complaint_factory(resident_headers)
        cid = complaint["id"]
        resolve = client.patch(
            f"{API}/complaints/{cid}/status",
            headers=admin_headers,
            json={"status": "RESOLVED", "note": "done"},
        )
        assert resolve.status_code == 200, resolve.text

        for target in ("OPEN", "IN_PROGRESS"):
            resp = client.patch(
                f"{API}/complaints/{cid}/status",
                headers=admin_headers,
                json={"status": target},
            )
            assert resp.status_code == 409
            assert resp.json()["code"] == "invalid_status_transition"

    def test_in_progress_back_to_open_rejected(
        self, client, admin_headers, resident_headers, complaint_factory
    ):
        complaint = complaint_factory(resident_headers)
        cid = complaint["id"]
        start = client.patch(
            f"{API}/complaints/{cid}/status",
            headers=admin_headers,
            json={"status": "IN_PROGRESS"},
        )
        assert start.status_code == 200, start.text

        resp = client.patch(
            f"{API}/complaints/{cid}/status",
            headers=admin_headers,
            json={"status": "OPEN"},
        )
        assert resp.status_code == 409

    def test_same_status_update_rejected(
        self, client, admin_headers, resident_headers, complaint_factory
    ):
        complaint = complaint_factory(resident_headers)
        resp = client.patch(
            f"{API}/complaints/{complaint['id']}/status",
            headers=admin_headers,
            json={"status": "OPEN"},
        )
        assert resp.status_code == 409

    def test_invalid_status_value_rejected(
        self, client, admin_headers, resident_headers, complaint_factory
    ):
        complaint = complaint_factory(resident_headers)
        resp = client.patch(
            f"{API}/complaints/{complaint['id']}/status",
            headers=admin_headers,
            json={"status": "CLOSED"},
        )
        assert resp.status_code == 422

    def test_resident_cannot_patch_status(
        self, client, resident_headers, complaint_factory
    ):
        complaint = complaint_factory(resident_headers)
        resp = client.patch(
            f"{API}/complaints/{complaint['id']}/status",
            headers=resident_headers,
            json={"status": "IN_PROGRESS"},
        )
        assert resp.status_code == 403
