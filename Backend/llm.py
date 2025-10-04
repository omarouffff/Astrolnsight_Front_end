import os
from dotenv import load_dotenv
from groq import Groq


load_dotenv()

api_key = os.getenv("GROQ_API_KEY")

if not api_key:
    raise ValueError("GROQ_API_KEY is not set in the environment variables.")

llm_client = Groq(api_key=api_key)

def generate_llm_response(user_prompt: str, relevant_chunks: list[dict]) -> dict:

    context_documents = [chunk["document"] for chunk in relevant_chunks]
    context = "\n\n---\n\n".join(context_documents)
    
    citations = [chunk["metadata"] for chunk in relevant_chunks]
    citations_names_with_year = []
    
    final_prompt = (
        f"CONTEXT:\n{context}\n\n"
        f"---\n\n"
        f"Based on the context above, please answer the user question provided to you:\n"
        f"if you think that the context has no answer please respond with "
        f"'Unfortunately, we don't have an adequate answer for your question.' with empty citations\n'"
    )
    
    try:
        chat_completion = llm_client.chat.completions.create(
            messages=[
                {"role": "system", "content": final_prompt},
                {"role": "user", "content": user_prompt},
            ],
            model="llama-3.1-8b-instant",
            temperature=0.2,
            max_tokens=2048,
            top_p=1,
            stop=None,
            )
        final_response = chat_completion.choices[0].message.content

        print(final_response)
        unique_citations = []
        seen_titles = set()

        for c in citations:
            if c['title'] not in seen_titles:
                unique_citations.append(c)
                seen_titles.add(c['title'])

        # استبدال القائمة القديمة بالمنقحة
        citations = unique_citations
        print("\n--- Citations ---")
        if citations:
            for counter, citation_s in enumerate(citations, 1):
                print(f"[{counter}] {citation_s['title']} ({citation_s['year']})")
                print(f"    URL: {citation_s['url']}")
        else:
            print("No citations found.")
        for m in citations:
            citations_names_with_year.append({
                "title": m.get("title", ""),
                "year": m.get("year", "")
            })
        return {"answer": final_response,
                "citations": citations,
                "citationsNamesWithYear": citations_names_with_year}
    
    except Exception as e:
        '''
        print(f"An error occurred while calling the Groq API: {e}")
        return "Sorry, I encountered an error while generating a response."
        '''
        print(f"An error occurred while calling the Groq API: {e}")

        return {"answer": "Sorry, I encountered an error while generating a response.", "citations": []}
    
def get_cited_answer(user_question: str, relevant_chunks) -> dict:
    
    if not relevant_chunks:
        return {"answer": "I could not find any relevant information in the knowledge base to answer your question.", "citations": []}

    print("Step 2: Generating a synthesised answer with citations...")
    # Pass the retrieved data to the generator
    response = generate_llm_response(user_question, relevant_chunks)

    return response

# 5. An executable block to run a live demonstration
# if __name__ == '__main__':
#     # Example usage:
#     question = "What was the purpose of the Bion-M 1 mission and what was the condition of the mice after the flight?"
#
#     print(f"--- Querying the Astro-Insight Engine ---")
#     print(f"Question: {question}\n")
#     test_relevant_chunks_with_metadata = [
#         {
#             "document": "The aim of mice experiments in the Bion-M 1 project was to elucidate cellular and molecular mechanisms, underlying the adaptation of key physiological systems to long-term exposure in microgravity.",
#             "metadata": {"title": "Mice in Bion-M 1 Space Mission: Training and Selection", "year": 2014,
#                          "url": "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4136787/"}
#         },
#         {
#             "document": "The scientific program of the Bion-M 1 project was aimed at obtaining data on mechanisms of adaptation of muscle, bone, cardiovascular, sensorimotor and nervous systems to prolonged exposure in microgravity and during post-flight recovery.",
#             "metadata": {"title": "Mice in Bion-M 1 Space Mission: Training and Selection", "year": 2014,
#                          "url": "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4136787/"}
#         },
#         {
#             "document": "After the flight, mice were in good condition for biomedical studies and displayed signs of pronounced disadaptation to Earth's gravity. Examination of mice after the Bion-M 1 flight directly at the landing site (return +3 h) revealed gross motor function impairment: the mice could not maintain steady posture.",
#             # --- THIS COMMA FIXES THE PROBLEM ---
#             "metadata": {"title": "Mice in Bion-M 1 Space Mission: Training and Selection", "year": 2014,
#                          "url": "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4136787/"}
#         }
#     ]
#
#     final_response = get_cited_answer(question, test_relevant_chunks_with_metadata)
#
#     print("\n--- AI-Generated Answer ---")
#     print(final_response['answer'])
#
#     if final_response['citations']:
#         for i, citation in enumerate(final_response['citations'], 1):
#             print(f"[{i}] {citation['title']} ({citation['year']})")
#             print(f"    URL: {citation['url']}")
#     else:
#         print("No citations found.")
