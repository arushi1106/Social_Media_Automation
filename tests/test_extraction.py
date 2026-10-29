from api.services.extraction import clean_url


def test_strip_tracking_query():
    url = "https://example.com/article?id=1&utm_source=news"
    assert clean_url(url) == "https://example.com/article?id=1"


def test_strip_leaves_clean_url():
    url = "https://example.com/article"
    assert clean_url(url) == url
