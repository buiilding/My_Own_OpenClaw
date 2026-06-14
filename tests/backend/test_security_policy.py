"""Covers security policy behavior in the backend test suite."""

from backend.src.core.security.policy import Permission, SecurityPolicy


class _Tool:
    required_permissions = {Permission.READ_FILESYSTEM}


def test_declared_tool_permission_is_not_authorization_grant():
    policy = SecurityPolicy()

    assert (
        policy.check_permission(
            "read_file",
            Permission.READ_FILESYSTEM,
            {},
            tool_instance=_Tool(),
        )
        is False
    )


def test_granted_declared_tool_permission_allows_access():
    policy = SecurityPolicy()
    policy.grant_permission("read_file", Permission.READ_FILESYSTEM)

    assert (
        policy.check_permission(
            "read_file",
            Permission.READ_FILESYSTEM,
            {},
            tool_instance=_Tool(),
        )
        is True
    )


def test_grant_without_tool_declaration_still_denies_access():
    policy = SecurityPolicy()
    policy.grant_permission("read_file", Permission.WRITE_FILESYSTEM)

    assert (
        policy.check_permission(
            "read_file",
            Permission.WRITE_FILESYSTEM,
            {},
            tool_instance=_Tool(),
        )
        is False
    )


def test_fallback_required_permissions_still_require_explicit_grant():
    policy = SecurityPolicy()
    policy.required_permissions["legacy_tool"] = {Permission.NETWORK_ACCESS}

    assert (
        policy.check_permission("legacy_tool", Permission.NETWORK_ACCESS, {}) is False
    )

    policy.grant_permissions("legacy_tool", {Permission.NETWORK_ACCESS})

    assert policy.check_permission("legacy_tool", Permission.NETWORK_ACCESS, {}) is True


def test_revoked_permission_denies_access_again():
    policy = SecurityPolicy()
    policy.grant_permission("read_file", Permission.READ_FILESYSTEM)
    policy.revoke_permission("read_file", Permission.READ_FILESYSTEM)

    assert (
        policy.check_permission(
            "read_file",
            Permission.READ_FILESYSTEM,
            {},
            tool_instance=_Tool(),
        )
        is False
    )
