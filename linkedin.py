import requests


def share(blog_content, title):
    url = "https://api.linkedin.com/v2/ugcPosts"
    if url:
        # url = "https://api.linkedin.com/v2/ugcPosts"
        access_token = "AQWKlP6cx4ywRJCp1WYRIEr4LGtQ17BHLfciBvsJtT1id2rBOT2vXm9DKAjudqSILdUTz3l5kToUIY5vVUk9X-4d1lPrIwjXnKMca7-zX5DJNW-fdmll4XbsX_PCKhBXSJkvDq5zSmeQPlKQAW_b65ptFBiDLenV3giYvDx293TrMgOIryeVL0TBwerWPN0LmyHO3LfRRW4qIAsTmhTYagFL0Jwoax2-yppqE0mA6jVJflPdrUxPB2n4M8tlgIERsCIVSM8xfAD3RUtxnHbc1oLoOizeyDUtKI-4CEw2feAf-5SU-wFVR-4h7tgGVtPt81wqMyc2wXXhR_xk2THQKPWC56ZiDw"

        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        data = {
            "author": "urn:li:person:MJ99SrG6ZL",
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
    else:
        print("not POST method")
