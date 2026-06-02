from typing import Dict


class InspectionIntelligenceEngine:
    def __init__(self):
        self.system_weights = {
            "Electrical": 1.4,
            "Plumbing": 1.3,
            "HVAC": 1.1,
            "Structural": 1.5,
            "Roofing": 1.2,
            "Exterior": 1.0,
            "General": 1.0,
        }

        self.override_memory = {
            "downrated_patterns": {},
            "uprated_patterns": {},
        }

    def score(self, issue: Dict) -> Dict:
        system = issue.get("system", "General")
        risk_hint = issue.get("risk_hint", "low")
        confidence = float(issue.get("confidence", 0.5))

        base = 0.0
        base += 20 * self.system_weights.get(system, 1.0)
        base += self._risk_score(risk_hint)
        base += confidence * 20

        text = (
            issue.get("finding", "") + " " +
            issue.get("professional_finding", "")
        ).lower()

        if any(word in text for word in ["burn", "smoke", "fire", "arcing", "sparking"]):
            base += 25

        if any(word in text for word in ["leak", "water", "moisture", "stain"]):
            base += 18

        if any(word in text for word in ["crack", "foundation", "movement"]):
            base += 12

        base += self._apply_memory_bias(text)

        score = round(max(0, min(100, base)), 2)

        return {
            "priority_score": score,
            "priority_level": self._level(score),
            "reasoning": self._explain(issue, score),
        }

    def _risk_score(self, risk_hint: str) -> int:
        return {
            "high": 35,
            "medium": 20,
            "low": 10,
        }.get(risk_hint, 10)

    def _level(self, score: float) -> str:
        if score >= 80:
            return "CRITICAL"
        if score >= 60:
            return "HIGH"
        if score >= 40:
            return "MEDIUM"
        return "LOW"

    def _explain(self, issue: Dict, score: float) -> str:
        reasons = []

        system = issue.get("system")
        risk = issue.get("risk_hint")
        confidence = float(issue.get("confidence", 0.5))

        if system == "Electrical":
            reasons.append("electrical system safety priority")

        if system == "Structural":
            reasons.append("structural system elevated concern")

        if risk == "high":
            reasons.append("high risk indicators detected")
        elif risk == "medium":
            reasons.append("moderate risk indicators detected")

        if confidence >= 0.85:
            reasons.append("high confidence observation")
        elif confidence < 0.6:
            reasons.append("lower confidence observation requires inspector validation")

        if score >= 80:
            reasons.append("requires immediate inspector attention")
        elif score >= 60:
            reasons.append("should be reviewed promptly")

        return "; ".join(reasons) if reasons else "standard inspection observation"

    def _apply_memory_bias(self, text: str) -> float:
        bias = 0.0

        for pattern, weight in self.override_memory["downrated_patterns"].items():
            if pattern in text:
                bias -= weight

        for pattern, weight in self.override_memory["uprated_patterns"].items():
            if pattern in text:
                bias += weight

        return bias

    def apply_override(self, issue: Dict, original_score: float, adjusted_score: float):
        if adjusted_score is None:
            return {
                "memory_updated": False,
                "reason": "No adjusted score provided.",
            }

        if original_score is None:
            original_score = 0

        text = (
            issue.get("finding", "") + " " +
            issue.get("professional_finding", "")
        ).lower()

        pattern = self._extract_pattern(text)
        delta = adjusted_score - original_score

        if delta < -5:
            self.override_memory["downrated_patterns"][pattern] = (
                self.override_memory["downrated_patterns"].get(pattern, 0) + abs(delta)
            )

        elif delta > 5:
            self.override_memory["uprated_patterns"][pattern] = (
                self.override_memory["uprated_patterns"].get(pattern, 0) + delta
            )

        return {
            "pattern": pattern,
            "learned_delta": delta,
            "memory_updated": abs(delta) > 5,
        }

    def _extract_pattern(self, text: str) -> str:
        if any(word in text for word in ["burn", "smoke", "arcing", "sparking"]):
            return "electrical_thermal_damage"

        if any(word in text for word in ["leak", "water", "moisture", "stain"]):
            return "water_intrusion"

        if "crack" in text:
            return "structural_crack"

        return "general_issue"


intelligence_engine = InspectionIntelligenceEngine()