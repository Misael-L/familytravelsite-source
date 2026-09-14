import { useState, useEffect } from 'react'
import { resolveManagedFileUrl } from './FileManager.helpers'

export function AuthedImg({ src, style }: { src: string; style?: React.CSSProperties }) {
  const [authSrc, setAuthSrc] = useState('')
  useEffect(() => {
    if (!src) { setAuthSrc(''); return }
    resolveManagedFileUrl(src).then(setAuthSrc)
  }, [src])
  return authSrc ? <img src={authSrc} alt="" style={style} /> : null
}
