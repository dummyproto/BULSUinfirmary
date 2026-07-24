import { createPortal } from 'react-dom'
import { useToast } from '@context/ToastContext'
import { CheckCircleIcon, XCircleIcon, AlertTriangleIcon, InfoIcon } from './icons'

const ICONS = { success: CheckCircleIcon, error: XCircleIcon, warning: AlertTriangleIcon, info: InfoIcon }

export default function ToastViewport() {
  const { toasts, dismiss } = useToast()
  const target = document.getElementById('toast-container')
  if (!target) return null

  return createPortal(
    <>
      {toasts.map((t) => {
        const Icon = ICONS[t.type] || ICONS.info
        return (
          <div
            key={t.id}
            className={`toast ${t.type}`}
            role="status"
            onClick={() => dismiss(t.id)}
          >
            <Icon width={16} height={16} style={{ flexShrink: 0 }} />
            <span>{t.message}</span>
          </div>
        )
      })}
    </>,
    target
  )
}
