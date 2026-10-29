from api.errors import public_error_detail


def test_public_error_detail_strips_secrets_and_long_traces():
    assert public_error_detail(ValueError("sk-live-secret-value"), "safe") == "safe"
    assert public_error_detail(ValueError("service_role key leaked"), "safe") == "safe"
    assert public_error_detail(ValueError("Unsupported format 'caption' for linkedin."), "safe") == (
        "Unsupported format 'caption' for linkedin."
    )
    assert public_error_detail(ValueError("x" * 400), "safe") == "safe"
    assert public_error_detail(ValueError(""), "safe") == "safe"
