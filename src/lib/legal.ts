/**
 * Company details shown on the legal pages.
 * Set these as environment variables in Railway once the company is registered – no code change needed.
 */
export const LEGAL = {
  product: "Tadaai",
  site: process.env.TADAA_PUBLIC_URL || "https://tadaaai.com",
  company: process.env.TADAA_COMPANY_NAME || "Tadaai (company registration in progress)",
  orgNumber: process.env.TADAA_COMPANY_ORGNR || "",
  address: process.env.TADAA_COMPANY_ADDRESS || "",
  country: process.env.TADAA_COMPANY_COUNTRY || "Sweden",
  email: process.env.TADAA_CONTACT_EMAIL || "tuliany@mail.com",
  updated: "11 November 2026",
};

export function companyLine() {
  return [LEGAL.company, LEGAL.orgNumber && `org. no. ${LEGAL.orgNumber}`, LEGAL.address, LEGAL.country].filter(Boolean).join(", ");
}
