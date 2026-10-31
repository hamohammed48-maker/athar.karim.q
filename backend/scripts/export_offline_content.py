"""Deprecated: QF content must never be prepackaged into the APK.

Use the authenticated backend endpoint /api/offline/quran-bundle. It downloads
Content Sync data after installation and stores the copy on the user's device.
"""
raise SystemExit(
    "Prepackaging Quran Foundation content is not permitted by the Developer Terms. "
    "Use the backend Content Sync endpoint after installation."
)
