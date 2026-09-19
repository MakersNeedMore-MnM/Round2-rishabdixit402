from typing import List, Dict, Any
from backend.app.rules.checks import (
    check_removed_field_reference,
    check_function_signature_change,
    check_api_contract_change,
    check_auth_missing,
    check_sensitive_exposure,
    check_null_access,
    check_risky_migration,
    check_missing_test,
    Finding
)

class RuleEngine:
    def __init__(self):
        self.rules = [
            check_removed_field_reference,
            check_function_signature_change,
            check_api_contract_change,
            check_auth_missing,
            check_sensitive_exposure,
            check_null_access,
            check_risky_migration,
            check_missing_test
        ]

    def evaluate(self, files: List[Dict[str, Any]], entities: List[Dict[str, Any]], relationships: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        findings: List[Finding] = []
        for rule in self.rules:
            try:
                results = rule(files, entities, relationships)
                findings.extend(results)
            except Exception as e:
                print(f"Error executing rule {rule.__name__}: {e}")

        return [f.to_dict() for f in findings]
