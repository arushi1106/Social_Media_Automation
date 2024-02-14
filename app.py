import csv
from datetime import datetime
import openai
import requests
from GoogleNews import GoogleNews
from bs4 import BeautifulSoup
from flask import Flask, jsonify
from flask_sqlalchemy import SQLAlchemy

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///demo.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)
api_key = 'api_key'
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
def ai(scraped_item, stripped_urls):
    max_context_length = 4097
    truncated_text = scraped_item['text'][:max_context_length]
    messages = [
        {"role": "system",
         "content": "You are a blogger. Write a blog. It should not look like raw data. Should be plagiarism "
                    "free. Should be humanly not AI written"},
        {"role": "assistant",
         "content": scraped_item['title']},
        {"role": "assistant",
         "content": truncated_text}
    ]
    response = openai.chat.completions.create(model="gpt-3.5-turbo", messages=messages)
    # print(response)
    # print("===============================")
    response = response.choices[0].message.content
    # print(response)
    # print("===========response===========")
    item = {'url': stripped_urls,
            'title': scraped_item['title'],
            'text': scraped_item['text'],
            'blog': response}

    share(response)
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


def share(blog_content):
    url = "https://api.linkedin.com/v2/ugcPosts"
    if url:
        access_token = "access_token"
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }

        data = {
            "author": "urn:li:person:Ud1xZb_nTB",
            "lifecycleState": "PUBLISHED",
            "specificContent": {
                "com.linkedin.ugc.ShareContent": {
                    "shareCommentary": {
                        "text": blog_content
                    },
                    "shareMediaCategory": "NONE"
                }
            },
            "visibility": {
                "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"
            }
        }

        response = requests.post(url, headers=headers, json=data)
        if response.status_code == 201:
            print("Successfully shared on LinkedIn!")
        else:
            print(f"Failed to share on LinkedIn. Status code: {response.status_code}")
            print(response.text)
    else:
        print("not POST method")


if __name__ == '__main__':
    app.run(debug=True)