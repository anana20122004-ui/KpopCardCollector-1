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

// Helper function to check if user is admin or staff
export const isAdminUser = (member: any): boolean => {
  if (!member) return false;
  
  // Check if ID is in ADMIN_USERS list
  const userId = typeof member === 'string' ? member : member.id;
  if (ADMIN_USERS.includes(userId)) return true;

  // Check for staff role if member object is provided
  if (typeof member !== 'string' && member.roles) {
    return member.roles.cache.has(STAFF_ROLE_ID);
  }

  return false;
};
