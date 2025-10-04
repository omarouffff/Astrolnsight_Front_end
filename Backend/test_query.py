from sentence_transformers import SentenceTransformer
import chromadb
import llm


model = SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')
client = chromadb.PersistentClient(path="chroma_db")

def get_question_answer(question):
    query = question
    query_embedding = model.encode([query]).tolist()

    collection = client.get_collection(name="research_papers")

    results = collection.query(
        query_embeddings=query_embedding,
        n_results=5,
        include=['documents', 'metadatas']  # Ask ChromaDB for metadata
    )

    relevant_chunks = []

    if results.get('documents') and results.get('metadatas'):
        for doc_list, meta_list in zip(results['documents'], results['metadatas']):
            for doc, meta in zip(doc_list, meta_list):
                relevant_chunks.append({
                    "document": doc,
                    "metadata": meta
                })

    response = llm.generate_llm_response(question, relevant_chunks)

    return response

