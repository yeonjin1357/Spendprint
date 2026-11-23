import { useRef } from 'react';
import { Button } from '../components/Button';
import { useImportFlow } from '../features/import/ImportFlow';
import styles from './Onboarding.module.css';

const STEPS = [
  "뱅크샐러드 앱의 가계부 설정에서 '파일로 받기'를 눌러요",
  '메일로 온 엑셀 파일을 PC에 저장해요',
  '이 화면에 파일을 끌어다 놓아요',
];

/** First screen when nothing has been imported yet. */
export function Onboarding() {
  const { choose, busy } = useImportFlow();
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>뱅크샐러드 내역을 올려 주세요</h1>
      <p className={styles.lead}>내역은 이 PC에만 저장되고 밖으로 나가지 않아요.</p>
      <ol className={styles.steps}>
        {STEPS.map((step, i) => (
          <li key={step} className={styles.step}>
            <span className={styles.number}>{i + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <Button disabled={busy} onClick={() => input.current?.click()}>파일 선택</Button>
      <input
        ref={input}
        type="file"
        accept=".xlsx"
        hidden
        onChange={(e) => {
          choose(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
    </div>
  );
}
