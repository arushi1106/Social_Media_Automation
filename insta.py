import requests
import time
from random import choice
import pandas as pd

graph_url = 'https://graph.facebook.com/v19.0/'
token = "meta_api_key"
pexels_api_key = "pexels_api_key"
pexels_url = "https://api.pexels.com/v1/search"


def get_pexels_data(api_key, pexels_url):
    headers = {"Authorization": api_key}
    params = {'query': 'computer', 'per_page': 5, 'page': 1}

    response = requests.get(pexels_url, headers=headers, params=params)
    data = response.json()
    if 'photos' in data and data['photos']:
        return data['photos']
    else:
        return None


def post_image(blog_text, pexels_data, instagram_account_id='', access_token=token):
    captions = blog_text

    selected_photo = choice(pexels_data)
    image_url = selected_photo['src']['medium']

    url = graph_url + instagram_account_id + '/media'
    param = {'access_token': access_token, 'caption': captions, 'image_url': image_url}
    response = requests.post(url, params=param)
    print(response)
    container_id = response.json().get('id')
    print(container_id)
    return container_id


def publish_container(creation_id, instagram_account_id='', access_token=token):
    url = graph_url + instagram_account_id + '/media_publish'
    param = {'access_token': access_token, 'creation_id': creation_id}
    response = requests.post(url, params=param)
    print(response)
    response = response.json()
    print(response)
    return response


previous_image_urls = set()


def main():
    while True:
        text = pd.read_csv('titles.csv')
        blog_text = text['blog']
        pexels_data = get_pexels_data(pexels_api_key, pexels_url)

        if pexels_data is None:
            print("Error fetching Pexels data. Retrying...")
            continue

        creation_id = post_image(blog_text, pexels_data)
        publish_container(creation_id)
        time.sleep(60)