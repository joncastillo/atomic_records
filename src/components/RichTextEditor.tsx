import { useMemo, useRef, useEffect } from 'react'
import ReactQuill from 'react-quill'
import 'react-quill/dist/quill.snow.css'

// Add custom icons for undo and redo
const icons = ReactQuill.Quill.import('ui/icons')
icons['undo'] = '<svg viewbox="0 0 18 18"><polygon class="ql-fill ql-stroke" points="6 10 4 12 2 10 6 10"></polygon><path class="ql-stroke" d="M8.09,13.91A4.6,4.6,0,0,0,9,14,5,5,0,1,0,4,9"></path></svg>'
icons['redo'] = '<svg viewbox="0 0 18 18"><polygon class="ql-fill ql-stroke" points="12 10 14 12 16 10 12 10"></polygon><path class="ql-stroke" d="M9.91,13.91A4.6,4.6,0,0,1,9,14a5,5,0,1,1,5-5"></path></svg>'

interface Props {
  value: string
  onChange: (val: string) => void
  placeholder?: string
  className?: string
  autoFocus?: boolean
}

export default function RichTextEditor({ value, onChange, placeholder, className, autoFocus }: Props) {
  const quillRef = useRef<ReactQuill>(null)

  useEffect(() => {
    if (quillRef.current) {
      if (autoFocus) {
        quillRef.current.focus()
      }
      const editor = quillRef.current.getEditor().root
      editor.setAttribute('spellcheck', 'false')
      editor.setAttribute('autocorrect', 'off')
    }
  }, [autoFocus])

  const modules = useMemo(() => ({
    toolbar: {
      container: [
        [{ 'header': [1, 2, 3, 4, 5, 6, false] }, { 'font': [] }, { 'size': [] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ 'color': [] }, { 'background': [] }],
        [{ 'list': 'ordered' }, { 'list': 'bullet' }],
        ['link', 'clean'],
        ['undo', 'redo']
      ],
      handlers: {
        undo: function () {
          // @ts-ignore
          this.quill.history.undo()
        },
        redo: function () {
          // @ts-ignore
          this.quill.history.redo()
        }
      }
    },
    history: {
      delay: 200,
      maxStack: 100,
      userOnly: true
    }
  }), [])

  return (
    <ReactQuill
      ref={quillRef}
      theme="snow"
      value={value}
      onChange={onChange}
      modules={modules}
      placeholder={placeholder}
      className={className}
    />
  )
}
