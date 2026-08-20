export function logSecurityEvent(event: string, metadata: Record<string, unknown>) {
  // Redact sensitive fields
  const sanitized = { ...metadata };
  const sensitive = ["token", "signature", "password", "privateKey", "address"];
  for (const key of sensitive) {
    if (sanitized[key] && typeof sanitized[key] === "string") {
      sanitized[key] = sanitized[key].slice(0, 10) + "***REDACTED***";
    }
  }
  
  console.info("SECURITY_EVENT", {
    event,
    timestamp: new Date().toISOString(),
    ...sanitized,
  });
}
