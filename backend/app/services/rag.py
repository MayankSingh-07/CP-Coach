import os
from langchain_nvidia_ai_endpoints import ChatNVIDIA
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_core.output_parsers import StrOutputParser
from ..core.config import settings

# C-2: Set env var eagerly so the SDK can find it
os.environ["NVIDIA_API_KEY"] = settings.NVIDIA_API_KEY

# L-7: Cache the RAG chain at module level so it's not rebuilt on every request
_cached_chain = None

def _build_chain():
    """
    Constructs the LangChain pipeline using NVIDIA.
    C-2: Qdrant initialization is removed entirely — it was never deployed.
    The app now runs in pure LLM mode (no vector retrieval) which is the actual
    production state. Qdrant can be re-added later as an optional enhancement.
    """
    llm = ChatNVIDIA(
        model="meta/llama-3.1-8b-instruct",
        temperature=0.3
    )

    template = """You are an elite Competitive Programming Coach.
Your default behavior is to provide progressive hints without revealing the full direct solution.
HOWEVER, if the user explicitly asks for the full solution or code (e.g., 'give me the full solution', 'show me the code'), you MUST provide the complete, correct, and optimal C++ solution code to solve the problem. Do not refuse if they explicitly ask for it.

User Code & Query:
{question}

Coach Response:"""

    prompt = ChatPromptTemplate.from_template(template)
    return {"question": RunnablePassthrough()} | prompt | llm | StrOutputParser()


def get_rag_chain():
    """L-7: Returns the cached chain, building it only once."""
    global _cached_chain
    if _cached_chain is None:
        _cached_chain = _build_chain()
    return _cached_chain


async def get_chat_response(query: str, problem_id: str) -> str:
    """
    Invoke the LLM chain for a specific query.
    """
    chain = get_rag_chain()
    response = await chain.ainvoke(query)
    return response
