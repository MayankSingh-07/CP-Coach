from fastapi import APIRouter, Depends
from pydantic import BaseModel
from fastapi.responses import StreamingResponse
from ..services.rag import get_chat_response

router = APIRouter()

class ChatRequest(BaseModel):
    problem_id: str
    code_snippet: str
    query: str

@router.post("/chat")
async def chat_with_coach(request: ChatRequest):
    """
    Send prompt to RAG pipeline and receive AI coach guidance.
    In a fully featured version, this would use StreamingResponse to stream back tokens.
    """
    
    # Constructing a comprehensive query incorporating the user's code and question.
    full_query = f"Problem ID: {request.problem_id}\n\nUser Code:\n{request.code_snippet}\n\nUser Question:\n{request.query}"
    
    response = await get_chat_response(full_query, request.problem_id)
    return {"reply": response}

@router.post("/editorials/index")
async def index_editorials():
    """
    Internal route to parse and upload raw editorial text into Qdrant.
    """
    # Logic to chunk editorials and index via vector_store.add_documents
    return {"status": "success", "message": "Editorials indexed successfully"}
