from unittest.mock import MagicMock

import pytest
from backend.app.db.connection import execute

# Everything the tests register uses one of these throwaway email patterns.
TEST_EMAIL_PATTERNS = ("oauth-test-%", "analysis-test-%", "oauth-%@example.com")


@pytest.fixture(autouse=True)
def drop_test_accounts():
    """
    Remove what a test registered once it is done.

    Tests run against the development database, so without this every run leaves
    throwaway accounts and their fake repositories behind - and the scan sweeper
    then dutifully tries to clone those repositories over the network.
    """
    yield
    execute(
        """
        DELETE FROM users
        WHERE email LIKE %s OR email LIKE %s OR email LIKE %s
        """,
        TEST_EMAIL_PATTERNS,
    )


@pytest.fixture(autouse=True)
def queued_scans(monkeypatch):
    """
    Keep tests hermetic.

    Importing or connecting a repository queues a background scan, and a scan
    shallow-clones the repository over the network inside a worker thread. Tests
    assert that a scan was *queued*; they must never depend on one running, on
    the network, or on another test's pending rows being picked up.

    Returns the mock so a test can assert which repositories asked for a scan.
    """
    mock = MagicMock()
    for target in (
        "backend.app.api.github.start_analysis_async",
        "backend.app.api.repositories.start_analysis_async",
        "backend.app.api.analysis.start_analysis_async",
    ):
        monkeypatch.setattr(target, mock)
    return mock
