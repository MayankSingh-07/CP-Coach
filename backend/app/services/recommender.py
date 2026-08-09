from typing import List, Dict, Any, Tuple
from collections import defaultdict
import math
import random
from datetime import datetime
from app.services.tracking import get_tracked_rewards

def process_user_data(
    all_submissions: List[Dict[str, Any]], 
    user_info: Dict[str, Any], 
    problemset: List[Dict[str, Any]],
    tracked_rewards: Dict[str, float] = None
) -> Dict[str, Any]:
    
    # 1. Data Ingestion & API Constraints
    contest_subs = []
    practice_subs = []
    user_rating = user_info.get("rating", 0)
    handle = user_info.get("handle", "")
    
    for sub in all_submissions:
        p_type = sub.get("author", {}).get("participantType", "")
        if p_type in {"CONTESTANT", "OUT_OF_COMPETITION"}:
            contest_subs.append(sub)
        elif p_type in {"PRACTICE", "VIRTUAL"}:
            practice_subs.append(sub)
            
    # Keep track of basic stats to not break the frontend payload entirely if possible
    stats = _calculate_basic_stats(all_submissions, user_info)
    
    # 2. Three-Way Tag Classification
    classifications, expected_attempts, actual_attempts = _classify_tags(practice_subs, problemset)
    
    # 3 & 4. Dual-Rating Calculation & Submission Weighting
    contest_ratings = _compute_ratings(contest_subs, user_info)
    practice_ratings = _compute_ratings(practice_subs, user_info)
    
    # 5. Bandit Recommender
    dynamic_offsets = _compute_bandit_offsets(practice_subs, practice_ratings, handle, tracked_rewards)
    
    # Build final output format
    tag_analysis = []
    tag_coverage = defaultdict(lambda: defaultdict(int)) # We can mock this or just return empty for now, or populate it
    
    for tag, state in classifications.items():
        c_info = contest_ratings.get(tag, {"final_rating": max(800, user_rating - 300), "n_attempts": 0})
        p_info = practice_ratings.get(tag, {"final_rating": max(800, user_rating - 300), "n_attempts": 0})
        offset = dynamic_offsets.get(tag, 150)
        
        n_practice = p_info["n_attempts"]
        if n_practice >= 20:
            confidence = "High"
        elif n_practice >= 10:
            confidence = "Medium"
        else:
            confidence = "Low"
            
        final_state = state
        if state in ["Practiced", "Confirmed Weak", "Strong", "Average"]:
            # If the user's practice rating is significantly below their overall rating, it's a weak topic
            if p_info["final_rating"] < user_rating - 75:
                final_state = "Confirmed Weak"
            elif p_info["final_rating"] > user_rating + 75:
                final_state = "Strong"
            else:
                final_state = "Average"
            
        tag_analysis.append({
            "tag": tag,
            "state": final_state,
            "expected_attempts": round(expected_attempts.get(tag, 0), 2),
            "actual_attempts": actual_attempts.get(tag, 0),
            "contest_reliability_rating": round(c_info["final_rating"]),
            "practice_ceiling_rating": round(p_info["final_rating"]),
            "bandit_offset": offset,
            "target_rating": round(p_info["final_rating"]) + offset,
            "confidence": confidence
        })
            
    # Sort by a weakness metric (e.g., target_rating gap from user rating)
    tag_analysis.sort(key=lambda x: x["target_rating"] - user_rating)
    
    # Calculate tag coverage
    tag_coverage = defaultdict(lambda: defaultdict(int))
    for sub in all_submissions:
        if sub.get("verdict") == "OK":
            prob = sub.get("problem", {})
            rating = prob.get("rating")
            if rating:
                r_bin = f"{(rating // 200) * 200}-{(rating // 200) * 200 + 199}"
                for tag in prob.get("tags", []):
                    tag_coverage[tag][r_bin] += 1
                    
    return {
        "stats": stats,
        "tag_analysis": tag_analysis,
        "tag_coverage": tag_coverage
    }


def _classify_tags(practice_subs: List[Dict[str, Any]], problemset: List[Dict[str, Any]]):
    all_tags = set()
    for p in problemset:
        all_tags.update(p.get("tags", []))
        
    classifications = {}
    
    if len(practice_subs) == 0:
        for t in all_tags:
            classifications[t] = "Insufficient Practice Data"
        return classifications, {}, {}
        
    problems_in_bin = defaultdict(int)
    tag_counts_in_bin = defaultdict(lambda: defaultdict(int))
    
    for p in problemset:
        rating = p.get("rating")
        if not rating: continue
        
        r_bin = (rating // 100) * 100
        problems_in_bin[r_bin] += 1
        for t in p.get("tags", []):
            tag_counts_in_bin[r_bin][t] += 1
            
    practice_volume = defaultdict(int)
    actual_attempts = defaultdict(int)
    
    for sub in practice_subs:
        prob = sub.get("problem", {})
        rating = prob.get("rating")
        if not rating: continue
        
        r_bin = (rating // 100) * 100
        practice_volume[r_bin] += 1
        for t in prob.get("tags", []):
            actual_attempts[t] += 1
            
    expected_attempts = defaultdict(float)
    for t in all_tags:
        expected = 0.0
        for r_bin, vol in practice_volume.items():
            if problems_in_bin[r_bin] > 0:
                freq = tag_counts_in_bin[r_bin][t] / problems_in_bin[r_bin]
                expected += freq * vol
        expected_attempts[t] = expected
        
    for t in all_tags:
        expected = expected_attempts[t]
        actual = actual_attempts[t]
        
        if expected < 1.0:
            classifications[t] = "Not Yet Applicable"
        elif actual < 0.30 * expected:
            classifications[t] = "Avoided"
        elif actual >= 3:
            classifications[t] = "Practiced"
        else:
            classifications[t] = "Low-confidence"
            
    return classifications, expected_attempts, actual_attempts

def _compute_ratings(subs: List[Dict[str, Any]], user_info: Dict[str, Any]):
    overall_rating = user_info.get("rating", 0)
    R_prior = max(800, overall_rating - 300)
    
    subs.sort(key=lambda x: x.get("creationTimeSeconds", 0))
    last_wa_time = {}
    tag_subs = defaultdict(list)
    
    for sub in subs:
        prob = sub.get("problem", {})
        contest_id = prob.get("contestId")
        index = prob.get("index")
        prob_id = f"{contest_id}{index}"
        rating = prob.get("rating")
        if not rating: continue
        
        verdict = sub.get("verdict")
        ts = sub.get("creationTimeSeconds", 0)
        
        if verdict == "OK":
            is_single_shot = prob_id not in last_wa_time
            gap_hours = (ts - last_wa_time[prob_id]) / 3600.0 if not is_single_shot else 0
            
            discount = 1.0
            if is_single_shot or gap_hours > 4:
                discount = 0.65
                
            sub["EditorialDiscount"] = discount
            
            tags = prob.get("tags", [])
            n_tags = len(tags)
            if n_tags > 0:
                f_rp = max(0.25, min(3.0, 2.0 ** ((rating - overall_rating) / 200.0)))
                contribution = f_rp / n_tags * discount
                
                for t in tags:
                    tag_subs[t].append({
                        "rating": rating,
                        "weight": contribution
                    })
        else:
            last_wa_time[prob_id] = ts
            
    tag_ratings = {}
    for t, attempts in tag_subs.items():
        n_attempts = len(attempts)
        if n_attempts == 0: continue
        
        weighted_sum = sum(a["rating"] * a["weight"] for a in attempts)
        weight_sum = sum(a["weight"] for a in attempts)
        
        raw_est = weighted_sum / weight_sum if weight_sum > 0 else R_prior
        w = n_attempts / (n_attempts + 5.0)
        final_rating = R_prior + w * (raw_est - R_prior)
        
        tag_ratings[t] = {
            "final_rating": final_rating,
            "n_attempts": n_attempts
        }
        
    return tag_ratings

def _compute_bandit_offsets(practice_subs: List[Dict[str, Any]], practice_ratings: Dict[str, Any], handle: str = "", tracked_rewards: Dict[str, float] = None):
    attempts_per_prob = defaultdict(list)
    for sub in practice_subs:
        prob = sub.get("problem", {})
        contest_id = prob.get("contestId")
        index = prob.get("index")
        prob_id = f"{contest_id}{index}"
        attempts_per_prob[prob_id].append(sub)
        
    tag_rewards = defaultdict(list)
    tag_dynamic_offsets = defaultdict(lambda: 150)
    
    if handle and tracked_rewards:
        for t, r_val in tracked_rewards.items():
            # In the new logic, we just track a single scalar reward_value per tag
            # The previous JSON logic kept a list of rewards. For compatibility with the bandit,
            # we will treat this single dampended value as a recent average.
            tag_rewards[t].append(r_val)
    
    for prob_id, attempts in attempts_per_prob.items():
        prob = attempts[0].get("problem", {})
        rating = prob.get("rating")
        if not rating: continue
        tags = prob.get("tags", [])
        
        ac_attempt = None
        ac_idx = -1
        for i, sub in enumerate(attempts):
            if sub.get("verdict") == "OK":
                ac_attempt = sub
                ac_idx = i
                break
                
        is_ac = ac_attempt is not None
        num_attempts = ac_idx + 1 if is_ac else len(attempts)
        
        reward = None
        for tag in tags:
            ceiling = practice_ratings.get(tag, {}).get("final_rating", 800)
            
            if is_ac and num_attempts == 1:
                discount = ac_attempt.get("EditorialDiscount", 1.0)
                if rating >= ceiling and discount == 1.0:
                    reward = 1.0
                elif rating >= ceiling and discount == 0.65:
                    reward = 0.5
                elif rating < ceiling:
                    reward = 0.6
            elif is_ac and num_attempts > 1:
                last_wa = attempts[ac_idx - 1]
                gap_mins = (ac_attempt.get("creationTimeSeconds", 0) - last_wa.get("creationTimeSeconds", 0)) / 60.0
                
                if 10 <= gap_mins <= 120:
                    reward = 1.0
                elif gap_mins < 5:
                    reward = 0.3
                elif gap_mins > 240:
                    reward = 0.2
            elif not is_ac and num_attempts >= 5:
                reward = 0.0
                
            if reward is None:
                reward = 0.5
                
            tag_rewards[tag].append(reward)
            
            if len(tag_rewards[tag]) >= 6:
                window = tag_rewards[tag][-6:]
                mean_r = sum(window) / 6.0
                if mean_r > 0.75:
                    tag_dynamic_offsets[tag] += 50
                elif mean_r < 0.30:
                    tag_dynamic_offsets[tag] -= 50
                    
    # Force initialization so keys exist
    for tag in tag_rewards.keys():
        _ = tag_dynamic_offsets[tag]
        
    return tag_dynamic_offsets

def _calculate_basic_stats(submissions, user_info):
    import datetime
    
    solved_problems = set()
    total_submissions = len(submissions)
    ok_submissions = 0
    
    verdicts = defaultdict(int)
    solves_per_month = defaultdict(int)
    activity_grid = defaultdict(int)
    langs = defaultdict(int)
    solve_days = set()
    ist_offset = datetime.timedelta(hours=5, minutes=30)
    
    for sub in submissions:
        prob = sub.get("problem", {})
        prob_id = f"{prob.get('contestId', '')}{prob.get('index', '')}"
        
        verdict = sub.get("verdict", "UNKNOWN")
        verdicts[verdict] += 1
        langs[sub.get("programmingLanguage", "")] += 1
        
        ts = sub.get("creationTimeSeconds", 0)
        if ts > 0:
            dt = datetime.datetime.utcfromtimestamp(ts) + ist_offset
            activity_grid[f"{dt.weekday()},{dt.hour}"] += 1
            
        if verdict == "OK":
            solved_problems.add(prob_id)
            ok_submissions += 1
            if ts > 0:
                solves_per_month[dt.strftime("%Y-%m")] += 1
                solve_days.add(dt.date())
            
    accuracy = (ok_submissions / total_submissions * 100) if total_submissions > 0 else 0
    fav_lang = max(langs.items(), key=lambda x: x[1])[0] if langs else "N/A"
    
    sorted_days = sorted(list(solve_days))
    longest_streak = 0
    current_streak = 0
    
    if sorted_days:
        streak = 1
        longest_streak = 1
        for i in range(1, len(sorted_days)):
            if (sorted_days[i] - sorted_days[i-1]).days == 1:
                streak += 1
                longest_streak = max(longest_streak, streak)
            else:
                streak = 1
                
        today_ist = (datetime.datetime.utcnow() + ist_offset).date()
        if (today_ist - sorted_days[-1]).days <= 1:
            current_streak = streak
    
    return {
        "total_solved": len(solved_problems),
        "accuracy": round(accuracy, 1),
        "max_rating": user_info.get("max_rating", 0),
        "current_streak": current_streak,
        "longest_streak": longest_streak,
        "favorite_language": fav_lang,
        "verdicts": verdicts,
        "solves_per_month": solves_per_month,
        "activity_grid": activity_grid
    }

def _pick_problems_for_tags(selected_tags, problemset, submissions, num_problems=5):
    # Get set of all attempted problem IDs
    attempted_ids = set()
    for sub in submissions:
        prob = sub.get("problem", {})
        pid = f"{prob.get('contestId', '')}{prob.get('index', '')}"
        if pid:
            attempted_ids.add(pid)
            
    recs = []
    
    # Simple list of reasons
    REASONS = [
        "Stretch pick — slightly above your comfort zone in this area.",
        "Fundamentals check — cementing a known weak point.",
        "Targeted practice — highly relevant to recent struggles.",
        "Blind spot check — testing an area you've been avoiding.",
        "Strategic pick — high ROI for your current rating."
    ]
    
    for tag_info in selected_tags:
        tag = tag_info["tag"]
        target = tag_info["target_rating"]
        
        candidates = []
        # Fallback to wider bands if nothing found
        for tolerance in [100, 200, 300]:
            for prob in problemset:
                pid = f"{prob.get('contestId', '')}{prob.get('index', '')}"
                if pid in attempted_ids:
                    continue
                prob_tags = [t.lower() for t in prob.get("tags", [])]
                if not any(tag in t for t in prob_tags):
                    continue
                rating = prob.get("rating")
                if not rating:
                    continue
                    
                if abs(rating - target) <= tolerance:
                    candidates.append(prob)
                    
            if candidates:
                break
                
        if candidates:
            # Sort by fewest tags
            candidates.sort(key=lambda x: len(x.get("tags", [])))
            # Pick randomly from the top 3 cleanest candidates so we don't ALWAYS pick single-tag problems
            top_candidates = candidates[:3]
            chosen = random.choice(top_candidates)
            attempted_ids.add(f"{chosen.get('contestId', '')}{chosen.get('index', '')}")
            
            recs.append({
                "problem_id": f"{chosen.get('contestId', '')}{chosen.get('index', '')}",
                "problem_name": chosen.get("name", "Unknown"),
                "url": f"https://codeforces.com/contest/{chosen.get('contestId')}/problem/{chosen.get('index')}",
                "rating": chosen.get("rating"),
                "reason": random.choice(REASONS),
                "tag": tag,
                "target_rating": target
            })
            
            if len(recs) >= num_problems:
                break
                
    return recs

def _select_weighted_tags(tag_analysis, num_tags=5):
    candidates = []
    weights = []
    
    for t in tag_analysis:
        if t["state"] == "Avoided":
            candidates.append(t)
            weights.append(100.0) # High weight
        elif t["state"] == "Confirmed Weak":
            candidates.append(t)
            gap = max(10, t["target_rating"] - t["contest_reliability_rating"])
            weights.append(float(gap))
            
    if not candidates:
        return []
        
    selected = []
    # Weighted random sampling without replacement
    for _ in range(min(num_tags, len(candidates))):
        idx = random.choices(range(len(candidates)), weights=weights, k=1)[0]
        selected.append(candidates[idx])
        candidates.pop(idx)
        weights.pop(idx)
        
    return selected

def generate_roadmap(tag_analysis, problemset, submissions):
    # For the UI to properly render problems for the top tags it slices, 
    # we should generate at least 1 problem for every Avoided/Weak tag.
    all_targets = [t for t in tag_analysis if t["state"] in ("Avoided", "Confirmed Weak")]
    recs = _pick_problems_for_tags(all_targets, problemset, submissions, len(all_targets))
    return {"recommended_problems": recs}

def generate_upsolve_recommendations(tag_analysis, problemset, submissions, recent_contests=None, user_rating=0):
    if recent_contests is None:
        recent_contests = []
        
    # AI Picks (Flat list)
    selected = _select_weighted_tags(tag_analysis, 8)
    recs = _pick_problems_for_tags(selected, problemset, submissions, 8)
    
    # Process Recent Contests for Attempted/Unattempted
    # Universe = the last 5 contests held on Codeforces platform-wide (via contest.list)
    attempted = []
    unattempted = []
    
    # We want the 5 most recent finished contests. 'recent_contests' from contest.list is typically sorted by startTimeSeconds descending.
    # Filter to finished contests just in case.
    finished_contests = [c for c in recent_contests if c.get("phase") == "FINISHED"]
    last_5_global = finished_contests[:5] if finished_contests else []
    
    recent_contest_ids = {c["id"] for c in last_5_global}
    
    # Find all problems in these contests
    contest_problems = defaultdict(list)
    for p in problemset:
        cid = p.get("contestId")
        if cid in recent_contest_ids:
            contest_problems[cid].append(p)
            
    # Group submissions by problem to check solves, and track contest participation
    subs_by_prob = defaultdict(list)
    participated_contests = set()
    for s in submissions:
        cid = s.get("problem", {}).get("contestId")
        idx = s.get("problem", {}).get("index")
        ptype = s.get("author", {}).get("participantType")
        
        if cid and idx:
            subs_by_prob[f"{cid}{idx}"].append(s)
            
        if cid in recent_contest_ids and ptype in ("CONTESTANT", "OUT_OF_COMPETITION"):
            participated_contests.add(cid)
            
    # Metadata for empty state distinction
    attempted_contests_count = len(participated_contests)
    unattempted_contests_count = len(last_5_global) - attempted_contests_count
    attempted_in_range_count = 0
    unattempted_in_range_count = 0
            
    # Doable range filter: (0, user_rating + 200]
    rating_ceiling = user_rating + 200
    
    for contest in last_5_global:
        cid = contest["id"]
        cname = contest["name"]
        probs = contest_problems.get(cid, [])
        # Sort by index (A, B, C...)
        probs.sort(key=lambda x: x.get("index", ""))
        
        has_participated = cid in participated_contests
        
        for p in probs:
            rating = p.get("rating")
            if not rating or rating > rating_ceiling:
                continue # Out of range, exclude entirely
                
            pid = f"{cid}{p.get('index')}"
            prob_subs = subs_by_prob.get(pid, [])
            
            prob_obj = {
                "id": pid,
                "problem_id": pid,
                "problem_name": p.get("name", "Unknown"),
                "url": f"https://codeforces.com/contest/{cid}/problem/{p.get('index')}",
                "rating": rating,
                "index": p.get("index", ""),
                "contest_name": cname
            }
            
            is_ac = any(s.get("verdict") == "OK" for s in prob_subs)
            
            if has_participated:
                attempted_in_range_count += 1
                if not is_ac:
                    attempted.append(prob_obj)
            else:
                unattempted_in_range_count += 1
                if not is_ac:
                    unattempted.append(prob_obj)
                
    return {
        "recommended_problems": recs,
        "attempted": attempted,
        "unattempted": unattempted,
        "metadata": {
            "attempted_contests_count": attempted_contests_count,
            "unattempted_contests_count": unattempted_contests_count,
            "attempted_in_range_count": attempted_in_range_count,
            "unattempted_in_range_count": unattempted_in_range_count
        }
    }
