import requests
from bs4 import BeautifulSoup


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

        title_tag = soup.find('title')
        if title_tag:
            title = title_tag.get_text()
        else:
            title = 'Title not found'

        paragraphs = soup.find_all('p')
        text = ' '.join([p.get_text() for p in paragraphs])

        return {'title': title, 'text': text}
    else:
        return None
