import requests
import json
import sys

def scrape_subreddit(subreddit, limit=3):
    url = f"https://www.reddit.com/r/{subreddit}/hot.json?limit={limit}"
    headers = {
        "User-Agent": "AntigravityBot/1.0 by CarlosDoers"
    }
    
    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        data = response.json()
        
        posts = data['data']['children']
        results = []
        
        for post in posts:
            p_data = post['data']
            results.append({
                "title": p_data['title'],
                "score": p_data['score'],
                "url": f"https://reddit.com{p_data['permalink']}",
                "author": p_data['author']
            })
            
        return results
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No subreddit provided"}))
    else:
        sub = sys.argv[1]
        lim = int(sys.argv[2]) if len(sys.argv) > 2 else 3
        print(json.dumps(scrape_subreddit(sub, lim), indent=2))
