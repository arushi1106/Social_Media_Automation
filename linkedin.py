import requests


def share(blog_content, title):
    url = "https://api.linkedin.com/v2/ugcPosts"
    access_token = "linkedin_access_token"

    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }
    data = {
        "author": "urn:li:person:UserID",
        "lifecycleState": "PUBLISHED",
        "specificContent": {
            "com.linkedin.ugc.ShareContent": {
                "shareCommentary": {
                    "text": f"{title}\n\n{blog_content}"
                },
                "shareMediaCategory": "NONE",
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
