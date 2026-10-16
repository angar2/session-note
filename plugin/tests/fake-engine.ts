// 테스트용 가짜 $ — 메모리 안의 파일·환경 변수·플러그인 정보만 흉내 낸다
import type { EngineInterface } from 'claude-code'

export type Fake = {
  $: EngineInterface
  files: Map<string, string>
  writes: string[]
}

export function fakeEngine(options: {
  env?: Record<string, string>
  files?: Record<string, string>
  plugin?: { name: string; root: string }
  failWrite?: boolean
}): Fake {
  const files = new Map(Object.entries(options.files ?? {}))
  const writes: string[] = []
  const env = options.env ?? { HOME: '/Users/zeke' }
  const fake = {
    plugin: options.plugin ?? { name: 'session-note', root: '/repo/plugin' },
    env: { get: async (name: string) => env[name] },
    fs: {
      exists: async (path: string) => files.has(path),
      read: async (path: string) => {
        const text = files.get(path)
        if (text === undefined) throw new Error(`ENOENT ${path}`)
        return text
      },
      write: async (path: string, text: string) => {
        if (options.failWrite) throw new Error(`EACCES ${path}`)
        files.set(path, text)
        writes.push(path)
      },
    },
  }
  return { $: fake as unknown as EngineInterface, files, writes }
}
