from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, BigInteger
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base

class UserTracking(Base):
    __tablename__ = "user_tracking"

    handle = Column(String, primary_key=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    pending_recommendations = relationship("PendingRecommendation", back_populates="user", cascade="all, delete-orphan")
    rewards = relationship("TagReward", back_populates="user", cascade="all, delete-orphan")


class PendingRecommendation(Base):
    __tablename__ = "pending_recommendations"

    id = Column(Integer, primary_key=True, index=True)
    user_handle = Column(String, ForeignKey("user_tracking.handle"), index=True)
    problem_id = Column(String, index=True)
    tag = Column(String)
    target_rating = Column(Integer)
    timestamp = Column(BigInteger)
    expires_at = Column(BigInteger)
    
    user = relationship("UserTracking", back_populates="pending_recommendations")


class TagReward(Base):
    __tablename__ = "tag_rewards"

    id = Column(Integer, primary_key=True, index=True)
    user_handle = Column(String, ForeignKey("user_tracking.handle"), index=True)
    tag = Column(String, index=True)
    reward_value = Column(Float, default=0.0)
    
    user = relationship("UserTracking", back_populates="rewards")
