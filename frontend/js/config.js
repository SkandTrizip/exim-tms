/**
 * Use the current page origin so API calls work whether you open the app as
 * http://localhost:8000 or http://127.0.0.1:8000 (hardcoding localhost breaks fetch).
 */
const CONFIG = {
    API_URL: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5000'
};
