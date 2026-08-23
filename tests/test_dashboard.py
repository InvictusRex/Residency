API = "/api/v1"


def test_dashboard_baseline_shape(client, admin_headers):
    resp = client.get(f"{API}/dashboard/summary", headers=admin_headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert set(data.keys()) == {
        "total_complaints",
        "by_status",
        "by_category",
        "overdue_count",
    }
    assert data["total_complaints"] == 0
    assert data["by_status"] == {"OPEN": 0, "IN_PROGRESS": 0, "RESOLVED": 0}
    assert data["overdue_count"] == 0


def test_dashboard_counts_by_status_and_category(
    client,
    resident_headers,
    admin_headers,
    category_factory,
    complaint_factory,
):
    cat_a = category_factory(name="Plumbing")
    cat_b = category_factory(name="Electrical")

    complaint_factory(resident_headers, cat_a["id"], description="Open one in plumbing")
    complaint_factory(resident_headers, cat_a["id"], description="Second in plumbing")
    in_progress = complaint_factory(
        resident_headers, cat_b["id"], description="Electrical issue here"
    )
    to_resolve = complaint_factory(resident_headers, cat_b["id"], description="Resolve me")

    started = client.patch(
        f"{API}/complaints/{in_progress['id']}/status",
        headers=admin_headers,
        json={"status": "IN_PROGRESS"},
    )
    assert started.status_code == 200, started.text

    resolved = client.patch(
        f"{API}/complaints/{to_resolve['id']}/status",
        headers=admin_headers,
        json={"status": "IN_PROGRESS"},
    )
    assert resolved.status_code == 200, resolved.text
    resolved = client.patch(
        f"{API}/complaints/{to_resolve['id']}/status",
        headers=admin_headers,
        json={"status": "RESOLVED", "note": "Done"},
    )
    assert resolved.status_code == 200, resolved.text

    resp = client.get(f"{API}/dashboard/summary", headers=admin_headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert data["total_complaints"] == 4
    assert data["by_status"]["OPEN"] == 2
    assert data["by_status"]["IN_PROGRESS"] == 1
    assert data["by_status"]["RESOLVED"] == 1

    by_cat = {item["category_id"]: item["count"] for item in data["by_category"]}
    assert by_cat[str(cat_a["id"])] == 2
    assert by_cat[str(cat_b["id"])] == 2


def test_dashboard_resident_forbidden(client, resident_headers):
    resp = client.get(f"{API}/dashboard/summary", headers=resident_headers)
    assert resp.status_code == 403


def test_dashboard_unauthenticated_401(client):
    resp = client.get(f"{API}/dashboard/summary")
    assert resp.status_code == 401
