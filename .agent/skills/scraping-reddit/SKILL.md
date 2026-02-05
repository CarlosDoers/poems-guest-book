---
name: scraping-reddit
description: Extracts top posts and metadata from subreddits using Reddit's JSON API. Use when the user requests information from specific Reddit communities or needs to monitor trends.
---

# Scraping Reddit

## When to use this skill
- Fetching top/hot/new posts from a subreddit.
- Summarizing community discussions.
- Getting links and upvote counts for specific topics on Reddit.

## Workflow

### 1. Preparation
- [ ] Identify the target subreddit name (e.g., `n8n`, `programing`).
- [ ] Define the number of posts needed (default is 3).
- [ ] Ensure `requests` library is available in the environment.

### 2. Execution
1. Run the `reddit_scraper.py` script with the subreddit name.
2. Parse the JSON response provided by the script.
3. Present the results to the user with titles, scores, and links.

## Instructions

### URL Construction
Always append `.json` to the subreddit URL to get the data without needing an API key for public subreddits:
`https://www.reddit.com/r/<subreddit>/top.json?limit=3&t=day`

### User-Agent Requirement
Reddit requires a custom User-Agent to avoid 429 (Too Many Requests) errors. Use a descriptive one like:
`User-Agent: AntigravityBot/1.0 by CarlosDoers`

## Resources
- `scripts/reddit_scraper.py`: Python script for fetching and parsing the data.
