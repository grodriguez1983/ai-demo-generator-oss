/**
 * Shared CSS selectors for the generic recording flow.
 *
 * These are deliberately broad defaults that match common component libraries
 * (plain HTML forms, shadcn/ui, Radix, sonner toasts). The built-in login step
 * (src/flows/base-flow.ts) uses AUTH and LAYOUT; everything else a demo needs is
 * written inline in its YAML `actions`, so you rarely touch this file.
 *
 * Override any of these by writing explicit selectors in your demo's actions.
 */

// ── Auth (used by the built-in login step) ──────────────────────────
export const AUTH = {
  emailInput: 'input[name="email"], input#email, input[type="email"]',
  passwordInput: 'input[name="password"], input#password, input[type="password"]',
  submitButton: 'button[type="submit"]',
  errorMessage: '[class*="error"], [class*="destructive"], .text-red-500',
} as const;

// ── Layout ──────────────────────────────────────────────────────────
export const LAYOUT = {
  sidebar: '[data-testid="sidebar"], nav[class*="sidebar"], aside',
  sidebarLink: (text: string) => `nav a:has-text("${text}"), aside a:has-text("${text}")`,
  header: 'header',
  mainContent: 'main',
  loadingSpinner: '[data-testid="loading"], .animate-spin',
  toast: '[data-sonner-toast]',
  successToast: '[data-sonner-toast][data-type="success"]',
} as const;

// ── Tables (shared patterns) ────────────────────────────────────────
export const TABLE = {
  container: 'table',
  header: 'thead',
  body: 'tbody',
  row: 'tbody tr',
  cell: 'td',
  headerCell: 'th',
  pagination: '[data-testid="pagination"], nav[aria-label*="pagination"]',
  emptyState: '[class*="empty"], [data-testid="empty-state"]',
} as const;

// ── Common UI elements ──────────────────────────────────────────────
export const UI = {
  dialog: '[role="dialog"]',
  dialogClose: '[role="dialog"] button[class*="close"], [role="dialog"] button:has(svg)',
  comboboxOption: (text: string) => `[role="option"]:has-text("${text}")`,
  tab: (text: string) => `[role="tab"]:has-text("${text}")`,
  button: (text: string) => `button:has-text("${text}")`,
  link: (text: string) => `a:has-text("${text}")`,
} as const;
