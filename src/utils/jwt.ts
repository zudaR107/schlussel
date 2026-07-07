import { SignJWT, jwtVerify } from 'jose'
import { randomUUID } from 'node:crypto'
import { getPrivateKey, getPublicKey } from './keys.js'

export interface JwtPayload {
  sub: string
  email: string
  name: string
  role: 'admin' | 'user'
}

const ACCESS_TOKEN_TTL = '15m'
const REFRESH_TOKEN_TTL = '7d'
const ISSUER = process.env['JWT_ISSUER'] ?? 'schlussel'

export async function signAccessToken(payload: JwtPayload): Promise<string> {
  return new SignJWT({ email: payload.email, name: payload.name, role: payload.role })
    .setProtectedHeader({ alg: 'RS256', kid: 'schloss-1' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setExpirationTime(ACCESS_TOKEN_TTL)
    .sign(getPrivateKey())
}

export async function signRefreshToken(userId: string): Promise<string> {
  return new SignJWT({ jti: randomUUID() })
    .setProtectedHeader({ alg: 'RS256', kid: 'schloss-1' })
    .setSubject(userId)
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setExpirationTime(REFRESH_TOKEN_TTL)
    .sign(getPrivateKey())
}

export async function verifyToken(token: string): Promise<JwtPayload & { exp: number }> {
  const { payload } = await jwtVerify(token, getPublicKey(), { issuer: ISSUER })
  return {
    sub: payload.sub as string,
    email: payload['email'] as string,
    name: payload['name'] as string,
    role: payload['role'] as 'admin' | 'user',
    exp: payload.exp as number,
  }
}
