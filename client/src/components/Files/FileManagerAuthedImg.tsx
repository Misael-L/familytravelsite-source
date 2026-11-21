import { useFilePreview } from '../../hooks/useFilePreview'

// Authenticated image — fetches a short-lived download token and renders the image
export function AuthedImg({ src, style }: { src: string; style?: React.CSSProperties }) {
  const { src: authSrc } = useFilePreview(src)
  return authSrc ? <img src={authSrc} alt="" style={style} /> : null
}
