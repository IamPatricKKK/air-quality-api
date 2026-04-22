/**
 * User status enum
 */
export enum UserStatus {
  ACTIVE = 'active',
  INVITED = 'invited',
  DISABLED = 'disabled',
}

/**
 * Area level enum for geographic hierarchy
 */
export enum AreaLevel {
  PROVINCE = 'province',
  DISTRICT = 'district',
  WARD = 'ward',
}

/**
 * Station type enum
 */
export enum StationType {
  MONITORING = 'monitoring',
  REFERENCE = 'reference',
  VIRTUAL = 'virtual',
}
