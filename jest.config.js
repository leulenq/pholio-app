module.exports = {
  testEnvironment: 'node',
  // Server tests live under tests/ and co-located src/**/__tests__ (e.g. PDF engine).
  // Client tests run separately via Vitest, so /client/ is ignored here.
  testMatch: ['**/tests/**/*.test.js', '**/__tests__/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/', '/client/'],
};
