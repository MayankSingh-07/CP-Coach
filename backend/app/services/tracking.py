import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete
from app.models.tracking import UserTracking, PendingRecommendation, TagReward

async def save_recommendations(handle: str, recommendations: list, db: AsyncSession):
    """
    Saves a batch of recommended problems.
    recommendations = [{"problem_id": "123A", "tag": "graphs", "target_rating": 1500, "timestamp": 123456}]
    """
    # Ensure user exists
    stmt = select(UserTracking).where(UserTracking.handle == handle)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    
    if not user:
        user = UserTracking(handle=handle)
        db.add(user)
        await db.commit()
        await db.refresh(user)

    now = datetime.datetime.utcnow().timestamp()
    
    for r in recommendations:
        expires_at = now + (14 * 24 * 60 * 60) # 14 days
        new_rec = PendingRecommendation(
            user_handle=handle,
            problem_id=r["problem_id"],
            tag=r["tag"],
            target_rating=r["target_rating"],
            timestamp=r.get("timestamp", now),
            expires_at=expires_at
        )
        db.add(new_rec)
        
    await db.commit()

async def sync_and_calculate_rewards(handle: str, submissions: list, db: AsyncSession):
    """
    Checks pending recommendations against new submissions to compute rewards.
    Returns the accumulated rewards per tag.
    """
    # Get user
    stmt = select(UserTracking).where(UserTracking.handle == handle)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    
    if not user:
        return {}
        
    # Get pending recs
    stmt = select(PendingRecommendation).where(PendingRecommendation.user_handle == handle)
    result = await db.execute(stmt)
    pending = result.scalars().all()
    
    # Get current rewards
    stmt = select(TagReward).where(TagReward.user_handle == handle)
    result = await db.execute(stmt)
    current_rewards = {r.tag: r for r in result.scalars().all()}
    
    if not pending:
        return {tag: r.reward_value for tag, r in current_rewards.items()}
        
    now = datetime.datetime.utcnow().timestamp()
    
    # Map submissions by problem ID
    subs_by_prob = {}
    for sub in submissions:
        prob = sub.get("problem", {})
        prob_id = f"{prob.get('contestId', '')}{prob.get('index', '')}"
        if prob_id not in subs_by_prob:
            subs_by_prob[prob_id] = []
        subs_by_prob[prob_id].append(sub)
        
    recs_to_delete = []
    
    for req in pending:
        prob_id = req.problem_id
        tag = req.tag
        
        # Did it expire?
        if now > req.expires_at:
            recs_to_delete.append(req)
            continue # Drop it
            
        # Check submissions after the recommendation was made
        rel_subs = [s for s in subs_by_prob.get(prob_id, []) if s.get("creationTimeSeconds", 0) >= req.timestamp]
        if not rel_subs:
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
            # Update DB reward
            if tag not in current_rewards:
                tr = TagReward(user_handle=handle, tag=tag, reward_value=0.0)
                db.add(tr)
                current_rewards[tag] = tr
            
            # Dampen updates
            current_rewards[tag].reward_value = 0.8 * current_rewards[tag].reward_value + 0.2 * reward
            
            # The problem was attempted heavily or solved, so we drop it from pending
            recs_to_delete.append(req)
            
    # Delete resolved/expired recommendations
    for req in recs_to_delete:
        await db.delete(req)
        
    await db.commit()
    
    return {tag: r.reward_value for tag, r in current_rewards.items()}

async def get_tracked_rewards(handle: str, db: AsyncSession):
    stmt = select(TagReward).where(TagReward.user_handle == handle)
    result = await db.execute(stmt)
    return {r.tag: r.reward_value for r in result.scalars().all()}
