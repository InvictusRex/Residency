import pytest

from tests.conftest import API

ADMIN_PATHS = [
    ("PATCH_STATUS", "patch", "/complaints/{complaint_id}/status"),
    ("PATCH_PRIORITY", "patch", "/complaints/{complaint_id}/priority"),
    ("POST_NOTICE", "post", "/notices"),
    ("DELETE_NOTICE", "delete", "/notices/{notice_id}"),
    ("DASHBOARD", "get", "/dashboard/summary"),
    ("GET_SETTINGS", "get", "/admin/settings"),
    ("PATCH_THRESHOLD", "patch", "/admin/settings/overdue-threshold"),
    ("POST_CATEGORY", "post", "/categories"),
    ("PATCH_CATEGORY", "patch", "/categories/{category_id}"),
    ("DELETE_CATEGORY", "delete", "/categories/{category_id}"),
]

PAYLOADS = {
    "PATCH_STATUS": {"status": "IN_PROGRESS", "note": "Assigning plumber"},
    "PATCH_PRIORITY": {"priority": "HIGH"},
    "POST_NOTICE": {"title": "New Notice", "content": "Some content"},
    "DELETE_NOTICE": None,
    "DASHBOARD": None,
    "GET_SETTINGS": None,
    "PATCH_THRESHOLD": {"overdue_threshold_days": 7},
    "POST_CATEGORY": {"name": "Fresh Category"},
    "PATCH_CATEGORY": {"name": "Renamed Category"},
    "DELETE_CATEGORY": None,
}

CREATED_STATUS = {"POST_NOTICE": 201, "POST_CATEGORY": 201}


def _create_notice(client, headers, title, content):
    resp = client.post(
        f"{API}/notices", headers=headers, json={"title": title, "content": content}
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


@pytest.fixture()
def env(client, admin_headers, resident_headers, category_factory, complaint_factory):
    category = category_factory(name="Matrix Plumbing")
    complaint = complaint_factory(resident_headers, category["id"])
    notice = _create_notice(
        client, admin_headers, title="Matrix Notice", content="Notice content"
    )
    return {
        "client": client,
        "admin_headers": admin_headers,
        "resident_headers": resident_headers,
        "category_id": category["id"],
        "complaint_id": complaint["id"],
        "notice_id": notice["id"],
    }


def _url(template, env):
    return (
        template.replace("{complaint_id}", str(env["complaint_id"]))
        .replace("{notice_id}", str(env["notice_id"]))
        .replace("{category_id}", str(env["category_id"]))
    )


class TestAdminOnlyEndpoints:
    @pytest.mark.parametrize("name,method,template", ADMIN_PATHS)
    def test_no_token_401(self, env, name, method, template):
        url = _url(template, env)
        resp = env["client"].request(method, f"{API}{url}", json=PAYLOADS[name])
        assert resp.status_code == 401, resp.text

    @pytest.mark.parametrize("name,method,template", ADMIN_PATHS)
    def test_resident_403(self, env, name, method, template):
        url = _url(template, env)
        resp = env["client"].request(
            method, f"{API}{url}", headers=env["resident_headers"], json=PAYLOADS[name]
        )
        assert resp.status_code == 403, resp.text

    @pytest.mark.parametrize("name,method,template", ADMIN_PATHS)
    def test_admin_happy_path(self, env, name, method, template):
        url = _url(template, env)
        resp = env["client"].request(
            method, f"{API}{url}", headers=env["admin_headers"], json=PAYLOADS[name]
        )
        expected = CREATED_STATUS.get(name, 200)
        assert resp.status_code == expected, resp.text


class AdminHappyPathAssertions:
    pass


class TestResidentReadAccess:
    def test_resident_can_list_notices(self, client, admin_headers, resident_headers):
        _create_notice(client, admin_headers, title="Water Shutdown", content="No water Saturday")
        resp = client.get(f"{API}/notices", headers=resident_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] >= 1
        assert any(item["title"] == "Water Shutdown" for item in body["items"])

    def test_resident_can_view_single_notice(self, client, admin_headers, resident_headers):
        notice = _create_notice(
            client, admin_headers, title="Elevator Repair", content="Elevator B serviced"
        )
        resp = client.get(f"{API}/notices/{notice['id']}", headers=resident_headers)
        assert resp.status_code == 200
        assert resp.json()["id"] == notice["id"]

    def test_resident_can_list_categories(self, client, resident_headers, category_factory):
        category = category_factory(name="Electrical")
        resp = client.get(f"{API}/categories", headers=resident_headers)
        assert resp.status_code == 200
        ids = [c["id"] for c in resp.json()]
        assert category["id"] in ids

    def test_resident_can_list_own_complaints(self, client, resident_headers, category_factory):
        category = category_factory(name="Gardening")
        create = client.post(
            f"{API}/complaints",
            headers=resident_headers,
            data={"category_id": category["id"], "description": "Overgrown hedge issue"},
        )
        assert create.status_code == 201, create.text
        complaint_id = create.json()["id"]
        resp = client.get(f"{API}/complaints", headers=resident_headers)
        assert resp.status_code == 200
        assert any(c["id"] == complaint_id for c in resp.json()["items"])

    def test_resident_can_view_own_complaint(self, client, resident_headers, category_factory):
        category = category_factory(name="Security")
        create = client.post(
            f"{API}/complaints",
            headers=resident_headers,
            data={"category_id": category["id"], "description": "Broken gate lock"},
        )
        assert create.status_code == 201, create.text
        complaint_id = create.json()["id"]
        resp = client.get(f"{API}/complaints/{complaint_id}", headers=resident_headers)
        assert resp.status_code == 200
        assert resp.json()["id"] == complaint_id


class TestBadTokens:
    def test_garbage_token_401(self, client):
        resp = client.get(
            f"{API}/auth/me", headers={"Authorization": "Bearer not-a-real-jwt"}
        )
        assert resp.status_code == 401

    def test_tampered_signature_401(self, client, resident_headers):
        token = resident_headers["Authorization"].split(" ", 1)[1]
        head, payload, sig = token.split(".")
        tampered_sig = ("a" if sig[0] != "a" else "b") + sig[1:]
        resp = client.get(
            f"{API}/auth/me",
            headers={"Authorization": f"Bearer {head}.{payload}.{tampered_sig}"},
        )
        assert resp.status_code == 401
