import requests
from bs4 import BeautifulSoup
import json
from datetime import datetime
import os

URL = "https://t.me/s/jigongnews"
OUTPUT_FILE = "posts.json"

def fetch_telegram_articles(url):
    print("Fetching Telegram messages...")
    res = requests.get(url)
    res.raise_for_status()

    soup = BeautifulSoup(res.text, "html.parser")
    messages = soup.select(".tgme_widget_message_text")

    articles = []
    for i, msg in enumerate(messages, 1):
        text = msg.get_text(strip=True)
        if text:
            articles.append({
                "id": i,
                "content": text
            })
    return articles

def load_old_posts():
    if os.path.exists(OUTPUT_FILE):
        with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return []

def save_posts(data):
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def is_new_data(old, new):
    return json.dumps(old, sort_keys=True) != json.dumps(new, sort_keys=True)

def write_log():
    with open("last_updated.txt", "w", encoding="utf-8") as f:
        f.write(f"Last updated at: {datetime.now().isoformat()}")

# 主程式流程
try:
    new_posts = fetch_telegram_articles(URL)
    old_posts = load_old_posts()

    if is_new_data(old_posts, new_posts):
        print("Detected new posts. Updating...")
        save_posts(new_posts)
        write_log()
    else:
        print("No new posts found. Skipping update.")
        write_log()

except Exception as e:
    print("❌ Crawler failed:", str(e))
    # 若要整合通知：這裡可加上 Line Notify 或 email 警示
