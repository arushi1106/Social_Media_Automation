from flask import Flask, jsonify
from flask_sqlalchemy import SQLAlchemy
import openai
from eventregistry import *
from GoogleNews import GoogleNews
from bs4 import BeautifulSoup
import csv

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///demo.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

api_key = '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'
API_ENDPOINT = "https://api.openai.com/v1/chat/completions"
openai.api_key = api_key


class Demo(db.Model):
    serial = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    desc = db.Column(db.String(500), nullable=False)
    date_created = db.Column(db.DateTime, default=datetime)

    def __repr__(self) -> str:
        return f'{self.Serial}-{self.title}'


with app.app_context():
    db.create_all()


@app.route('/ai')
def ai(item):
    messages = [
        {"role": "system",
         "content": "You are a blogger. Write a blog. It should not look like raw data. Should be plagiarism "
                    "free. Should be humanly not AI written"},
        {"role": "assistant",
         "content": item['title']},
        {"role": "assistant",
         "content": item['text']}
    ]
    response = openai.chat.completions.create(model="gpt-3.5-turbo", messages=messages)
    print(response)
    print("===============================")
    response = response.choices[0].message.content
    print(response)
    print("===========response===========")

    item['blog'] = response

    return item


def strip_after_character(url, character='&'):
    index = url.find(character)
    if index != -1:
        return url[:index]
    else:
        return url


def scrape_data(url):
    response = requests.get(url, verify=False)
    if response.status_code == 200:
        soup = BeautifulSoup(response.content, 'html.parser')
        title = soup.find('title').get_text()
        paragraphs = soup.find_all('p')
        text = ' '.join([p.get_text() for p in paragraphs])
        return {'title': title, 'text': text}
    else:
        return None


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
            modified_blogs = [ai(scraped_item) for scraped_item in scraped_data if scraped_item]
            modified_blogs_data = modified_blogs.copy()

        # Write modified_blogs_data to a CSV file
        csv_filename = 'titles.csv'
        fieldnames = ['url', 'title', 'text', 'blog']

        with open(csv_filename, 'w', newline='', encoding='utf-8') as csvfile:
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            writer.writeheader()
            for data in modified_blogs_data:
                writer.writerow(data)

        return jsonify(news_results)
    else:
        return jsonify({'error': 'No news'})


if __name__ == '__main__':
    app.run(debug=True)
