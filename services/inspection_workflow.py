"""
services/inspection_workflow.py

Inspection Co-Pilot Workflow Engine

TABLE OF CONTENTS

1. Imports
2. Session State Constants
3. Session Data Model
4. Workflow Class Setup
5. Session Management
6. Context Management
7. Observation Processing
8. Follow-Up Questions
9. Photo Attachment
10. Issue Lookup Helpers
11. Review / Decision Workflow
12. Coverage Checks
13. Pending / Confirmed Retrieval
14. Report Block Generation
15. Summary Layer
16. Session Persistence

NOTES FOR FUTURE CHANGES

- Add new workflow states in Section 2.
- Add new issue fields in Section 7.
- Add new follow-up logic in Section 8.
- Add save/load changes in Section 16.
"""


# ================================================================
# 1. IMPORTS
# ================================================================

from typing import Dict, List
from uuid import uuid4
from dataclasses import dataclass, field

from services.normalizer import normalizer
from services.intelligence_engine import intelligence_engine
from services.interaction_engine import interaction_engine
from services.inspection_summary import inspection_summary


# ================================================================
# 2. SESSION STATE CONSTANTS
# ================================================================

class SessionState:
    """
    High-level backend workflow states.

    These are currently lightweight states, while the frontend handles
    Inspection / Review / Complete UI modes.
    """

    INIT = "init"
    CONTEXT_SET = "context_set"
    OBSERVATION_RECEIVED = "observation_received"
    READY_FOR_REVIEW = "ready_for_review"
    COMPLETED = "completed"


# ================================================================
# 3. SESSION DATA MODEL
# ================================================================

@dataclass
class InspectionSession:
    """
    In-memory inspection session.

    This is the main object saved, loaded, and updated throughout an inspection.
    """

    session_id: str
    inspection_title: str = "Untitled Inspection"
    state: str = SessionState.INIT

    # Current area/system/component.
    context: Dict = field(default_factory=dict)

    # Raw observations and normalized outputs.
    observations: List[Dict] = field(default_factory=list)

    # All issues ever created in this session.
    issues: List[Dict] = field(default_factory=list)

    # Issues waiting for inspector approval/rejection/override.
    pending_review: List[Dict] = field(default_factory=list)

    # Approved findings used for copy/paste report blocks.
    confirmed: List[Dict] = field(default_factory=list)

    # Coverage suggestions created at completion.
    coverage_notes: List[str] = field(default_factory=list)


# ================================================================
# 4. WORKFLOW CLASS SETUP
# ================================================================

class InspectionWorkflow:
    """
    Main workflow engine.

    Responsibilities:
    - manage sessions
    - process observations
    - score findings
    - ask follow-up questions
    - attach photos
    - approve/reject/override findings
    - generate report blocks
    - export/import sessions
    """

    def __init__(self):
        # Active sessions live here while backend is running.
        self.sessions: Dict[str, InspectionSession] = {}


    # ================================================================
    # 5. SESSION MANAGEMENT
    # ================================================================

    def create_session(self, inspection_title: str = "Untitled Inspection") -> str:
        """Create a new inspection session and return its ID."""

        session_id = str(uuid4())
        self.sessions[session_id] = InspectionSession(
            session_id=session_id,
            inspection_title=inspection_title,
        )
        return session_id

    def get_session(self, session_id: str) -> InspectionSession:
        """
        Get an active session by ID.

        Raises:
            ValueError if session is not active/loaded.
        """

        if session_id not in self.sessions:
            raise ValueError(f"Session not found: {session_id}")

        return self.sessions[session_id]


    # ================================================================
    # 6. CONTEXT MANAGEMENT
    # ================================================================

    def set_context(self, session_id: str, context: Dict) -> Dict:
        """
        Set current inspection target.

        Context usually contains:
        - system
        - component
        - location_note
        """

        session = self.get_session(session_id)
        session.context = context
        session.state = SessionState.CONTEXT_SET

        return {
            "session_id": session_id,
            "state": session.state,
            "context": session.context,
        }


    # ================================================================
    # 7. OBSERVATION PROCESSING
    # ================================================================

    def add_observation(self, session_id: str, raw_input: str) -> Dict:
        """
        Process raw inspector observation.

        Pipeline:
        1. Normalize raw speech/text.
        2. Apply current context if needed.
        3. Create issue object.
        4. Score issue.
        5. Generate co-pilot interaction.
        6. Generate smart follow-up question.
        7. Add issue to pending review queue.
        """

        session = self.get_session(session_id)

        # Convert inspector language into structured/professional fields.
        normalized = normalizer.normalize(raw_input)

        # Use active context when normalizer cannot determine system/component.
        if session.context:
            if normalized.get("system") == "General" and session.context.get("system"):
                normalized["system"] = session.context["system"]

            if normalized.get("component") == "General" and session.context.get("component"):
                normalized["component"] = session.context["component"]

        # Main issue object used throughout the workflow.
        issue = {
            "id": str(uuid4()),
            "system": normalized["system"],
            "component": normalized["component"],
            "finding": normalized["finding"],
            "professional_finding": normalized["professional_finding"],
            "risk_hint": normalized["risk_hint"],
            "recommended_action": normalized["recommended_action"],
            "confidence": normalized["confidence"],
            "status": "pending",
            "photos": [],
        }

        # Add priority score, level, and reasoning.
        intelligence = intelligence_engine.score(issue)
        issue.update(intelligence)

        # Add co-pilot message, photo recommendation, and next action.
        interaction = interaction_engine.process_observation(issue)
        issue["interaction"] = interaction

        # Add smart follow-up question if useful.
        issue["follow_up"] = self._generate_follow_up(issue)

        # Store raw/normalized observation for audit trail.
        session.observations.append(
            {
                "raw_input": raw_input,
                "normalized": normalized,
                "issue_id": issue["id"],
            }
        )

        # Store issue in master issue list and pending review queue.
        session.issues.append(issue)
        session.pending_review.append(issue)
        session.state = SessionState.OBSERVATION_RECEIVED

        return {
            "session_id": session_id,
            "issue": issue,
            "interaction": interaction,
            "follow_up": issue["follow_up"],
            "state": session.state,
        }


    # ================================================================
    # 8. FOLLOW-UP QUESTIONS
    # ================================================================

    def answer_follow_up(self, session_id: str, issue_id: str, answer: str) -> Dict:
        """
        Record follow-up answer and update issue.

        The answer may adjust:
        - professional finding
        - risk hint
        - confidence
        - priority score
        - interaction message
        """

        session = self.get_session(session_id)
        issue = self._find_issue(session, issue_id)

        if not issue:
            raise ValueError(f"Issue not found: {issue_id}")

        answer_clean = answer.strip()

        issue["follow_up"]["answered"] = True
        issue["follow_up"]["answer"] = answer_clean

        issue["professional_finding"] = (
            f"{issue.get('professional_finding')} Inspector follow-up: {answer_clean}."
        )

        self._apply_follow_up_risk_adjustment(issue, answer_clean)

        updated_intelligence = intelligence_engine.score(issue)
        issue.update(updated_intelligence)

        updated_interaction = interaction_engine.process_observation(issue)
        issue["interaction"] = updated_interaction

        return {
            "session_id": session_id,
            "issue": issue,
            "interaction": updated_interaction,
            "message": "Follow-up answer recorded and issue updated.",
        }

    def _generate_follow_up(self, issue: Dict) -> Dict:
        """
        Generate smart follow-up question.

        Add new follow-up categories here.
        """

        text = (
            issue.get("finding", "") + " " +
            issue.get("professional_finding", "")
        ).lower()

        system = issue.get("system")
        component = issue.get("component")

        if any(word in text for word in ["burn", "smoke", "arcing", "sparking", "hot"]):
            return {
                "required": True,
                "answered": False,
                "question": f"Is the {component.lower()} warm to the touch, actively sparking, or showing an odor of overheating?",
                "answer": None,
            }

        if any(word in text for word in ["water", "leak", "moisture", "stain"]):
            return {
                "required": True,
                "answered": False,
                "question": "Does the staining or moisture appear wet, active, or dry at the time of inspection?",
                "answer": None,
            }

        if any(word in text for word in ["crack", "movement", "settlement", "foundation"]):
            return {
                "required": True,
                "answered": False,
                "question": "Is the crack wider than hairline size, displaced, or showing signs of recent movement?",
                "answer": None,
            }

        if system == "HVAC":
            return {
                "required": True,
                "answered": False,
                "question": "Is airflow restricted, noise present, or maintenance visibly overdue?",
                "answer": None,
            }

        return {
            "required": False,
            "answered": False,
            "question": None,
            "answer": None,
        }

    def _apply_follow_up_risk_adjustment(self, issue: Dict, answer: str):
        """
        Adjust risk based on follow-up answer.

        This is rule-based for now.
        Later this can become AI-assisted or inspector-configurable.
        """

        answer_lower = answer.lower()

        high_risk_terms = [
            "active",
            "wet",
            "warm",
            "hot",
            "sparking",
            "burning smell",
            "odor",
            "displaced",
            "recent movement",
            "wider",
        ]

        low_risk_terms = [
            "dry",
            "old",
            "minor",
            "hairline",
            "no odor",
            "not warm",
            "no movement",
        ]

        if any(term in answer_lower for term in high_risk_terms):
            issue["risk_hint"] = "high"
            issue["confidence"] = min(0.95, issue.get("confidence", 0.5) + 0.1)

        elif any(term in answer_lower for term in low_risk_terms):
            if issue.get("risk_hint") == "high":
                issue["risk_hint"] = "medium"
            elif issue.get("risk_hint") == "medium":
                issue["risk_hint"] = "low"

            issue["confidence"] = min(0.95, issue.get("confidence", 0.5) + 0.05)


    # ================================================================
    # 9. PHOTO ATTACHMENT
    # ================================================================

    def attach_photo(
        self,
        session_id: str,
        issue_id: str,
        photo_path: str,
        photo_url: str,
        original_filename: str,
    ) -> Dict:
        """
        Attach uploaded photo to a finding.

        The actual file is saved by main.py.
        This method links the saved file to the issue.
        """

        session = self.get_session(session_id)
        issue = self._find_issue(session, issue_id)

        if not issue:
            raise ValueError(f"Issue not found: {issue_id}")

        photo_record = {
            "photo_id": str(uuid4()),
            "path": photo_path,
            "url": photo_url,
            "filename": original_filename,
        }

        if "photos" not in issue:
            issue["photos"] = []

        issue["photos"].append(photo_record)

        issue["photo_documentation"] = {
            "attached": True,
            "count": len(issue["photos"]),
        }

        return {
            "session_id": session_id,
            "issue_id": issue_id,
            "photo": photo_record,
            "photo_count": len(issue["photos"]),
            "issue": issue,
            "message": "Photo attached to finding.",
        }


    # ================================================================
    # 10. ISSUE LOOKUP HELPERS
    # ================================================================

    def _find_issue(self, session: InspectionSession, issue_id: str):
        """
        Find issue inside a session by issue ID.

        Returns:
            issue dict or None
        """

        for issue in session.issues:
            if issue.get("id") == issue_id:
                return issue

        return None


    # ================================================================
    # 11. REVIEW / DECISION WORKFLOW
    # ================================================================

    def process_decisions(self, session_id: str, decisions: List[Dict]) -> Dict:
        """
        Process inspector review decisions.

        Supported statuses:
        - approved: moves issue to confirmed
        - rejected: marks issue rejected
        - override: changes priority score/level and learns from adjustment
        """

        session = self.get_session(session_id)

        confirmed = []
        rejected = []
        overridden = []

        for decision in decisions:
            decision_id = decision.get("id")
            status = decision.get("status")
            adjusted_score = decision.get("adjusted_score")

            for issue in session.pending_review:
                if issue.get("id") != decision_id:
                    continue

                original_score = issue.get("priority_score", 0)

                if decision.get("edited_finding"):
                    issue["finding"] = decision["edited_finding"]
                    issue["professional_finding"] = decision["edited_finding"]

                if decision.get("edited_action"):
                    issue["recommended_action"] = decision["edited_action"]

                if status == "approved":
                    issue["status"] = "approved"
                    session.confirmed.append(issue)
                    confirmed.append(issue)

                elif status == "rejected":
                    issue["status"] = "rejected"
                    rejected.append(issue)

                elif status == "override":
                    if adjusted_score is not None:

                        learn_from_override = decision.get(
                            "learn_from_override",
                            True,
                        )

                        learning = None

                        if learn_from_override:
                            learning = intelligence_engine.apply_override(
                                issue,
                                original_score,
                                adjusted_score,
                            )

                        issue["priority_score"] = adjusted_score
                        issue["priority_level"] = intelligence_engine._level(
                            adjusted_score
                        )

                        issue["override_learning_enabled"] = (
                            learn_from_override
                        )

                        if learning is not None:
                            issue["override_learning"] = learning

                        issue["status"] = "pending"

                        overridden.append(issue)

                break

        # Keep only still-pending issues in review queue.
        session.pending_review = [
            issue for issue in session.pending_review
            if issue.get("status") == "pending"
        ]

        session.state = SessionState.READY_FOR_REVIEW

        return {
            "session_id": session_id,
            "confirmed": confirmed,
            "rejected": rejected,
            "overridden": overridden,
            "pending_remaining": len(session.pending_review),
            "state": session.state,
        }


    # ================================================================
    # 12. COVERAGE CHECKS
    # ================================================================

    def run_coverage_check(self, session_id: str) -> Dict:
        """
        Check whether core inspection systems have been observed.

        This is intentionally simple for now.
        Later this can be made room-by-room or template-based.
        """

        session = self.get_session(session_id)

        expected = {"Electrical", "Plumbing", "HVAC", "Structural"}
        seen = {issue.get("system") for issue in session.issues}

        missing = sorted(list(expected - seen))

        session.coverage_notes = missing
        session.state = SessionState.COMPLETED

        return {
            "session_id": session_id,
            "missing_areas": missing,
            "seen_areas": sorted(list(seen)),
            "state": session.state,
        }


    # ================================================================
    # 13. PENDING / CONFIRMED RETRIEVAL
    # ================================================================

    def get_pending(self, session_id: str) -> Dict:
        """Return pending findings sorted highest priority first."""

        session = self.get_session(session_id)

        sorted_pending = sorted(
            session.pending_review,
            key=lambda item: item.get("priority_score", 0),
            reverse=True,
        )

        return {
            "session_id": session_id,
            "pending_findings": sorted_pending,
            "total": len(sorted_pending),
        }

    def get_confirmed(self, session_id: str) -> Dict:
        """Return approved findings."""

        session = self.get_session(session_id)

        return {
            "session_id": session_id,
            "confirmed": session.confirmed,
            "total": len(session.confirmed),
        }


    # ================================================================
    # 14. REPORT BLOCK GENERATION
    # ================================================================

    def generate_report_blocks(self, session_id: str, severity: str = "all") -> Dict:
        """
        Generate copy/paste blocks from approved findings.

        This is intentionally NOT a full report generator.
        """

        session = self.get_session(session_id)

        blocks = []

        for issue in session.confirmed:
            level = issue.get("priority_level", "LOW")

            if severity.lower() != "all" and level.lower() != severity.lower():
                continue

            block = self._build_copy_paste_block(issue)
            blocks.append(block)

        return {
            "session_id": session_id,
            "severity_filter": severity,
            "report_blocks": blocks,
            "total_blocks": len(blocks),
        }

    def _build_copy_paste_block(self, issue: Dict) -> str:
        """
        Build inspector-friendly report narrative.

        Current format:
        - Observation
        - Implication
        - Recommendation
        - Optional photo note
        """

        observation = issue.get(
            "professional_finding",
            issue.get("finding", "Condition observed."),
        )

        implication = self._build_implication(issue)

        recommendation = issue.get(
            "recommended_action",
            "Further evaluation and correction is recommended as needed.",
        )

        photo_count = len(issue.get("photos", []))

        photo_note = ""
        if photo_count > 0:
            photo_note = (
                f"\n\nPhoto Documentation:\n"
                f"{photo_count} photo(s) attached for inspector reference."
            )

        return f"""
Observation:
{observation}

Implication:
{implication}

Recommendation:
{recommendation}{photo_note}
""".strip()

    def _build_implication(self, issue: Dict) -> str:
        """
        Build implication/risk wording based on issue content.

        Add new implication templates here.
        """

        system = issue.get("system", "General")
        risk = issue.get("risk_hint", "low")

        text = (
            issue.get("finding", "") + " " +
            issue.get("professional_finding", "")
        ).lower()

        if any(word in text for word in ["burn", "smoke", "arcing", "sparking", "fire"]):
            return (
                "This condition may indicate overheating, electrical arcing, or damaged electrical components, "
                "which can increase the risk of electrical failure or fire."
            )

        if any(word in text for word in ["water", "leak", "moisture", "stain"]):
            return (
                "This condition may indicate active or prior moisture intrusion, which can lead to material damage, "
                "deterioration, or microbial growth if not corrected."
            )

        if any(word in text for word in ["crack", "movement", "settlement", "foundation"]):
            return (
                "This condition may indicate movement, settlement, or deterioration requiring further evaluation "
                "to determine severity and appropriate corrective action."
            )

        if system == "HVAC":
            return (
                "This condition may affect system performance, airflow, efficiency, or service life if not corrected."
            )

        if risk == "high":
            return (
                "This condition represents an elevated concern and should be reviewed promptly to determine the "
                "appropriate corrective action."
            )

        if risk == "medium":
            return "This condition may worsen over time if not monitored or corrected."

        return (
            "This condition should be reviewed and corrected as needed based on the inspector's findings and scope of inspection."
        )


    # ================================================================
    # 15. SUMMARY LAYER
    # ================================================================

    def get_summary(self, session_id: str) -> Dict:
        """Return summary data used by dashboard/summary views."""

        session = self.get_session(session_id)

        return inspection_summary.build_summary(
            {
                "issues": session.issues,
                "confirmed": session.confirmed,
                "pending": session.pending_review,
                "coverage_notes": session.coverage_notes,
            }
        )


    # ================================================================
    # 16. SESSION PERSISTENCE
    # ================================================================

    def export_session(self, session_id: str) -> Dict:
        """
        Export full inspection session.
        Used by:
            Save
            Auto-save
            Future cloud sync
        """

        session = self.get_session(session_id)

        return {
            "session_id": session.session_id,
            "inspection_title": session.inspection_title,
            "state": session.state,

            # inspection context
            "context": session.context,

            # observations spoken by inspector
            "observations": session.observations,

            # findings
            "issues": session.issues,
            "pending_review": session.pending_review,
            "confirmed": session.confirmed,

            # completion data
            "coverage_notes": session.coverage_notes,

            # future metadata
            "version": "1.0",
        }

    def import_session(self, data: Dict) -> Dict:
        """
        Load saved JSON data back into active workflow memory.

        Returns exported session data so the frontend gets a consistent shape.
        """

        session_id = data.get("session_id")

        if not session_id:
            session_id = str(uuid4())

        session = InspectionSession(
            session_id=session_id,
            inspection_title=data.get("inspection_title", "Untitled Inspection"),
            state=data.get("state", SessionState.INIT),
            context=data.get("context", {}),
            observations=data.get("observations", []),
            issues=data.get("issues", []),
            pending_review=data.get("pending_review", []),
            confirmed=data.get("confirmed", []),
            coverage_notes=data.get("coverage_notes", []),
        )

        self.sessions[session_id] = session

        return self.export_session(session_id)
