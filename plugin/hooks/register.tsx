// session-note 모드의 훅 모듈 진입점 — 엔진이 불러오면 register가 훅을 등록한다
import type { Register } from 'claude-code'

export const register: Register = () => {}
