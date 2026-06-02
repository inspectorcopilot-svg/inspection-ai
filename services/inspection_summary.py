from typing import Dict, List


class InspectionSummaryLayer:
    def build_summary(self, session: Dict) -> Dict:
        issues = session.get("issues", [])
        confirmed = session.get("confirmed", [])
        pending = session.get("pending", [])

        return {
            "critical": self._filter(issues, ["CRITICAL"]),
            "high": self._filter(issues, ["HIGH", "CRITICAL"]),
            "all": issues,
            "copy_blocks": self._build_copy_blocks(confirmed),
            "missed_areas": session.get("coverage_notes", self._detect_gaps(issues)),
            "quick_stats": self._stats(issues),
            "pending_count": len(pending),
            "confirmed_count": len(confirmed),
        }

    def _filter(self, issues: List[Dict], levels: List[str]) -> List[Dict]:
        return [
            issue for issue in issues
            if issue.get("priority_level") in levels
        ]

    def _build_copy_blocks(self, issues: List[Dict]) -> List[str]:
        blocks = []

        for issue in issues:
            block = f"""
SYSTEM: {issue.get("system")}
COMPONENT: {issue.get("component")}
ISSUE: {issue.get("professional_finding")}
RISK: {issue.get("risk_hint")}
PRIORITY: {issue.get("priority_level")} ({issue.get("priority_score")})
RECOMMENDATION: {issue.get("recommended_action")}
""".strip()

            blocks.append(block)

        return blocks

    def _detect_gaps(self, issues: List[Dict]) -> List[str]:
        expected = {"Electrical", "Plumbing", "HVAC", "Structural"}
        seen = {issue.get("system") for issue in issues}

        return sorted(list(expected - seen))

    def _stats(self, issues: List[Dict]) -> Dict:
        return {
            "total": len(issues),
            "critical": len([i for i in issues if i.get("priority_level") == "CRITICAL"]),
            "high": len([i for i in issues if i.get("priority_level") == "HIGH"]),
            "medium": len([i for i in issues if i.get("priority_level") == "MEDIUM"]),
            "low": len([i for i in issues if i.get("priority_level") == "LOW"]),
        }


inspection_summary = InspectionSummaryLayer()