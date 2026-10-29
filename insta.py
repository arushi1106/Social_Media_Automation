import requests
import pandas as pd
import time
import random


graph_url = 'https://graph.facebook.com/v15.0/'
token = 'meta_long_live_access_token'
pexels_api_key = 'pexels_api_key'
pexels_url = "https://api.pexels.com/v1/search"


def pexels(query='computer', per_page=5, page=1):
    headers = {"Authorization": pexels_api_key}
    params = {'query': query, 'per_page': per_page, 'page': page}

    response = requests.get(pexels_url, headers=headers, params=params)
    data = response.json()
    if 'photos' in data and data['photos']:
        return [photo['src']['medium'] for photo in data['photos']]
    else:
        return None


def post_image(instagram_account_id='instagramID_numerics', access_token=token):
    query = random.choice(['technology', 'laptop', 'ai', 'computer'])

    image_urls = pexels(query=query)
    if not image_urls:
        print("No images found.")
        return

    caption = pd.read_csv('titles.csv')
    if not caption.empty and 'blog' in caption:
        captions = random.choice(caption['blog'])
    else:
        print("No captions")

    for i, image_url in enumerate(image_urls):
        url = graph_url + instagram_account_id + '/media'
        param = dict()
        param['access_token'] = access_token
        param['caption'] = captions
        param['image_url'] = image_url
        response = requests.post(url, params=param)
        print(response)
        if response.status_code == 200:
            container_id = response.json().get('id')
            print(container_id)
            return container_id
        else:
            print(f"Error posting image {i + 1}: {response.text}")


def publish_container(instagram_account_id='instagramID_numerics', access_token=token):
    creation_id = post_image()
    url = graph_url + instagram_account_id + '/media_publish'
    param = dict()
    param['access_token'] = access_token
    param['creation_id'] = creation_id
    response = requests.post(url, params=param)
    print(response)
    response = response.json()
    print(response)
    return response


def main():
    while True:
        publish_container()
        time.sleep(60)


