import openai
from pymongo import MongoClient
from linkedin import share

api_key = 'openAI_api_key'
API_ENDPOINT = "https://api.openai.com/v1/chat/completions"
openai.api_key = api_key
client = MongoClient("MongoDB_connection_string")
db = client.qbdb.my_collection


def ai(scraped_item, stripped_urls):
    max_context_length = 4097
    truncated_text = scraped_item['text'][:max_context_length]
    messages = [
        {"role": "system",
         "content": "You are a blogger. Write a blog in 2 paragraphs only. It should not look like raw data. Should be plagiarism free. Should be humanly not AI written."},
        {"role": "assistant",
         "content": scraped_item['title']},
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
    title = scraped_item['title']
    share(response, title)
    documents = [{'url': stripped_urls,
                  'title': scraped_item['title'],
                  'text': scraped_item['text'],
                  'blog': response}]
    db.create_index('url', unique=True)
    db.insert_many(documents)
    return item
