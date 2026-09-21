/**
 * Simple REDCap branching logic evaluator.
 *
 * Supports the subset used by RADAR-Questionnaire:
 *   - [field_name] = "value"         → equality check
 *   - [field_name(code)] = "1"       → checkbox/array contains check
 *   - [field_name] <> "value"        → inequality check
 *   - ... or ...                     → logical OR
 *   - ... and ...                    → logical AND
 *
 * This avoids the `morph-expressions` dependency used by the original Angular app.
 */

export function evaluateBranchingLogic(
  logic: string | undefined,
  answers: Record<string, any>,
): boolean {
  if (!logic || logic.trim() === '') return true;

  try {
    // Normalize the logic string
    let normalized = logic
      .replace(/\[([^\]]+)\]/g, (_, inner) => {
        // Convert [field_name(code)] → field_name__code
        // Convert [field_name] → field_name
        return inner.replace(/\(([^)]+)\)/g, '__$1');
      })
      .replace(/<>/g, '!=')
      .replace(/(?<!=)=(?!=)/g, '==');

    // Split by OR first (lower precedence)
    const orClauses = splitOutsideParens(normalized, / or /i);
    return orClauses.some(orClause => {
      // Split by AND (higher precedence)
      const andClauses = splitOutsideParens(orClause, / and /i);
      return andClauses.every(clause => evaluateClause(clause.trim(), answers));
    });
  } catch {
    // If parsing fails, show the question (fail open)
    return true;
  }
}

function evaluateClause(clause: string, answers: Record<string, any>): boolean {
  // Match: identifier operator value
  // e.g., field_name == "1" or field_name__3 == "1"
  const match = clause.match(/^(.+?)\s*(==|!=)\s*(.+)$/);
  if (!match) return true;

  const [, rawField, operator, rawValue] = match;
  const field = rawField.trim();
  const expectedValue = rawValue.trim().replace(/^["']|["']$/g, '');

  // Check for checkbox/array syntax: field_name__code
  const checkboxMatch = field.match(/^(.+?)__(.+)$/);

  let actualValue: any;
  if (checkboxMatch) {
    const [, fieldName, code] = checkboxMatch;
    const answer = answers[fieldName];
    // For checkboxes, the answer is an array of selected codes
    if (Array.isArray(answer)) {
      actualValue = answer.includes(code) || answer.includes(Number(code)) ? '1' : '0';
    } else {
      actualValue = '0';
    }
  } else {
    actualValue = answers[field];
  }

  // Coerce to string for comparison
  const actualStr = actualValue != null ? String(actualValue) : '';

  if (operator === '==') return actualStr === expectedValue;
  if (operator === '!=') return actualStr !== expectedValue;
  return true;
}

function splitOutsideParens(str: string, separator: RegExp): string[] {
  // Simple split — no nested parens to worry about in REDCap logic
  return str.split(separator);
}
