import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert as pg_insert
from app.models.tracking import UserTracking, PendingRecommendation, TagReward, TagBanditOffset


async def _ensure_user(handle: str, db: AsyncSession) -> UserTracking:
    """Idempotently creates or fetches a UserTracking row."""
    stmt = select(UserTracking).where(UserTracking.handle == handle)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if not user:
        user = UserTracking(handle=handle)
        db.add(user)
        await db.commit()
        await db.refresh(user)
    return user


async def save_recommendations(handle: str, recommendations: list, db: AsyncSession):
    """
    Saves a batch of recommended problems.
    recommendations = [{"problem_id": "123A", "tag": "graphs", "target_rating": 1500}]

    H-1 fix: Uses ON CONFLICT DO NOTHING to prevent duplicate rows on concurrent requests.
    C-3 fix: Skips any recommendation that does not have a "tag" field (e.g. upsolve contest problems).
    """
    await _ensure_user(handle, db)

    now = datetime.datetime.utcnow().timestamp()

    for r in recommendations:
        # C-3: skip upsolve contest problems that have no "tag" field
        tag = r.get("tag")
        if not tag:
            continue

        expires_at = now + (14 * 24 * 60 * 60)  # 14 days

        # H-1: use INSERT ... ON CONFLICT DO NOTHING so rapid duplicate calls are safe
        stmt = pg_insert(PendingRecommendation).values(
            user_handle=handle,
            problem_id=r["problem_id"],
            tag=tag,
            target_rating=r.get("target_rating", 800),
            timestamp=r.get("timestamp", now),
            expires_at=expires_at,
        ).on_conflict_do_nothing(constraint="uq_pending_rec_user_problem")
        await db.execute(stmt)

    await db.commit()


async def sync_and_calculate_rewards(handle: str, submissions: list, db: AsyncSession):
    """
    Checks pending recommendations against new submissions to compute rewards.
    Returns the accumulated rewards per tag.
    """
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
            continue

        # Check submissions after the recommendation was made
        rel_subs = [s for s in subs_by_prob.get(prob_id, []) if s.get("creationTimeSeconds", 0) >= req.timestamp]
        if not rel_subs:
            continue

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
            discount = ac_attempt.get("EditorialDiscount", 1.0)
            if discount == 1.0:
                reward = 1.0
            else:
                reward = 0.5
        elif is_ac and num_attempts > 1:
            last_wa = rel_subs[ac_idx - 1]
            gap_mins = (ac_attempt.get("creationTimeSeconds", 0) - last_wa.get("creationTimeSeconds", 0)) / 60.0
            if 10 <= gap_mins <= 120:
                reward = 1.0
            elif gap_mins < 5:
                reward = 0.3
            else:
                reward = 0.2
        elif not is_ac and num_attempts >= 5:
            reward = 0.0

        if reward is not None:
            if tag not in current_rewards:
                tr = TagReward(user_handle=handle, tag=tag, reward_value=0.0)
                db.add(tr)
                current_rewards[tag] = tr

            current_rewards[tag].reward_value = 0.8 * current_rewards[tag].reward_value + 0.2 * reward
            recs_to_delete.append(req)

    for req in recs_to_delete:
        await db.delete(req)

    await db.commit()

    return {tag: r.reward_value for tag, r in current_rewards.items()}


async def get_tracked_rewards(handle: str, db: AsyncSession):
    stmt = select(TagReward).where(TagReward.user_handle == handle)
    result = await db.execute(stmt)
    return {r.tag: r.reward_value for r in result.scalars().all()}


async def save_bandit_offsets(handle: str, offsets: dict, db: AsyncSession):
    """M-1: Persist computed bandit offsets to the DB so they survive across requests."""
    await _ensure_user(handle, db)

    for tag, offset_val in offsets.items():
        stmt = pg_insert(TagBanditOffset).values(
            user_handle=handle,
            tag=tag,
            offset_value=float(offset_val),
        ).on_conflict_do_update(
            constraint="uq_bandit_offset_user_tag",
            set_={"offset_value": float(offset_val)},
        )
        await db.execute(stmt)

    await db.commit()


async def get_bandit_offsets(handle: str, db: AsyncSession) -> dict:
    """M-1: Load persisted bandit offsets from DB."""
    stmt = select(TagBanditOffset).where(TagBanditOffset.user_handle == handle)
    result = await db.execute(stmt)
    return {r.tag: r.offset_value for r in result.scalars().all()}
