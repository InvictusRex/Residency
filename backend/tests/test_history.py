from tests.conftest import API


def _history(client, headers, complaint_id):
    return client.get(f"{API}/complaints/{complaint_id}/history", headers=headers)


class TestHistoryOnCreation:
    def test_creation_inserts_one_open_row_with_creator_actor(
        self, client, resident_headers, category_factory
    ):
        category = category_factory(name="Plumbing")
        create_resp = client.post(
            f"{API}/complaints",
            headers=resident_headers,
            data={
                "category_id": str(category["id"]),
                "description": "Leaking tap in bathroom",
            },
        )
        assert create_resp.status_code == 201, create_resp.text
        complaint = create_resp.json()
        resident_id = complaint["resident"]["id"]

        resp = _history(client, resident_headers, complaint["id"])
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["complaint_id"] == complaint["id"]
        assert len(body["items"]) == 1

        entry = body["items"][0]
        assert entry["status"] == "OPEN"
        assert entry["note"] == "Complaint created"
        assert entry["actor"]["id"] == resident_id
        assert entry["actor"]["role"] == "RESIDENT"


class TestFullLifecycleHistory:
    def test_lifecycle_produces_three_chronological_rows(
        self, client, admin_headers, resident_headers, category_factory
    ):
        category = category_factory(name="Electrical")
        create_resp = client.post(
            f"{API}/complaints",
            headers=resident_headers,
            data={
                "category_id": str(category["id"]),
                "description": "Fan making loud noise",
            },
        )
        assert create_resp.status_code == 201, create_resp.text
        complaint = create_resp.json()
        cid = complaint["id"]
        resident_id = complaint["resident"]["id"]

        first = client.patch(
            f"{API}/complaints/{cid}/status",
            headers=admin_headers,
            json={"status": "IN_PROGRESS", "note": "Technician scheduled"},
        )
        assert first.status_code == 200, first.text

        second = client.patch(
            f"{API}/complaints/{cid}/status",
            headers=admin_headers,
            json={"status": "RESOLVED", "note": "Motor replaced"},
        )
        assert second.status_code == 200, second.text

        resp = _history(client, resident_headers, cid)
        assert resp.status_code == 200, resp.text
        items = resp.json()["items"]

        assert len(items) == 3
        assert [entry["status"] for entry in items] == [
            "OPEN",
            "IN_PROGRESS",
            "RESOLVED",
        ]
        assert [entry["actor"]["role"] for entry in items] == [
            "RESIDENT",
            "ADMIN",
            "ADMIN",
        ]
        assert items[0]["actor"]["id"] == resident_id

        timestamps = [entry["created_at"] for entry in items]
        assert timestamps == sorted(timestamps)

        notes = [entry["note"] for entry in items]
        assert notes[0] == "Complaint created"
        assert notes[1] == "Technician scheduled"
        assert notes[2] == "Motor replaced"

    def test_status_change_without_note_stored_as_null(
        self, client, admin_headers, resident_headers, complaint_factory
    ):
        complaint = complaint_factory(resident_headers)
        resp = client.patch(
            f"{API}/complaints/{complaint['id']}/status",
            headers=admin_headers,
            json={"status": "IN_PROGRESS"},
        )
        assert resp.status_code == 200, resp.text

        history = _history(client, admin_headers, complaint["id"]).json()["items"]
        assert len(history) == 2
        assert history[1]["note"] is None


class TestHistoryImmutability:
    def test_repeated_gets_identical(
        self, client, admin_headers, resident_headers, complaint_factory
    ):
        complaint = complaint_factory(resident_headers)
        first = _history(client, admin_headers, complaint["id"])
        assert first.status_code == 200
        second = _history(client, admin_headers, complaint["id"])
        assert second.status_code == 200
        assert first.json() == second.json()

    def test_no_mutation_methods_on_history_route(
        self, client, admin_headers, resident_headers, complaint_factory
    ):
        complaint = complaint_factory(resident_headers)
        url = f"{API}/complaints/{complaint['id']}/history"
        resp = client.post(url, headers=admin_headers, json={"status": "OPEN"})
        assert resp.status_code == 405, f"POST returned {resp.status_code}"
        resp = client.patch(url, headers=admin_headers, json={"status": "OPEN"})
        assert resp.status_code == 405, f"PATCH returned {resp.status_code}"
        resp = client.delete(url, headers=admin_headers)
        assert resp.status_code == 405, f"DELETE returned {resp.status_code}"


class TestHistoryAccessControl:
    def test_other_resident_gets_404(
        self, client, resident_headers, second_resident_headers, complaint_factory
    ):
        complaint = complaint_factory(resident_headers)
        resp = _history(client, second_resident_headers, complaint["id"])
        assert resp.status_code == 404
        assert resp.json()["detail"] == "complaint_not_found"

    def test_admin_can_view_any_history(
        self, client, admin_headers, resident_headers, complaint_factory
    ):
        complaint = complaint_factory(resident_headers)
        resp = _history(client, admin_headers, complaint["id"])
        assert resp.status_code == 200, resp.text
        assert len(resp.json()["items"]) == 1

    def test_owner_can_view_own_history(
        self, client, resident_headers, complaint_factory
    ):
        complaint = complaint_factory(resident_headers)
        resp = _history(client, resident_headers, complaint["id"])
        assert resp.status_code == 200, resp.text

class TestProgressNotes:
    def _note(self, client, headers, complaint_id, note="Plumber arrived on site."):
        return client.post(
            f"{API}/complaints/{complaint_id}/notes",
            headers=headers,
            json={"note": note},
        )

    def test_admin_posts_progress_note_appears_in_history(
        self, client, admin_headers, resident_headers, complaint_factory
    ):
        complaint = complaint_factory(resident_headers)
        resp = self._note(client, admin_headers, complaint["id"], "Plumber dispatched to unit 4B.")
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["status"] == "OPEN"
        assert body["note"] == "Plumber dispatched to unit 4B."
        assert body["actor"]["role"] == "ADMIN"
        history = _history(client, admin_headers, complaint["id"]).json()
        assert len(history["items"]) == 2
        assert history["items"][1]["note"] == "Plumber dispatched to unit 4B."

    def test_note_preserves_current_in_progress_status(
        self, client, admin_headers, resident_headers, complaint_factory
    ):
        complaint = complaint_factory(resident_headers)
        client.patch(
            f"{API}/complaints/{complaint['id']}/status",
            headers=admin_headers,
            json={"status": "IN_PROGRESS", "note": "Work started"},
        )
        resp = self._note(client, admin_headers, complaint["id"], "Waiting on replacement valve.")
        assert resp.status_code == 201, resp.text
        assert resp.json()["status"] == "IN_PROGRESS"

    def test_resident_cannot_post_note(
        self, client, resident_headers, second_resident_headers, complaint_factory
    ):
        complaint = complaint_factory(resident_headers)
        resp = self._note(client, resident_headers, complaint["id"])
        assert resp.status_code == 403

    def test_note_on_resolved_complaint_rejected(
        self, client, admin_headers, resident_headers, complaint_factory
    ):
        complaint = complaint_factory(resident_headers)
        client.patch(
            f"{API}/complaints/{complaint['id']}/status",
            headers=admin_headers,
            json={"status": "RESOLVED", "note": "Fixed"},
        )
        resp = self._note(client, admin_headers, complaint["id"])
        assert resp.status_code == 422
        assert resp.json()["detail"] == "resolved_complaint_is_closed"

    def test_empty_note_rejected(
        self, client, admin_headers, resident_headers, complaint_factory
    ):
        complaint = complaint_factory(resident_headers)
        resp = self._note(client, admin_headers, complaint["id"], "   ")
        assert resp.status_code == 422
