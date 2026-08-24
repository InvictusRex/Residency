import os
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine, text

from app.core.enums import ComplaintStatus
from app.models.complaint import Complaint
from app.services.overdue_service import is_complaint_overdue
from app.services.settings_service import get_overdue_threshold

API = "/api/v1"


def _backdate_complaint(complaint_id, days):
    engine = create_engine(os.environ["DATABASE_URL"])
    try:
        target = datetime.now(timezone.utc) - timedelta(days=days)
        with engine.begin() as conn:
            conn.execute(
                text("UPDATE complaints SET created_at = :t WHERE id::text = :i"),
                {"t": target, "i": str(complaint_id)},
            )
    finally:
        engine.dispose()


def _set_threshold(client, admin_headers, days):
    return client.patch(
        f"{API}/admin/settings/overdue-threshold",
        headers=admin_headers,
        json={"overdue_threshold_days": days},
    )


def _list_overdue(client, admin_headers):
    resp = client.get(
        f"{API}/complaints", params={"overdue": "true"}, headers=admin_headers
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


@pytest.fixture()
def threshold_reset(client, admin_headers):
    yield
    _set_threshold(client, admin_headers, 3)


def test_fresh_unresolved_complaint_not_overdue(
    client, db, resident_headers, admin_headers, category_factory, complaint_factory
):
    complaint = complaint_factory(resident_headers, category_factory()["id"])

    data = _list_overdue(client, admin_headers)
    assert data["total"] == 0
    assert all(item["id"] != str(complaint["id"]) for item in data["items"])

    obj = db.get(Complaint, complaint["id"])
    assert obj is not None
    threshold = get_overdue_threshold(db)
    assert is_complaint_overdue(obj, threshold) is False


def test_backdated_unresolved_complaint_is_overdue(
    client, db, resident_headers, admin_headers, category_factory, complaint_factory
):
    complaint = complaint_factory(resident_headers, category_factory()["id"])
    _backdate_complaint(complaint["id"], 30)

    data = _list_overdue(client, admin_headers)
    ids = [item["id"] for item in data["items"]]
    assert str(complaint["id"]) in ids
    assert data["total"] == 1

    db.expire_all()
    obj = db.get(Complaint, complaint["id"])
    threshold = get_overdue_threshold(db)
    assert is_complaint_overdue(obj, threshold) is True


def test_resolved_complaint_never_overdue_even_ancient(
    client, db, resident_headers, admin_headers, category_factory, complaint_factory
):
    category_id = category_factory()["id"]
    complaint = complaint_factory(resident_headers, category_id)
    resolve = client.patch(
        f"{API}/complaints/{complaint['id']}/status",
        headers=admin_headers,
        json={"status": "RESOLVED", "note": "Fixed by maintenance"},
    )
    assert resolve.status_code == 200, resolve.text
    _backdate_complaint(complaint["id"], 400)

    data = _list_overdue(client, admin_headers)
    assert data["total"] == 0
    assert all(item["id"] != str(complaint["id"]) for item in data["items"])

    db.expire_all()
    obj = db.get(Complaint, complaint["id"])
    assert obj.status == ComplaintStatus.RESOLVED
    threshold = get_overdue_threshold(db)
    assert is_complaint_overdue(obj, threshold) is False


@pytest.mark.usefixtures("threshold_reset")
def test_configurable_threshold_changes_overdue_detection(
    client, db, resident_headers, admin_headers, category_factory, complaint_factory
):
    complaint = complaint_factory(resident_headers, category_factory()["id"])
    _backdate_complaint(complaint["id"], 30)

    resp = _set_threshold(client, admin_headers, 365)
    assert resp.status_code == 200, resp.text
    assert resp.json()["overdue_threshold_days"] == 365

    data = _list_overdue(client, admin_headers)
    assert all(item["id"] != str(complaint["id"]) for item in data["items"])
    db.expire_all()
    assert is_complaint_overdue(db.get(Complaint, complaint["id"]), 365) is False

    resp = _set_threshold(client, admin_headers, 1)
    assert resp.status_code == 200, resp.text

    data = _list_overdue(client, admin_headers)
    assert str(complaint["id"]) in [item["id"] for item in data["items"]]
    db.expire_all()
    assert is_complaint_overdue(db.get(Complaint, complaint["id"]), 1) is True


@pytest.mark.parametrize("invalid", [0, 366])
def test_threshold_validation_rejects_out_of_range(
    client, admin_headers, invalid
):
    resp = _set_threshold(client, admin_headers, invalid)
    assert resp.status_code == 422, resp.text


def test_default_ordering_overdue_first_then_priority(
    client, resident_headers, admin_headers, category_factory, complaint_factory
):
    category_id = category_factory()["id"]

    overdue = complaint_factory(resident_headers, category_id)
    high_new = complaint_factory(resident_headers, category_id)
    low_new = complaint_factory(resident_headers, category_id)
    _backdate_complaint(overdue["id"], 30)

    promote = client.patch(
        f"{API}/complaints/{high_new['id']}/priority",
        headers=admin_headers,
        json={"priority": "HIGH"},
    )
    assert promote.status_code == 200, promote.text

    listed = client.get(f"{API}/complaints", headers=admin_headers)
    assert listed.status_code == 200, listed.text
    items = listed.json()["items"]
    assert len(items) == 3
    assert items[0]["id"] == str(overdue["id"])

    rest_ids = [item["id"] for item in items[1:]]
    assert "HIGH" == next(
        item["priority"] for item in items[1:] if item["id"] == str(high_new["id"])
    )
    assert rest_ids.index(str(high_new["id"])) < rest_ids.index(str(low_new["id"]))


def test_explicit_overdue_sort_puts_overdue_first_and_alt_sorts_override(
    client, resident_headers, admin_headers, category_factory, complaint_factory
):
    category_id = category_factory()["id"]
    overdue = complaint_factory(resident_headers, category_id)
    fresh = complaint_factory(resident_headers, category_id)
    _backdate_complaint(overdue["id"], 30)

    overdue_first = client.get(f"{API}/complaints?sort=overdue", headers=admin_headers)
    assert overdue_first.status_code == 200, overdue_first.text
    ids = [item["id"] for item in overdue_first.json()["items"]]
    assert str(overdue["id"]) in ids and str(fresh["id"]) in ids
    assert ids.index(str(overdue["id"])) < ids.index(str(fresh["id"]))

    alternate = client.get(f"{API}/complaints?sort=newest", headers=admin_headers)
    assert alternate.status_code == 200, alternate.text
    alt_ids = [item["id"] for item in alternate.json()["items"]]
    assert alt_ids.index(str(fresh["id"])) < alt_ids.index(str(overdue["id"]))

    triage = client.get(f"{API}/complaints?sort=triage", headers=admin_headers)
    assert triage.status_code == 200, triage.text

    resolved = complaint_factory(resident_headers, category_id)
    resolve = client.patch(
        f"{API}/complaints/{resolved['id']}/status",
        headers=admin_headers,
        json={"status": "RESOLVED", "note": "Fixed by maintenance"},
    )
    assert resolve.status_code == 200, resolve.text
    _backdate_complaint(resolved["id"], 400)

    overdue_list = client.get(f"{API}/complaints?sort=overdue", headers=admin_headers)
    assert overdue_list.status_code == 200, overdue_list.text
    sorted_ids = [item["id"] for item in overdue_list.json()["items"]]
    assert str(resolved["id"]) in sorted_ids
    assert sorted_ids.index(str(overdue["id"])) < sorted_ids.index(str(resolved["id"]))
