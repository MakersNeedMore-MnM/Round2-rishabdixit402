import pytest
from backend.app.db.seed_data import DEMO_FILES
from backend.app.analysis.parsers import parse_file
from backend.app.rules.engine import RuleEngine
from backend.app.janitor.analyzer import JanitorAnalyzer
from backend.app.analysis.graph import CodeIntelligenceGraph

def test_safety_rules_and_janitor():
    all_entities = []
    all_relationships = []

    for f in DEMO_FILES:
        ents, rels = parse_file(f["path"], f["language"], f["content"])
        all_entities.extend([e.to_dict() for e in ents])
        all_relationships.extend([r.to_dict() for r in rels])

    # Test Rule Engine
    engine = RuleEngine()
    findings = engine.evaluate(DEMO_FILES, all_entities, all_relationships)
    
    rule_ids = [f["rule_id"] for f in findings]
    assert "removed_field_reference" in rule_ids
    assert "function_signature_change" in rule_ids
    assert "auth_missing" in rule_ids
    assert "sensitive_exposure" in rule_ids
    assert "null_access" in rule_ids
    assert "risky_migration" in rule_ids

    # Test Janitor
    janitor = JanitorAnalyzer()
    cleanup = janitor.analyze(DEMO_FILES, all_entities, all_relationships)
    cleanup_types = [c["type"] for c in cleanup]
    assert "unused_import" in cleanup_types
    assert "dead_code" in cleanup_types

    # Test NetworkX Impact Graph
    cg = CodeIntelligenceGraph()
    cg.build_from_records(all_entities, all_relationships)
    impact = cg.compute_impact("email")
    assert impact["summary"]["files"] > 0
