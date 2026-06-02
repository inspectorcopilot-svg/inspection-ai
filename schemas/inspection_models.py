from pydantic import BaseModel
from typing import List, Optional


class InspectionIssue(BaseModel):
    id: Optional[str] = None
    system: str
    component: str
    finding: str
    professional_finding: Optional[str] = None
    risk_hint: Optional[str] = None
    recommended_action: Optional[str] = None
    confidence: float = 0.5
    priority_score: Optional[float] = None
    priority_level: Optional[str] = None
    reasoning: Optional[str] = None
    status: str = "pending"


class InspectionResponse(BaseModel):
    issues: List[InspectionIssue]