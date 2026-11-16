import { useEffect, useRef } from 'react';
import Vditor from 'vditor';

interface VditorEditorProps {
  value: string;
  articleKey: string;
  onChange: (markdown: string) => void;
  onSave?: (markdown: string) => void;
}

/** Typora-style Instant Rendering (IR) Markdown editor powered by local Vditor assets. */
export function VditorEditor({ value, articleKey, onChange, onSave }: VditorEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const vditorRef = useRef<Vditor | null>(null);
  const isReadyRef = useRef(false);
  const pendingValueRef = useRef<string | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);

  onChangeRef.current = onChange;
  onSaveRef.current = onSave;
  pendingValueRef.current = value;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    isReadyRef.current = false;

    const cdnBase = window.location.protocol === 'file:' ? './vditor' : '/vditor';

    const instance = new Vditor(el, {
      mode: 'ir',
      cdn: cdnBase,
      height: '100%',
      cache: { enable: false },
      toolbar: [],
      outline: { enable: false, position: 'left' },
      preview: {
        markdown: {
          autoSpace: true,
          mark: true,
          gfmAutoLink: true,
        },
        hljs: {
          enable: true,
          style: 'github',
          lineNumber: false,
        },
      },
      value,
      after: () => {
        isReadyRef.current = true;
        if (pendingValueRef.current !== null && pendingValueRef.current !== instance.getValue()) {
          instance.setValue(pendingValueRef.current);
        }
      },
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

    // Resolve relative local ./assets/* images in DOM via vcat-asset:// without altering Markdown source
    const resolveLocalImages = () => {
      const imgs = el.querySelectorAll('img');
      imgs.forEach((img) => {
        const rawSrc = img.getAttribute('src');
        if (!rawSrc || /^(https?:|data:|vcat-asset:|blob:)/i.test(rawSrc)) return;
        const cleanRel = rawSrc.replace(/^\.\//, '');
        img.src = `vcat-asset://local/${cleanRel}`;
      });
    };

    const observer = new MutationObserver(resolveLocalImages);
    observer.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });

    return () => {
      observer.disconnect();
      isReadyRef.current = false;
      try {
        vditorRef.current?.destroy();
      } catch {
        // Ignore teardown race when unmounting before Vditor finishes async lute load
      }
      vditorRef.current = null;
    };
  }, []);

  useEffect(() => {
    const instance = vditorRef.current;
    if (!instance || !isReadyRef.current) return;
    try {
      if (instance.getValue() !== value) {
        instance.setValue(value);
      }
    } catch {
      // Fallback handled by pendingValueRef in after()
    }
  }, [articleKey]);

  return <div ref={containerRef} className="h-full w-full" />;
}
