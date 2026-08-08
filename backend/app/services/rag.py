import os
from langchain_qdrant import QdrantVectorStore
from langchain_nvidia_ai_endpoints import ChatNVIDIA, NVIDIAEmbeddings
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_core.output_parsers import StrOutputParser
from qdrant_client import QdrantClient
from ..core.config import settings

# Initialize Qdrant Client
qdrant_client = QdrantClient(url=settings.QDRANT_URL)

# Embeddings (Using NVIDIA)
os.environ["NVIDIA_API_KEY"] = settings.NVIDIA_API_KEY
embeddings = NVIDIAEmbeddings(model="nvidia/nv-embedqa-e5-v5")

# Vector Store - we initialize it lazily or catch the error so the app can start
def get_vector_store():
    try:
        return QdrantVectorStore(
            client=qdrant_client,
            collection_name="cp_editorials",
            embedding=embeddings
        )
    except Exception as e:
        print(f"Warning: Qdrant collection might not exist yet. {e}")
        return None

def get_rag_chain():
    """
    Constructs the LangChain RAG pipeline using NVIDIA.
    """
    vector_store = get_vector_store()
    
    # NVIDIA LLM
    llm = ChatNVIDIA(
        model="meta/llama-3.1-8b-instruct", 
        temperature=0.3
    )

    if vector_store is None:
        template = """You are an elite Competitive Programming Coach. 
Your default behavior is to provide progressive hints without revealing the full direct solution.
HOWEVER, if the user explicitly asks for the full solution or code (e.g., 'give me the full solution', 'show me the code'), you MUST provide the complete, correct, and optimal C++ solution code to solve the problem. Do not refuse if they explicitly ask for it.

User Code & Query:
{question}

Coach Response:"""
        prompt = ChatPromptTemplate.from_template(template)
        return {"question": RunnablePassthrough()} | prompt | llm | StrOutputParser()
        
    retriever = vector_store.as_retriever(search_kwargs={"k": 3})

    template = """You are an elite Competitive Programming Coach. 
Your default behavior is to provide progressive hints without revealing the full direct solution.
HOWEVER, if the user explicitly asks for the full solution or code (e.g., 'give me the full solution', 'show me the code'), you MUST provide the complete, correct, and optimal C++ solution code to solve the problem. Do not refuse if they explicitly ask for it.

Context (Editorials/Hints):
{context}

User Code & Query:
{question}

Coach Response:"""
    
    prompt = ChatPromptTemplate.from_template(template)

    def format_docs(docs):
        return "\n\n".join(doc.page_content for doc in docs)

    rag_chain = (
        {"context": retriever | format_docs, "question": RunnablePassthrough()}
        | prompt
        | llm
        | StrOutputParser()
    )

    return rag_chain

async def get_chat_response(query: str, problem_id: str) -> str:
    """
    Invoke the RAG chain for a specific query. 
    In a real app, problem_id would be used to filter the retriever's metadata.
    """
    chain = get_rag_chain()
    # Note: To filter by problem_id in Qdrant, we would pass search_kwargs to the retriever dynamically
    # e.g., using VectorStoreRetriever with filter
    
    response = await chain.ainvoke(query)
    return response
