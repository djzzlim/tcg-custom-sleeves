```markdown
# tcg-custom-sleeves Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches the core development patterns and conventions used in the `tcg-custom-sleeves` TypeScript repository. You'll learn how to structure files, write imports and exports, follow commit message conventions, and organize your tests. This guide also introduces suggested workflows and commands to streamline common development tasks.

## Coding Conventions

### File Naming
- Use **camelCase** for file names.
  - Example: `customSleeve.ts`, `cardManager.test.ts`

### Import Style
- Use **alias imports** for modules.
  - Example:
    ```typescript
    import { CardManager as Manager } from './cardManager';
    ```

### Export Style
- Use **named exports** for functions, classes, and constants.
  - Example:
    ```typescript
    export function createSleeve() { ... }
    export const SLEEVE_TYPES = ['matte', 'glossy'];
    ```

### Commit Messages
- Follow **Conventional Commits** with the `feat` prefix for new features.
  - Example:  
    ```
    feat: add support for custom sleeve colors
    ```

## Workflows

### Feature Development
**Trigger:** When starting work on a new feature  
**Command:** `/start-feature`

1. Create a new branch for your feature.
2. Implement the feature using camelCase file naming and named exports.
3. Write or update relevant tests in `*.test.*` files.
4. Commit changes using the `feat:` prefix and a concise description.
5. Open a pull request for review.

### Testing Code
**Trigger:** Before pushing or merging code  
**Command:** `/run-tests`

1. Locate or create test files matching the `*.test.*` pattern.
2. Run the test suite using your preferred test runner (framework not specified).
3. Ensure all tests pass before proceeding.

## Testing Patterns

- Test files use the `*.test.*` naming convention, e.g., `cardManager.test.ts`.
- The testing framework is not specified; use your team's preferred tool.
- Place tests alongside the code they verify or in a dedicated test directory.
- Example test file structure:
  ```typescript
  // cardManager.test.ts
  import { CardManager } from './cardManager';

  describe('CardManager', () => {
    it('should create a new card', () => {
      // test implementation
    });
  });
  ```

## Commands
| Command         | Purpose                                 |
|-----------------|-----------------------------------------|
| /start-feature  | Begin a new feature development workflow |
| /run-tests      | Run all tests before pushing code        |
```
