import re
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, Any
from pydantic import BaseModel
import asyncio

from ..core.database import get_db
from app.services.codeforces import (
    get_user_submissions,
    get_user_info,
    get_user_rating_history,
    calculate_user_statistics,
    get_problemset,
    get_recent_contests
)
from ..services.recommender import process_user_data, generate_roadmap, generate_upsolve_recommendations

router = APIRouter()

# H-2: Codeforces handles are alphanumeric with underscores, hyphens, dots, 3-24 chars
HANDLE_RE = re.compile(r'^[a-zA-Z0-9_\-\.]{3,24}$')

def validate_handle(handle: str) -> str:
    """H-2 + L-6: Validate and normalize a Codeforces handle."""
    # L-6: normalize case so "Mayank" and "mayank" map to the same user
    handle = handle.strip()
    if not HANDLE_RE.match(handle):
        raise HTTPException(
            status_code=422,
            detail=f"Invalid Codeforces handle '{handle}'. Must be 3-24 characters: letters, digits, hyphens, underscores, or dots."
        )
    return handle


class ChatRequest(BaseModel):
    query: str
    problem_id: str
    problem_name: str = ""
    code: str = ""

class ChatResponse(BaseModel):
    response: str

class TargetPracticeRequest(BaseModel):
    handle: str
    tag: str
    force_refresh: bool = False

class AnalysisResponse(BaseModel):
    handle: str
    rating: int
    tag_analysis: list
    roadmap: dict
    stats: Dict[str, Any]
    tag_coverage: Dict[str, Any]
    upsolve: Dict[str, Any]
    last_synced: str

@router.post("/analyze/{handle}", response_model=AnalysisResponse)
async def analyze_profile(handle: str, force_refresh: bool = False, db: AsyncSession = Depends(get_db)):
    try:
        from datetime import datetime

        # H-2 + L-6: validate and normalize handle
        handle = validate_handle(handle)

        submissions = await get_user_submissions(handle, force_refresh)

        user_info, rating_history, problemset, recent_contests = await asyncio.gather(
            get_user_info(handle, force_refresh),
            get_user_rating_history(handle, force_refresh),
            get_problemset(force_refresh),
            get_recent_contests(force_refresh)
        )

        user_rating = user_info.get("rating", 0)

        # Sync tracking layer first so bandit offsets include latest rewards
        from app.services.tracking import sync_and_calculate_rewards, save_recommendations, save_bandit_offsets, get_bandit_offsets
        tracked_rewards = await sync_and_calculate_rewards(handle, submissions, db)

        # M-1: load persisted bandit offsets so the MAB learns across sessions
        persisted_offsets = await get_bandit_offsets(handle, db)

        # O(N) single-pass advanced processing
        processed_data = process_user_data(submissions, user_info, problemset, tracked_rewards, persisted_offsets)
        tag_analysis = processed_data.get("tag_analysis", [])
        stats = processed_data.get("stats", {})
        tag_coverage = processed_data.get("tag_coverage", {})
        dynamic_offsets = processed_data.get("dynamic_offsets", {})

        roadmap = generate_roadmap(tag_analysis, problemset, submissions)
        upsolve = generate_upsolve_recommendations(tag_analysis, problemset, submissions, recent_contests, user_rating)

        # M-1: persist updated bandit offsets back to DB
        if dynamic_offsets:
            await save_bandit_offsets(handle, dynamic_offsets, db)

        # Persist new recommendations for future outcome tracking
        # C-3: only AI picks have a "tag" field; save_recommendations now skips tag-less items
        import copy
        all_recs = copy.deepcopy(roadmap.get("recommended_problems", [])) + copy.deepcopy(upsolve.get("recommended_problems", []))
        await save_recommendations(handle, all_recs, db)

        # Strip tags from upsolve per option A (spoiler-free default)
        for r in upsolve.get("recommended_problems", []):
            if "tag" in r:
                del r["tag"]

        # Return analysis
        return AnalysisResponse(
            handle=user_info["handle"],
            rating=user_rating,
            tag_analysis=tag_analysis,
            roadmap=roadmap,
            stats=stats,
            tag_coverage=tag_coverage,
            upsolve=upsolve,
            last_synced=datetime.now().isoformat()
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/practice/target")
async def get_target_practice(req: TargetPracticeRequest, db: AsyncSession = Depends(get_db)):
    try:
        from datetime import datetime

        # H-2 + L-6: validate and normalize handle
        handle = validate_handle(req.handle)
        tag = req.tag.strip().lower()
        force_refresh = req.force_refresh

        submissions = await get_user_submissions(handle, force_refresh)
        user_info, problemset = await asyncio.gather(
            get_user_info(handle, force_refresh),
            get_problemset(force_refresh)
        )

        from app.services.tracking import get_tracked_rewards, get_bandit_offsets
        tracked_rewards = await get_tracked_rewards(handle, db)
        persisted_offsets = await get_bandit_offsets(handle, db)

        processed_data = process_user_data(submissions, user_info, problemset, tracked_rewards, persisted_offsets)
        tag_analysis = processed_data.get("tag_analysis", [])

        target_rating = 800
        for t in tag_analysis:
            if t["tag"].lower() == tag:
                target_rating = t["target_rating"]
                break

        from app.services.recommender import _pick_problems_for_tags
        fake_tag = {"tag": tag, "target_rating": target_rating}
        recs = _pick_problems_for_tags([fake_tag], problemset, submissions, 1)

        if recs:
            from app.services.tracking import save_recommendations
            import copy
            await save_recommendations(handle, copy.deepcopy(recs), db)

        return {
            "tag": tag,
            "target_rating": target_rating,
            "recommended_problem": recs[0] if recs else None
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/badge-data/{handle}")
async def get_badge_data(handle: str, db: AsyncSession = Depends(get_db)):
    try:
        # H-2 + L-6: validate and normalize handle
        handle = validate_handle(handle)

        submissions = await get_user_submissions(handle)
        user_info, problemset = await asyncio.gather(
            get_user_info(handle),
            get_problemset()
        )

        from app.services.tracking import get_tracked_rewards, get_bandit_offsets
        tracked_rewards = await get_tracked_rewards(handle, db)
        persisted_offsets = await get_bandit_offsets(handle, db)

        processed_data = process_user_data(submissions, user_info, problemset, tracked_rewards, persisted_offsets)
        tag_analysis = processed_data.get("tag_analysis", [])
        # Filter weak tags and sort them to find the most critical ones
        weak_tags_list = [t for t in tag_analysis if t["state"] in ["Avoided", "Confirmed Weak"]]

        def sort_key(t):
            gap = t["target_rating"] - t.get("contest_reliability_rating", 0)
            return -gap

        weak_tags_list.sort(key=sort_key)

        # Take only the top 3 most critical tags to avoid badging the entire problemset
        top_weak_tags = weak_tags_list[:3]

        badge_data = {}
        for prob in problemset:
            rating = prob.get("rating")
            if not rating:
                continue

            pid = f"{prob.get('contestId', '')}{prob.get('index', '')}"
            if not pid:
                continue

            prob_tags = [t.lower() for t in prob.get("tags", [])]
            matched_tag = None
            matched_state = None
            matched_target = 0

            # Find the most severe tag match
            for t_info in top_weak_tags:
                if t_info["tag"] in prob_tags:
                    if abs(rating - t_info["target_rating"]) <= 200:
                        matched_tag = t_info["tag"]
                        matched_state = t_info["state"]
                        matched_target = t_info["target_rating"]
                        break

            if matched_tag:
                badge_data[pid] = {
                    "tag": matched_tag,
                    "state": matched_state,
                    "target_rating": matched_target
                }

        return {"problems": badge_data}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/recommend/{handle}")
async def get_recommendation(handle: str, db: AsyncSession = Depends(get_db)):
    try:
        # H-2 + L-6: validate and normalize handle
        handle = validate_handle(handle)

        submissions = await get_user_submissions(handle)
        user_info, problemset, recent_contests = await asyncio.gather(
            get_user_info(handle),
            get_problemset(),
            get_recent_contests()
        )

        user_rating = user_info.get("rating", 0)

        from app.services.tracking import get_tracked_rewards, get_bandit_offsets
        tracked_rewards = await get_tracked_rewards(handle, db)
        persisted_offsets = await get_bandit_offsets(handle, db)

        processed_data = process_user_data(submissions, user_info, problemset, tracked_rewards, persisted_offsets)
        tag_analysis = processed_data.get("tag_analysis", [])

        upsolve = generate_upsolve_recommendations(tag_analysis, problemset, submissions, recent_contests, user_rating)

        recs = upsolve.get("recommended_problems", [])
        if not recs:
            return {"problem": None}

        chosen = recs[0]
        if "tag" in chosen:
            del chosen["tag"]

        return {"problem": chosen}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/roadmap/{handle}")
async def get_roadmap(handle: str, db: AsyncSession = Depends(get_db)):
    return {"message": "Endpoint to retrieve active roadmap from DB"}

@router.post("/chat", response_model=ChatResponse)
async def chat_endpoint(req: ChatRequest):
    try:
        from app.services.rag import get_chat_response
        full_query = f"User Query: {req.query}"
        if req.problem_id != 'general' or req.problem_name:
            full_query += f"\n\nContext:\nThe user is working on Codeforces problem '{req.problem_name}' (ID: {req.problem_id}). Please rely on your training data about this problem to understand the problem statement if you can."

        if req.code and "Write your code here" not in req.code and "Paste your code here" not in req.code:
            full_query += f"\n\nUser Code:\n{req.code}"

        response = await get_chat_response(full_query, req.problem_id)
        return ChatResponse(response=response)
    except Exception as e:
        return ChatResponse(response=f"Error connecting to AI: {str(e)}")
