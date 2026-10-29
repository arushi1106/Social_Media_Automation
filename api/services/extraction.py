def clean_url(url: str, character: str = "&") -> str:
    """Match scraping.strip_after_character without importing requests at module load."""
    index = url.find(character)
    return url[:index] if index != -1 else url


def extract_source(url: str) -> dict:
    from scraping import scrape_data

    cleaned_url = clean_url(url.strip())
    scraped = scrape_data(cleaned_url)
    if not scraped:
        raise ValueError(f"Could not extract content from {cleaned_url}")
    return {
        "url": cleaned_url,
        "title": (scraped.get("title") or "").strip(),
        "text": (scraped.get("text") or "").strip(),
    }
