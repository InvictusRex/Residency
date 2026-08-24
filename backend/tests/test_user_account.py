from tests.conftest import API


class TestUserAccountChanges:
    def test_change_email_success(self, client, resident_headers):
        resp = client.patch(
            f"{API}/users/me/email",
            headers=resident_headers,
            json={"email": "newaddress@test.com", "current_password": "Passw0rd!Strong"},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["email"] == "newaddress@test.com"
        me = client.get(f"{API}/auth/me", headers=resident_headers).json()
        assert me["email"] == "newaddress@test.com"

    def test_change_email_duplicate_conflict(self, client, resident_headers, second_resident_headers):
        me = client.get(f"{API}/auth/me", headers=second_resident_headers).json()
        other = client.get(f"{API}/auth/me", headers=resident_headers).json()
        resp = client.patch(
            f"{API}/users/me/email",
            headers=second_resident_headers,
            json={"email": other["email"], "current_password": "Passw0rd!Strong"},
        )
        assert resp.status_code == 409
        assert resp.json()["detail"] == "email_already_registered"

    def test_change_email_wrong_current_password(self, client, resident_headers):
        resp = client.patch(
            f"{API}/users/me/email",
            headers=resident_headers,
            json={"email": "hacked@test.com", "current_password": "WrongPass1!"},
        )
        assert resp.status_code == 422
        assert resp.json()["detail"] == "current_password_incorrect"

    def test_change_password_success(self, client, resident_headers):
        resp = client.patch(
            f"{API}/users/me/password",
            headers=resident_headers,
            json={"current_password": "Passw0rd!Strong", "new_password": "NewPassw0rd!"},
        )
        assert resp.status_code == 200, resp.text
        login_old = client.post(
            f"{API}/auth/login", json={"email": None, "password": None}
        )
        user = client.get(f"{API}/auth/me", headers=resident_headers).json()
        old_login = client.post(
            f"{API}/auth/login", json={"email": user["email"], "password": "Passw0rd!Strong"}
        )
        assert old_login.status_code == 401
        new_login = client.post(
            f"{API}/auth/login", json={"email": user["email"], "password": "NewPassw0rd!"}
        )
        assert new_login.status_code == 200

    def test_change_password_wrong_current(self, client, resident_headers):
        resp = client.patch(
            f"{API}/users/me/password",
            headers=resident_headers,
            json={"current_password": "WrongPass1!", "new_password": "NewPassw0rd!"},
        )
        assert resp.status_code == 422
        assert resp.json()["detail"] == "current_password_incorrect"

    def test_change_password_weak_new(self, client, resident_headers):
        resp = client.patch(
            f"{API}/users/me/password",
            headers=resident_headers,
            json={"current_password": "Passw0rd!Strong", "new_password": "weakpass"},
        )
        assert resp.status_code == 422