from backend.constants import ALLOWED_PROVIDER_TAGS
from backend.seed_demo_data import pick_provider_tags


def test_seed_tag_picker_stays_in_allowed_set():
    for index in range(40):
        tags = pick_provider_tags(index)
        assert tags
        assert all(tag in ALLOWED_PROVIDER_TAGS for tag in tags)
