import os
import webview 
import base64
import json
from google import genai

from dotenv import load_dotenv
load_dotenv
class API:
    def __init__(self):
        self.window = None 
        self.api_key = os.environ.get("GEMINI_API_KEY", "")
        

    def audit_receipt_router(self, mode, file_path, direct_base64_data, mission_statement):
        if not self.api_key:
            return {"error": "API Key Missing! Set your GEMINI_API_KEY environment variable."}
            
        if not mission_statement.strip():
            return {"error": "Please provide your Organization's Mission Statement to judge due cause."}

        try:
            if mode == 'file':
                if not os.path.exists(file_path):
                    return {"error": f"Selected file path does not exist: {file_path}"}
                with open(file_path, "rb") as image_file:
                    image_payload = base64.b64encode(image_file.read()).decode("utf-8")
            else:
                if "," in direct_base64_data:
                    image_payload = direct_base64_data.split(",", 1)[1]
                else:
                    image_payload = direct_base64_data

            client = genai.Client(api_key=self.api_key)

            prompt = f"""
            You are a rigorous, highly protective internal financial compliance auditor for a non-profit charity.
            Your task is to analyze this receipt image and judge if the purchase directly aligns with the charity's mission statement.

            Charity Mission Statement: "{mission_statement}"

            Analyze the image and return a JSON object with these EXACT keys (do not wrap in markdown ```json blocks):
            {{
                "total_amount": "The total currency amount identified on the receipt (string, e.g. 'R1,016.74')",
                "vendor": "Name of the store or vendor (string, e.g. 'Checkers')",
                "date": "The transaction date found on the receipt (string, e.g. '2026-09-06' or 'Unknown')",
                "receipt_number": "The receipt number, invoice ID, or document tax number (string, e.g. 'INV-48291' or 'Unknown')",
                "items_extracted": [
                    {{"name": "Item name string", "price": "Item price string"}}
                ],
                "due_cause_rating": "Either 'APPROVED', 'FLAGGED', or 'REJECTED' based on how well items match the mission statement (string)",
                "compliance_reasoning": "A concise, objective single sentence explaining your compliance rating."
            }}
            """
            response = client.models.generate_content(
                model='gemini-3.6-flash',
                contents=[
                    {"inline_data": {"mime_type": "image/jpeg", "data": image_payload}},
                    prompt
                ]
            )
            clean_text = response.text.strip().replace("```json", "").replace("```", "")
            return json.loads(clean_text)

        except Exception as e:
            return {"error": f"Audit execution failed: {str(e)}"}

    def select_local_file(self):
        file_types = ('Image Files (*.jpg;*.jpeg;*.png)', 'All files (*.*)')
        result = self.window.create_file_dialog(webview.OPEN_DIALOG, allow_multiple=False, file_types=file_types)
        if not result:
            return ""

        if isinstance(result, (list, tuple)):
            if len(result) > 0:
                return str(result[0])
            return ""
            
        return str(result)

if __name__ == '__main__':
    api = API()
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    INDEX_HTML = os.path.join(BASE_DIR, 'template', 'index.html')

    window = webview.create_window('Management System', INDEX_HTML,js_api=api,width=1024,height=768,fullscreen=True,min_size=(450, 600))
    api.window = window
    webview.start()