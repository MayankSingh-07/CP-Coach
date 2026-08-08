from sqlalchemy import Column, Integer, String, DateTime, func, JSON, Boolean
from sqlalchemy.orm import relationship
from ..core.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    codeforces_handle = Column(String, unique=True, index=True, nullable=False)
    rating = Column(Integer, nullable=True)
    max_rating = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    submissions = relationship("SubmissionHistory", back_populates="user")
    roadmaps = relationship("Roadmap", back_populates="user")
    chat_sessions = relationship("ChatSession", back_populates="user")
