import { generateKeyPair, exportPKCS8, exportSPKI, exportJWK, importPKCS8, importSPKI } from 'jose'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const KEYS_DIR = process.env['KEYS_DIR'] ?? './data/keys'
const PRIVATE_KEY_PATH = resolve(KEYS_DIR, 'private.pem')
const PUBLIC_KEY_PATH = resolve(KEYS_DIR, 'public.pem')

let cachedPrivateKey: Awaited<ReturnType<typeof importPKCS8>> | null = null
let cachedPublicKey: Awaited<ReturnType<typeof importSPKI>> | null = null
let cachedJwks: { keys: object[] } | null = null

export async function initKeys(): Promise<void> {
  mkdirSync(KEYS_DIR, { recursive: true })

  if (!existsSync(PRIVATE_KEY_PATH) || !existsSync(PUBLIC_KEY_PATH)) {
    const { privateKey, publicKey } = await generateKeyPair('RS256', { modulusLength: 2048, extractable: true })
    writeFileSync(PRIVATE_KEY_PATH, await exportPKCS8(privateKey), { mode: 0o600 })
    writeFileSync(PUBLIC_KEY_PATH, await exportSPKI(publicKey))
    console.log('[Schlüssel] Generated new RSA key pair')
  }

  cachedPrivateKey = await importPKCS8(readFileSync(PRIVATE_KEY_PATH, 'utf-8'), 'RS256')
  const pubKey = await importSPKI(readFileSync(PUBLIC_KEY_PATH, 'utf-8'), 'RS256')
  cachedPublicKey = pubKey

  const jwk = await exportJWK(pubKey)
  cachedJwks = { keys: [{ ...jwk, use: 'sig', alg: 'RS256', kid: 'schloss-1' }] }
}

export function getPrivateKey() {
  if (!cachedPrivateKey) throw new Error('Keys not initialized')
  return cachedPrivateKey
}

export function getPublicKey() {
  if (!cachedPublicKey) throw new Error('Keys not initialized')
  return cachedPublicKey
}

export function getJwks() {
  if (!cachedJwks) throw new Error('Keys not initialized')
  return cachedJwks
}
