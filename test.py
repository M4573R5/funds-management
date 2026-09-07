import os
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()
client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

def extract_compliance_mission(pdf_path: str) -> str:
    """
    Uploads the donor rules PDF to Gemini and synthesizes a compressed
    compliance profile to feed into the receipt validation prompt.
    """
    # 1. Upload the PDF file using the File API
    print("Uploading donor rules PDF...")
    donor_rules_file = client.files.upload(file=pdf_path)
    
    # 2. Instruct Gemini to compress the legal text into a functional evaluation baseline
    extraction_prompt = """You are an expert NPO contract auditor. Read this South African Grant Agreement and extract a structured JSON payload containing: 1. Total Grant Amount, 2. Funding Start/End Dates, 3. Allowed Expenditure Categories, 4. Strictly Prohibited Items/Keywords, 5. Per-capita limits or branch-specific restrictions."""
    
    print("Extracting compliance charter...")
    response = client.models.generate_content(
        model="gemini-3.6-flash",
        contents=[donor_rules_file, extraction_prompt]
    )
    
    # 3. Clean up the uploaded file from cloud storage
    client.files.delete(name=donor_rules_file.name)
    
    return response.text.strip()

# --- Execution Workflow ---

# Step A: Parse the PDF rules dynamically into your variable
pdf_file_path = "donor_grant_restrictions_example.pdf" 
mission_statement = extract_compliance_mission(pdf_file_path)

# Print out what was generated to verify it caught the constraints
print("\nGenerated Compliance Mission Context:\n", mission_statement)
