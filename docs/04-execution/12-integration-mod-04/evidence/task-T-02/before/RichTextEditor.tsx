import React, { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { 
  Bold, 
  Italic, 
  Underline as UnderlineIcon, 
  List, 
  ListOrdered, 
  Link as LinkIcon,
  Unlink
} from 'lucide-react';
import { cn } from '../../lib/utils';


interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
}

const MenuBar = ({ editor }: { editor: any }) => {
  if (!editor) {
    return null;
  }

  const setLink = () => {
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL:', previousUrl);

    if (url === null) {
      return;
    }

    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  const ToolbarBtn = ({ 
    isActive, 
    onClick, 
    children 
  }: { 
    isActive: boolean; 
    onClick: () => void; 
    children: React.ReactNode 
  }) => (
    <button
      onClick={(e) => {
        e.preventDefault();
        onClick();
      }}
      className={cn(
        "p-1.5 rounded transition-colors text-nexus-muted hover:bg-nexus-sidebar hover:text-nexus-foreground",
        isActive && "bg-nexus-sidebar text-nexus-accent shadow-sm ring-1 ring-nexus-border"
      )}
    >
      {children}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-1 p-2 border-b bg-nexus-background/50 backdrop-blur-sm rounded-t min-w-[300px]">
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive('bold')}
      >
        <Bold className="w-4 h-4" />
      </ToolbarBtn>
      
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive('italic')}
      >
        <Italic className="w-4 h-4" />
      </ToolbarBtn>

      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        isActive={editor.isActive('underline')}
      >
        <UnderlineIcon className="w-4 h-4" />
      </ToolbarBtn>

      <div className="w-px h-4 bg-nexus-border mx-1" />

      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive('bulletList')}
      >
        <List className="w-4 h-4" />
      </ToolbarBtn>

      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive('orderedList')}
      >
        <ListOrdered className="w-4 h-4" />
      </ToolbarBtn>

      <div className="w-px h-4 bg-nexus-border mx-1" />

      <ToolbarBtn
        onClick={setLink}
        isActive={editor.isActive('link')}
      >
        <LinkIcon className="w-4 h-4" />
      </ToolbarBtn>
      
      {editor.isActive('link') && (
        <ToolbarBtn
          onClick={() => editor.chain().focus().unsetLink().run()}
          isActive={false}
        >
          <Unlink className="w-4 h-4" />
        </ToolbarBtn>
      )}
    </div>
  );
};

export const RichTextEditor: React.FC<RichTextEditorProps> = ({ 
  content, 
  onChange, 
  placeholder = "Write your message here...",
  className
}) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-500 hover:text-blue-600 underline transition-colors cursor-pointer',
        },
      }),
      Placeholder.configure({
        placeholder,
        emptyEditorClass: 'is-editor-empty',
      }),
    ],
    content,
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[300px] p-4 font-sans text-nexus-foreground bg-transparent',
          '[&_a]:text-blue-500 [&_a]:underline',
          '[&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4',
          className
        ),
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  // Re-sync standard react controlled component value if needed
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      // Small optimization: don't loop updates if strictly identical internally, 
      // but usually the caller just keeps the state.
      // E.g. we only init content once or update fully if cleared.
      if (!content || content === '<p></p>') {
        editor.commands.setContent(content);
      }
    }
  }, [content, editor]);

  return (
    <div className="flex flex-col flex-1 border border-nexus-border/50 rounded-lg overflow-hidden bg-white/5 shadow-inner">
      <MenuBar editor={editor} />
      <div className="flex-1 overflow-y-auto cursor-text" onClick={() => editor?.commands.focus()}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
};
