import os
import webview 
import base64
import json
import sqlite3
import time
from google import genai
from dotenv import load_dotenv

load_dotenv()
class API:
    DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "kindness_ledger.db")
    def __init__(self):
        self.window = None 
        self.api_key = os.environ.get("GEMINI_API_KEY", "")
        print(self.api_key)
        if self.api_key:
            self.init_database() 

    def init_database(self):
        conn = sqlite3.connect(self.DB_PATH)
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS receipts (
                id TEXT PRIMARY KEY,
                vendor TEXT,
                total_amount TEXT,
                transaction_date TEXT,
                receipt_number TEXT,
                items_json TEXT,
                category_breakdown_json TEXT,
                due_cause_rating TEXT,
                compliance_reasoning TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.commit()
        conn.close()
        print(f"📁 Local SQLite Database active and synchronized at: {self.DB_PATH}")

    def save_to_db(self,payload):
        record_id = f"rec_{int(time.time() * 1000)}"

        conn = sqlite3.connect(self.DB_PATH)
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO receipts (id, vendor, total_amount, transaction_date, receipt_number, items_json, category_breakdown_json, due_cause_rating, compliance_reasoning)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
            record_id,
            payload.get("vendor", "Unknown Vendor"),
            payload.get("total_amount", "$0.00"),
            payload.get("date", "Unknown"),
            payload.get("receipt_number", "Unknown"),
            json.dumps(payload.get("items_extracted", [])),
            json.dumps(payload.get("category_breakdown", {})),
            payload.get("due_cause_rating", "FLAGGED"),
            payload.get("compliance_reasoning", "No context provided.")
        ))
        conn.commit()
        conn.close()

        return record_id

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
            You are a protective internal financial compliance auditor for a non-profit charity.
            Analyze this receipt image and judge if the purchase fits this mission: "{mission_statement}"

            Return an object with these EXACT keys (no markdown markdown wrapper code strings):
            {{
                "total_amount": "Total amount (e.g. 'R1016.74')",
                "vendor": "Store name",
                "date": "Transaction date (e.g. '2026-09-06')",
                "receipt_number": "Invoice ID number or document serial string",
                "items_extracted": [
                    {{"name": "Item name string", "price": "Item cost price string"}}
                ],
                "category_breakdown": {{
                    "Food & Meals": 450.00,
                    "Logistics & Transport": 0.00,
                    "Operational Overhead": 120.00,
                    "Unapproved / Disallowed": 446.74
                }},
                "due_cause_rating": "APPROVED, FLAGGED, or REJECTED",
                "compliance_reasoning": "A concise sentence explaining the rating."
            }}
            
            Note: Sum the absolute values inside 'category_breakdown' so that their totals match the receipt amount perfectly. Use numbers only for values inside the breakdown dictionary tracker mapping fields.
            """
            response = client.models.generate_content(
                model='gemini-3.6-flash',
                contents=[
                    {"inline_data": {"mime_type": "image/jpeg", "data": image_payload}},
                    prompt
                ]
            )
            clean_text = response.text.strip().replace("```json", "").replace("```", "")
            parsed_json = json.loads(clean_text)
            parsed_json["id"] = self.save_to_db(parsed_json)
            return parsed_json

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

    def load_receipts(self):
        try:
            conn = sqlite3.connect(self.DB_PATH)
            cursor = conn.cursor()
            cursor.execute("SELECT id, vendor, total_amount, transaction_date, receipt_number, items_json, category_breakdown_json, due_cause_rating, compliance_reasoning FROM receipts ORDER BY timestamp DESC")
            rows = cursor.fetchall()
            conn.close()

            records = []
            for row in rows:
                records.append({
                    "id": row[0],
                    "vendor": row[1],
                    "total": row[2],
                    "date": row[3],
                    "receiptNumber": row[4],
                    "items": json.loads(row[5]),
                    "categories": json.loads(row[6] if row[6] else "{}"),
                    "rating": row[7],
                    "reasoning": row[8]
                })
            return records
        except Exception as e:
            return {"error": f"Failed to pull historical archive: {str(e)}"}


if __name__ == '__main__':
    api = API()
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    INDEX_HTML = os.path.join(BASE_DIR, 'template', 'index.html')

    window = webview.create_window('Management System', INDEX_HTML,js_api=api,width=1024,height=768,fullscreen=True,min_size=(450, 600))
    api.window = window
    webview.start()