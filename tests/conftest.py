import os
import tempfile

os.environ["DATABASE_URL"] = "postgresql+psycopg://smt:smt@localhost:5433/smt_test"
os.environ["EMAIL_ENABLED"] = "false"
os.environ["UPLOAD_DIR"] = str(tempfile.mkdtemp(prefix="smt_uploads_test_"))

import uuid

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

ADMIN_URL = "postgresql+psycopg://smt:smt@localhost:5433/postgres"
TEST_DB_URL = os.environ["DATABASE_URL"]
API = "/api/v1"
ADMIN_EMAIL = "admin@example.com"
ADMIN_PASSWORD = "Admin123!ChangeMe"

TABLES = [
    "users",
    "categories",
    "complaints",
    "complaint_history",
    "notices",
    "system_settings",
]


def _recreate_test_database() -> None:
    admin_engine = create_engine(ADMIN_URL, isolation_level="AUTOCOMMIT")
    try:
        with admin_engine.connect() as conn:
            conn.execute(
                text(
                    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                    "WHERE datname = 'smt_test' AND pid <> pg_backend_pid()"
                )
            )
            conn.execute(text("DROP DATABASE IF EXISTS smt_test"))
            conn.execute(text("CREATE DATABASE smt_test"))
    finally:
        admin_engine.dispose()


def _run_migrations() -> None:
    cfg = Config("alembic.ini")
    command.upgrade(cfg, "head")


_recreate_test_database()
_run_migrations()

engine = create_engine(TEST_DB_URL, pool_pre_ping=True)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


@pytest.fixture()
def db():
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        with engine.begin() as conn:
            conn.execute(text(f"TRUNCATE {', '.join(TABLES)} RESTART IDENTITY CASCADE"))


def _override_get_db():
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client():
    from app.db.session import get_db
    from app.main import app

    app.dependency_overrides[get_db] = _override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


def register_and_login(client, email_suffix):
    """Register a fresh resident and log in. Returns the token payload dict
    (access_token, token_type, expires_in, user)."""
    email = f"user_{uuid.uuid4().hex[:10]}_{email_suffix}@example.com"
    register_resp = client.post(
        f"{API}/auth/register",
        json={
            "name": f"Resident {email_suffix}",
            "email": email,
            "password": "Passw0rd!Strong",
        },
    )
    assert register_resp.status_code == 201, register_resp.text
    login_resp = client.post(
        f"{API}/auth/login",
        json={"email": email, "password": "Passw0rd!Strong"},
    )
    assert login_resp.status_code == 200, login_resp.text
    return login_resp.json()


@pytest.fixture()
def resident_headers(client):
    token_data = register_and_login(client, "resident")
    return {"Authorization": f"Bearer {token_data['access_token']}"}


@pytest.fixture()
def second_resident_headers(client):
    token_data = register_and_login(client, "resident2")
    return {"Authorization": f"Bearer {token_data['access_token']}"}


@pytest.fixture()
def admin_headers(client, db):
    from app.core.enums import Role
    from app.core.security import hash_password
    from app.models.user import User

    existing = db.query(User).filter(User.email == ADMIN_EMAIL).first()
    if existing is None:
        db.add(
            User(
                id=uuid.uuid4(),
                name="Society Admin",
                email=ADMIN_EMAIL,
                password_hash=hash_password(ADMIN_PASSWORD),
                role=Role.ADMIN,
                is_active=True,
            )
        )
        db.commit()
    login_resp = client.post(
        f"{API}/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    assert login_resp.status_code == 200, login_resp.text
    return {"Authorization": f"Bearer {login_resp.json()['access_token']}"}


@pytest.fixture()
def category_factory(client, admin_headers):
    def _create(name="Plumbing", description=None):
        resp = client.post(
            f"{API}/categories",
            headers=admin_headers,
            json={"name": name, "description": description},
        )
        assert resp.status_code == 201, resp.text
        return resp.json()

    return _create


@pytest.fixture()
def complaint_factory(client, category_factory):
    def _create(resident_headers, category_id=None, description="Leaking tap in bathroom", with_photo=False):
        if category_id is None:
            category_id = category_factory()["id"]
        kwargs = {}
        if with_photo:
            kwargs["files"] = {"photo": ("test.png", b"\x89PNG fake bytes", "image/png")}
        resp = client.post(
            f"{API}/complaints",
            headers=resident_headers,
            data={"category_id": str(category_id), "description": description},
            **kwargs,
        )
        assert resp.status_code == 201, resp.text
        return resp.json()

    return _create
