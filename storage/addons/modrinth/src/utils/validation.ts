export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateSearchQuery(query: string): ValidationResult {
  if (typeof query !== 'string') return { valid: false, error: 'Query must be a string' };
  const trimmed = query.trim();
  if (trimmed.length > 200) return { valid: false, error: 'Query too long (max 200 chars)' };
  return { valid: true };
}

export function validateProjectId(id: string): ValidationResult {
  if (!id?.trim()) return { valid: false, error: 'Project ID is required' };
  if (id.length > 100) return { valid: false, error: 'Project ID too long' };
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return { valid: false, error: 'Invalid project ID format' };
  return { valid: true };
}

export function validateVersionId(id: string): ValidationResult {
  if (!id?.trim()) return { valid: false, error: 'Version ID is required' };
  if (id.length > 100) return { valid: false, error: 'Version ID too long' };
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return { valid: false, error: 'Invalid version ID format' };
  return { valid: true };
}

export function validateServerId(id: string): ValidationResult {
  if (!id?.trim()) return { valid: false, error: 'Server ID is required' };
  if (id.length > 100) return { valid: false, error: 'Server ID too long' };
  return { valid: true };
}

export function validatePageNumber(page: any): ValidationResult {
  const num = parseInt(page, 10);
  if (isNaN(num) || num < 1) return { valid: false, error: 'Page must be a positive integer' };
  return { valid: true };
}

export function validateProjectType(type: string): ValidationResult {
  const allowed = ['all', 'mod', 'modpack', 'resourcepack', 'shader', 'plugin', 'datapack'];
  if (!allowed.includes(type)) return { valid: false, error: `Invalid project type. Allowed: ${allowed.join(', ')}` };
  return { valid: true };
}

export function sanitizeInput(input: string): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[<>]/g, '')
    .replace(/['"]/g, '')
    .replace(/;/g, '')
    .trim();
}
