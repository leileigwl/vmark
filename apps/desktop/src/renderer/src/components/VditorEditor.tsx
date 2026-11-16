import { useEffect, useRef } from 'react';
import Vditor from 'vditor';

interface VditorEditorProps {
  value: string;
  articleKey: string;
  onChange: (markdown: string) => void;
  onSave?: (markdown: string) => void;
}

/** Typora-style Instant Rendering (IR) Markdown editor powered by Vditor. */
export function VditorEditor({ value, articleKey, onChange, onSave }: VditorEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const vditorRef = useRef<Vditor | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);

  onChangeRef.current = onChange;
  onSaveRef.current = onSave;

  useEffect(() => {
    if (!containerRef.current) return;

    const instance = new Vditor(containerRef.current, {
      mode: 'ir',
      height: '100%',
      cache: { enable: false },
      toolbar: [],
      outline: { enable: false, position: 'left' },
      value,
      input: (md) => {
        onChangeRef.current(md);
      },
      ctrlEnter: (md) => {
        onSaveRef.current?.(md);
      },
      upload: {
        accept: 'image/*',
        handler: async (files: File[]) => {
          for (const file of files) {
            const buffer = await file.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) {
              binary += String.fromCharCode(bytes[i]);
            }
            const base64 = btoa(binary);
            const ext = file.name.split('.').pop() || 'png';
            const saved = await window.electronAPI.saveLocalImage(base64, ext);
            instance.insertValue(`![${file.name}](${saved.relativeMarkdownPath})\n`);
          }
          return null;
        },
      },
    });

    vditorRef.current = instance;
    return () => {
      vditorRef.current?.destroy();
      vditorRef.current = null;
    };
  }, []);

  useEffect(() => {
    const instance = vditorRef.current;
    if (instance && instance.getValue() !== value) {
      instance.setValue(value);
    }
  }, [articleKey]);

  return <div ref={containerRef} className="h-full w-full" />;
}
