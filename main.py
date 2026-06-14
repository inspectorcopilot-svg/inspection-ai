"""
main.py

Inspection Co-Pilot FastAPI Backend

TABLE OF CONTENTS

1. Imports
2. App Setup
3. Directory Setup
4. Global Service Instances
5. Request Models
6. Session Save / Load Endpoints
7. Health Check
8. Legacy AI Analysis Endpoints
9. Workflow Session Endpoints
10. Workflow Context / Observation Endpoints
11. Follow-Up Question Endpoint
12. Photo Attachment Endpoint
13. Review / Decision Endpoints
14. Coverage / Report / Summary Endpoints

NOTES FOR FUTURE CHANGES

- Add login/auth endpoints in a new section after Request Models.
- Add settings endpoints after Session Save / Load.
- Keep frontend API paths stable unless you also update InspectionCopilotUI.jsx.
"""


# ================================================================
# 1. IMPORTS
# ================================================================

from fastapi import FastAPI, UploadFile, File, HTTPException, Query, Form, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional
from uuid import UUID, uuid4
from datetime import datetime

import shutil
import os
import json
import hmac
import re

from services.text_analyzer import analyze_text
from services.image_analyzer import analyze_inspection_image
from services.inspection_workflow import InspectionWorkflow
from services.intelligence_engine import intelligence_engine
from services.supabase_client import (
    count_supabase_storage_objects,
    download_supabase_storage_file,
    get_supabase_client,
    get_supabase_settings,
    upload_supabase_storage_file,
)


# ================================================================
# 2. APP SETUP
# ================================================================

app = FastAPI(
    title="Inspection Co-Pilot API",
    description="Backend API for the inspection co-pilot workflow.",
    version="0.1.0",
)

# Explicit origins support hosted deployments while the regex keeps the
# existing localhost and local-network field workflow working by default.
DEFAULT_ALLOWED_ORIGINS = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
)
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "ALLOWED_ORIGINS",
        ",".join(DEFAULT_ALLOWED_ORIGINS),
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"^https?://(?:localhost|127\.0\.0\.1|(?:\d{1,3}\.){3}\d{1,3})(?::\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ================================================================
# LOCAL AUTH CONFIGURATION
# ================================================================

LOCAL_USER_ID = "local_user"
TESTER_USER_ID = "tester"
FIELD_TESTER_USER_IDS = ("tester", "tester2", "tester3")
USER_ROOT_DIR = "users"
TESTER_TEMP_PASSWORD = "TestPilot2026!"


def local_user_dir(user_id: str) -> str:
    if user_id in FIELD_TESTER_USER_IDS:
        return f"{user_id}_storage"

    return os.path.join(USER_ROOT_DIR, user_id)


def local_user_inspection_dir(user_id: str) -> str:
    return os.path.join(local_user_dir(user_id), "inspections")


def local_user_profile_path(user_id: str) -> str:
    return os.path.join(local_user_dir(user_id), "profile.json")


def local_user_settings_path(user_id: str) -> str:
    return os.path.join(local_user_dir(user_id), "settings.json")


def local_user_config_path(user_id: str) -> str:
    if user_id in FIELD_TESTER_USER_IDS:
        return os.path.join(USER_ROOT_DIR, user_id, "pilot_config.json")

    return os.path.join(local_user_dir(user_id), "pilot_config.json")


USER_INSPECTION_DIR = local_user_inspection_dir(LOCAL_USER_ID)
USER_PROFILE_PATH = local_user_profile_path(LOCAL_USER_ID)
USER_SETTINGS_PATH = local_user_settings_path(LOCAL_USER_ID)
PILOT_CONFIG_PATH = local_user_config_path(LOCAL_USER_ID)

os.makedirs(USER_INSPECTION_DIR, exist_ok=True)
for field_tester_id in FIELD_TESTER_USER_IDS:
    os.makedirs(local_user_inspection_dir(field_tester_id), exist_ok=True)


def load_local_credentials():
    """Load install-time pilot credentials with development fallbacks."""

    if os.path.exists(PILOT_CONFIG_PATH):
        with open(PILOT_CONFIG_PATH, "r", encoding="utf-8") as file:
            config = json.load(file)

        return (
            config.get("username", "admin"),
            config.get("password", "admin123"),
        )

    return (
        os.getenv("INSPECTION_COPILOT_USERNAME", "admin"),
        os.getenv("INSPECTION_COPILOT_PASSWORD", "admin123"),
    )


LOCAL_USERNAME, LOCAL_PASSWORD = load_local_credentials()


def load_tester_credentials(user_id: str):
    """Load field-tester credentials with a local temporary fallback."""

    tester_config_path = local_user_config_path(user_id)
    env_suffix = "" if user_id == TESTER_USER_ID else user_id.replace("tester", "TESTER")
    username_env = (
        "INSPECTION_COPILOT_TESTER_USERNAME"
        if user_id == TESTER_USER_ID
        else f"INSPECTION_COPILOT_{env_suffix}_USERNAME"
    )
    password_env = (
        "INSPECTION_COPILOT_TESTER_PASSWORD"
        if user_id == TESTER_USER_ID
        else f"INSPECTION_COPILOT_{env_suffix}_PASSWORD"
    )

    if os.path.exists(tester_config_path):
        with open(tester_config_path, "r", encoding="utf-8") as file:
            config = json.load(file)

        return (
            config.get("username", user_id),
            config.get("password", TESTER_TEMP_PASSWORD),
        )

    return (
        os.getenv(username_env, user_id),
        os.getenv(password_env, TESTER_TEMP_PASSWORD),
    )


LOCAL_ACCOUNTS = {
    LOCAL_USERNAME: {
        "password": LOCAL_PASSWORD,
        "user_id": LOCAL_USER_ID,
        "display_name": "Local Inspector",
        "role": "owner",
    },
}

for field_tester_id in FIELD_TESTER_USER_IDS:
    tester_username, tester_password = load_tester_credentials(field_tester_id)
    LOCAL_ACCOUNTS[tester_username] = {
        "password": tester_password,
        "user_id": field_tester_id,
        "display_name": f"Field Tester {field_tester_id.removeprefix('tester')}".strip(),
        "role": "tester",
    }


def local_user_id_from_username(username: str) -> str:
    account = LOCAL_ACCOUNTS.get((username or "").strip())
    return account["user_id"] if account else LOCAL_USER_ID


def request_local_user_id(request: Request) -> str:
    return local_user_id_from_username(request.headers.get("X-Local-User", LOCAL_USERNAME))


def inspection_session_path(session_id: str, user_id: str = LOCAL_USER_ID) -> str:
    """Return the saved-session path only for a valid workflow UUID."""

    try:
        safe_session_id = str(UUID(session_id))
    except (TypeError, ValueError, AttributeError):
        raise HTTPException(status_code=400, detail="Invalid inspection session ID")

    inspection_dir = local_user_inspection_dir(user_id)
    os.makedirs(inspection_dir, exist_ok=True)

    return os.path.join(inspection_dir, f"{safe_session_id}.json")


# ================================================================
# 3. DIRECTORY SETUP
# ================================================================

# Temporary uploads used by general image analyzer endpoint.
UPLOAD_DIR = "temp_uploads"

# Photos attached to actual inspection findings.
PHOTO_DIR = "issue_photos"

# Saved inspection sessions for save/load and auto-save.
SAVE_DIR = "saved_sessions"

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(PHOTO_DIR, exist_ok=True)
os.makedirs(SAVE_DIR, exist_ok=True)

# Serves attached photos so the frontend can preview/open/download them.
# Example browser URL:
# http://localhost:8000/issue-photos/example.jpg
app.mount("/issue-photos", StaticFiles(directory=PHOTO_DIR), name="issue_photos")


# ================================================================
# USER PROFILE / SETTINGS BOOTSTRAP
# ================================================================

def ensure_local_user_files(user_id: str = LOCAL_USER_ID, username: str = LOCAL_USERNAME):
    user_dir = local_user_dir(user_id)
    inspection_dir = local_user_inspection_dir(user_id)
    profile_path = local_user_profile_path(user_id)
    settings_path = local_user_settings_path(user_id)

    os.makedirs(user_dir, exist_ok=True)
    os.makedirs(inspection_dir, exist_ok=True)

    if not os.path.exists(profile_path):
        display_name = (
            LOCAL_ACCOUNTS.get(username, {}).get("display_name")
            or "Local Inspector"
        )

        with open(profile_path, "w", encoding="utf-8") as file:
            json.dump(
                {
                    "user_id": user_id,
                    "username": username,
                    "display_name": display_name,
                    "created_at": datetime.now().isoformat(),
                },
                file,
                indent=2,
            )

    if not os.path.exists(settings_path):
        with open(settings_path, "w", encoding="utf-8") as file:
            json.dump(
                {
                    "inspector_name": "",
                    "default_mode": "inspection",
                    "appearance_theme": "system",

                    "voice_auto_submit": True,
                    "voice_language": "en-US",
                    "voice_sensitivity": "normal",

                    "require_photo_for_critical": False,
                    "require_photo_for_high": False,

                    "auto_save_enabled": True,
                    "auto_save_interval_seconds": 30,
                    "restore_previous_session": True,

                    "show_ai_reasoning": True,
                    "show_confidence_score": True,
                    "learn_from_overrides": True,
                },
                file,
                indent=2,
            )


for account_username, account in LOCAL_ACCOUNTS.items():
    ensure_local_user_files(account["user_id"], account_username)


# ================================================================
# 4. GLOBAL SERVICE INSTANCES
# ================================================================

# Main workflow engine.
# This holds active sessions in memory while the backend is running.
workflow = InspectionWorkflow()


# ================================================================
# 5. REQUEST MODELS
# ================================================================

class TextRequest(BaseModel):
    """Payload for legacy text analysis endpoint."""

    text: str


class ContextRequest(BaseModel):
    """
    Current inspection target.

    This tells the co-pilot what the inspector is currently inspecting.
    Example:
    - area/location_note: Kitchen
    - system: Electrical
    - component: GFCI Outlet
    """

    session_id: str
    system: str
    component: str
    location_note: Optional[str] = None


class ObservationRequest(BaseModel):
    """
    Raw inspector observation.

    The frontend may send either:
    - observation
    - raw_input

    Both are supported for compatibility.
    """

    session_id: str
    observation: Optional[str] = None
    raw_input: Optional[str] = None


class FollowUpRequest(BaseModel):
    """Answer to a smart follow-up question."""

    session_id: str
    issue_id: str
    answer: str


class Decision(BaseModel):
    """
    Review decision for a pending finding.

    status values currently used:
    - approved
    - rejected
    - override

    learn_from_override controls whether an override should be used
    as learning feedback by the co-pilot.
    """

    id: str
    status: str
    edited_finding: Optional[str] = None
    edited_action: Optional[str] = None
    adjusted_score: Optional[float] = None
    learn_from_override: Optional[bool] = True


class DecisionRequest(BaseModel):
    """Batch of review decisions."""

    session_id: str
    decisions: List[Decision]


# ================================================================
# AUTH MODELS
# ================================================================

class LoginRequest(BaseModel):
    username: str
    password: str

class SessionCreateRequest(BaseModel):
    inspection_title: Optional[str] = None

class SessionTitleRequest(BaseModel):
    inspection_title: str

class SettingsRequest(BaseModel):
    inspector_name: Optional[str] = ""
    default_mode: Optional[str] = "inspection"
    appearance_theme: Optional[str] = "system"

    voice_auto_submit: Optional[bool] = True
    voice_language: Optional[str] = "en-US"
    voice_sensitivity: Optional[str] = "normal"

    require_photo_for_critical: Optional[bool] = False
    require_photo_for_high: Optional[bool] = False

    auto_save_enabled: Optional[bool] = True
    auto_save_interval_seconds: Optional[int] = 30
    restore_previous_session: Optional[bool] = True

    show_ai_reasoning: Optional[bool] = True
    show_confidence_score: Optional[bool] = True
    learn_from_overrides: Optional[bool] = True


# ================================================================
# 6. SESSION SAVE / LOAD ENDPOINTS
# ================================================================

def persist_session(session_id: str, user_id: str = LOCAL_USER_ID):
    """Persist an active session after meaningful workflow changes."""
    try:
        session_data = workflow.export_session(session_id)

    except ValueError:
        raise HTTPException(
            status_code=404,
            detail="Inspection session no longer exists in memory. Create or load a session first."
        )

    file_path = inspection_session_path(session_id, user_id)

    session_data["saved_at"] = datetime.now().isoformat()
    session_data["updated_at"] = session_data["saved_at"]
    session_data["user_id"] = user_id
    session_data["storage_mode"] = "local_user"

    with open(file_path, "w", encoding="utf-8") as file:
        json.dump(session_data, file, indent=2)

    return {
        "saved": True,
        "session_id": session_id,
        "saved_at": session_data["saved_at"],
        "user_id": user_id,
    }


@app.post("/workflow/session/{session_id}/save")
def save_session(session_id: str, request: Request):
    return persist_session(session_id, request_local_user_id(request))


@app.post("/workflow/session/{session_id}/title")
def update_session_title(session_id: str, payload: SessionTitleRequest, request: Request):
    """Update the active inspection session label used for save/load lists."""

    inspection_title = (
        payload.inspection_title.strip()
        if payload and payload.inspection_title
        else "Untitled Inspection"
    )

    try:
        session = workflow.get_session(session_id)
    except ValueError:
        raise HTTPException(
            status_code=404,
            detail="Inspection session no longer exists in memory. Create or load a session first."
        )

    session.inspection_title = inspection_title
    saved = persist_session(session_id, request_local_user_id(request))

    return {
        "updated": True,
        "session_id": session_id,
        "inspection_title": inspection_title,
        "saved_at": saved["saved_at"],
    }


@app.get("/workflow/sessions")
def list_saved_sessions(request: Request):
    sessions = []
    user_id = request_local_user_id(request)
    inspection_dir = local_user_inspection_dir(user_id)
    os.makedirs(inspection_dir, exist_ok=True)

    for file_name in os.listdir(inspection_dir):
        if not file_name.endswith(".json"):
            continue

        file_path = os.path.join(inspection_dir, file_name)

        with open(file_path, "r", encoding="utf-8") as file:
            data = json.load(file)

        sessions.append(
            {
                "session_id": data.get("session_id"),
                "inspection_title": data.get("inspection_title", "Untitled Inspection"),
                "saved_at": data.get("saved_at"),
                "updated_at": data.get("updated_at", data.get("saved_at")),
                "issue_count": len(data.get("issues", [])),
                "confirmed_count": len(data.get("confirmed", [])),
                "state": data.get("state"),
                "user_id": data.get("user_id", user_id),
            }
        )

    sessions.sort(key=lambda item: item.get("saved_at") or "", reverse=True)

    return {
        "sessions": sessions,
        "user_id": user_id,
    }


@app.get("/workflow/session/{session_id}/load")
def load_session(session_id: str, request: Request):
    user_id = request_local_user_id(request)
    file_path = inspection_session_path(session_id, user_id)

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Saved session not found")

    with open(file_path, "r", encoding="utf-8") as file:
        data = json.load(file)

    loaded = workflow.import_session(data)

    return {
        "loaded": True,
        "session": loaded,
        "user_id": user_id,
    }


# ================================================================
# 7. HEALTH CHECK
# ================================================================

@app.get("/")
def root():
    """Basic backend status check."""

    return {"status": "Inspection Co-Pilot backend running"}


@app.get("/health")
def health():
    """Lightweight connection check used by the field UI."""

    return {"status": "ok"}


@app.get("/supabase/health")
def supabase_health():
    """Confirm Supabase configuration and profiles-table readability."""

    status = {
        "supabase_configured": False,
        "client_created": False,
        "profiles_readable": False,
    }

    try:
        get_supabase_settings()
        status["supabase_configured"] = True
    except Exception:
        return {
            **status,
            "error": "Supabase environment configuration is incomplete.",
        }

    try:
        client = get_supabase_client()
        status["client_created"] = True
    except Exception:
        return {
            **status,
            "error": "Supabase client could not be created.",
        }

    try:
        client.table("profiles").select("id").limit(1).execute()
        status["profiles_readable"] = True
        return status
    except Exception:
        return {
            **status,
            "error": "Supabase profiles table could not be read.",
        }


def supabase_rows(response):
    """Return row dictionaries from the SDK response or REST fallback."""

    return response.data if hasattr(response, "data") else response


SUPABASE_SETTINGS_FIELDS = (
    "show_ai_reasoning",
    "show_confidence_score",
    "require_photo_for_critical",
    "require_photo_for_high",
    "voice_sensitivity",
    "learn_from_overrides",
)

DEFAULT_UI_SETTINGS = {
    "inspector_name": "",
    "default_mode": "inspection",
    "appearance_theme": "system",
    "voice_auto_submit": True,
    "voice_language": "en-US",
    "voice_sensitivity": "normal",
    "require_photo_for_critical": False,
    "require_photo_for_high": False,
    "auto_save_enabled": True,
    "auto_save_interval_seconds": 30,
    "restore_previous_session": True,
    "show_ai_reasoning": True,
    "show_confidence_score": True,
    "learn_from_overrides": True,
}


def get_supabase_profile_and_settings():
    """Read the single Option A inspector profile and matching settings row."""

    client = get_supabase_client()
    profiles = supabase_rows(
        client.table("profiles").select("*").limit(1).execute()
    )

    if not profiles:
        raise HTTPException(status_code=404, detail="Supabase profile not found")

    profile = profiles[0]
    profile_id = profile.get("id")
    settings_rows = supabase_rows(
        client.table("settings").select("*").limit(100).execute()
    )

    match = None

    for row in settings_rows:
        for column in ("profile_id", "user_id", "inspector_id", "id"):
            if profile_id and row.get(column) == profile_id:
                match = (row, column, profile_id)
                break

        if match:
            break

    if match is None and len(settings_rows) == 1:
        row = settings_rows[0]

        for column in ("profile_id", "user_id", "inspector_id", "id"):
            if row.get(column):
                match = (row, column, row[column])
                break

    if match is None:
        raise HTTPException(status_code=404, detail="Supabase settings not found")

    settings_row, match_column, match_value = match

    return client, profile, settings_row, match_column, match_value


def build_ui_settings(profile: dict, settings_row: dict, user_id: str = LOCAL_USER_ID):
    """Keep the current frontend settings shape while using Supabase values."""

    settings = load_local_settings(user_id)
    settings.update(
        {
            field: settings_row.get(field, settings[field])
            for field in SUPABASE_SETTINGS_FIELDS
            if settings_row.get(field) is not None
        }
    )

    settings["inspector_name"] = (
        profile.get("inspector_name")
        or profile.get("display_name")
        or profile.get("full_name")
        or settings.get("inspector_name", "")
    )

    return settings


def load_local_settings(user_id: str = LOCAL_USER_ID):
    """Load the existing local settings fallback."""

    settings_path = local_user_settings_path(user_id)

    if not os.path.exists(settings_path):
        username = user_id if user_id in FIELD_TESTER_USER_IDS else LOCAL_USERNAME
        ensure_local_user_files(user_id, username)

    with open(settings_path, "r", encoding="utf-8") as file:
        local_settings = json.load(file)

    return {
        **DEFAULT_UI_SETTINGS,
        **local_settings,
    }


def save_local_settings(settings: dict, user_id: str = LOCAL_USER_ID):
    """Persist the existing local settings fallback."""

    settings_path = local_user_settings_path(user_id)
    username = user_id if user_id in FIELD_TESTER_USER_IDS else LOCAL_USERNAME
    ensure_local_user_files(user_id, username)

    with open(settings_path, "w", encoding="utf-8") as file:
        json.dump(settings, file, indent=2)


@app.get("/supabase/me")
def supabase_me():
    """Return safe read-only profile and settings verification data."""

    result = {
        "profile_found": False,
        "settings_found": False,
        "profile": {},
        "settings": {},
    }

    try:
        client = get_supabase_client()
        profiles = supabase_rows(
            client.table("profiles").select("*").limit(1).execute()
        )
    except Exception:
        return {
            **result,
            "error": "Supabase profile could not be read.",
        }

    if not profiles:
        return result

    profile = profiles[0]
    profile_id = profile.get("id")
    result["profile_found"] = True
    result["profile"] = {
        "inspector_name": (
            profile.get("inspector_name")
            or profile.get("display_name")
            or profile.get("full_name")
            or ""
        ),
    }

    try:
        settings_rows = supabase_rows(
            client.table("settings").select("*").limit(100).execute()
        )
    except Exception:
        return {
            **result,
            "error": "Supabase settings could not be read.",
        }

    matching_settings = next(
        (
            row
            for row in settings_rows
            if profile_id
            and profile_id
            in {
                row.get("profile_id"),
                row.get("user_id"),
                row.get("inspector_id"),
                row.get("id"),
            }
        ),
        None,
    )

    if matching_settings is None and len(settings_rows) == 1:
        matching_settings = settings_rows[0]

    if matching_settings is None:
        return result

    result["settings_found"] = True
    result["settings"] = {
        "show_ai_reasoning": matching_settings.get("show_ai_reasoning"),
        "show_confidence_score": matching_settings.get("show_confidence_score"),
        "require_photo_for_critical": matching_settings.get(
            "require_photo_for_critical"
        ),
        "require_photo_for_high": matching_settings.get("require_photo_for_high"),
        "voice_sensitivity": matching_settings.get("voice_sensitivity"),
        "learn_from_overrides": matching_settings.get("learn_from_overrides"),
    }

    return result


# ================================================================
# 8. LEGACY AI ANALYSIS ENDPOINTS
# ================================================================

@app.post("/analyze-text")
def analyze_text_endpoint(payload: TextRequest):
    """
    Legacy text analyzer.

    This is separate from the newer workflow system.
    Keep this for direct testing of AI text parsing.
    """

    return analyze_text(payload.text)


@app.post("/analyze-image")
def analyze_image_endpoint(file: UploadFile = File(...)):
    """
    Legacy image analyzer.

    This analyzes an uploaded image directly and returns suggestions.
    It is separate from the issue photo attachment workflow.
    """

    file_path = os.path.join(UPLOAD_DIR, file.filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    return analyze_inspection_image(file_path)


# ================================================================
# AUTH ENDPOINTS
# ================================================================

@app.post("/auth/login")
def login(payload: LoginRequest):
    username = payload.username.strip()

    for account_username, account in LOCAL_ACCOUNTS.items():
        if (
            hmac.compare_digest(username, account_username)
            and hmac.compare_digest(payload.password, account["password"])
        ):
            ensure_local_user_files(account["user_id"], account_username)

            return {
                "authenticated": True,
                "username": account_username,
                "user_id": account["user_id"],
                "role": account["role"],
            }

    raise HTTPException(status_code=401, detail="Invalid username or password")


@app.get("/auth/status")
def auth_status():
    return {
        "auth_enabled": True,
        "mode": "local",
    }


@app.post("/auth/logout")
def logout():
    return {
        "logged_out": True,
    }

# ================================================================
# SETTINGS ENDPOINTS
# ================================================================

@app.get("/settings")
def get_settings(request: Request):
    user_id = request_local_user_id(request)

    if user_id in FIELD_TESTER_USER_IDS:
        return {
            "settings": load_local_settings(user_id),
            "storage_mode": "local_user",
        }

    try:
        _, profile, settings_row, _, _ = get_supabase_profile_and_settings()
        settings = build_ui_settings(profile, settings_row, user_id)
        storage_mode = "supabase"
    except Exception:
        settings = load_local_settings(user_id)
        storage_mode = "local_fallback"

    return {
        "settings": settings,
        "storage_mode": storage_mode,
    }


@app.post("/settings")
def update_settings(payload: SettingsRequest, request: Request):
    user_id = request_local_user_id(request)
    requested_settings = {
        **load_local_settings(user_id),
        **payload.model_dump(),
    }
    save_local_settings(requested_settings, user_id)

    if user_id in FIELD_TESTER_USER_IDS:
        return {
            "saved": True,
            "settings": requested_settings,
            "storage_mode": "local_user",
        }

    try:
        client, profile, _, match_column, match_value = (
            get_supabase_profile_and_settings()
        )
        cloud_settings = {
            field: requested_settings[field]
            for field in SUPABASE_SETTINGS_FIELDS
        }
        updated_rows = supabase_rows(
            client.table("settings")
            .update(cloud_settings)
            .eq(match_column, match_value)
            .execute()
        )

        if not updated_rows:
            raise HTTPException(
                status_code=404,
                detail="Supabase settings not found",
            )

        profile_id = profile.get("id")

        if profile_id:
            profile_name_column = next(
                (
                    column
                    for column in ("inspector_name", "display_name", "full_name")
                    if column in profile
                ),
                None,
            )

        if profile_id and profile_name_column:
            updated_profiles = supabase_rows(
                client.table("profiles")
                .update(
                    {
                        profile_name_column: requested_settings[
                            "inspector_name"
                        ]
                    }
                )
                .eq("id", profile_id)
                .execute()
            )

            if updated_profiles:
                profile = updated_profiles[0]

        settings = build_ui_settings(profile, updated_rows[0], user_id)
        storage_mode = "supabase"
    except Exception:
        settings = requested_settings
        storage_mode = "local_fallback"

    return {
        "saved": True,
        "settings": settings,
        "storage_mode": storage_mode,
    }


# ================================================================
# 9. WORKFLOW SESSION ENDPOINTS
# ================================================================

def mirror_inspection_metadata(session_id: str, inspection_title: str):
    """Best-effort Supabase mirror for new inspection metadata only."""

    timestamp = datetime.now().isoformat()
    metadata = {
        "id": session_id,
        "created_at": timestamp,
        "updated_at": timestamp,
        "status": "active",
    }

    try:
        client = get_supabase_client()
        profiles = supabase_rows(
            client.table("profiles").select("id").limit(1).execute()
        )

        if not profiles:
            raise RuntimeError("Supabase profile not found")

        metadata["user_id"] = profiles[0]["id"]
        inserted_rows = supabase_rows(
            client.table("inspections").insert(metadata).execute()
        )

        return {
            "storage_mode": "supabase" if inserted_rows else "local_fallback",
            "metadata_saved": bool(inserted_rows),
        }
    except Exception:
        return {
            "storage_mode": "local_fallback",
            "metadata_saved": False,
        }


@app.get("/supabase/inspections/count")
def supabase_inspection_count():
    """Return a safe count of mirrored Supabase inspection metadata rows."""

    try:
        rows = supabase_rows(
            get_supabase_client().table("inspections").select("*").execute()
        )

        return {
            "inspections_readable": True,
            "inspection_count": len(rows),
        }
    except Exception:
        return {
            "inspections_readable": False,
            "inspection_count": None,
            "error": "Supabase inspections table could not be read.",
        }


@app.get("/supabase/mirror-counts")
def supabase_mirror_counts():
    """Return safe row counts for staged Supabase mirror verification."""

    result = {}

    try:
        client = get_supabase_client()

        for table_name in ("issues", "decisions", "photos"):
            rows = supabase_rows(
                client.table(table_name).select("*").execute()
            )
            result[f"{table_name}_count"] = len(rows)

        return {
            "tables_readable": True,
            **result,
        }
    except Exception:
        return {
            "tables_readable": False,
            "issues_count": None,
            "decisions_count": None,
            "photos_count": None,
            "error": "Supabase mirror tables could not be read.",
        }


@app.get("/supabase/photo-storage-count")
def supabase_photo_storage_count():
    """Return a safe object count for the private inspection photo bucket."""

    try:
        return {
            "storage_readable": True,
            "object_count": count_supabase_storage_objects("inspection-photos"),
        }
    except Exception:
        return {
            "storage_readable": False,
            "object_count": None,
            "error": "Supabase photo storage could not be read.",
        }


@app.get("/supabase/inspection/{inspection_id}")
def supabase_inspection_recovery(inspection_id: UUID):
    """Return safe read-only cloud mirror data for one inspection."""

    inspection_id_text = str(inspection_id)

    try:
        client = get_supabase_client()
        inspections = supabase_rows(
            client.table("inspections")
            .select("*")
            .eq("id", inspection_id_text)
            .limit(1)
            .execute()
        )

        if not inspections:
            return {
                "inspection_found": False,
                "inspection_id": inspection_id_text,
                "inspection": {},
                "issues": [],
                "decisions": [],
                "photos": [],
            }

        issues = supabase_rows(
            client.table("issues")
            .select("*")
            .eq("inspection_id", inspection_id_text)
            .execute()
        )
        decisions = supabase_rows(
            client.table("decisions")
            .select("*")
            .eq("inspection_id", inspection_id_text)
            .execute()
        )
        photos = supabase_rows(
            client.table("photos")
            .select("*")
            .eq("inspection_id", inspection_id_text)
            .execute()
        )

        return {
            "inspection_found": True,
            "inspection_id": inspection_id_text,
            "inspection": {
                key: inspections[0].get(key)
                for key in (
                    "id",
                    "created_at",
                    "updated_at",
                    "status",
                    "title",
                    "address",
                )
                if key in inspections[0]
            },
            "issues": [
                {
                    key: issue.get(key)
                    for key in (
                        "id",
                        "inspection_id",
                        "system",
                        "component",
                        "finding",
                        "professional_finding",
                        "recommended_action",
                        "priority_score",
                        "priority_level",
                        "reasoning",
                        "status",
                        "follow_up_required",
                        "follow_up_question",
                        "follow_up_answer",
                        "created_at",
                        "updated_at",
                    )
                    if key in issue
                }
                for issue in issues
            ],
            "decisions": [
                {
                    key: decision.get(key)
                    for key in (
                        "id",
                        "inspection_id",
                        "issue_id",
                        "decision_type",
                        "original_score",
                        "adjusted_score",
                        "learn_from_override",
                        "created_at",
                        "updated_at",
                    )
                    if key in decision
                }
                for decision in decisions
            ],
            "photos": [
                {
                    key: photo.get(key)
                    for key in (
                        "id",
                        "inspection_id",
                        "issue_id",
                        "filename",
                        "storage_path",
                        "created_at",
                        "updated_at",
                    )
                    if key in photo
                }
                for photo in photos
            ],
        }
    except Exception:
        return {
            "inspection_found": False,
            "inspection_id": inspection_id_text,
            "inspection": {},
            "issues": [],
            "decisions": [],
            "photos": [],
            "error": "Supabase inspection recovery data could not be read.",
        }


@app.get("/supabase/photo/{photo_id}")
def supabase_restored_photo(photo_id: UUID):
    """Stream one restored private cloud photo without saving it locally."""

    try:
        photos = supabase_rows(
            get_supabase_client().table("photos")
            .select("*")
            .eq("id", str(photo_id))
            .limit(1)
            .execute()
        )

        if not photos or not photos[0].get("storage_path"):
            raise HTTPException(status_code=404, detail="Cloud photo not found")

        content, content_type = download_supabase_storage_file(
            "inspection-photos",
            photos[0]["storage_path"],
        )
        return Response(
            content=content,
            media_type=content_type,
        )
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=404, detail="Cloud photo not found")


@app.post("/supabase/inspection/{inspection_id}/restore")
def restore_supabase_inspection(inspection_id: UUID, request: Request):
    """Restore a cloud mirror into the existing local session format."""

    cloud_data = supabase_inspection_recovery(inspection_id)
    inspection_id_text = str(inspection_id)

    if not cloud_data.get("inspection_found"):
        raise HTTPException(status_code=404, detail="Cloud inspection not found")

    cloud_photos_by_issue = {}

    for photo in cloud_data["photos"]:
        photo_id = photo.get("id")
        issue_id = photo.get("issue_id")

        if not photo_id or not issue_id:
            continue

        cloud_photos_by_issue.setdefault(issue_id, []).append(
            {
                "photo_id": photo_id,
                "path": None,
                "url": f"/supabase/photo/{photo_id}",
                "filename": photo.get("filename") or "inspection-photo",
                "storage_path": photo.get("storage_path"),
                "cloud_backed": True,
            }
        )

    restored_issues = []
    restored_issues_by_id = {}

    for cloud_issue in cloud_data["issues"]:
        issue_id = cloud_issue.get("id")
        photos = cloud_photos_by_issue.get(issue_id, [])
        issue = {
            **cloud_issue,
            "status": cloud_issue.get("status") or "pending",
            "photos": photos,
            "follow_up": {
                "required": cloud_issue.get("follow_up_required", False),
                "answered": bool(cloud_issue.get("follow_up_answer")),
                "question": cloud_issue.get("follow_up_question"),
                "answer": cloud_issue.get("follow_up_answer"),
            },
        }

        if photos:
            issue["photo_documentation"] = {
                "attached": True,
                "count": len(photos),
            }

        restored_issues.append(issue)

        if issue_id:
            restored_issues_by_id[issue_id] = issue

    for decision in sorted(
        cloud_data["decisions"],
        key=lambda item: item.get("created_at") or "",
    ):
        issue = restored_issues_by_id.get(decision.get("issue_id"))

        if not issue:
            continue

        decision_type = decision.get("decision_type")

        if decision_type == "approve":
            issue["status"] = "approved"
        elif decision_type == "reject":
            issue["status"] = "rejected"
        elif decision_type == "override":
            adjusted_score = decision.get("adjusted_score")

            if adjusted_score is not None:
                issue["priority_score"] = adjusted_score
                issue["priority_level"] = intelligence_engine._level(
                    adjusted_score
                )

            issue["override_learning_enabled"] = decision.get(
                "learn_from_override"
            )
            issue["status"] = "pending"

    restored_session = {
        "session_id": inspection_id_text,
        "inspection_title": (
            cloud_data["inspection"].get("title")
            or "Restored Cloud Inspection"
        ),
        "state": "ready_for_review",
        "context": {},
        "observations": [],
        "issues": restored_issues,
        "pending_review": [
            issue for issue in restored_issues
            if issue.get("status") == "pending"
        ],
        "confirmed": [
            issue for issue in restored_issues
            if issue.get("status") == "approved"
        ],
        "coverage_notes": [],
        "cloud_restored": True,
        "cloud_decisions": cloud_data["decisions"],
        "version": "1.0",
    }
    workflow.import_session(restored_session)
    persist_session(inspection_id_text, request_local_user_id(request))

    return {
        "restored": True,
        "inspection_id": inspection_id_text,
        "issues_restored": len(restored_issues),
        "decisions_restored": len(cloud_data["decisions"]),
        "photos_restored": len(cloud_data["photos"]),
    }


@app.post("/workflow/session")
def create_session(payload: Optional[SessionCreateRequest] = None):
    """Create a new active inspection session."""

    inspection_title = (
        payload.inspection_title.strip()
        if payload and payload.inspection_title
        else "Untitled Inspection"
    )

    session_id = workflow.create_session(inspection_title)

    return {
        "session_id": session_id,
        "inspection_title": inspection_title,
        "metadata_storage": mirror_inspection_metadata(
            session_id,
            inspection_title,
        ),
    }


@app.post("/workflow/session/create")
def create_session_alt(payload: Optional[SessionCreateRequest] = None):
    """
    Alternate create-session route.

    Kept for compatibility with earlier frontend tests.
    """

    inspection_title = (
        payload.inspection_title.strip()
        if payload and payload.inspection_title
        else "Untitled Inspection"
    )

    session_id = workflow.create_session(inspection_title)

    return {
        "session_id": session_id,
        "inspection_title": inspection_title,
        "metadata_storage": mirror_inspection_metadata(
            session_id,
            inspection_title,
        ),
    }


# ================================================================
# 10. WORKFLOW CONTEXT / OBSERVATION ENDPOINTS
# ================================================================

def mirror_issue(session_id: str, issue: dict):
    """Best-effort Supabase mirror for AI-suggested issue fields only."""

    timestamp = datetime.now().isoformat()
    follow_up = issue.get("follow_up") or {}
    mirrored_issue = {
        "id": issue.get("id"),
        "inspection_id": session_id,
        "system": issue.get("system"),
        "component": issue.get("component"),
        "finding": issue.get("finding"),
        "professional_finding": issue.get("professional_finding"),
        "recommended_action": issue.get("recommended_action"),
        "priority_score": issue.get("priority_score"),
        "priority_level": issue.get("priority_level"),
        "reasoning": issue.get("reasoning"),
        "status": issue.get("status"),
        "follow_up_required": follow_up.get("required", False),
        "follow_up_question": follow_up.get("question"),
        "follow_up_answer": follow_up.get("answer"),
        "created_at": timestamp,
        "updated_at": timestamp,
    }

    try:
        client = get_supabase_client()
        profiles = supabase_rows(
            client.table("profiles").select("id").limit(1).execute()
        )

        if not profiles:
            raise RuntimeError("Supabase profile not found")

        mirrored_issue["user_id"] = profiles[0]["id"]
        inserted_rows = supabase_rows(
            client.table("issues").insert(mirrored_issue).execute()
        )

        return {
            "storage_mode": "supabase" if inserted_rows else "local_fallback",
            "mirrored": bool(inserted_rows),
        }
    except Exception:
        return {
            "storage_mode": "local_fallback",
            "mirrored": False,
        }


def mirror_decisions(
    session_id: str,
    decisions: List[dict],
    original_scores: dict,
    result: dict,
):
    """Best-effort Supabase mirror for completed inspector decisions only."""

    processed_ids = {
        issue.get("id")
        for group in ("confirmed", "rejected", "overridden")
        for issue in result.get(group, [])
    }
    timestamp = datetime.now().isoformat()
    decision_types = {
        "approved": "approve",
        "rejected": "reject",
        "override": "override",
    }

    try:
        client = get_supabase_client()
        profiles = supabase_rows(
            client.table("profiles").select("id").limit(1).execute()
        )

        if not profiles:
            raise RuntimeError("Supabase profile not found")

        mirrored_count = 0

        for decision in decisions:
            issue_id = decision.get("id")
            decision_type = decision_types.get(decision.get("status"))

            if issue_id not in processed_ids or not decision_type:
                continue

            mirrored_decision = {
                "id": str(uuid4()),
                "inspection_id": session_id,
                "issue_id": issue_id,
                "decision_type": decision_type,
                "original_score": original_scores.get(issue_id),
                "adjusted_score": decision.get("adjusted_score"),
                "learn_from_override": decision.get("learn_from_override"),
                "created_at": timestamp,
                "user_id": profiles[0]["id"],
            }
            inserted_rows = supabase_rows(
                client.table("decisions").insert(mirrored_decision).execute()
            )
            mirrored_count += len(inserted_rows)

        return {
            "storage_mode": "supabase",
            "mirrored": mirrored_count > 0,
            "mirrored_count": mirrored_count,
        }
    except Exception:
        return {
            "storage_mode": "local_fallback",
            "mirrored": False,
            "mirrored_count": 0,
        }


@app.post("/workflow/context")
def set_context(payload: ContextRequest):
    """
    Set current inspection area/system/component.

    Called before submitting an observation so the AI knows what area
    the inspector is currently working in.
    """

    result = workflow.set_context(
        payload.session_id,
        {
            "system": payload.system,
            "component": payload.component,
            "location_note": payload.location_note,
        },
    )
    return result


@app.post("/workflow/observe")
def observe(payload: ObservationRequest, request: Request):
    """
    Submit an inspector observation into the co-pilot workflow.

    This triggers:
    - normalization
    - scoring
    - follow-up question generation
    - photo recommendation logic
    - pending review queue update
    """

    text = payload.observation or payload.raw_input

    if not payload.session_id:
        raise HTTPException(status_code=400, detail="Missing session_id")

    if not text:
        raise HTTPException(status_code=400, detail="Missing observation text")

    result = workflow.add_observation(
        session_id=payload.session_id,
        raw_input=text,
    )
    result["issue_storage"] = mirror_issue(
        payload.session_id,
        result["issue"],
    )
    persist_session(payload.session_id, request_local_user_id(request))
    return result


# ================================================================
# 11. FOLLOW-UP QUESTION ENDPOINT
# ================================================================

@app.post("/workflow/follow-up")
def answer_follow_up(payload: FollowUpRequest, request: Request):
    """
    Submit answer to a smart follow-up question.

    This may adjust risk, confidence, priority score, and final wording.
    """

    result = workflow.answer_follow_up(
        session_id=payload.session_id,
        issue_id=payload.issue_id,
        answer=payload.answer,
    )
    persist_session(payload.session_id, request_local_user_id(request))
    return result


# ================================================================
# 12. PHOTO ATTACHMENT ENDPOINT
# ================================================================

def mirror_photo(
    session_id: str,
    issue_id: str,
    photo_record: dict,
    unique_name: str,
    content_type: str,
):
    """Best-effort Supabase Storage and photo metadata mirror."""

    storage_path = f"{session_id}/{unique_name}"
    uploaded = False

    try:
        client = get_supabase_client()
        profiles = supabase_rows(
            client.table("profiles").select("id").limit(1).execute()
        )

        if not profiles:
            raise RuntimeError("Supabase profile not found")

        upload_supabase_storage_file(
            "inspection-photos",
            storage_path,
            photo_record["path"],
            content_type,
        )
        uploaded = True
        inserted_rows = supabase_rows(
            client.table("photos").insert(
                {
                    "id": photo_record["photo_id"],
                    "inspection_id": session_id,
                    "issue_id": issue_id,
                    "storage_path": storage_path,
                    "filename": photo_record["filename"],
                    "created_at": datetime.now().isoformat(),
                    "user_id": profiles[0]["id"],
                }
            ).execute()
        )

        return {
            "storage_mode": "supabase" if inserted_rows else "local_fallback",
            "uploaded": bool(inserted_rows),
        }
    except Exception:
        return {
            "storage_mode": "local_fallback",
            "uploaded": uploaded,
        }


@app.post("/workflow/photo")
def attach_photo(
    request: Request,
    session_id: str = Form(...),
    issue_id: str = Form(...),
    photo: UploadFile = File(...),
):
    """
    Attach a photo to a specific finding.

    This does NOT analyze the photo yet.
    It stores the photo and links it to the issue for preview/download/copy.
    """

    original_filename = os.path.basename(photo.filename or "inspection-photo.jpg")
    safe_filename = re.sub(r"[^A-Za-z0-9._-]", "_", original_filename)
    unique_name = f"{issue_id}_{uuid4()}_{safe_filename}"

    file_path = os.path.join(PHOTO_DIR, unique_name)
    photo_url = f"/issue-photos/{unique_name}"

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(photo.file, buffer)

    result = workflow.attach_photo(
        session_id=session_id,
        issue_id=issue_id,
        photo_path=file_path,
        photo_url=photo_url,
        original_filename=original_filename,
    )
    persist_session(session_id, request_local_user_id(request))
    result["photo_storage"] = mirror_photo(
        session_id,
        issue_id,
        result["photo"],
        unique_name,
        photo.content_type or "application/octet-stream",
    )
    return result


# ================================================================
# 13. REVIEW / DECISION ENDPOINTS
# ================================================================

@app.get("/workflow/pending/{session_id}")
def get_pending(session_id: str):
    """Return pending findings ordered by priority."""

    return workflow.get_pending(session_id)


@app.get("/workflow/confirmed/{session_id}")
def get_confirmed(session_id: str):
    """Return approved findings."""

    return workflow.get_confirmed(session_id)


@app.post("/workflow/decisions")
def process_decisions(payload: DecisionRequest, request: Request):
    """
    Approve, reject, or override pending findings.

    This endpoint powers Review Mode.
    """

    decisions = [decision.model_dump() for decision in payload.decisions]
    session = workflow.get_session(payload.session_id)
    original_scores = {
        issue.get("id"): issue.get("priority_score")
        for issue in session.pending_review
    }
    result = workflow.process_decisions(
        payload.session_id,
        decisions,
    )
    persist_session(payload.session_id, request_local_user_id(request))
    result["decision_storage"] = mirror_decisions(
        payload.session_id,
        decisions,
        original_scores,
        result,
    )
    return result


# ================================================================
# 14. COVERAGE / REPORT / SUMMARY ENDPOINTS
# ================================================================

@app.get("/workflow/coverage/{session_id}")
def coverage(session_id: str, request: Request):
    """
    Run coverage check.

    Used at completion to suggest areas that may have been missed.
    """

    result = workflow.run_coverage_check(session_id)
    persist_session(session_id, request_local_user_id(request))
    return result


@app.get("/workflow/report/{session_id}")
def generate_report_blocks(
    session_id: str,
    severity: str = Query(default="all"),
):
    """
    Generate copy/paste report blocks from approved findings.

    This is not a full report generator.
    It creates inspector-approved narrative blocks.
    """

    return workflow.generate_report_blocks(session_id, severity)


@app.get("/workflow/summary/{session_id}")
def get_summary(session_id: str):
    """Return current summary of issues, counts, and coverage notes."""

    return workflow.get_summary(session_id)
