// API prefix is relative for the website/Vite proxy, but must be absolute in the
// installed Android WebView. Set VITE_API_BASE_URL to the public backend origin + /api
// when building the APK (for example: https://api.example.com/api).
const configured = (import.meta.env.VITE_API_BASE_URL || "").trim().replace(/\/+$/, "");
export const API_BASE_URL = configured || "/api";
