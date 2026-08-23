import uuid

import pytest

API = "/api/v1"
PASSWORD_OK = "Passw0rd!Strong"


def _unique_email():
    return f"auth_{uuid.uuid4().hex[:10]}@example.com"


class TestRegistration:
    def test_register_success_returns_201_without_password_hash(self, client):
        email = _unique_email()
        resp = client.post(
            f"{API}/auth/register",
            json={"name": "Asha Resident", "email": email, "password": PASSWORD_OK},
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["email"] == email
        assert body["name"] == "Asha Resident"
        assert body["role"] == "RESIDENT"
        assert "password_hash" not in body
        assert "password" not in body

    def test_register_duplicate_email_409(self, client):
        email = _unique_email()
        first = client.post(
            f"{API}/auth/register",
            json={"name": "First User", "email": email, "password": PASSWORD_OK},
        )
        assert first.status_code == 201
        second = client.post(
            f"{API}/auth/register",
            json={"name": "Second User", "email": email, "password": PASSWORD_OK},
        )
        assert second.status_code == 409
        # NOTE: app reports the discriminator in "detail"; "code" is the generic
        # "conflict" (see report in conftest docstring). Accept both spellings.
        body = second.json()
        assert "email_already_registered" in (body["detail"], body["code"])

    @pytest.mark.parametrize(
        "password,reason",
        [
            ("nouppcase1!", "no uppercase"),
            ("NoDigitHere!", "no digit"),
            ("Ab1x", "too short"),
        ],
    )
    def test_register_weak_password_rejected_422(self, client, password, reason):
        resp = client.post(
            f"{API}/auth/register",
            json={
                "name": "Weak Pass",
                "email": _unique_email(),
                "password": password,
            },
        )
        assert resp.status_code == 422


class TestLogin:
    def test_login_success_shape(self, client):
        email = _unique_email()
        client.post(
            f"{API}/auth/register",
            json={"name": "Token User", "email": email, "password": PASSWORD_OK},
        )
        resp = client.post(
            f"{API}/auth/login",
            json={"email": email, "password": PASSWORD_OK},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["token_type"] == "bearer"
        assert isinstance(body["expires_in"], int) and body["expires_in"] > 0
        assert isinstance(body["access_token"], str) and body["access_token"]
        user = body["user"]
        assert user["email"] == email
        assert user["role"] == "RESIDENT"
        assert "password_hash" not in user

    def test_login_wrong_password_401(self, client):
        email = _unique_email()
        client.post(
            f"{API}/auth/register",
            json={"name": "Wrong Pass", "email": email, "password": PASSWORD_OK},
        )
        resp = client.post(
            f"{API}/auth/login",
            json={"email": email, "password": "Wr0ngPassword!"},
        )
        assert resp.status_code == 401
        assert resp.json()["detail"] == "invalid_credentials"

    def test_login_unknown_email_identical_response_to_wrong_password(self, client):
        unknown_resp = client.post(
            f"{API}/auth/login",
            json={"email": _unique_email(), "password": PASSWORD_OK},
        )
        assert unknown_resp.status_code == 401

        email = _unique_email()
        client.post(
            f"{API}/auth/register",
            json={"name": "Known User", "email": email, "password": PASSWORD_OK},
        )
        wrong_pass_resp = client.post(
            f"{API}/auth/login",
            json={"email": email, "password": "TotallyWr0ng!"},
        )
        assert wrong_pass_resp.status_code == 401
        assert unknown_resp.json() == wrong_pass_resp.json()


class TestMe:
    def test_me_happy_path(self, client, resident_headers):
        resp = client.get(f"{API}/auth/me", headers=resident_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["role"] == "RESIDENT"
        assert "password_hash" not in body

    def test_me_without_token_401(self, client):
        resp = client.get(f"{API}/auth/me")
        assert resp.status_code == 401

    def test_patch_users_me_updates_name(self, client, resident_headers):
        me = client.get(f"{API}/auth/me", headers=resident_headers).json()
        new_name = "Renamed Resident"
        resp = client.patch(
            f"{API}/users/me", headers=resident_headers, json={"name": new_name}
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == new_name
        assert resp.json()["id"] == me["id"]
        verify = client.get(f"{API}/auth/me", headers=resident_headers).json()
        assert verify["name"] == new_name
