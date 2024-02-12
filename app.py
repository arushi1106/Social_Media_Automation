import requests
from flask import Flask, jsonify
from flask_sqlalchemy import SQLAlchemy
import openai
from GoogleNews import GoogleNews
from datetime import datetime
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
    print(response)
    print("===============================")
    response = response.choices[0].message.content
    print(response)
    print("===========response===========")
    item = {'url': stripped_urls,
            'title': scraped_item['title'],
            'text': scraped_item['text'],
            'blog': response}

    linkedin(item)

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


def linkedin(item):
    client_id = '862fr2bt6pb2do'
    client_secret = 'GDq3nPz9I1i7jvGh'
    redirect_uri = 'https://www.linkedin.com/developers/tools/oauth/redirect'
    access_token = "AQUlh_ChYiHwIAIr_kkil75emU0s55ObvHmgnkPjXkgjfcfqMYDn0iAb2fdg7sYhO_-9UG8eUTEovsdI51SzaAWV_gRQsuLMg-JoVCTGZZB0dU9O7zmnVYXwzqS0eXPUMzykkFU3l9N_Gmy55rxeRs6t-rKmqgLVVo8dP5Zf3QLHSajTn-nQOiIWpZb03UDr09IYsd7TTE4ZgaBjsIVm6TnIsUimI_GkZJRmCucYe4C0VEm_9jHR38fhzFvbrePYrczdF7J2ILeN97Z_96pocI2XgOy5ElAezaPAaI9gH8ktyWMF04VVjsXQgsp30Jm5V_8BttBkiHzQt70mKlcFs1Z92JffUg"
    blog = item['blog']

    data = {
        "author": "urn:li:member:arushi-jain-73424b215",
        "lifecycleState": "PUBLISHED",
        "specificContent": {
            "com.linkedin.ugc.ShareContent": {
                "shareCommentary": {
                    "text": blog
                },
                "shareMediaCategory": "NONE"
            }
        },
        "visibility": {
            "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"
        }
    }

    # Make a POST request to share the blog
    url = 'https://api.linkedin.com/v2/ugcPosts'
    headers = {'Authorization': 'Bearer ' + access_token,
               'Content-Type': 'application/json',
               'X-Restli-Protocol-Version': '2.0.0'}
    response = requests.post(url, headers=headers, json=data)

    # Handle the response
    if response.status_code == 201:
        print("Blog shared successfully!")
    else:
        print("Error sharing blog:", response.text)

    return item


if __name__ == '__main__':
    app.run(debug=True)
