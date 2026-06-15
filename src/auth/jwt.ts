import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  KeyObject,
  sign as signPayload,
  verify as verifyPayload,
} from "crypto";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";

export const ADMIN_ROLES = ["super_admin", "admin", "operator", "analyst"];

export interface PublicJwk {
  kty: string;
  use: "sig";
  alg: "RS256";
  kid: string;
  n: string;
  e: string;
}

export interface JwksResponse {
  keys: PublicJwk[];
}

interface SigningState {
  kid: string;
  issuer: string;
  audience: string;
  ttlSeconds: number;
  privateKey: KeyObject;
  publicKey: KeyObject;
  jwk: PublicJwk;
}

export interface AuthUserContext {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
  authProvider?: string;
}

export interface AccessTokenClaims {
  iss: string;
  aud: string;
  sub: string;
  email: string;
  roles: string[];
  displayName: string;
  user_metadata: {
    display_name: string;
    auth_provider?: string;
  };
  iat: number;
  exp: number;
}

let signingState: SigningState | null = null;

function normalizeEnvValue(value?: string) {
  return value?.replace(/\\n/g, "\n").trim();
}

function isConfigured(value?: string) {
  const normalized = normalizeEnvValue(value);
  return Boolean(normalized && normalized !== "change-me");
}

function base64urlEncodeJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodeBase64urlJson<T>(value: string): T {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
  } catch {
    throw new UnauthorizedException("Malformed token payload");
  }
}

function getAccessTokenTtlSeconds() {
  const parsed = Number(process.env.JWT_ACCESS_TTL_SECONDS ?? 60 * 60 * 8);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60 * 60 * 8;
}

function buildKid(n: string, e: string) {
  const digest = createHash("sha256").update(`${n}.${e}`).digest("hex").slice(0, 16);
  return process.env.JWT_KID?.trim() || `air-quality-api-${digest}`;
}

function loadSigningState() {
  if (signingState) {
    return signingState;
  }

  const issuer = process.env.JWT_ISSUER?.trim() || "air-quality-api";
  const audience = process.env.JWT_AUDIENCE?.trim() || "air-quality-clients";
  const ttlSeconds = getAccessTokenTtlSeconds();

  let privateKeyPem: string;
  let publicKeyPem: string;

  if (isConfigured(process.env.JWT_PRIVATE_KEY) && isConfigured(process.env.JWT_PUBLIC_KEY)) {
    privateKeyPem = normalizeEnvValue(process.env.JWT_PRIVATE_KEY)!;
    publicKeyPem = normalizeEnvValue(process.env.JWT_PUBLIC_KEY)!;
  } else {
    const generated = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { format: "pem", type: "pkcs8" },
      publicKeyEncoding: { format: "pem", type: "spki" },
    });

    privateKeyPem = generated.privateKey;
    publicKeyPem = generated.publicKey;
  }

  const privateKey = createPrivateKey(privateKeyPem);
  const publicKey = createPublicKey(publicKeyPem);
  const exportedJwk = publicKey.export({ format: "jwk" }) as { n?: string; e?: string; kty?: string };

  if (!exportedJwk.n || !exportedJwk.e) {
    throw new Error("Unable to export JWT public key as JWK");
  }

  const kid = buildKid(exportedJwk.n, exportedJwk.e);

  signingState = {
    kid,
    issuer,
    audience,
    ttlSeconds,
    privateKey,
    publicKey,
    jwk: {
      kty: exportedJwk.kty ?? "RSA",
      use: "sig",
      alg: "RS256",
      kid,
      n: exportedJwk.n,
      e: exportedJwk.e,
    },
  };

  return signingState;
}

export function getJwks(): JwksResponse {
  return { keys: [loadSigningState().jwk] };
}

export function issueAccessToken(user: AuthUserContext) {
  const state = loadSigningState();
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + state.ttlSeconds;
  const payload: AccessTokenClaims = {
    iss: state.issuer,
    aud: state.audience,
    sub: user.id,
    email: user.email,
    roles: user.roles,
    displayName: user.displayName,
    user_metadata: {
      display_name: user.displayName,
      auth_provider: user.authProvider ?? "local",
    },
    iat: issuedAt,
    exp: expiresAt,
  };

  const encodedHeader = base64urlEncodeJson({
    alg: "RS256",
    typ: "JWT",
    kid: state.kid,
  });
  const encodedPayload = base64urlEncodeJson(payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = signPayload("RSA-SHA256", Buffer.from(signingInput), state.privateKey).toString("base64url");

  return {
    token: `${signingInput}.${signature}`,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
    claims: payload,
  };
}

export function extractBearerToken(authHeader?: string) {
  if (!authHeader) {
    throw new UnauthorizedException("Bearer token is required");
  }

  const [scheme, token] = authHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw new UnauthorizedException("Invalid authorization header");
  }

  return token;
}

export function verifyAccessToken(token: string) {
  const state = loadSigningState();
  const segments = token.split(".");
  if (segments.length !== 3) {
    throw new UnauthorizedException("Malformed token");
  }

  const [encodedHeader, encodedPayload, encodedSignature] = segments;
  const header = decodeBase64urlJson<{ alg?: string; kid?: string }>(encodedHeader);
  if (header.alg !== "RS256" || header.kid !== state.kid) {
    throw new UnauthorizedException("Unknown signing key");
  }

  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const isValidSignature = verifyPayload(
    "RSA-SHA256",
    Buffer.from(signingInput),
    state.publicKey,
    Buffer.from(encodedSignature, "base64url"),
  );

  if (!isValidSignature) {
    throw new UnauthorizedException("Invalid token signature");
  }

  const claims = decodeBase64urlJson<AccessTokenClaims>(encodedPayload);
  const now = Math.floor(Date.now() / 1000);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];

  if (claims.iss !== state.issuer || !audiences.includes(state.audience)) {
    throw new UnauthorizedException("Invalid token audience");
  }

  if (!claims.sub || !claims.email || claims.exp <= now) {
    throw new UnauthorizedException("Token expired");
  }

  return claims;
}

export function requireAuth(authHeader?: string, allowedRoles?: string[]) {
  const claims = verifyAccessToken(extractBearerToken(authHeader));
  if (allowedRoles?.length) {
    const roles = claims.roles ?? [];
    if (!allowedRoles.some((role) => roles.includes(role))) {
      throw new ForbiddenException("Insufficient role");
    }
  }

  return claims;
}

export function resolveActingUserId(requestedUserId: string | undefined, claims: AccessTokenClaims) {
  if (!requestedUserId || requestedUserId === claims.sub) {
    return claims.sub;
  }

  requireRoles(claims, ADMIN_ROLES);
  return requestedUserId;
}

export function requireRoles(claims: AccessTokenClaims, allowedRoles: string[]) {
  const roles = claims.roles ?? [];
  if (!allowedRoles.some((role) => roles.includes(role))) {
    throw new ForbiddenException("Insufficient role");
  }
}

export function mapClaimsToUser(claims: AccessTokenClaims) {
  return {
    id: claims.sub,
    email: claims.email,
    roles: claims.roles ?? ["user"],
    displayName: claims.displayName,
    user_metadata: claims.user_metadata,
  };
}
