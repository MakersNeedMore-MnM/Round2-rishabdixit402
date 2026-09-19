import pytest
from backend.app.analysis.parsers import parse_file

def test_python_ast_parser():
    content = """
class User:
    email_address = "test@example.com"

    def get_email(self):
        return self.email_address

def global_helper():
    u = User()
    return u.get_email()
"""
    entities, rels = parse_file("user.py", "python", content)
    entity_names = [e.name for e in entities]
    assert "User" in entity_names
    assert "User.get_email" in entity_names
    assert "global_helper" in entity_names

    call_targets = [r.target_name for r in rels if r.type == "calls"]
    assert "User" in call_targets or "get_email" in call_targets

def test_typescript_parser():
    content = """
import { fetchUser } from "./api";

export function UserProfile({ userId }) {
    const user = fetchUser(userId);
    return <div>{user.email}</div>;
}
"""
    entities, rels = parse_file("UserProfile.tsx", "typescript", content)
    assert any(e.name == "UserProfile" for e in entities)
    assert any(r.target_name == "email" and r.type == "references" for r in rels)
