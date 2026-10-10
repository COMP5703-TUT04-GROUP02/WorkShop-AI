import re
from pathlib import Path

from backend.main import app

NGINX_CONF = Path(__file__).resolve().parent.parent / "docker" / "web" / "nginx.conf"


def test_web_nginx_forwards_every_api_route():
    """The web container serves the app and the API on one origin.

    nginx forwards only the paths it lists to the API; anything else gets the
    app's index.html. A new endpoint missing from the list works locally but
    returns HTML behind nginx.
    """
    conf = NGINX_CONF.read_text(encoding="utf-8")
    api_pattern = re.compile(re.search(r"location ~ (\^/\(.*?\)\(/\|\$\))", conf).group(1))
    prefix_locations = re.findall(r"location (/[\w./-]+)", conf)

    def forwarded(path: str) -> bool:
        return bool(api_pattern.match(path)) or any(path.startswith(p) for p in prefix_locations)

    # OpenAPI lists every endpoint, including those of nested routers.
    missing = sorted(
        path for path in app.openapi()["paths"] if path != "/" and not forwarded(path)
    )
    assert missing == [], f"Add these to docker/web/nginx.conf: {missing}"


def test_web_nginx_leaves_app_pages_to_the_app():
    conf = NGINX_CONF.read_text(encoding="utf-8")
    api_pattern = re.compile(re.search(r"location ~ (\^/\(.*?\)\(/\|\$\))", conf).group(1))

    for page in ("/Help", "/Main/Account", "/payment-result"):
        assert not api_pattern.match(page), page
