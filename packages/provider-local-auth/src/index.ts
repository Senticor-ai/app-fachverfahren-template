export { hashPassword, verifyPassword } from "./password.js";
export {
  evaluateLoginAttempt,
  lockAfterFailure,
  LOGIN_FAILURE_THRESHOLD,
  LOGIN_LOCK_DURATION_MS,
} from "./lockout.js";
export type { LoginGateDecision, LoginGateState } from "./lockout.js";
