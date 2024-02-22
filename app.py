import csv
from flask import Flask, jsonify
from openai import ai
from scraping import scrape_data, strip_after_character
from GoogleNews import GoogleNews
app = Flask(__name__)


@app.route('/')
def news_view():
    google_news = GoogleNews()
    google_news.search('GenAI')
    news_results = google_news.results()
    if news_results:
        urls = [link['link'] for link in news_results]  # Extract URL strings from dictionaries
        stripped_urls = [strip_after_character(url) for url in urls]  # Strip URLs
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
        # Write modified_blogs_data to a CSV file
        csv_filename = 'titles.csv'
        fieldnames = ['url', 'title', 'text', 'blog']
        with open(csv_filename, 'w', newline='', encoding='utf-8') as csvfile:
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            writer.writeheader()
            for data in modified_blogs:
                writer.writerow(data)
        return jsonify(news_results)
    else:
        return jsonify({'error': 'No news'})


if __name__ == '__main__':
    app.run(debug=True)
