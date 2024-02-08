from flask import Flask, render_template, request, redirect, jsonify
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
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


@app.route('/', methods=['GET', 'POST'])
def hello_world():
    if request.method == "POST":
        title = request.form['title']
        desc = request.form['desc']
        demo = Demo(title=title, desc=desc, date_created=datetime.now())
        db.session.add(demo)
        db.session.commit()
    all_demo = Demo.query.all()
    return render_template('index.html', all_demo=all_demo)
    # return 'Hello, World!'


@app.route('/show')
def products():
    all_demo = Demo.query.all()
    print(all_demo)
    return 'this is the products'


@app.route('/delete/<int:serial>')
def delete(serial):
    all_demo = Demo.query.filter_by(serial=serial).first()
    db.session.delete(all_demo)
    db.session.commit()
    return redirect('/')


@app.route('/ai')
def ai(scraped_data):

    #print("title===", scraped_data['title'])
    if request.method == 'GET':
        #news_response = requests.get('http://localhost:5000/news')  # Assuming the news endpoint is on the same server
        messages = [
            {"role": "system",
             "content": "You are a blogger. Write a blog. It should not look like a raw data. Should be plagiarism "
                        "free. Should be humanly not AI written"},
            {"role": "assistant",
             "content": scraped_data['title']},
            {"role": "assistant",
             "content": scraped_data['text']}
        ]
        response = openai.chat.completions.create(model="gpt-3.5-turbo", messages=messages)
        print("=========response============")
        print(response)
        response = response.choices[0].message.content
        print("====================================================")
        print(response)

        return response


@app.route('/update/<int:serial>', methods=['GET', 'POST'])
def update(serial):
    if request.method == 'POST':
        title = request.form['title']
        desc = request.form['desc']
        todo = Demo.query.filter_by(serial=serial).first()
        todo.title = title
        todo.desc = desc
        db.session.add(todo)
        db.session.commit()
        return redirect('/')

    todo = Demo.query.filter_by(serial=serial).first()
    return render_template('update.html', todo=todo)


@app.route('/newsfetch')
def news():
    event_registry = EventRegistry(apiKey='apiKey')

    query = QueryEvents(keywords="GenAI", sourceLocationUri=event_registry.getLocationUri("USA"))
    query.setRequestedResult(RequestEventsInfo(sortBy="date", count=10))
    result = (event_registry.execQuery(query))
    news_list = []
    if 'events' in result and 'results' in result['events'] and len(result['events']['results']) > 0:
        for event in result['events']['results']:
            news_summary = event['summary']
            news_title = event['title']
            news_list.append({'title': news_title, 'summary': news_summary})
    else:
        return jsonify({'error': 'No news found'})

    return jsonify(news_list)


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


@app.route('/news')
def news_view():
    google_news = GoogleNews()
    google_news.search('GenAI')
    news_results = google_news.results()
    #print(news_results[0])
    if news_results:
        urls = [link['link'] for link in news_results]  # Extract URL strings from dictionaries
        stripped_urls = [strip_after_character(url) for url in urls]  # Strip URLs
        # stripped_urls_dicts = [{'url': url} for url in stripped_urls]  # Convert back to dictionary format

        modified_blogs = []
        scraped_data = []

        for stripped_url in stripped_urls:
            data = scrape_data(stripped_url)
            if data:
                title = data['title']
                text = data['text']
                scraped_data.append({'url': stripped_url, 'title': title, 'text': text})
                #print(scraped_data)

            for scraped_item in scraped_data:
                #print("DEBUG: Scraped Item:", scraped_item)
                modified_blog = ai(scraped_item)
                if modified_blog:
                    blog = modified_blog
                    modified_blogs.append(blog)
                scraped_data.append({'blog': modified_blog})

        filename = 'titles.csv'
        with open(filename, 'w', newline='', encoding='utf-8') as f:
            w = csv.DictWriter(f, ['url', 'title', 'text', 'blog'])
            w.writeheader()
            w.writerows(scraped_data)

        return jsonify(news_results)
    else:
        return jsonify({'error': 'No news'})


if __name__ == '__main__':
    app.run(debug=True)
