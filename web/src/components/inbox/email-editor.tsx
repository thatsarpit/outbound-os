import { useCallback, useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Undo2,
  Redo2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type EmailEditorProps = {
  content: string
  onChange: (html: string) => void
  onPlainTextChange?: (text: string) => void
  onSend?: () => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

function ToolbarButton({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void
  active?: boolean
  disabled?: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors',
        'hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-40',
        active ? 'bg-surface-raised text-accent' : 'text-text-secondary',
      )}
    >
      {children}
    </button>
  )
}

export function EmailEditor({
  content,
  onChange,
  onPlainTextChange,
  onSend,
  placeholder = 'Write your email\u2026',
  disabled = false,
  className,
}: EmailEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'text-info underline', rel: 'noopener noreferrer nofollow' },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content,
    editable: !disabled,
    editorProps: {
      attributes: {
        class: cn(
          'min-h-[100px] max-h-[280px] overflow-y-auto px-4 py-3 text-sm text-text-primary',
          'outline-none prose prose-invert prose-sm max-w-none',
          'prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-blockquote:my-1',
          'prose-a:text-info prose-strong:text-text-primary',
        ),
      },
      handleKeyDown: (_view, event) => {
        if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
          // Only send if there's no active composition (autocomplete, CJK input, etc.)
          if (!event.isComposing && onSend) {
            event.preventDefault()
            onSend()
            return true
          }
        }
        return false
      },
    },
    onUpdate: ({ editor: e }) => {
      const html = e.getHTML()
      onChange(html)
      onPlainTextChange?.(e.getText())
    },
  })

  // Sync external content changes (e.g., template apply, AI draft)
  useEffect(() => {
    if (!editor) return
    const current = editor.getHTML()
    if (content !== current) {
      editor.commands.setContent(content, { emitUpdate: false })
    }
  }, [content, editor])

  useEffect(() => {
    if (editor) editor.setEditable(!disabled)
  }, [disabled, editor])

  const addLink = useCallback(() => {
    if (!editor) return
    const previousUrl = editor.getAttributes('link').href || ''
    const url = window.prompt('URL', previousUrl)
    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    }
  }, [editor])

  if (!editor) return null

  return (
    <div
      className={cn(
        'flex-1 rounded-md border border-border bg-surface-raised overflow-hidden',
        'focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/30',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border/60 px-2 py-1.5">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive('bold')}
          disabled={disabled}
          title="Bold (Ctrl+B)"
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive('italic')}
          disabled={disabled}
          title="Italic (Ctrl+I)"
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive('underline')}
          disabled={disabled}
          title="Underline (Ctrl+U)"
        >
          <UnderlineIcon className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          active={editor.isActive('strike')}
          disabled={disabled}
          title="Strikethrough"
        >
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolbarButton>

        <div className="mx-1 h-4 w-px bg-border/60" />

        <ToolbarButton
          onClick={addLink}
          active={editor.isActive('link')}
          disabled={disabled}
          title="Insert link (Ctrl+K)"
        >
          <LinkIcon className="h-3.5 w-3.5" />
        </ToolbarButton>

        <div className="mx-1 h-4 w-px bg-border/60" />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive('bulletList')}
          disabled={disabled}
          title="Bullet list"
        >
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive('orderedList')}
          disabled={disabled}
          title="Numbered list"
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive('blockquote')}
          disabled={disabled}
          title="Blockquote"
        >
          <Quote className="h-3.5 w-3.5" />
        </ToolbarButton>

        <div className="ml-auto flex items-center gap-0.5">
          <ToolbarButton
            onClick={() => editor.chain().focus().undo().run()}
            disabled={disabled || !editor.can().undo()}
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().redo().run()}
            disabled={disabled || !editor.can().redo()}
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo2 className="h-3.5 w-3.5" />
          </ToolbarButton>
        </div>
      </div>

      {/* Editor area */}
      <EditorContent editor={editor} />
    </div>
  )
}

/** Extract plain text from the editor for the `body` field */
export function getPlainText(html: string): string {
  const div = document.createElement('div')
  div.innerHTML = html
  return div.textContent || div.innerText || ''
}
