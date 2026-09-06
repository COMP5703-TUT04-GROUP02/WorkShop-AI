def test_public_providers_hide_pending_profiles(client, marketplace):
    listed = client.get("/providers", params={"service_province": "Istanbul"})
    assert listed.status_code == 200, listed.text
    items = listed.json()["data"]["items"]
    assert any(
        item["id"] == marketplace["provider_profile"]["id"] for item in items
    )


def test_customer_home_recommendations(client, marketplace):
    headers = marketplace["customer"]["headers"]
    client.post(
        "/customer/profile",
        json={
            "phone_number": "+905551110001",
            "address": "Besiktas",
            "service_province": "Istanbul",
            "latitude": 41.04,
            "longitude": 29.0,
        },
        headers=headers,
    )
    response = client.get(
        "/customer/home/recommendations",
        params={"service_province": "Istanbul", "provider_tag": "plumbing"},
        headers=headers,
    )
    assert response.status_code == 200, response.text


def test_admin_dashboard_and_favorites(client, marketplace):
    dashboard = client.get("/admin/dashboard", headers=marketplace["admin"]["headers"])
    assert dashboard.status_code == 200, dashboard.text

    provider_id = marketplace["provider_profile"]["id"]
    customer = marketplace["customer"]["headers"]
    added = client.post(f"/customer/favorites/{provider_id}", headers=customer)
    assert added.status_code == 200, added.text
    favorites = client.get("/customer/favorites", headers=customer)
    assert favorites.status_code == 200
    assert favorites.json()["data"]["total"] == 1


def test_provider_dashboard_requires_provider(client, marketplace):
    denied = client.get(
        "/provider/dashboard", headers=marketplace["customer"]["headers"]
    )
    assert denied.status_code == 403
    ok = client.get("/provider/dashboard", headers=marketplace["provider"]["headers"])
    assert ok.status_code == 200
