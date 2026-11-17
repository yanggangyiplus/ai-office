// Shared error types, kept apart so modules can import them without circular imports.
export class ValidationError extends Error {}

// The team (not the user) is missing a setting an admin has to provide first.
export class TeamSetupError extends Error {
  constructor(public what: "notion") {
    super(`team setup missing: ${what}`);
  }
}
