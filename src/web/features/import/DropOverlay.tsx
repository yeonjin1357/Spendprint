import { useEffect, useRef, useState } from 'react';
import styles from './DropOverlay.module.css';

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

/** Lets a file be dropped anywhere in the window. */
export function DropOverlay({ onFiles }: { onFiles(files: File[]): void }) {
  const [visible, setVisible] = useState(false);
  const depth = useRef(0);
  const handler = useRef(onFiles);
  handler.current = onFiles;

  useEffect(() => {
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current += 1;
      setVisible(true);
    };
    const over = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault(); }; // required for `drop` to fire
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setVisible(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setVisible(false);
      handler.current(Array.from(e.dataTransfer?.files ?? []));
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, []);

  if (!visible) return null;
  return (
    <div className={styles.overlay}>
      <div className={styles.box}>
        <p className={styles.title}>여기에 놓으면 가져올게요</p>
      </div>
    </div>
  );
}
