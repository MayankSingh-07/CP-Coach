from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import router as core_router
from app.api.chat import router as chat_router

app = FastAPI(title="AI Competitive Programming Coach")

# Configure CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # For development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(core_router, prefix="/api/v1")
app.include_router(chat_router, prefix="/api/v1/coach")

@app.get("/")
async def root():
    return {"message": "Welcome to AI CP Coach API"}
