# SmartFA Application Test Suites

Directory breakdown per TRD specification:
- `unit/`: Unit tests for utilities, scoring logic, and formatters.
- `integration/`: Integration tests between services (Express API, Supabase, Python Worker).
- `e2e/`: Full browser-based end-to-end workflows (Playwright).
- `security/`: Multi-role access control, token tampering, and negative authorization tests.
- `fixtures/`: Synthetic, anonymized sample PDF files and test datasets for similarity testing.
