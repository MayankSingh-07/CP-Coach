import httpx
import asyncio
from datetime import datetime, timedelta
from typing import List, Dict, Any
import time
import logging

logger = logging.getLogger(__name__)

# Simple in-memory cache for API payloads
cache = {
    "problemset": {"data": None, "timestamp": 0},
    "contests": {"data": None, "timestamp": 0},
    "users": {} # handle -> {"submissions": (data, ts), "info": (data, ts), "rating": (data, ts)}
}
CACHE_TTL = 1 * 60 * 60  # 1 hour in seconds
PROBLEMSET_TTL = 12 * 60 * 60 # 12 hours for global problemset

CODEFORCES_API_URL = "https://codeforces.com/api"

# M-5: standard timeout for all Codeforces API calls
CF_TIMEOUT = httpx.Timeout(15.0)

async def get_user_submissions(handle: str, force_refresh: bool = False) -> List[Dict[str, Any]]:
    """
    Fetch user submission history via Codeforces API asynchronously.
    """
    current_time = time.time()
    if handle not in cache["users"]:
        cache["users"][handle] = {}
        
    if not force_refresh and "submissions" in cache["users"][handle]:
        data, ts = cache["users"][handle]["submissions"]
        if current_time - ts < CACHE_TTL:
            return data
            
    url = f"{CODEFORCES_API_URL}/user.status?handle={handle}"
    
    async with httpx.AsyncClient(timeout=CF_TIMEOUT) as client:
        response = await client.get(url)
        if response.status_code != 200:
            raise Exception(f"Failed to fetch submissions for {handle}: {response.text}")
        
        data = response.json()
        if data["status"] != "OK":
            raise Exception(f"Codeforces API error: {data.get('comment', 'Unknown error')}")
            
        result = data["result"]
        cache["users"][handle]["submissions"] = (result, current_time)
        return result

def filter_failed_submissions(submissions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Filter submissions by verdict: isolate non-OK verdicts.
    """
    failed_verdicts = {"TIME_LIMIT_EXCEEDED", "WRONG_ANSWER", "RUNTIME_ERROR", "MEMORY_LIMIT_EXCEEDED"}
    failed_subs = []
    
    for sub in submissions:
        verdict = sub.get("verdict")
        if verdict in failed_verdicts:
            problem = sub.get("problem", {})
            failed_subs.append({
                "problem_id": f"{problem.get('contestId', '')}{problem.get('index', '')}",
                "verdict": verdict,
                "rating": problem.get("rating", 0),
                "tags": problem.get("tags", []),
                "submitted_at": datetime.fromtimestamp(sub.get("creationTimeSeconds", 0))
            })
            
    return failed_subs

async def get_user_info(handle: str, force_refresh: bool = False) -> Dict[str, Any]:
    """
    Fetch user basic info (rating, max rating).
    """
    current_time = time.time()
    if handle not in cache["users"]:
        cache["users"][handle] = {}
        
    if not force_refresh and "info" in cache["users"][handle]:
        data, ts = cache["users"][handle]["info"]
        if current_time - ts < CACHE_TTL:
            return data
            
    url = f"{CODEFORCES_API_URL}/user.info?handles={handle}"
    
    async with httpx.AsyncClient(timeout=CF_TIMEOUT) as client:
        response = await client.get(url)
        if response.status_code != 200:
            raise Exception(f"Failed to fetch user info for {handle}")
            
        data = response.json()
        if data["status"] != "OK":
            raise Exception(f"Codeforces API error: {data.get('comment', 'Unknown error')}")
            
        user_info = data["result"][0]
        result = {
            "handle": user_info.get("handle"),
            "rating": user_info.get("rating", 0),
            "max_rating": user_info.get("maxRating", 0),
            "rank": user_info.get("rank", "unrated")
        }
        cache["users"][handle]["info"] = (result, current_time)
        return result

async def get_user_rating_history(handle: str, force_refresh: bool = False) -> List[Dict[str, Any]]:
    """
    Fetch user rating history to find their latest contests.
    """
    current_time = time.time()
    if handle not in cache["users"]:
        cache["users"][handle] = {}
        
    if not force_refresh and "rating" in cache["users"][handle]:
        data, ts = cache["users"][handle]["rating"]
        if current_time - ts < CACHE_TTL:
            return data
            
    url = f"{CODEFORCES_API_URL}/user.rating?handle={handle}"
    
    async with httpx.AsyncClient(timeout=CF_TIMEOUT) as client:
        response = await client.get(url)
        if response.status_code != 200:
            return []
            
        data = response.json()
        if data.get("status") != "OK":
            return []
            
        result = data.get("result", [])
        cache["users"][handle]["rating"] = (result, current_time)
        return result

def calculate_user_statistics(submissions: List[Dict[str, Any]], user_info: Dict[str, Any]) -> Dict[str, Any]:
    """
    Calculate deep statistics from user's submission history.
    """
    solved_problems = set()
    total_submissions = len(submissions)
    ok_submissions = 0
    language_counts = {}
    
    for sub in submissions:
        prob = sub.get("problem", {})
        prob_id = f"{prob.get('contestId', '')}{prob.get('index', '')}"
        
        lang = sub.get("programmingLanguage")
        if lang:
            language_counts[lang] = language_counts.get(lang, 0) + 1
            
        if sub.get("verdict") == "OK":
            solved_problems.add(prob_id)
            ok_submissions += 1
            
    accuracy = (ok_submissions / total_submissions * 100) if total_submissions > 0 else 0
    
    fav_language = "N/A"
    if language_counts:
        fav_language = max(language_counts.items(), key=lambda x: x[1])[0]
        
    return {
        "total_solved": len(solved_problems),
        "accuracy": round(accuracy, 1),
        "max_rating": user_info.get("max_rating", 0),
        "favorite_language": fav_language
    }

async def get_problemset(force_refresh: bool = False) -> List[Dict[str, Any]]:
    """
    Fetch and cache the full Codeforces problemset.
    """
    current_time = time.time()
    if not force_refresh and cache["problemset"]["data"] and (current_time - cache["problemset"]["timestamp"] < PROBLEMSET_TTL):
        return cache["problemset"]["data"]
    
    async with httpx.AsyncClient(timeout=CF_TIMEOUT) as client:
        logger.info("Fetching problemset from Codeforces API...")
        response = await client.get(f"{CODEFORCES_API_URL}/problemset.problems")
        if response.status_code != 200:
            return []
            
        data = response.json()
        if data["status"] == "OK":
            cache["problemset"] = {
                "data": data["result"]["problems"],
                "timestamp": current_time
            }
            return data["result"]["problems"]
        return []

async def get_recent_contests(force_refresh: bool = False) -> List[Dict[str, Any]]:
    """
    Fetches the list of all contests. Caches the result.
    """
    current_time = time.time()
    
    if not force_refresh and cache["contests"]["data"] and (current_time - cache["contests"]["timestamp"] < PROBLEMSET_TTL):
        logger.info("Returning contests from cache")
        return cache["contests"]["data"]
        
    async with httpx.AsyncClient(timeout=CF_TIMEOUT) as client:
        logger.info("Fetching contests from Codeforces API...")
        response = await client.get(f"{CODEFORCES_API_URL}/contest.list")
        if response.status_code != 200:
            logger.error(f"Failed to fetch contests: {response.status_code}")
            return []
            
        data = response.json()
        if data["status"] == "OK":
            cache["contests"] = {
                "data": data["result"],
                "timestamp": current_time
            }
            return data["result"]
        return []
