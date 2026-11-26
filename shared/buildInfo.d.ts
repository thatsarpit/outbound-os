export interface BuildInfo {
  version: string
  revision: string | null
  channel: 'release' | 'development' | 'local'
}

export function readBuildInfo(): BuildInfo
