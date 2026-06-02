from typing import Dict


class InteractionEngine:
    def process_observation(self, issue: Dict) -> Dict:
        return {
            "issue_id": issue.get("id"),
            "priority_level": issue.get("priority_level"),
            "priority_score": issue.get("priority_score"),
            "co_pilot_message": self._generate_message(issue),
            "suggest_photo": self._should_suggest_photo(issue),
            "suggest_follow_up": self._should_suggest_follow_up(issue),
            "next_action": self._next_action(issue),
        }

    def _generate_message(self, issue: Dict) -> str:
        level = issue.get("priority_level")

        if level == "CRITICAL":
            return "Critical issue detected. Document with photo and review before continuing."

        if level == "HIGH":
            return "High priority issue identified. Photo documentation is recommended."

        if level == "MEDIUM":
            return "Moderate issue noted. Consider documenting for review."

        return "Low priority observation recorded."

    def _should_suggest_photo(self, issue: Dict) -> bool:
        text = (
            issue.get("finding", "") + " " +
            issue.get("professional_finding", "")
        ).lower()

        if issue.get("priority_score", 0) >= 70:
            return True

        return any(word in text for word in ["burn", "smoke", "leak", "crack", "water", "moisture"])

    def _should_suggest_follow_up(self, issue: Dict) -> bool:
        return issue.get("priority_level") in ["CRITICAL", "HIGH"]

    def _next_action(self, issue: Dict) -> str:
        if issue.get("priority_level") == "CRITICAL":
            return "STOP_AND_DOCUMENT"

        if issue.get("priority_level") == "HIGH":
            return "PHOTO_AND_CONTINUE"

        return "CONTINUE"


interaction_engine = InteractionEngine()