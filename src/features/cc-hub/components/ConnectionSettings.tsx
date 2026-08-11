import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { messageForCode } from '../api'
import type { CcHubApiError, SaveConnectionInput } from '../api'

type ConnectionSettingsProps = {
  initialBaseUrl: string
  initialAllowInsecureHttp: boolean
  connected: boolean
  saving: boolean
  error: CcHubApiError | null
  onSave: (input: SaveConnectionInput) => Promise<unknown>
  onTest: () => Promise<unknown>
  onRemove: () => Promise<unknown>
}

export default function ConnectionSettings({
  initialBaseUrl,
  initialAllowInsecureHttp,
  connected,
  saving,
  error,
  onSave,
  onTest,
  onRemove,
}: ConnectionSettingsProps) {
  const [baseUrl, setBaseUrl] = useState(initialBaseUrl)
  const [adminToken, setAdminToken] = useState('')
  const [allowInsecureHttp, setAllowInsecureHttp] = useState(initialAllowInsecureHttp)

  useEffect(() => {
    setBaseUrl(initialBaseUrl)
    setAllowInsecureHttp(initialAllowInsecureHttp)
  }, [initialAllowInsecureHttp, initialBaseUrl])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      await onSave({ baseUrl, adminToken, allowInsecureHttp })
      setAdminToken('')
    } catch {
      return
    }
  }

  async function testCurrentConnection() {
    try {
      await onTest()
    } catch {
      return
    }
  }

  async function removeCurrentConnection() {
    try {
      await onRemove()
      setAdminToken('')
    } catch {
      return
    }
  }

  return (
    <section className="connection-settings" aria-labelledby="connection-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">CC Hub</p>
          <h2 id="connection-title">连接</h2>
        </div>
        <span className={`connection-status ${connected ? 'is-connected' : 'is-disconnected'}`}>
          {connected ? '已连接' : '未连接'}
        </span>
      </div>

      <form className="connection-form" onSubmit={submit}>
        <label>
          基础地址
          <input
            autoComplete="url"
            inputMode="url"
            name="baseUrl"
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder="https://cc-hub.example"
            required
            type="url"
            value={baseUrl}
          />
        </label>
        <label>
          管理员令牌
          <input
            autoComplete="off"
            name="adminToken"
            onChange={(event) => setAdminToken(event.target.value)}
            required
            type="password"
            value={adminToken}
          />
        </label>
        <label className="check-label">
          <input
            checked={allowInsecureHttp}
            name="allowInsecureHttp"
            onChange={(event) => setAllowInsecureHttp(event.target.checked)}
            type="checkbox"
          />
          允许已确认的本地或私有 HTTP 连接
        </label>
        {error ? <p className="form-error" role="alert">{messageForCode(error.code)}</p> : null}
        <div className="form-actions">
          <button disabled={saving} type="submit">
            {saving ? '保存中…' : connected ? '替换连接' : '保存连接'}
          </button>
          {connected ? (
            <>
              <button disabled={saving} onClick={() => void testCurrentConnection()} type="button">
                测试连接
              </button>
              <button className="danger-button" disabled={saving} onClick={() => void removeCurrentConnection()} type="button">
                移除连接
              </button>
            </>
          ) : null}
        </div>
      </form>
    </section>
  )
}
