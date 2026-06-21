// Dev/Special User IDs with full permissions
export const DEV_USER_ID = '1403958587843149937';
export const ADMIN_USERS = [
  '1403958587843149937',  // Dev user
  '996524280869302492'    // Admin user
];

// Role IDs
export const STAFF_ROLE_ID = '1468244160527204362';
export const BOOSTER_ROLE_ID = '1479309772569313290';

// Users who can use bot during lockdown
export const LOCKDOWN_WHITELIST = ADMIN_USERS;

const getMemberUserId = (member: any): string | undefined => {
  if (!member) return undefined;
  if (typeof member === 'string') return member;
  return member.id || member.user?.id;
};

const memberHasRole = (member: any, roleId: string): boolean => {
  if (!member || typeof member === 'string' || !member.roles) return false;

  if (member.roles.cache?.has(roleId)) return true;

  if (Array.isArray(member.roles)) {
    return member.roles.some((role: any) => role === roleId || role?.id === roleId);
  }

  return false;
};

// Helper function to check if user is admin or has the staff role
export const isAdminUser = (member: any): boolean => {
  const userId = getMemberUserId(member);
  if (userId && ADMIN_USERS.includes(userId)) return true;

  return memberHasRole(member, STAFF_ROLE_ID);
};