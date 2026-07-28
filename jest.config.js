module.exports = {
  testEnvironment: 'node',
  // Runs before every test module is imported. Aborts the run if the resolved
  // database is PostgreSQL without the safe-runner flag, so that `npx jest`
  // cannot bypass scripts/run-jest.js and point the destructive suites at a
  // real database. See tests/setup/guard-production-db.js.
  setupFiles: ['<rootDir>/tests/setup/guard-production-db.js'],
  // Server tests live under tests/ and co-located src/**/__tests__ (e.g. PDF engine).
  // Client tests run separately via Vitest, so /client/ is ignored here.
  testMatch: ['**/tests/**/*.test.js', '**/__tests__/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/', '/client/'],
};
