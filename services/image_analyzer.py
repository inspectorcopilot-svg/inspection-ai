from openai import OpenAI
from dotenv import load_dotenv
import os
import base64
import json
import re

load_dotenv()

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


COPILOT_VISION_PROMPT = """
You are an AI inspection assistant.

Your job is to help an inspector understand observable conditions in an image.

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
- Only describe observable conditions
- Do not claim code violations
- Do not make final judgments
- Keep outputs short and actionable
"""


def extract_json(text: str):
    text = text.strip()
    text = re.sub(r"^```json", "", text)
    text = re.sub(r"^```", "", text)
    text = re.sub(r"```$", "", text)
    return json.loads(text.strip())


def analyze_inspection_image(image_path: str):
    with open(image_path, "rb") as file:
        encoded = base64.b64encode(file.read()).decode("utf-8")

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": COPILOT_VISION_PROMPT},
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": "Analyze this image and provide inspection suggestions.",
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{encoded}"
                        },
                    },
                ],
            },
        ],
    )

    return extract_json(response.choices[0].message.content)