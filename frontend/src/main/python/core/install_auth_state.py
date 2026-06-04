"""Compatibility exports for sidecar install-auth state helpers."""

from windie import _auth

__all__ = [
    "get_authenticated_user_id",
    "get_install_auth_state_path",
    "get_install_bearer_token",
    "load_install_auth_state",
]

get_authenticated_user_id = _auth.get_authenticated_user_id
get_install_auth_state_path = _auth.get_install_auth_state_path
get_install_bearer_token = _auth.get_install_bearer_token
load_install_auth_state = _auth.load_install_auth_state
