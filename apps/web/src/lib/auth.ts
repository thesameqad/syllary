export const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as
  | string
  | undefined;

/** Auth UI is only wired up once a Clerk key is present. */
export const authConfigured = Boolean(clerkPublishableKey);
