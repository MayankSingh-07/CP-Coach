import json
import os
import datetime

TRACKING_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "data", "recommendations.json")

def _load_data():
    if not os.path.exists(TRACKING_FILE):
        return {}
    try:
        with open(TRACKING_FILE, "r") as f:
            return json.load(f)
    except:
        return {}

def _save_data(data):
    os.makedirs(os.path.dirname(TRACKING_FILE), exist_ok=True)
    with open(TRACKING_FILE, "w") as f:
        json.dump(data, f, indent=2)

def save_recommendations(handle: str, recommendations: list):
    """
    Saves a batch of recommended problems.
    recommendations = [{"problem_id": "123A", "tag": "graphs", "target_rating": 1500, "timestamp": 123456}]
    """
    data = _load_data()
    if handle not in data:
        data[handle] = {"pending": [], "rewards": {}}
        
    now = datetime.datetime.utcnow().timestamp()
    
    # Add new recommendations
    for r in recommendations:
        r["expires_at"] = now + (14 * 24 * 60 * 60) # 14 days
        data[handle]["pending"].append(r)
        
    _save_data(data)

def sync_and_calculate_rewards(handle: str, submissions: list):
    """
    Checks pending recommendations against new submissions to compute rewards.
    Returns the accumulated rewards per tag.
    """
    data = _load_data()
    if handle not in data:
        return {}
        
    user_data = data[handle]
    pending = user_data.get("pending", [])
    rewards = user_data.setdefault("rewards", {})
    
    if not pending:
        return rewards
        
    now = datetime.datetime.utcnow().timestamp()
    
    # Map submissions by problem ID
    subs_by_prob = {}
    for sub in submissions:
        prob = sub.get("problem", {})
        prob_id = f"{prob.get('contestId', '')}{prob.get('index', '')}"
        if prob_id not in subs_by_prob:
            subs_by_prob[prob_id] = []
        subs_by_prob[prob_id].append(sub)
        
    new_pending = []
    
    for req in pending:
        prob_id = req["problem_id"]
        tag = req["tag"]
        target = req["target_rating"]
        
        # Did it expire?
        if now > req["expires_at"]:
            continue # Drop it
            
        # Check submissions after the recommendation was made
        rel_subs = [s for s in subs_by_prob.get(prob_id, []) if s.get("creationTimeSeconds", 0) >= req["timestamp"]]
        if not rel_subs:
            new_pending.append(req)
            continue
            
        # We have submissions! Calculate reward based on Section 5 rules
        # Sort chronologically
        rel_subs.sort(key=lambda x: x.get("creationTimeSeconds", 0))
        
        ac_attempt = None
        ac_idx = -1
        for i, sub in enumerate(rel_subs):
            if sub.get("verdict") == "OK":
                ac_attempt = sub
                ac_idx = i
                break
                
        is_ac = ac_attempt is not None
        num_attempts = ac_idx + 1 if is_ac else len(rel_subs)
        
        reward = None
        
        if is_ac and num_attempts == 1:
            # First try AC
            discount = ac_attempt.get("EditorialDiscount", 1.0)
            if discount == 1.0:
                reward = 1.0
            else:
                reward = 0.5
        elif is_ac and num_attempts > 1:
            # AC after WA
            last_wa = rel_subs[ac_idx - 1]
            gap_mins = (ac_attempt.get("creationTimeSeconds", 0) - last_wa.get("creationTimeSeconds", 0)) / 60.0
            if 10 <= gap_mins <= 120:
                reward = 1.0
            elif gap_mins < 5:
                reward = 0.3
            else:
                reward = 0.2
        elif not is_ac and num_attempts >= 5:
            # 5 WA -> give up
            reward = 0.0
            
        if reward is not None:
            if tag not in rewards:
                rewards[tag] = []
            rewards[tag].append(reward)
            # Do not keep in pending if resolved
        else:
            # Still working on it (e.g. 2 WA)
            new_pending.append(req)
            
    user_data["pending"] = new_pending
    _save_data(data)
    
    return rewards

def get_tracked_rewards(handle: str):
    data = _load_data()
    return data.get(handle, {}).get("rewards", {})
