// 이 플러그인의 정식 데이터 폴더 경로를 계산하는 유일한 곳 (spec DATA.md 1절)
// 모드에는 데이터 폴더를 알려 주는 공식 API가 없어(CLAUDE_PLUGIN_DATA는 자식 프로세스 전용),
// Claude Code가 폴더를 짓는 방식을 따라 계산한다. Claude Code가 방식을 바꾸면 여기만 고친다.
import type { EngineInterface } from 'claude-code'

type Marketplaces = Record<string, { installLocation?: string; source?: { path?: string } }>

// "이름@마켓플레이스" → 폴더 이름. 영숫자·_·- 밖의 글자는 -로 바꾼다
export const pluginId = (name: string, marketplace: string) =>
  `${name}@${marketplace}`.replace(/[^A-Za-z0-9_-]/g, '-')

const isUnder = (path: string, folder: string) => path === folder || path.startsWith(`${folder}/`)

async function pluginsDir($: EngineInterface): Promise<string> {
  const cacheDir = await $.env.get('CLAUDE_CODE_PLUGIN_CACHE_DIR')
  if (cacheDir) return cacheDir
  const configDir = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${await $.env.get('HOME')}/.claude`
  return `${configDir}/plugins`
}

// 설치 사본(plugins/cache/<마켓>/<플러그인>/<버전>)이면 경로에서, 폴더 출처면 등록 목록에서,
// 둘 다 아니면 --plugin-dir로 불러온 것이라 inline이다
async function marketplaceOf($: EngineInterface, plugins: string): Promise<string> {
  const root = $.plugin.root
  const cached = root.match(new RegExp(`^${plugins.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/cache/([^/]+)/`))
  if (cached?.[1]) return cached[1]
  const listPath = `${plugins}/known_marketplaces.json`
  if (await $.fs.exists(listPath)) {
    const known = JSON.parse(await $.fs.read(listPath)) as Marketplaces
    for (const [name, entry] of Object.entries(known)) {
      const folder = entry.source?.path ?? entry.installLocation
      if (folder && isUnder(root, folder.replace(/\/$/, ''))) return name
    }
  }
  return 'inline'
}

export async function dataDir($: EngineInterface): Promise<string> {
  const plugins = await pluginsDir($)
  return `${plugins}/data/${pluginId($.plugin.name, await marketplaceOf($, plugins))}`
}
