from openai import OpenAI
from dotenv import load_dotenv
import os
import json
import re

load_dotenv()

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


COPILOT_TEXT_PROMPT = """
You are an AI inspection assistant.

Your job is to convert raw inspector notes into structured suggestions.

Return ONLY valid JSON.

Do NOT create a final report.

Output format:

{
  "suggestions": [
    {
      "system": "",
      "component": "",
      "finding": "",
      "risk": "",
      "recommended_action": "",
      "confidence": 0.0
    }
  ]
}

Rules:
- Be concise
- Only include real issues from text
- No guessing beyond provided info
"""


def extract_json(text: str):
    text = text.strip()
    text = re.sub(r"^```json", "", text)
    text = re.sub(r"^```", "", text)
    text = re.sub(r"```$", "", text)
    return json.loads(text.strip())


def analyze_text(text: str):
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": COPILOT_TEXT_PROMPT},
            {"role": "user", "content": text},
        ],
    )

    return extract_json(response.choices[0].message.content)