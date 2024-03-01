import openai
from pymongo import MongoClient
from linkedin import share
from pymongo.errors import DuplicateKeyError


api_key = 'openAI_api_key'
API_ENDPOINT = "https://api.openai.com/v1/chat/completions"
openai.api_key = api_key
client = MongoClient("MongoDB_connection")
db = client.qbdb.my_collection


def ai(scraped_item, stripped_urls):
    max_context_length = 4097
    messages = [
        {"role": "system",
         "content": "You are a blogger. You need to write a blog in two paragraphs that is plagiarism-free, written in a humanly way, and not resemble raw data. Give hashtags in lowercase. The source should not be revealed."},
        {"role": "assistant",
         "content": scraped_item['title']}
    ]

    if 'text' in scraped_item and scraped_item['text']:
        text_content = scraped_item['text']
        if len(text_content) > max_context_length:
            truncated_text = text_content[:max_context_length]
        else:
            truncated_text = text_content
        messages = [
            {"role": "assistant",
             "content": truncated_text}
    ]
    response = openai.chat.completions.create(model="gpt-3.5-turbo", messages=messages)
    print("Original response length:", len(response.choices[0].message.content))
    # print("===============================")
    response = response.choices[0].message.content
    # print("===========response===========")
    item = {'url': stripped_urls,
            'title': scraped_item['title'],
            'text': scraped_item['text'],
            'blog': response}
    try:
        db.create_index('url', unique=True)
        db.insert_one(item)
        title = scraped_item['title']
        share(response, title)
    except DuplicateKeyError:
        print(f"Skipping duplicate URL: {stripped_urls}")
        return None

    return item
