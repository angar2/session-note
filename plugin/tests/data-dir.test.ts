// 데이터 폴더 경로 계산의 세 경우(설치 사본·폴더 출처·--plugin-dir)와 환경 변수 우선순위를 확인한다
import { expect, test } from 'claude-code/testing'

import { dataDir, pluginId } from '../hooks/data-dir'
import { fakeEngine } from './fake-engine'

test('plugin id folder name follows Claude Code', () => {
  expect(pluginId('hookify', 'claude-plugins-official')).toBe('hookify-claude-plugins-official')
  expect(pluginId('a.b', 'm k')).toBe('a-b-m-k')
})

test('installed copy reads the marketplace from the cache path', async () => {
  const { $ } = fakeEngine({
    plugin: { name: 'session-note', root: '/Users/zeke/.claude/plugins/cache/angar2/session-note/0.1.0' },
  })
  expect(await dataDir($)).toBe('/Users/zeke/.claude/plugins/data/session-note-angar2')
})

test('folder marketplace is found in known_marketplaces.json', async () => {
  const { $ } = fakeEngine({
    plugin: { name: 'session-note', root: '/Users/zeke/repo/plugin' },
    files: {
      '/Users/zeke/.claude/plugins/known_marketplaces.json': JSON.stringify({
        other: { installLocation: '/Users/zeke/elsewhere' },
        angar2: { source: { source: 'directory', path: '/Users/zeke/repo' }, installLocation: '/Users/zeke/repo' },
      }),
    },
  })
  expect(await dataDir($)).toBe('/Users/zeke/.claude/plugins/data/session-note-angar2')
})

test('a folder no marketplace lists is a --plugin-dir load: inline', async () => {
  const { $ } = fakeEngine({ plugin: { name: 'session-note', root: '/Users/zeke/repo-elsewhere/plugin' } })
  expect(await dataDir($)).toBe('/Users/zeke/.claude/plugins/data/session-note-inline')
})

test('CLAUDE_CODE_PLUGIN_CACHE_DIR, then CLAUDE_CONFIG_DIR, then HOME', async () => {
  const cache = fakeEngine({ env: { CLAUDE_CODE_PLUGIN_CACHE_DIR: '/c', CLAUDE_CONFIG_DIR: '/d', HOME: '/h' } })
  expect(await dataDir(cache.$)).toBe('/c/data/session-note-inline')
  const config = fakeEngine({ env: { CLAUDE_CONFIG_DIR: '/d', HOME: '/h' } })
  expect(await dataDir(config.$)).toBe('/d/plugins/data/session-note-inline')
})
