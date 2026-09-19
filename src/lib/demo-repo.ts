export interface DemoFile {
  path: string;
  language: string;
  content: string;
}

export const DEMO_REPO_NAME = "regit-demo";
export const DEMO_REPO_URL = "https://github.com/rishabdixit4021/regit-demo";

export const DEMO_FILES: DemoFile[] = [
  {
    path: "backend/models/user.py",
    language: "python",
    content: `"""User domain model: single source of truth for identity fields."""
from sqlalchemy import Column, Integer, String
from backend.models.base import BaseModel


class User(BaseModel):
    """User account record. CHANGE: email -> email_address (pending migration)."""

    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    # RENAMED: email -> email_address. Old references must be updated.
    email_address = Column(String(255), nullable=False, unique=True)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=True)
    role = Column(String(50), default="member")

    def display_name(self):
        return self.full_name or self.email_address

    def to_dict(self):
        return {
            "id": self.id,
            "email_address": self.email_address,
            "full_name": self.full_name,
            "role": self.role,
        }
`,
  },
  {
    path: "backend/services/user_service.py",
    language: "python",
    content: `"""User service layer: orchestrates reads/writes for User entities."""
import os
import json  # UNUSED: leftover from debugging
from backend.models.user import User
from backend.services.email_client import send_email


def get_user_by_email(email_address, include_inactive=False):
    """Fetch a user by email. SIGNATURE CHANGED: added include_inactive flag."""
    # NOTE: callers still pass a single positional arg (old contract).
    return User.query.filter_by(email_address=email_address).first()


def get_user_profile(user_id):
    user = User.query.get(user_id)
    # RISKY: user may be None, dereferenced without guard
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
    }


def update_user_email(user_id, new_email):
    user = User.query.get(user_id)
    if user is None:
        return None
    user.email = new_email
    send_email(user.email, "Email updated")
    return user.to_dict()


def format_username(user):
    # POTENTIAL duplicate utility: see auth_service.format_username
    return (user.full_name or user.email_address or "").strip().lower()


def legacy_export_users():
    # DEAD: never called anywhere, predates to_dict()
    rows = User.query.all()
    return [r.to_dict() for r in rows]
`,
  },
  {
    path: "backend/services/auth_service.py",
    language: "python",
    content: `"""Authentication service: login, sessions, tokens."""
import hashlib
import requests  # UNUSED: old OAuth spike
from backend.models.user import User
from backend.services.user_service import get_user_by_email


def authenticate(email, password):
    # OLD CALLER: uses single-arg call after signature change
    user = get_user_by_email(email)
    if user is None:
        return None
    digest = hashlib.sha256(password.encode()).hexdigest()
    if digest != user.password_hash:
        return None
    return create_session(user)


def create_session(user):
    token = hashlib.sha256(user.email_address.encode()).hexdigest()
    print(f"SESSION CREATED token={token} for {user.email}")
    return {"user_id": user.id, "token": token}


def format_username(user):
    # POTENTIAL duplicate utility: mirrors user_service.format_username
    name = user.full_name or user.email or "unknown"
    return name.strip().lower()


def ghost_token_refresh():
    # DEAD: scheduled job removed but function left behind
    return None
`,
  },
  {
    path: "backend/services/email_client.py",
    language: "python",
    content: `"""Thin email delivery client."""


def send_email(to_address, subject, body=""):
    # Stubbed delivery: logs instead of sending in demo
    print(f"Sending email to={to_address} subject={subject}")
    return True
`,
  },
  {
    path: "backend/api/user.py",
    language: "python",
    content: `"""User REST API: public + admin routes."""
from fastapi import APIRouter
from backend.services.user_service import get_user_by_email, get_user_profile
from backend.services.auth_service import authenticate

router = APIRouter(prefix="/users")


@router.get("/{user_id}")
def get_user(user_id: int):
    """Public profile fetch. No auth check by design for demo of missing guard."""
    profile = get_user_profile(user_id)
    return profile


@router.get("/by-email")
def get_user_by_email_route(email: str):
    user = get_user_by_email(email)
    if not user:
        return {"error": "not found"}
    # SENSITIVE: leaks password hash into API response
    return {"id": user.id, "email": user.email, "password_hash": user.password_hash}


@router.post("/login")
def login(email: str, password: str):
    session = authenticate(email, password)
    return session or {"error": "invalid credentials"}


@router.get("/admin/all")
def list_all_users_admin():
    """ADMIN route WITHOUT any authorization check: HIGH risk."""
    from backend.models.user import User
    users = User.query.all()
    return [u.to_dict() for u in users]
`,
  },
  {
    path: "backend/api/profile.py",
    language: "python",
    content: `"""Profile API: aggregates user + preferences."""
from fastapi import APIRouter
from backend.services.user_service import get_user_profile, update_user_email

router = APIRouter(prefix="/profile")


@router.get("/{user_id}")
def read_profile(user_id: int, current_user=None):
    # Has current_user param => treated as auth-guarded
    profile = get_user_profile(user_id)
    return {"profile": profile, "viewer": current_user}


@router.post("/{user_id}/email")
def change_email(user_id: int, new_email: str, current_user=None):
    result = update_user_email(user_id, new_email)
    return {"ok": True, "user": result}
`,
  },
  {
    path: "backend/migrations/0012_remove_email.py",
    language: "python",
    content: `"""Migration 0012: drops legacy User.email column."""
from alembic import op


def upgrade():
    # RISKY MIGRATION: drops email while app code still references user.email
    op.drop_column("users", "email")


def downgrade():
    op.add_column("users", "email")
`,
  },
  {
    path: "backend/tests/test_user.py",
    language: "python",
    content: `"""Tests for user service (partial coverage)."""
from backend.services.user_service import format_username


def test_format_username():
    class FakeUser:
        full_name = " Ada "
        email_address = "ada@example.com"

    assert format_username(FakeUser()) == "ada"


def test_placeholder():
    assert True
`,
  },
  {
    path: "frontend/components/Profile.tsx",
    language: "typescript",
    content: `import React, { useEffect, useState } from "react";
import { fetchUser } from "../lib/api";
import { Avatar } from "./Avatar";

interface ProfileProps {
  userId: number;
}

export function Profile({ userId }: ProfileProps) {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    fetchUser(userId).then(setUser);
  }, [userId]);

  if (!user) return <div>Loading…</div>;

  return (
    <div className="profile-card">
      <Avatar name={user.full_name} />
      {/* STALE: backend renamed email -> email_address */}
      <p>{user.email}</p>
      <p>{user.full_name}</p>
      <span>{user.role}</span>
    </div>
  );
}
`,
  },
  {
    path: "frontend/components/Settings.tsx",
    language: "typescript",
    content: `import React, { useState } from "react";
import { updateEmail } from "../lib/api";

export function Settings({ userId }: { userId: number }) {
  const [email, setEmail] = useState("");
  // UNUSED import pattern: lodash imported but never used
  const save = async () => {
    await updateEmail(userId, email);
    console.log("saved new email", email);
  };

  return (
    <div>
      <h2>Settings</h2>
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="new email" />
      <button onClick={save}>Save</button>
      {/* STALE reference to removed response field */}
      <small>Current: {(window as any).__USER__?.email}</small>
    </div>
  );
}

export function DeadSettingsHelper() {
  // DEAD: exported but never imported anywhere
  return null;
}
`,
  },
  {
    path: "frontend/components/Avatar.tsx",
    language: "typescript",
    content: `import React from "react";

export function Avatar({ name }: { name: string }) {
  const initial = (name || "?").slice(0, 1).toUpperCase();
  return <div className="avatar">{initial}</div>;
}
`,
  },
  {
    path: "frontend/lib/api.ts",
    language: "typescript",
    content: `// Frontend API client: consumes backend user/profile routes.
import axios from "axios";
import _ from "lodash";

const BASE = "/api";

export async function fetchUser(userId: number) {
  const res = await axios.get(\`\${BASE}/users/\${userId}\`);
  // Contract depends on 'email' field that backend removed
  return { ...res.data, email: res.data.email };
}

export async function updateEmail(userId: number, email: string) {
  const res = await axios.post(\`\${BASE}/profile/\${userId}/email\`, { email });
  return res.data;
}

export async function fetchAdminUsers(token: string) {
  // Calls the unguarded admin route, forwarding a token the server ignores
  const res = await axios.get(\`\${BASE}/users/admin/all\`, {
    headers: { Authorization: \`Bearer \${token}\` },
  });
  console.log("admin token used:", token);
  return res.data;
}

export function unusedFormatter(x: any) {
  // DEAD: never imported by components
  return JSON.stringify(x);
}
`,
  },
  {
    path: "backend/requirements.txt",
    language: "text",
    content: `fastapi==0.110.0
sqlalchemy==2.0.29
alembic==1.13.1
requests==2.31.0
celery==5.3.6
`,
  },
  {
    path: "frontend/package.json",
    language: "json",
    content: `{
  "name": "regit-demo-frontend",
  "dependencies": {
    "react": "18.3.1",
    "axios": "1.7.2",
    "lodash": "4.17.21",
    "moment": "2.30.1"
  }
}
`,
  },
  {
    path: "backend/models/base.py",
    language: "python",
    content: `"""Shared ORM base."""


class BaseModel:
    query = None

    def save(self):
        return True
`,
  },
];

export const DEMO_CHANGES = [
  {
    filePath: "backend/models/user.py",
    symbol: "User.email",
    changeType: "rename",
    oldValue: "User.email",
    newValue: "User.email_address",
    description: "Rename User.email → User.email_address to disambiguate auth vs contact email.",
  },
  {
    filePath: "backend/services/user_service.py",
    symbol: "get_user_by_email",
    changeType: "signature",
    oldValue: "get_user_by_email(email)",
    newValue: "get_user_by_email(email_address, include_inactive=False)",
    description: "Add include_inactive flag for admin lookups.",
  },
  {
    filePath: "backend/api/user.py",
    symbol: "GET /users/{user_id} response.email",
    changeType: "api_change",
    oldValue: "{ id, email, full_name }",
    newValue: "{ id, email_address, full_name, role }",
    description: "API response drops legacy email field.",
  },
  {
    filePath: "backend/migrations/0012_remove_email.py",
    symbol: "users.email column",
    changeType: "migration",
    oldValue: "users.email exists",
    newValue: "users.email dropped",
    description: "Migration drops legacy column still referenced by services.",
  },
];
