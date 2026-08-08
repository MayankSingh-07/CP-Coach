from sqlalchemy import Column, Integer, String, DateTime, func, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from ..core.database import Base
from .user import User

class SubmissionHistory(Base):
    __tablename__ = "submission_history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    problem_id = Column(String, index=True) # e.g. "1900A"
    verdict = Column(String)
    failed_tag = Column(String, nullable=True) # if a specific tag is attributed to failure
    rating = Column(Integer, nullable=True)
    submitted_at = Column(DateTime)
    
    user = relationship("User", back_populates="submissions")

class Roadmap(Base):
    __tablename__ = "roadmaps"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    weak_topics = Column(JSONB) # e.g. ["dp", "greedy", "math"]
    recommended_problems = Column(JSONB) # e.g. ["1900B", "1850C"]
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="roadmaps")

class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    problem_id = Column(String, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="chat_sessions")
    messages = relationship("ChatMessage", back_populates="session")

class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("chat_sessions.id"))
    sender = Column(String) # 'user' or 'coach'
    content = Column(String)
    retrieved_context = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    session = relationship("ChatSession", back_populates="messages")
