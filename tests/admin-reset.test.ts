// ================================================
// tests/admin-reset.test.ts — 管理员重置 PIN 回归测试
// 覆盖：接口隐藏、令牌校验、用户存在性、指定/自动生成PIN、重置后登录验证
// ================================================

import { describe, expect, it, beforeEach } from 'vitest'
import { handle } from '../cloudflare-worker/worker.js'
import { hashPhone, hashPin, generateSalt } from '../cloudflare-worker/security.js'

// 测试用常量
const SITE_KEY = 'test-site-key-2026'
const ADMIN_TOKEN = 'test-admin-token-abc123'
const HASH_PEPPER = 'test-hash-pepper-xyz789'
const JWT_SECRET = 'test-jwt-secret-uvw456'
const TEST_PHONE = '13800000001'
const TEST_PIN = '482917'
const NEW_PIN = '739205'

// 模拟 KV 命名空间
class MockKV {
  constructor() {
    this.store = new Map()
  }
  async get(key) {
    return this.store.get(key) ?? null
  }
  async put(key, value) {
    this.store.set(key, value)
  }
  async delete(key) {
    this.store.delete(key)
  }
}

// 构造测试环境
function makeEnv(overrides = {}) {
  return {
    GITHUB_TOKEN: 'test-github-token',
    SITE_KEY,
    HASH_PEPPER,
    JWT_SECRET,
    ADMIN_TOKEN,
    USERS_KV: new MockKV(),
    AUDIT_MODE: 'disabled',
    ...overrides,
  }
}

// 构造请求
function makeRequest(method, path, body, headers = {}) {
  const defaultHeaders = {
    'content-type': 'application/json',
    'x-site-key': SITE_KEY,
    origin: 'https://localhost',
    ...headers,
  }
  return new Request(`http://localhost${path}`, {
    method,
    headers: defaultHeaders,
    body: body ? JSON.stringify(body) : undefined,
  })
}

// 辅助：注册一个测试用户
async function registerUser(env, phone = TEST_PHONE, pin = TEST_PIN) {
  const pHash = await hashPhone(phone, HASH_PEPPER)
  const salt = generateSalt()
  const pinHash = await hashPin(pin, salt)
  await env.USERS_KV.put(pHash, JSON.stringify({ pinHash, salt, createdAt: new Date().toISOString() }))
  return pHash
}

// 辅助：解析响应
async function parseJson(res) {
  return {
    status: res.status,
    body: await res.json(),
  }
}

describe('管理员重置 PIN — 接口隐藏与鉴权', () => {
  it('未配置 ADMIN_TOKEN 时返回 404（隐藏接口）', async () => {
    const env = makeEnv({ ADMIN_TOKEN: '' })
    const res = await handle(makeRequest('POST', '/api/admin/reset-pin', {
      phone: TEST_PHONE,
      newPin: NEW_PIN,
    }), env)
    const { status, body } = await parseJson(res)
    expect(status).toBe(404)
    expect(body.error).toBe('未找到接口')
  })

  it('管理员令牌错误返回 403', async () => {
    const env = makeEnv()
    const res = await handle(makeRequest('POST', '/api/admin/reset-pin', {
      phone: TEST_PHONE,
      newPin: NEW_PIN,
    }, {
      'x-admin-token': 'wrong-token',
    }), env)
    const { status, body } = await parseJson(res)
    expect(status).toBe(403)
    expect(body.error).toBe('管理员令牌错误')
  })

  it('缺少管理员令牌头返回 403', async () => {
    const env = makeEnv()
    const res = await handle(makeRequest('POST', '/api/admin/reset-pin', {
      phone: TEST_PHONE,
      newPin: NEW_PIN,
    }), env)
    const { status, body } = await parseJson(res)
    expect(status).toBe(403)
    expect(body.error).toBe('管理员令牌错误')
  })

  it('缺少 x-site-key 返回 403', async () => {
    const env = makeEnv()
    const res = await handle(makeRequest('POST', '/api/admin/reset-pin', {
      phone: TEST_PHONE,
      newPin: NEW_PIN,
    }, {
      'x-site-key': '',
      'x-admin-token': ADMIN_TOKEN,
    }), env)
    const { status, body } = await parseJson(res)
    expect(status).toBe(403)
    expect(body.error).toBe('站点密钥错误')
  })
})

describe('管理员重置 PIN — 参数校验', () => {
  it('手机号格式不正确返回 400', async () => {
    const env = makeEnv()
    await registerUser(env)
    const res = await handle(makeRequest('POST', '/api/admin/reset-pin', {
      phone: '12345',
      newPin: NEW_PIN,
    }, {
      'x-admin-token': ADMIN_TOKEN,
    }), env)
    const { status, body } = await parseJson(res)
    expect(status).toBe(400)
    expect(body.error).toBe('手机号格式不正确')
  })

  it('用户未注册返回 404', async () => {
    const env = makeEnv()
    const res = await handle(makeRequest('POST', '/api/admin/reset-pin', {
      phone: '13900000099',
      newPin: NEW_PIN,
    }, {
      'x-admin-token': ADMIN_TOKEN,
    }), env)
    const { status, body } = await parseJson(res)
    expect(status).toBe(404)
    expect(body.error).toBe('该手机号未注册')
  })
})

describe('管理员重置 PIN — 重置成功', () => {
  it('指定新 PIN 重置成功，返回脱敏手机号和新 PIN', async () => {
    const env = makeEnv()
    await registerUser(env)
    const res = await handle(makeRequest('POST', '/api/admin/reset-pin', {
      phone: TEST_PHONE,
      newPin: NEW_PIN,
    }, {
      'x-admin-token': ADMIN_TOKEN,
    }), env)
    const { status, body } = await parseJson(res)
    expect(status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.phone).toBe('138****0001')
    expect(body.temporaryPin).toBe(NEW_PIN)
  })

  it('不指定新 PIN 时自动生成 6 位随机数字', async () => {
    const env = makeEnv()
    await registerUser(env)
    const res = await handle(makeRequest('POST', '/api/admin/reset-pin', {
      phone: TEST_PHONE,
    }, {
      'x-admin-token': ADMIN_TOKEN,
    }), env)
    const { status, body } = await parseJson(res)
    expect(status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.temporaryPin).toMatch(/^\d{6}$/)
  })

  it('新 PIN 格式不是 6 位数字时自动生成随机 PIN', async () => {
    const env = makeEnv()
    await registerUser(env)
    const res = await handle(makeRequest('POST', '/api/admin/reset-pin', {
      phone: TEST_PHONE,
      newPin: '123',
    }, {
      'x-admin-token': ADMIN_TOKEN,
    }), env)
    const { status, body } = await parseJson(res)
    expect(status).toBe(200)
    expect(body.temporaryPin).toMatch(/^\d{6}$/)
    expect(body.temporaryPin).not.toBe('123')
  })

  it('重置后 KV 中存储了新的 pinHash 和 salt', async () => {
    const env = makeEnv()
    await registerUser(env)
    const pHash = await hashPhone(TEST_PHONE, HASH_PEPPER)
    const before = JSON.parse(await env.USERS_KV.get(pHash))

    await handle(makeRequest('POST', '/api/admin/reset-pin', {
      phone: TEST_PHONE,
      newPin: NEW_PIN,
    }, {
      'x-admin-token': ADMIN_TOKEN,
    }), env)

    const after = JSON.parse(await env.USERS_KV.get(pHash))
    expect(after.pinHash).not.toBe(before.pinHash)
    expect(after.salt).not.toBe(before.salt)
    expect(after.resetAt).toBeDefined()
  })
})

describe('管理员重置 PIN — 重置后登录验证', () => {
  it('重置后用新 PIN 登录成功', async () => {
    const env = makeEnv()
    await registerUser(env)

    // 重置 PIN
    await handle(makeRequest('POST', '/api/admin/reset-pin', {
      phone: TEST_PHONE,
      newPin: NEW_PIN,
    }, {
      'x-admin-token': ADMIN_TOKEN,
    }), env)

    // 用新 PIN 登录
    const loginRes = await handle(makeRequest('POST', '/api/login', {
      phone: TEST_PHONE,
      pin: NEW_PIN,
    }), env)
    const { status, body } = await parseJson(loginRes)
    expect(status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.token).toBeDefined()
    expect(body.phone).toBe('138****0001')
  })

  it('重置后旧 PIN 登录失败', async () => {
    const env = makeEnv()
    await registerUser(env)

    // 重置 PIN
    await handle(makeRequest('POST', '/api/admin/reset-pin', {
      phone: TEST_PHONE,
      newPin: NEW_PIN,
    }, {
      'x-admin-token': ADMIN_TOKEN,
    }), env)

    // 用旧 PIN 登录
    const loginRes = await handle(makeRequest('POST', '/api/login', {
      phone: TEST_PHONE,
      pin: TEST_PIN,
    }), env)
    const { status, body } = await parseJson(loginRes)
    expect(status).toBe(401)
    expect(body.error).toBe('手机号或管理口令错误')
  })

  it('重置后 JWT token 中包含正确的 phoneHash', async () => {
    const env = makeEnv()
    await registerUser(env)

    // 重置 PIN
    await handle(makeRequest('POST', '/api/admin/reset-pin', {
      phone: TEST_PHONE,
      newPin: NEW_PIN,
    }, {
      'x-admin-token': ADMIN_TOKEN,
    }), env)

    // 用新 PIN 登录
    const loginRes = await handle(makeRequest('POST', '/api/login', {
      phone: TEST_PHONE,
      pin: NEW_PIN,
    }), env)
    const { body } = await parseJson(loginRes)

    // 解析 JWT payload
    const payload = JSON.parse(Buffer.from(body.token.split('.')[1], 'base64').toString())
    const expectedHash = await hashPhone(TEST_PHONE, HASH_PEPPER)
    expect(payload.phoneHash).toBe(expectedHash)
  })
})

describe('管理员重置 PIN — 幂等性与并发', () => {
  it('多次重置同一用户，每次都生成新的 salt 和 pinHash', async () => {
    const env = makeEnv()
    await registerUser(env)
    const pHash = await hashPhone(TEST_PHONE, HASH_PEPPER)

    const hashes = []
    for (let i = 0; i < 3; i++) {
      await handle(makeRequest('POST', '/api/admin/reset-pin', {
        phone: TEST_PHONE,
        newPin: `11111${i}`,
      }, {
        'x-admin-token': ADMIN_TOKEN,
      }), env)
      const user = JSON.parse(await env.USERS_KV.get(pHash))
      hashes.push(user.pinHash)
    }

    // 三次重置的 pinHash 都不同
    expect(new Set(hashes).size).toBe(3)
  })

  it('重置不影响其他用户', async () => {
    const env = makeEnv()
    await registerUser(env, '13800000001', '111111')
    await registerUser(env, '13800000002', '222222')

    // 重置用户1
    await handle(makeRequest('POST', '/api/admin/reset-pin', {
      phone: '13800000001',
      newPin: '333333',
    }, {
      'x-admin-token': ADMIN_TOKEN,
    }), env)

    // 用户1用新PIN登录成功
    const login1 = await handle(makeRequest('POST', '/api/login', {
      phone: '13800000001',
      pin: '333333',
    }), env)
    expect(login1.status).toBe(200)

    // 用户2的PIN不变，仍可用原PIN登录
    const login2 = await handle(makeRequest('POST', '/api/login', {
      phone: '13800000002',
      pin: '222222',
    }), env)
    expect(login2.status).toBe(200)
  })
})
