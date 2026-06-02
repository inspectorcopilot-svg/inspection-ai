from typing import Dict
import re


class InspectionNormalizer:
    def __init__(self):
        self.system_map = {
            "Electrical": ["outlet", "breaker", "panel", "wiring", "gfci", "switch", "electrical", "receptacle"],
            "Plumbing": ["leak", "pipe", "water", "faucet", "drain", "ceiling", "stain", "toilet", "sink"],
            "HVAC": ["furnace", "filter", "air", "vent", "ac", "heating", "cooling"],
            "Structural": ["wall", "crack", "foundation", "beam", "drywall", "joist"],
            "Roofing": ["roof", "shingle", "flashing", "chimney"],
            "Exterior": ["siding", "window", "door", "deck", "porch"],
        }

        self.component_map = {
            "gfci": "GFCI Outlet",
            "outlet": "Electrical Outlet",
            "receptacle": "Electrical Outlet",
            "breaker": "Circuit Breakers",
            "panel": "Electrical Panel",
            "subpanel": "Subpanel",
            "wiring": "Electrical Wiring",
            "ceiling": "Ceiling",
            "pipe": "Pipe",
            "drain": "Drain Line",
            "furnace filter": "Furnace Filter",
            "filter": "Furnace Filter",
            "foundation": "Foundation Wall",
            "wall": "Wall",
            "roof": "Roof Surface",
            "shingle": "Shingles",
        }

    def normalize(self, raw_text: str) -> Dict:
        text = raw_text.strip()

        system = self._detect_system(text)
        component = self._detect_component(text)

        finding = self._extract_finding(text)
        professional = self._professional_rewrite(finding, system, component)

        return {
            "system": system,
            "component": component,
            "finding": finding,
            "professional_finding": professional,
            "risk_hint": self._risk_hint(text),
            "recommended_action": self._recommended_action(text, system, component),
            "confidence": self._confidence(text),
        }

    def _detect_system(self, text: str) -> str:
        text_lower = text.lower()

        scores = {}
        for system, keywords in self.system_map.items():
            scores[system] = sum(1 for keyword in keywords if keyword in text_lower)

        best = max(scores, key=scores.get)

        return best if scores[best] > 0 else "General"

    def _detect_component(self, text: str) -> str:
        text_lower = text.lower()

        exact_matches = sorted(
            self.component_map.items(),
            key=lambda item: len(item[0]),
            reverse=True,
        )

        for keyword, component in exact_matches:
            if keyword in text_lower:
                return component

        words = re.findall(r"\b[a-zA-Z]{4,}\b", text)
        if words:
            return words[-1].capitalize()

        return "General"

    def _extract_finding(self, text: str) -> str:
        cleaned = text.strip()

        cleanup_phrases = [
            "i see",
            "there is",
            "there are",
            "looks like",
            "appears to be",
            "i noticed",
            "noticing",
        ]

        lowered = cleaned.lower()
        for phrase in cleanup_phrases:
            lowered = lowered.replace(phrase, "")

        return lowered.strip().capitalize()

    def _professional_rewrite(self, finding: str, system: str, component: str) -> str:
        text = finding.lower()

        if any(word in text for word in ["burn", "smoke", "arcing", "scorch"]):
            return (
                f"Evidence of thermal damage observed at the {component.lower()}, "
                "consistent with possible overheating or electrical arcing conditions."
            )

        if any(word in text for word in ["leak", "water", "stain", "moisture"]):
            return (
                "Moisture-related staining or water intrusion observed, suggesting "
                "a potential active or prior leak condition."
            )

        if any(word in text for word in ["crack", "settlement", "movement"]):
            return (
                f"Cracking or movement observed at the {component.lower()}, "
                "requiring further evaluation to determine severity and progression."
            )

        if system == "HVAC":
            return (
                "HVAC system condition observed that may affect airflow, efficiency, "
                "or maintenance performance."
            )

        return f"Condition observed at the {component.lower()} requiring further inspection and evaluation."

    def _risk_hint(self, text: str) -> str:
        text_lower = text.lower()

        if any(word in text_lower for word in ["burn", "smoke", "fire", "sparking", "arcing", "shock"]):
            return "high"

        if any(word in text_lower for word in ["leak", "crack", "stain", "loose", "moisture", "rust"]):
            return "medium"

        return "low"

    def _recommended_action(self, text: str, system: str, component: str) -> str:
        text_lower = text.lower()

        if any(word in text_lower for word in ["burn", "smoke", "sparking", "arcing"]):
            return "Recommend evaluation and repair by a qualified electrician."

        if any(word in text_lower for word in ["leak", "water", "moisture", "stain"]):
            return "Recommend identifying the moisture source and repairing as needed."

        if "crack" in text_lower:
            return "Recommend further evaluation to determine cause and necessary repair."

        if system == "HVAC":
            return "Recommend servicing or maintenance by a qualified HVAC professional."

        return "Recommend further evaluation and correction as needed."

    def _confidence(self, text: str) -> float:
        score = 0.6

        if len(text.split()) > 8:
            score += 0.15

        if any(word in text.lower() for word in ["burn", "leak", "crack", "smoke", "water"]):
            score += 0.15

        if any(word in text.lower() for word in ["maybe", "unclear", "possibly", "not sure"]):
            score -= 0.2

        return round(max(0.1, min(0.95, score)), 2)


normalizer = InspectionNormalizer()