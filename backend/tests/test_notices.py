import logging
import os
from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine, text

API = "/api/v1"


def _backdate_notice(notice_id, days):
    engine = create_engine(os.environ["DATABASE_URL"])
    try:
        target = datetime.now(timezone.utc) - timedelta(days=days)
        with engine.begin() as conn:
            conn.execute(
                text("UPDATE notices SET created_at = :t WHERE id::text = :i"),
                {"t": target, "i": str(notice_id)},
            )
    finally:
        engine.dispose()


def _create_notice(client, admin_headers, title="Water maintenance", content="Supply off Saturday 10-13h.", is_important=False):
    resp = client.post(
        f"{API}/notices",
        headers=admin_headers,
        json={"title": title, "content": content, "is_important": is_important},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_admin_creates_notice_resident_sees_it(
    client, resident_headers, admin_headers
):
    notice = _create_notice(client, admin_headers)
    assert notice["title"] == "Water maintenance"
    assert notice["is_important"] is False

    listed = client.get(f"{API}/notices", headers=resident_headers)
    assert listed.status_code == 200, listed.text
    ids = [item["id"] for item in listed.json()["items"]]
    assert str(notice["id"]) in ids


def test_ordering_important_first_then_newest(
    client, resident_headers, admin_headers
):
    older_important = _create_notice(
        client,
        admin_headers,
        title="Old important notice",
        content="Elevator maintenance all day Friday.",
        is_important=True,
    )
    newer_regular = _create_notice(
        client,
        admin_headers,
        title="New regular notice",
        content="Garden cleanup scheduled soon.",
    )
    _backdate_notice(older_important["id"], 7)

    newer_important = _create_notice(
        client,
        admin_headers,
        title="New important notice",
        content="Water shutoff tonight at midnight.",
        is_important=True,
    )

    listed = client.get(f"{API}/notices", headers=resident_headers)
    items = listed.json()["items"]
    ids = [item["id"] for item in items]

    important_ids = [
        str(older_important["id"]),
        str(newer_important["id"]),
    ]
    regular_idx = ids.index(str(newer_regular["id"]))
    for imp_id in important_ids:
        assert ids.index(imp_id) < regular_idx

    assert ids.index(str(newer_important["id"])) < ids.index(str(older_important["id"]))


def test_get_single_notice_and_unknown_404(client, resident_headers, admin_headers):
    notice = _create_notice(client, admin_headers)

    got = client.get(f"{API}/notices/{notice['id']}", headers=resident_headers)
    assert got.status_code == 200, got.text
    assert got.json()["id"] == str(notice["id"])

    missing = client.get(
        f"{API}/notices/00000000-0000-0000-0000-000000000000",
        headers=resident_headers,
    )
    assert missing.status_code == 404
    assert missing.json().get("code") == "not_found" or (
        isinstance(missing.json().get("detail"), dict)
        and missing.json()["detail"].get("code") == "not_found"
    )


def test_admin_patch_persists_and_resident_forbidden(
    client, db, resident_headers, admin_headers
):
    notice = _create_notice(client, admin_headers)

    patched = client.patch(
        f"{API}/notices/{notice['id']}",
        headers=admin_headers,
        json={
            "title": "Updated title here",
            "content": "Updated content body.",
            "is_important": True,
        },
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["title"] == "Updated title here"
    assert patched.json()["is_important"] is True

    from app.models.notice import Notice

    row = db.get(Notice, notice["id"])
    db.refresh(row)
    assert row.title == "Updated title here"
    assert row.content == "Updated content body."
    assert row.is_important is True

    forbidden_patch = client.patch(
        f"{API}/notices/{notice['id']}",
        headers=resident_headers,
        json={"title": "Resident tampering"},
    )
    assert forbidden_patch.status_code == 403

    forbidden_delete = client.delete(
        f"{API}/notices/{notice['id']}", headers=resident_headers
    )
    assert forbidden_delete.status_code == 403


def test_delete_removes_notice(client, resident_headers, admin_headers):
    notice = _create_notice(client, admin_headers)

    deleted = client.delete(f"{API}/notices/{notice['id']}", headers=admin_headers)
    assert deleted.status_code == 200, deleted.text

    gone = client.get(f"{API}/notices/{notice['id']}", headers=admin_headers)
    assert gone.status_code == 404


def test_email_skipped_logged_only_for_important(
    client, caplog, resident_headers, admin_headers
):
    with caplog.at_level(logging.INFO, logger="app.services.notification_service"):
        regular = _create_notice(
            client,
            admin_headers,
            title="Regular board update",
            content="Nothing urgent this week.",
        )
        assert not any("email skipped" in rec.message for rec in caplog.records)

        important = _create_notice(
            client,
            admin_headers,
            title="Critical water outage",
            content="Water will be off tonight.",
            is_important=True,
        )

    skip_records = [r for r in caplog.records if "email skipped" in r.message]
    assert len(skip_records) >= 1
    assert all(r.name == "app.services.notification_service" for r in skip_records)

    # sanity: both notices exist
    assert client.get(
        f"{API}/notices/{regular['id']}", headers=admin_headers
    ).status_code == 200
    assert client.get(
        f"{API}/notices/{important['id']}", headers=admin_headers
    ).status_code == 200


def test_pagination_envelope(client, resident_headers, admin_headers):
    for i in range(3):
        _create_notice(
            client, admin_headers, title=f"Notice number {i} title", content=f"Body {i}."
        )

    listed = client.get(
        f"{API}/notices", params={"limit": 2, "offset": 1}, headers=resident_headers
    )
    assert listed.status_code == 200, listed.text
    data = listed.json()
    assert set(data.keys()) >= {"total", "limit", "offset", "items"}
    assert data["total"] == 3
    assert data["limit"] == 2
    assert data["offset"] == 1
    assert len(data["items"]) == 2
