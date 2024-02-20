import requests
import pandas as pd
import time
from random import choice

graph_url = 'https://graph.facebook.com/v19.0/'
token = "meta developer token(long lived)"
file = pd.read_csv("titles.csv")
pexels_api_key = "pexels "
pexels_url = "https://api.pexels.com/v1/curated"


def get_pexels_data(api_key, pexels_url):
    headers = {"Authorization": api_key}
    params = {'per_page': 1, 'page': 1, 'random': int(time.time())}  # Add a random query parameter
    response = requests.get(pexels_url, headers=headers, params=params)
    data = response.json()
    if 'photos' in data and data['photos']:
        return data['photos'][0]
    else:
        return None


def post_image(title, pexels_data, instagram_account_id='insta id numerics', access_token=token):
    captions = title
    image_url = pexels_data['src']['medium']

    url = graph_url + instagram_account_id + '/media'
    param = {'access_token': access_token, 'caption': captions, 'image_url': image_url}
    response = requests.post(url, params=param)
    print(response)
    container_id = response.json().get('id')
    print(container_id)
    return container_id


def publish_container(creation_id, instagram_account_id='insta id numerics', access_token=token):
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
        title = choice(file['blog'])
        pexels_data = get_pexels_data(pexels_api_key, pexels_url)

        if pexels_data is None:
            print("Error fetching Pexels data. Retrying...")
            continue

        image_url = pexels_data['src']['medium']

        # Check if the image has already been posted
        if image_url in previous_image_urls:
            print("Image already posted. Choosing a new one.")
            continue

        previous_image_urls.add(image_url)

        creation_id = post_image(title, pexels_data)
        publish_container(creation_id)
        time.sleep(60)

        # Break out of the loop after successfully posting a new image
        break


if __name__ == "__main__":
    main()
