import csv
import os
from flask import Flask, jsonify
from gpt import ai
from scraping import scrape_data, strip_after_character
from GoogleNews import GoogleNews
from insta import main
app = Flask(__name__)

# Legacy scrape-and-publish entry point. Content Studio uses `make dev-api` / `make dev-web`.
# This file is not imported by FastAPI or Next.js.


def _legacy_publish_allowed() -> bool:
    return os.environ.get("ALLOW_LEGACY_PUBLISH") == "1"


@app.route('/')
def news_view():
    if not _legacy_publish_allowed():
        return jsonify({
            "error": "Legacy Flask publisher is disabled. Use make dev-api and make dev-web for Content Studio.",
            "hint": "Set ALLOW_LEGACY_PUBLISH=1 only if you intend to run the old scrape-and-publish path.",
        }), 403
    google_news = GoogleNews()
    google_news.search('GenAI')
    news_results = google_news.results()
    if news_results:
        urls = [link['link'] for link in news_results]
        stripped_urls = [strip_after_character(url) for url in urls]
        scraped_data = []
        for url in stripped_urls:
            data = scrape_data(url)
            if data:
                scraped_data.append(data)
        if scraped_data:
            modified_blogs = []
            for scraped_item, stripped_url in zip(scraped_data, stripped_urls):
                item = ai(scraped_item, stripped_url)
                modified_blogs.append(item)
        csv_filename = 'titles.csv'
        fieldnames = ['url', 'title', 'text', 'blog']
        with open(csv_filename, 'w', newline='', encoding='utf-8') as csvfile:
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            writer.writeheader()
            for data in modified_blogs:
                if data is not None:
                    data_to_write = {key: value for key, value in data.items() if key in fieldnames}
                    writer.writerow(data_to_write)

        main()

        return jsonify(news_results)
    else:
        return jsonify({'error': 'No news'})


if __name__ == '__main__':
    if not _legacy_publish_allowed():
        raise SystemExit(
            "Legacy Flask publisher is disabled. Content Studio uses `make dev-api` and `make dev-web`. "
            "Set ALLOW_LEGACY_PUBLISH=1 only if you intend to run the old scrape-and-publish path."
        )
    app.run(debug=True)
