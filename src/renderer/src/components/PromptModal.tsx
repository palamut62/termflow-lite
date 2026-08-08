import { useState } from 'react'
import { useModalClose } from '../hooks/useModalClose'

export interface PromptField {
  key: string
  label: string
  placeholder?: string
  required?: boolean
  defaultValue?: string
  type?: 'text' | 'textarea'
}

interface Props {
  title: string
  fields: PromptField[]
  submitLabel?: string
  onSubmit: (values: Record<string, string>) => void
  onClose: () => void
}

export default function PromptModal({
  title,
  fields,
  submitLabel = 'Apply',
  onSubmit,
  onClose
}: Props): React.JSX.Element {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, f.defaultValue ?? '']))
  )
  const valid = fields.every((f) => !f.required || values[f.key]?.trim())
  useModalClose(onClose)

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        e.stopPropagation()
        onClose()
      }}
    >
      <div className="modal" onMouseDown={(e) => e.stopPropagation()} style={{ width: 460 }}>
        <h3>{title}</h3>
        {fields.map((field, index) => (
          <div className="field" key={field.key}>
            <label>{field.label}</label>
            {field.type === 'textarea' ? (
              <textarea
                autoFocus={index === 0}
                rows={4}
                value={values[field.key] ?? ''}
                placeholder={field.placeholder}
                onChange={(e) => setValues((s) => ({ ...s, [field.key]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && valid) {
                    onSubmit(values)
                    onClose()
                  }
                }}
              />
            ) : (
              <input
                autoFocus={index === 0}
                value={values[field.key] ?? ''}
                placeholder={field.placeholder}
                onChange={(e) => setValues((s) => ({ ...s, [field.key]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && valid) {
                    onSubmit(values)
                    onClose()
                  }
                }}
              />
            )}
          </div>
        ))}
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={!valid}
            onClick={() => {
              onSubmit(values)
              onClose()
            }}
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
