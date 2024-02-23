import requests
import time
from random import choice
from gpt import ai

graph_url = 'https://graph.facebook.com/v19.0/'
token = "EAAKgK1ZA4l7YBO914jwlgw2NuodrUtRHZCPyhz2slkPI2uPkU8A4kxK036KMKZAR5vOoCvHqoTpTozNcvHxughtQc8MmHNZBR9bXcZB1C4B01VECLbdlyDKHtDAgYlfeveNetItZAHrZC1XcEmEpl4XCPZC3y7aZAhOjK55cEOMMzLlcveD2IB49VUU1RKL0ua2Vo"
pexels_api_key = "9KJsD81XxIWPasBJ4XeTPVPSfGfmDAKVsMmpLjGP3ZiHKjw2GJ6ZEbqd"
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


def post_image(title, pexels_data, instagram_account_id='17841464548297432', access_token=token):
    captions = title

    if not pexels_data:
        print("Error: No Pexels data available.")
        return None

    selected_photo = choice(pexels_data)

    image_url = selected_photo.get('src', {}).get('medium')

    if not image_url:
        print("Error: Image URL not found.")
        return None

    url = graph_url + instagram_account_id + '/media'
    param = {'access_token': access_token, 'caption': captions, 'image_url': image_url}
    response = requests.post(url, params=param)
    print(response)
    container_id = response.json().get('id')
    print(container_id)
    return container_id


def publish_container(creation_id, instagram_account_id='17841464548297432', access_token=token):
    url = graph_url + instagram_account_id + '/media_publish'
    param = {'access_token': access_token, 'creation_id': creation_id}
    response = requests.post(url, params=param)
    print(response)
    response = response.json()
    print(response)
    return response


previous_image_urls = set()


def main(scraped_item, stripped_urls):
    while True:
        title = ai(scraped_item, stripped_urls)  # Add arguments to the ai function call
        pexels_data = get_pexels_data(pexels_api_key, pexels_url)

        if pexels_data is None:
            print("Error fetching Pexels data. Retrying...")
            continue

        '''image_url = pexels_data['src']['medium']

        # Check if the image has already been posted
        if image_url in previous_image_urls:
            print("Image already posted. Choosing a new one.")
            continue

        previous_image_urls.add(image_url)'''

        creation_id = post_image(title, pexels_data)
        publish_container(creation_id)
        time.sleep(60)