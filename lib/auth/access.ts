import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sanitizeNextPath, withNext } from "@/lib/auth/paths";

export type AssuranceLevel = "aal1" | "aal2" | null;
export type AgencyRole = "agency_buyer" | "agency_admin";
export type StaffRole = "sales_reviewer" | "finance" | "system_admin";

export interface VerifiedIdentity {
  userId: string;
  email: string;
  currentLevel: AssuranceLevel;
  nextLevel: AssuranceLevel;
}

export interface UserProfileRecord {
  user_id: string;
  username: string;
  email: string;
  full_name: string;
  telephone: string | null;
  status: "pending_activation" | "active" | "suspended" | "revoked";
  mfa_required: boolean;
  mfa_enrolled_at: string | null;
}

export interface AgencyRecord {
  id: string;
  account_number: string;
  legal_name: string;
  display_name: string;
  status: "pending" | "active" | "suspended" | "closed";
  discount_basis_points: number;
  approved_credit_limit_cents: number;
  payment_terms_days: number;
  discount_policy: "stack" | "best_of" | "agency_replaces_campaign";
  po_required: boolean;
  effective_date: string;
  expires_at: string | null;
}

export interface AgencyMembershipRecord {
  id: string;
  agency_id: string;
  user_id: string;
  role: AgencyRole;
  status: "invited" | "active" | "suspended" | "revoked";
  can_purchase: boolean;
}

export interface StaffRecord {
  user_id: string;
  role: StaffRole;
  active: boolean;
}

export interface AgencyAccess {
  identity: VerifiedIdentity;
  profile: UserProfileRecord;
  membership: AgencyMembershipRecord;
  agency: AgencyRecord;
}

export interface StaffAccess {
  identity: VerifiedIdentity;
  profile: UserProfileRecord;
  staff: StaffRecord;
}

export class AgencyAccessError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 403, code = "ACCESS_DENIED") {
    super(message);
    this.name = "AgencyAccessError";
    this.status = status;
    this.code = code;
  }
}

function readClaims(
  claimsData: unknown,
): { sub?: string; email?: string } | undefined {
  if (!claimsData || typeof claimsData !== "object") {
    return undefined;
  }

  const record = claimsData as Record<string, unknown>;
  const claims = record.claims;

  if (!claims || typeof claims !== "object") {
    return undefined;
  }

  return claims as { sub?: string; email?: string };
}

export async function getVerifiedIdentity(): Promise<VerifiedIdentity | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error) {
    return null;
  }

  const claims = readClaims(data);
  const userId = claims?.sub?.trim();

  if (!userId) {
    return null;
  }

  const { data: aalData } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  return {
    userId,
    email: claims?.email?.trim().toLowerCase() ?? "",
    currentLevel: (aalData?.currentLevel ?? null) as AssuranceLevel,
    nextLevel: (aalData?.nextLevel ?? null) as AssuranceLevel,
  };
}

export async function getAgencyAccess(): Promise<AgencyAccess | null> {
  const identity = await getVerifiedIdentity();

  if (!identity) {
    return null;
  }

  const admin = createSupabaseAdminClient();

  const [{ data: profile }, { data: membership }] = await Promise.all([
    admin
      .from("user_profiles")
      .select(
        "user_id,username,email,full_name,telephone,status,mfa_required,mfa_enrolled_at",
      )
      .eq("user_id", identity.userId)
      .maybeSingle(),
    admin
      .from("agency_members")
      .select("id,agency_id,user_id,role,status,can_purchase")
      .eq("user_id", identity.userId)
      .maybeSingle(),
  ]);

  if (!profile || !membership) {
    return null;
  }

  const { data: agency } = await admin
    .from("agency_accounts")
    .select(
      "id,account_number,legal_name,display_name,status,discount_basis_points,approved_credit_limit_cents,payment_terms_days,discount_policy,po_required,effective_date,expires_at",
    )
    .eq("id", membership.agency_id)
    .maybeSingle();

  if (!agency) {
    return null;
  }

  return {
    identity,
    profile: profile as UserProfileRecord,
    membership: membership as AgencyMembershipRecord,
    agency: agency as AgencyRecord,
  };
}

export async function getStaffAccess(): Promise<StaffAccess | null> {
  const identity = await getVerifiedIdentity();

  if (!identity) {
    return null;
  }

  const admin = createSupabaseAdminClient();

  const [{ data: profile }, { data: staff }] = await Promise.all([
    admin
      .from("user_profiles")
      .select(
        "user_id,username,email,full_name,telephone,status,mfa_required,mfa_enrolled_at",
      )
      .eq("user_id", identity.userId)
      .maybeSingle(),
    admin
      .from("staff_members")
      .select("user_id,role,active")
      .eq("user_id", identity.userId)
      .maybeSingle(),
  ]);

  if (!profile || !staff) {
    return null;
  }

  return {
    identity,
    profile: profile as UserProfileRecord,
    staff: staff as StaffRecord,
  };
}

function agencyDatesAreActive(agency: AgencyRecord): boolean {
  const today = new Date().toISOString().slice(0, 10);

  return (
    agency.effective_date <= today &&
    (!agency.expires_at || agency.expires_at >= today)
  );
}

function redirectForMfa(identity: VerifiedIdentity, nextPath: string): never {
  if (identity.nextLevel === "aal2") {
    redirect(withNext("/auth/mfa/challenge", nextPath));
  }

  redirect(withNext("/auth/mfa/enroll", nextPath));
}

export async function requireAgencyPurchaseAccess(
  requestedPath: string,
): Promise<AgencyAccess> {
  const nextPath = sanitizeNextPath(requestedPath, "/portal");
  const identity = await getVerifiedIdentity();

  if (!identity) {
    redirect(withNext("/auth/login", nextPath));
  }

  if (identity.currentLevel !== "aal2") {
    redirectForMfa(identity, nextPath);
  }

  const access = await getAgencyAccess();

  if (
    !access ||
    access.profile.status !== "active" ||
    access.membership.status !== "active" ||
    access.agency.status !== "active" ||
    !agencyDatesAreActive(access.agency)
  ) {
    redirect("/auth/access-denied");
  }

  if (!access.membership.can_purchase) {
    redirect("/auth/access-denied?reason=purchasing-disabled");
  }

  return access;
}

export async function requireStaffAccess(
  requestedPath: string,
  roles: readonly StaffRole[],
): Promise<StaffAccess> {
  const nextPath = sanitizeNextPath(requestedPath, "/admin/agencies");
  const identity = await getVerifiedIdentity();

  if (!identity) {
    redirect(withNext("/auth/login", nextPath));
  }

  if (identity.currentLevel !== "aal2") {
    redirectForMfa(identity, nextPath);
  }

  const access = await getStaffAccess();

  if (
    !access ||
    !access.staff.active ||
    access.profile.status !== "active" ||
    !roles.includes(access.staff.role)
  ) {
    redirect("/auth/access-denied");
  }

  return access;
}

export async function requireAgencyPurchaseAccessForApi(): Promise<AgencyAccess> {
  const identity = await getVerifiedIdentity();

  if (!identity) {
    throw new AgencyAccessError("Authentication is required.", 401, "AUTH_REQUIRED");
  }

  if (identity.currentLevel !== "aal2") {
    throw new AgencyAccessError(
      "Authenticator verification is required.",
      403,
      "MFA_REQUIRED",
    );
  }

  const access = await getAgencyAccess();

  if (
    !access ||
    access.profile.status !== "active" ||
    access.membership.status !== "active" ||
    access.agency.status !== "active" ||
    !agencyDatesAreActive(access.agency) ||
    !access.membership.can_purchase
  ) {
    throw new AgencyAccessError(
      "The user is not authorized to purchase for an active agency account.",
      403,
      "AGENCY_PURCHASE_ACCESS_REQUIRED",
    );
  }

  return access;
}

export async function requireStaffAccessForApi(
  roles: readonly StaffRole[],
): Promise<StaffAccess> {
  const identity = await getVerifiedIdentity();

  if (!identity) {
    throw new AgencyAccessError("Authentication is required.", 401, "AUTH_REQUIRED");
  }

  if (identity.currentLevel !== "aal2") {
    throw new AgencyAccessError(
      "Authenticator verification is required.",
      403,
      "MFA_REQUIRED",
    );
  }

  const access = await getStaffAccess();

  if (
    !access ||
    !access.staff.active ||
    access.profile.status !== "active" ||
    !roles.includes(access.staff.role)
  ) {
    throw new AgencyAccessError(
      "Internal staff authorization is required.",
      403,
      "STAFF_ACCESS_REQUIRED",
    );
  }

  return access;
}
