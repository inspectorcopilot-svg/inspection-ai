"""
Reusable Supabase client helpers.

This module prepares the backend for future Supabase integration. It is not
connected to the active local login, JSON save/load, or photo upload workflow.
"""

from dataclasses import dataclass
from functools import lru_cache
import json
import os
from typing import TYPE_CHECKING, Any
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

from dotenv import load_dotenv

if TYPE_CHECKING:
    from supabase import Client


load_dotenv()


class SupabaseRestQuery:
    """Small PostgREST query helper used when the Supabase SDK is unavailable."""

    def __init__(self, url: str, key: str, table: str):
        self.url = url
        self.key = key
        self.table_name = table
        self.params = {}

    def select(self, columns: str):
        self.params["select"] = columns
        return self

    def limit(self, count: int):
        self.params["limit"] = str(count)
        return self

    def eq(self, column: str, value: str):
        self.params[column] = f"eq.{value}"
        return self

    def update(self, values: dict):
        self.method = "PATCH"
        self.values = values
        return self

    def insert(self, values: dict):
        self.method = "POST"
        self.values = values
        return self

    def execute(self):
        query = urlencode(self.params)
        endpoint = f"{self.url}/rest/v1/{self.table_name}"

        if query:
            endpoint = f"{endpoint}?{query}"

        headers = {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
        }
        data = None

        if getattr(self, "method", "GET") in {"PATCH", "POST"}:
            headers["Content-Type"] = "application/json"
            headers["Prefer"] = "return=representation"
            data = json.dumps(self.values).encode("utf-8")

        request = Request(
            endpoint,
            data=data,
            headers=headers,
            method=getattr(self, "method", "GET"),
        )

        with urlopen(request, timeout=10) as response:
            return json.loads(response.read().decode("utf-8"))


class SupabaseRestClient:
    """Minimal reusable REST client fallback for local integration checks."""

    def __init__(self, url: str, key: str):
        self.url = url.rstrip("/")
        self.key = key

    def table(self, table_name: str):
        return SupabaseRestQuery(self.url, self.key, table_name)


@dataclass(frozen=True)
class SupabaseSettings:
    """Supabase environment settings used by future backend integrations."""

    url: str
    anon_key: str
    service_role_key: str
    jwt_secret: str | None


@lru_cache
def get_supabase_settings() -> SupabaseSettings:
    """Load required Supabase settings from environment variables."""

    url = os.getenv("SUPABASE_URL", "").strip()
    anon_key = os.getenv("SUPABASE_ANON_KEY", "").strip()
    service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    jwt_secret = os.getenv("SUPABASE_JWT_SECRET", "").strip() or None

    missing = [
        name
        for name, value in (
            ("SUPABASE_URL", url),
            ("SUPABASE_ANON_KEY", anon_key),
            ("SUPABASE_SERVICE_ROLE_KEY", service_role_key),
        )
        if not value
    ]

    if missing:
        raise RuntimeError(
            "Missing required Supabase environment variables: "
            + ", ".join(missing)
        )

    return SupabaseSettings(
        url=url,
        anon_key=anon_key,
        service_role_key=service_role_key,
        jwt_secret=jwt_secret,
    )


@lru_cache
def get_supabase_client(use_service_role: bool = True) -> "Client | Any":
    """
    Create a reusable Supabase client.

    Backend persistence work should normally use the service-role client.
    Use the anonymous client only when intentionally applying Supabase RLS.
    """

    settings = get_supabase_settings()
    key = settings.service_role_key if use_service_role else settings.anon_key

    try:
        from supabase import create_client
    except ModuleNotFoundError:
        return SupabaseRestClient(settings.url, key)

    return create_client(settings.url, key)


def upload_supabase_storage_file(
    bucket: str,
    object_path: str,
    file_path: str,
    content_type: str,
) -> None:
    """Upload a local file to a private Supabase Storage bucket."""

    settings = get_supabase_settings()
    encoded_path = quote(object_path, safe="/")
    endpoint = (
        f"{settings.url.rstrip('/')}/storage/v1/object/"
        f"{quote(bucket, safe='')}/{encoded_path}"
    )

    with open(file_path, "rb") as file_handle:
        data = file_handle.read()

    request = Request(
        endpoint,
        data=data,
        headers={
            "apikey": settings.service_role_key,
            "Authorization": f"Bearer {settings.service_role_key}",
            "Content-Type": content_type,
            "x-upsert": "true",
        },
        method="POST",
    )

    with urlopen(request, timeout=10):
        return None


def download_supabase_storage_file(
    bucket: str,
    object_path: str,
) -> tuple[bytes, str]:
    """Read a private Supabase Storage object without saving it locally."""

    settings = get_supabase_settings()
    encoded_path = quote(object_path, safe="/")
    endpoint = (
        f"{settings.url.rstrip('/')}/storage/v1/object/"
        f"{quote(bucket, safe='')}/{encoded_path}"
    )
    request = Request(
        endpoint,
        headers={
            "apikey": settings.service_role_key,
            "Authorization": f"Bearer {settings.service_role_key}",
        },
        method="GET",
    )

    with urlopen(request, timeout=10) as response:
        return (
            response.read(),
            response.headers.get_content_type(),
        )


def count_supabase_storage_objects(bucket: str) -> int:
    """Return a safe object count for a Supabase Storage bucket."""

    settings = get_supabase_settings()
    endpoint = (
        f"{settings.url.rstrip('/')}/storage/v1/object/list/"
        f"{quote(bucket, safe='')}"
    )
    offset = 0
    limit = 1000
    object_count = 0

    while True:
        data = json.dumps(
            {
                "prefix": "",
                "limit": limit,
                "offset": offset,
            }
        ).encode("utf-8")
        request = Request(
            endpoint,
            data=data,
            headers={
                "apikey": settings.service_role_key,
                "Authorization": f"Bearer {settings.service_role_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        with urlopen(request, timeout=10) as response:
            objects = json.loads(response.read().decode("utf-8"))

        object_count += len(objects)

        if len(objects) < limit:
            return object_count

        offset += limit
