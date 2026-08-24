from tests.conftest import API


class TestAdminResidents:
    def _register_resident(self, client, suffix):
        resp = client.post(
            f"{API}/auth/register",
            json={"name": f"Resident {suffix}", "email": f"res.{suffix}@test.com", "password": "Passw0rd!Strong"},
        )
        assert resp.status_code == 201, resp.text
        return resp.json()

    def test_admin_lists_residents(self, client, admin_headers):
        self._register_resident(client, "list1")
        self._register_resident(client, "list2")
        resp = client.get(f"{API}/admin/residents", headers=admin_headers)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert set(body.keys()) == {"total", "limit", "offset", "items"}
        assert body["total"] >= 2
        assert all(i["role"] == "RESIDENT" for i in body["items"])

    def test_resident_cannot_list_residents(self, client, resident_headers):
        resp = client.get(f"{API}/admin/residents", headers=resident_headers)
        assert resp.status_code == 403

    def test_filter_by_active(self, client, admin_headers):
        created = self._register_resident(client, "activefilt")
        deactivate = client.patch(
            f"{API}/admin/residents/{created['id']}", headers=admin_headers, json={"is_active": False}
        )
        assert deactivate.status_code == 200
        inactive = client.get(f"{API}/admin/residents", headers=admin_headers, params={"is_active": "false"}).json()
        active = client.get(f"{API}/admin/residents", headers=admin_headers, params={"is_active": "true"}).json()
        assert created["id"] in [i["id"] for i in inactive["items"]]
        assert created["id"] not in [i["id"] for i in active["items"]]

    def test_search_by_email(self, client, admin_headers):
        created = self._register_resident(client, "findme")
        resp = client.get(f"{API}/admin/residents", headers=admin_headers, params={"search": "findme"}).json()
        assert any(i["id"] == created["id"] for i in resp["items"])

    def test_deactivate_then_reactivate(self, client, admin_headers):
        created = self._register_resident(client, "toggle")
        off = client.patch(f"{API}/admin/residents/{created['id']}", headers=admin_headers, json={"is_active": False})
        assert off.status_code == 200 and off.json()["is_active"] is False
        on = client.patch(f"{API}/admin/residents/{created['id']}", headers=admin_headers, json={"is_active": True})
        assert on.status_code == 200 and on.json()["is_active"] is True

    def test_unknown_resident_404(self, client, admin_headers):
        import uuid

        resp = client.patch(
            f"{API}/admin/residents/{uuid.uuid4()}", headers=admin_headers, json={"is_active": True}
        )
        assert resp.status_code == 404

    def test_cannot_toggle_admin(self, client, admin_headers):
        from app.models.user import User

        me = client.get(f"{API}/auth/me", headers=admin_headers).json()
        resp = client.patch(f"{API}/admin/residents/{me['id']}", headers=admin_headers, json={"is_active": False})
        assert resp.status_code == 404