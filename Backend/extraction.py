import pandas as pd
import requests
from bs4 import BeautifulSoup
import nltk
import tiktoken
from sentence_transformers import SentenceTransformer
import chromadb
import time
import re # Import the regular expression module

# --- INITIAL SETUP (Same as before) ---
print("Loading embedding model...")
model = SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')
nltk.download("punkt", quiet=True)
tokenizer = tiktoken.get_encoding("cl100k_base")
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
}

# --- HELPER FUNCTIONS ---
def fetch_text(url):
    try:
        response = requests.get(url, headers=headers, timeout=20)
        response.raise_for_status()
        return response.text
    except Exception as e:
        print(f"Error fetching {url}: {e}")
        return None

# --- NEW METADATA EXTRACTION FUNCTION ---
def extract_year_from_html(soup):
    """
    Finds the publication year from the specific citation section in the HTML.
    """
    try:
        # Target the specific section using the class you found
        citation_section = soup.find('section', class_='pmc-layout__citation')
        if citation_section:
            citation_text = citation_section.get_text()
            # Use a regular expression to find a four-digit year (e.g., 2021)
            match = re.search(r'\b(19|20)\d{2}\b', citation_text)
            if match:
                return int(match.group(0)) # Return the found year as an integer
    except Exception as e:
        print(f"Could not extract year: {e}")
    return None # Return None if the year can't be found

def chunk_text(text, max_tokens=512):
    sentences = nltk.sent_tokenize(text)
    chunks = []
    current_chunk = []
    current_len = 0
    for sent in sentences:
        sent_tokens = tokenizer.encode(sent)
        if current_len + len(sent_tokens) > max_tokens:
            chunks.append(" ".join(current_chunk))
            current_chunk = [sent]
            current_len = len(sent_tokens)
        else:
            current_chunk.append(sent)
            current_len += len(sent_tokens)
    if current_chunk:
        chunks.append(" ".join(current_chunk))
    return chunks

# --- MAIN DATA PROCESSING LOGIC ---
print("Loading full publication list...")
df = pd.read_csv("SB_publication_PMC.csv") 

all_chunks = []
all_metadatas = []
all_ids = []

print(f"Starting to process {len(df)} publications...")
for index, row in df.iterrows():
    url = row['Link']
    title = row['Title']

    print(f"  -> Processing ({index+1}/{len(df)}): {title}")
    html_content = fetch_text(url)
    if not html_content:
        continue

    soup = BeautifulSoup(html_content, "html.parser")
    
    # ** NEW STEP: Extract the year directly from the page content **
    year = extract_year_from_html(soup)
    if not year:
        print(f"     WARNING: Could not find publication year for {title}. Skipping.")
        continue # Skip this article if we can't find a year

    # Extract the main body text for embedding (same logic as before)
    sections = soup.select("section[id^=s]")
    paragraphs = [p.get_text(strip=True) for sec in sections for p in sec.find_all("p")]
    clean_text = "\n".join(paragraphs)

    if not clean_text:
        print(f"     No content found for {title}. Skipping.")
        continue

    # Chunk the text and create associated metadata for each chunk
    chunks = chunk_text(clean_text)
    for i, chunk in enumerate(chunks):
        all_chunks.append(chunk)
        all_ids.append(f"pub_{index}_chunk_{i}")
        all_metadatas.append({
            "title": str(title),
            "year": int(year),
            "url": str(url)
        })
    
    time.sleep(0.5)

print(f"\nTotal chunks created: {len(all_chunks)}")

# Generate embeddings for ALL chunks
print("Generating embeddings for all chunks...")
embeddings = model.encode(all_chunks, show_progress_bar=True)

# (Your existing code to create all_chunks, all_metadatas, all_ids, and embeddings)

print("Connecting to ChromaDB and building collection...")
client = chromadb.PersistentClient(path="chroma_db")
collection = client.get_or_create_collection(name="research_papers")

# --- FIX: ADD DATA IN BATCHES ---
batch_size = 4000 # A safe number below the 5461 limit
num_chunks = len(all_chunks)

print(f"Adding {num_chunks} chunks to the database in batches of {batch_size}...")

for i in range(0, num_chunks, batch_size):
    # Determine the end of the current batch
    end_index = min(i + batch_size, num_chunks)
    
    # Get the slice for the current batch
    batch_ids = all_ids[i:end_index]
    batch_documents = all_chunks[i:end_index]
    batch_embeddings = embeddings[i:end_index] # Assuming 'embeddings' is a list or numpy array
    batch_metadatas = all_metadatas[i:end_index]

    # Add the current batch to the collection
    collection.add(
        ids=batch_ids,
        documents=batch_documents,
        embeddings=batch_embeddings.tolist(), # Ensure embeddings are in list format
        metadatas=batch_metadatas
    )
    print(f" -> Added batch {i//batch_size + 1}/{(num_chunks + batch_size - 1)//batch_size}")


print("\n✅ Complete, metadata-rich database created! Phase 1 is complete.")
