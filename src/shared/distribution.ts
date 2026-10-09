// scripts/release.sh sets this only while building the GitHub APKs: Play's
// Payments policy rejects any in-app link to an outside payment page.
export const KOFI_URL: string | null = null;
export const GITHUB_BUILD = KOFI_URL !== null;
