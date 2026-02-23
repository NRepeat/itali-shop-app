export function sanitizeHandle(handle: string): string {
  return handle.toLowerCase().replace(/[^a-z0-9-]/g, "-");
}

export function stripBrandFromHandle(handle: string): string {
  // This is a placeholder. The actual implementation will depend on how brands are identified.
  return handle;
}
